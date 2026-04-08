// Common interface every storage backend implements.
//
// Why an interface: the local backend uses fs (current behaviour, used by
// tests + local dev) and the R2 backend talks to Cloudflare R2 over the S3
// API (used in production). The dispatcher in lib/utils/storage/index.ts
// picks one based on the STORAGE_BACKEND env var.
//
// Note: most reads/writes are async even on the local backend so the call
// sites are uniform across both implementations.

import type { Report, StatusFile } from "../../types";

export interface StorageBackend {
  // Status (small JSON)
  writeStatus(id: string, status: StatusFile): Promise<void>;
  readStatus(id: string): Promise<StatusFile | null>;

  // Report (larger JSON, immutable once written)
  writeReport(id: string, report: Report): Promise<void>;
  readReport(id: string): Promise<Report | null>;

  // Screenshots (PNG bytes)
  writeScreenshot(id: string, name: string, data: Buffer): Promise<void>;
  readScreenshot(id: string, name: string): Promise<Buffer | null>;

  // Cached PDF (immutable once rendered)
  writePdf(id: string, data: Buffer): Promise<void>;
  readPdf(id: string): Promise<Buffer | null>;

  // Cleanup loop (TTL sweep)
  listReportIds(): Promise<string[]>;
  reportLastModifiedMs(id: string): Promise<number>;
  deleteReport(id: string): Promise<void>;
}
