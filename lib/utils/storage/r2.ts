// Cloudflare R2 backend (S3-compatible).
//
// Activated when STORAGE_BACKEND=r2 is set in the environment. R2 free tier:
// 10 GB storage + 10M Class A operations + unlimited egress, no card required.
//
// Object key layout under the configured bucket:
//   reports/{id}/status.json      — small, frequently re-written
//   reports/{id}/report.json      — written once, immutable
//   reports/{id}/report.pdf       — written once after first PDF render
//   reports/{id}/screenshots/<name>.png
//
// Required env vars:
//   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//
// All operations are real network calls — keep tests on the local backend
// unless you're explicitly testing the R2 path.

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { Report, StatusFile } from "../../types";
import type { StorageBackend } from "./types";

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  const accountId = required("R2_ACCOUNT_ID");
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
  const config: S3ClientConfig = {
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  };
  _client = new S3Client(config);
  return _client;
}

function bucket(): string {
  return required("R2_BUCKET");
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[storage:r2] missing env var ${name}`);
  return v;
}

// ---------------------------------------------------------------------------
// Key helpers — every storage call routes through one of these so the layout
// is centralized.
// ---------------------------------------------------------------------------
const keyStatus = (id: string) => `reports/${id}/status.json`;
const keyReport = (id: string) => `reports/${id}/report.json`;
const keyPdf = (id: string) => `reports/${id}/report.pdf`;
const keyScreenshot = (id: string, name: string) => `reports/${id}/screenshots/${name}`;
const prefix = (id: string) => `reports/${id}/`;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

async function getObject(key: string): Promise<Buffer | null> {
  try {
    const out = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!out.Body) return null;
    // The SDK returns a Node Readable stream — collect to a buffer.
    const chunks: Uint8Array[] = [];
    for await (const chunk of out.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return null;
    console.warn(`[storage:r2] getObject ${key} failed:`, (e as Error).message);
    return null;
  }
}

async function getJson<T>(key: string): Promise<T | null> {
  const buf = await getObject(key);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    return null;
  }
}

async function putObject(
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function putJson(key: string, data: unknown): Promise<void> {
  await putObject(key, JSON.stringify(data, null, 2), "application/json");
}

// ---------------------------------------------------------------------------
// StorageBackend implementation
// ---------------------------------------------------------------------------

export const r2Backend: StorageBackend = {
  async writeStatus(id, status) {
    await putJson(keyStatus(id), status);
  },

  async readStatus(id) {
    return getJson<StatusFile>(keyStatus(id));
  },

  async writeReport(id, report) {
    await putJson(keyReport(id), report);
  },

  async readReport(id) {
    return getJson<Report>(keyReport(id));
  },

  async writeScreenshot(id, name, data) {
    await putObject(keyScreenshot(id, name), data, "image/png");
  },

  async readScreenshot(id, name) {
    return getObject(keyScreenshot(id, name));
  },

  async writePdf(id, data) {
    await putObject(keyPdf(id), data, "application/pdf");
  },

  async readPdf(id) {
    return getObject(keyPdf(id));
  },

  async listReportIds() {
    const ids = new Set<string>();
    let continuationToken: string | undefined;
    do {
      const res = await client().send(
        new ListObjectsV2Command({
          Bucket: bucket(),
          Prefix: "reports/",
          Delimiter: "/",
          ContinuationToken: continuationToken,
        }),
      );
      for (const cp of res.CommonPrefixes ?? []) {
        if (!cp.Prefix) continue;
        // Prefix shape: "reports/<id>/" → extract <id>
        const m = cp.Prefix.match(/^reports\/([^/]+)\/$/);
        if (m) ids.add(m[1]);
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
    return Array.from(ids);
  },

  async reportLastModifiedMs(id) {
    // Best signal is the status.json LastModified — fall back to the report
    // file if status is missing.
    for (const key of [keyStatus(id), keyReport(id)]) {
      try {
        const out = await client().send(
          new HeadObjectCommand({ Bucket: bucket(), Key: key }),
        );
        if (out.LastModified) return out.LastModified.getTime();
      } catch {
        // ignore — try next
      }
    }
    return 0;
  },

  async deleteReport(id) {
    // R2 doesn't support recursive delete — list everything under the prefix
    // and delete object-by-object.
    let continuationToken: string | undefined;
    do {
      const res = await client().send(
        new ListObjectsV2Command({
          Bucket: bucket(),
          Prefix: prefix(id),
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        try {
          await client().send(
            new DeleteObjectCommand({ Bucket: bucket(), Key: obj.Key }),
          );
        } catch (e) {
          console.warn(
            `[storage:r2] failed to delete ${obj.Key}:`,
            (e as Error).message,
          );
        }
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
  },
};
