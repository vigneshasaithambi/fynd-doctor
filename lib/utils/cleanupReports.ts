// TTL cleanup for reports/{id}/ directories (scale plan Step 5).
//
// Without this the filesystem fills up forever — every crawl leaves behind
// status.json + report.json + screenshots + (after Step 7) report.pdf. We
// delete anything older than the TTL on a low-frequency schedule.
//
// Started lazily on first import via lib/crawler/index.ts so it runs in the
// same process as the crawler. Cleared with .unref() so it never blocks
// process exit.

import { listReportIds, reportLastModifiedMs, deleteReport } from "./storage";

const TTL_MS = Number(process.env.REPORT_TTL_HOURS || 24) * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h

let started = false;

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  const ids = listReportIds();
  let deleted = 0;
  for (const id of ids) {
    const last = reportLastModifiedMs(id);
    if (last > 0 && last < cutoff) {
      deleteReport(id);
      deleted += 1;
    }
  }
  if (deleted > 0) {
    console.log(
      `[cleanupReports] swept ${deleted} report(s) older than ${TTL_MS / 1000 / 60 / 60}h`,
    );
  }
}

export function startReportCleanup() {
  if (started) return;
  started = true;
  // Run once on boot, then on a timer.
  try {
    sweep();
  } catch (e) {
    console.warn("[cleanupReports] initial sweep failed:", (e as Error).message);
  }
  const handle = setInterval(() => {
    try {
      sweep();
    } catch (e) {
      console.warn("[cleanupReports] sweep failed:", (e as Error).message);
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive just for the timer.
  if (typeof handle === "object" && handle && "unref" in handle) {
    (handle as { unref: () => void }).unref();
  }
}
