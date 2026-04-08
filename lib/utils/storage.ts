import fs from "fs";
import path from "path";
import type { Report, StatusFile } from "../types";

const REPORTS_DIR = path.join(process.cwd(), "reports");

// A crawl whose status hasn't been touched for this long is considered dead
// (scale plan Step 5). The poller will see done:true with an error message.
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

export function reportDir(id: string) {
  return path.join(REPORTS_DIR, id);
}

export function ensureReportDir(id: string) {
  const dir = reportDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "screenshots"), { recursive: true });
  return dir;
}

// Atomic write: write to a temp file in the same directory then rename. On
// POSIX filesystems rename is atomic, so concurrent readers either see the
// previous file or the new one — never a partial JSON document. (Scale plan
// Step 4 — was bare writeFileSync, which let polling readers JSON.parse a
// half-written file and crash the route.)
function writeJsonAtomic(filePath: string, data: unknown) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

// Safe read: returns null on missing file, partial write, or any parse error
// instead of throwing. The polling endpoint will treat null as a transient
// miss and try again on the next tick.
function readJsonSafe<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStatus(id: string, status: StatusFile) {
  ensureReportDir(id);
  writeJsonAtomic(path.join(reportDir(id), "status.json"), status);
}

export function readStatus(id: string): StatusFile | null {
  const status = readJsonSafe<StatusFile>(path.join(reportDir(id), "status.json"));
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

export function writeReport(id: string, report: Report) {
  ensureReportDir(id);
  writeJsonAtomic(path.join(reportDir(id), "report.json"), report);
}

export function readReport(id: string): Report | null {
  return readJsonSafe<Report>(path.join(reportDir(id), "report.json"));
}

export function screenshotPath(id: string, name: string) {
  return path.join(reportDir(id), "screenshots", name);
}

export function publicScreenshotUrl(id: string, name: string) {
  return `/api/screenshot/${id}/${name}`;
}

// PDF cache path used by lib/services/pdf.ts (scale plan Step 7).
export function pdfPath(id: string) {
  return path.join(reportDir(id), "report.pdf");
}

// For the cleanup job — let it iterate the directory.
export function listReportIds(): string[] {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs.readdirSync(REPORTS_DIR).filter((f) => {
    try {
      return fs.statSync(path.join(REPORTS_DIR, f)).isDirectory();
    } catch {
      return false;
    }
  });
}

export function reportLastModifiedMs(id: string): number {
  const dir = reportDir(id);
  try {
    const status = readJsonSafe<StatusFile>(path.join(dir, "status.json"));
    if (status?.updatedAt) return new Date(status.updatedAt).getTime();
    return fs.statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
}

export function deleteReport(id: string) {
  const dir = reportDir(id);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.warn(`[storage] failed to delete ${id}:`, (e as Error).message);
  }
}
