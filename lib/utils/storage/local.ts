// Local filesystem backend (default for dev + tests).
//
// Implements StorageBackend over `reports/{id}/{status,report}.json`,
// `reports/{id}/screenshots/<name>`, and `reports/{id}/report.pdf`.
//
// Atomic JSON writes via temp+rename. Safe reads return null on parse errors
// instead of throwing — the polling endpoint then sees a transient miss and
// retries on the next tick.

import fs from "fs";
import path from "path";
import type { Report, StatusFile } from "../../types";
import type { StorageBackend } from "./types";

const REPORTS_DIR = path.join(process.cwd(), "reports");

function reportDir(id: string) {
  return path.join(REPORTS_DIR, id);
}

function ensureDirs(id: string) {
  const dir = reportDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "screenshots"), { recursive: true });
}

function writeJsonAtomic(filePath: string, data: unknown) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function readJsonSafe<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export const localBackend: StorageBackend = {
  async writeStatus(id, status) {
    ensureDirs(id);
    writeJsonAtomic(path.join(reportDir(id), "status.json"), status);
  },

  async readStatus(id) {
    return readJsonSafe<StatusFile>(path.join(reportDir(id), "status.json"));
  },

  async writeReport(id, report) {
    ensureDirs(id);
    writeJsonAtomic(path.join(reportDir(id), "report.json"), report);
  },

  async readReport(id) {
    return readJsonSafe<Report>(path.join(reportDir(id), "report.json"));
  },

  async writeScreenshot(id, name, data) {
    ensureDirs(id);
    fs.writeFileSync(path.join(reportDir(id), "screenshots", name), data);
  },

  async readScreenshot(id, name) {
    const p = path.join(reportDir(id), "screenshots", name);
    if (!fs.existsSync(p)) return null;
    try {
      return fs.readFileSync(p);
    } catch {
      return null;
    }
  },

  async writePdf(id, data) {
    ensureDirs(id);
    fs.writeFileSync(path.join(reportDir(id), "report.pdf"), data);
  },

  async readPdf(id) {
    const p = path.join(reportDir(id), "report.pdf");
    if (!fs.existsSync(p)) return null;
    try {
      return fs.readFileSync(p);
    } catch {
      return null;
    }
  },

  async listReportIds() {
    if (!fs.existsSync(REPORTS_DIR)) return [];
    return fs.readdirSync(REPORTS_DIR).filter((f) => {
      try {
        return fs.statSync(path.join(REPORTS_DIR, f)).isDirectory();
      } catch {
        return false;
      }
    });
  },

  async reportLastModifiedMs(id) {
    const dir = reportDir(id);
    try {
      const status = readJsonSafe<StatusFile>(path.join(dir, "status.json"));
      if (status?.updatedAt) return new Date(status.updatedAt).getTime();
      return fs.statSync(dir).mtimeMs;
    } catch {
      return 0;
    }
  },

  async deleteReport(id) {
    const dir = reportDir(id);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[storage:local] failed to delete ${id}:`, (e as Error).message);
    }
  },
};
