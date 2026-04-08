// Storage facade — picks a backend at module load time based on the
// STORAGE_BACKEND env var. Re-exports the same function names the rest of
// the codebase used to import from `lib/utils/storage` so the migration is
// nearly drop-in. The only behavioural change is that all reads/writes are
// now Promise-returning.
//
//   STORAGE_BACKEND=local  (default) — fs reads/writes under reports/
//   STORAGE_BACKEND=r2              — Cloudflare R2 over the S3 API
//
// Stuck-crawl detection lives in this layer so it works against either
// backend without duplication.

import type { Report, StatusFile } from "../../types";
import type { StorageBackend } from "./types";
import { localBackend } from "./local";

const BACKEND_NAME = (process.env.STORAGE_BACKEND || "local").toLowerCase();

let backend: StorageBackend;
if (BACKEND_NAME === "r2") {
  // Lazy-import so the test suite (which uses local) never imports the AWS SDK.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  backend = require("./r2").r2Backend as StorageBackend;
  console.log("[storage] backend=r2");
} else {
  backend = localBackend;
  if (process.env.NODE_ENV !== "test") console.log("[storage] backend=local");
}

// A crawl whose status hasn't been touched for this long is considered dead
// (scale plan Step 5). The poller will see done:true with an error message.
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public API — same names the codebase already imports
// ---------------------------------------------------------------------------

export async function writeStatus(id: string, status: StatusFile): Promise<void> {
  return backend.writeStatus(id, status);
}

export async function readStatus(id: string): Promise<StatusFile | null> {
  const status = await backend.readStatus(id);
  if (!status) return null;
  // Stuck-crawl detection (scale plan Step 5). If the worker died mid-crawl
  // the file would otherwise sit at done:false forever and the loading screen
  // would spin indefinitely. Transform on read — don't mutate the file.
  if (!status.done && status.updatedAt) {
    const ageMs = Date.now() - new Date(status.updatedAt).getTime();
    if (ageMs > STUCK_THRESHOLD_MS) {
      return {
        ...status,
        done: true,
        error: `Crawl appears stuck (no progress for ${Math.round(ageMs / 1000)}s)`,
      };
    }
  }
  return status;
}

export async function writeReport(id: string, report: Report): Promise<void> {
  return backend.writeReport(id, report);
}

export async function readReport(id: string): Promise<Report | null> {
  return backend.readReport(id);
}

// Screenshots — the screenshot route + crawler use these. The R2 backend
// doesn't have an on-disk path to hand back, so the writer takes raw bytes
// and the reader returns raw bytes. The previous filesystem-path-based API
// is intentionally gone — call sites had to change anyway because the file
// path doesn't exist on R2.
export async function writeScreenshot(
  id: string,
  name: string,
  data: Buffer,
): Promise<void> {
  return backend.writeScreenshot(id, name, data);
}

export async function readScreenshot(
  id: string,
  name: string,
): Promise<Buffer | null> {
  return backend.readScreenshot(id, name);
}

export async function writePdf(id: string, data: Buffer): Promise<void> {
  return backend.writePdf(id, data);
}

export async function readPdf(id: string): Promise<Buffer | null> {
  return backend.readPdf(id);
}

export async function listReportIds(): Promise<string[]> {
  return backend.listReportIds();
}

export async function reportLastModifiedMs(id: string): Promise<number> {
  return backend.reportLastModifiedMs(id);
}

export async function deleteReport(id: string): Promise<void> {
  return backend.deleteReport(id);
}

// Public URL helper for screenshots — unchanged, points at the existing API
// route which fronts both backends.
export function publicScreenshotUrl(id: string, name: string): string {
  return `/api/screenshot/${id}/${name}`;
}

// ---------------------------------------------------------------------------
// Backwards-compat shims for any code that still expects the old fs paths.
// These exist only for the local backend; on R2 the test suite that uses them
// is skipped via the STORAGE_BACKEND check.
// ---------------------------------------------------------------------------

import path from "path";
const REPORTS_DIR = path.join(process.cwd(), "reports");

export function reportDir(id: string): string {
  return path.join(REPORTS_DIR, id);
}

export function ensureReportDir(id: string): string {
  // Idempotent — creates the local directory tree. On the R2 backend this is
  // a no-op (R2 has no directories) but the helper still returns a path
  // string so the path-traversal containment check in the screenshot route
  // keeps working without any backend-specific branching.
  const dir = path.join(REPORTS_DIR, id);
  if (BACKEND_NAME !== "r2") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "screenshots"), { recursive: true });
  }
  return dir;
}

export function screenshotPath(id: string, name: string): string {
  return path.join(REPORTS_DIR, id, "screenshots", name);
}

export function pdfPath(id: string): string {
  return path.join(REPORTS_DIR, id, "report.pdf");
}
