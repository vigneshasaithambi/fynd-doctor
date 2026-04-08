// Section A3 — Baymard guideline loader
// The loader is a process-singleton, so each test that needs a different
// scrape file must use vi.resetModules() to force a re-import.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";

const SCRAPE_PATH = path.join(process.cwd(), "lib", "data", "baymard-scrape.jsonl");
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "baymard-mini.jsonl");
const BACKUP = SCRAPE_PATH + ".bak-test";

function swapInScrape(content: string) {
  if (fs.existsSync(SCRAPE_PATH) && !fs.existsSync(BACKUP)) {
    fs.renameSync(SCRAPE_PATH, BACKUP);
  }
  fs.writeFileSync(SCRAPE_PATH, content);
}

function restoreScrape() {
  if (fs.existsSync(SCRAPE_PATH)) fs.unlinkSync(SCRAPE_PATH);
  if (fs.existsSync(BACKUP)) fs.renameSync(BACKUP, SCRAPE_PATH);
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  restoreScrape();
  vi.resetModules();
});

describe("baymardGuidelines loader", () => {
  it("#21 returns the built-in stub when scrape file is missing", async () => {
    if (fs.existsSync(SCRAPE_PATH)) fs.renameSync(SCRAPE_PATH, BACKUP);
    const mod = await import("@/lib/data/baymardGuidelines");
    const guidelines = mod.guidelinesFor("homepage");
    expect(guidelines.length).toBeGreaterThan(0);
    expect(guidelines[0].id).toMatch(/^HP-\d+$/); // stub IDs
  });

  it("#22 returns the built-in stub when scrape file is empty", async () => {
    swapInScrape("");
    const mod = await import("@/lib/data/baymardGuidelines");
    const guidelines = mod.guidelinesFor("homepage");
    expect(guidelines[0].id).toMatch(/^HP-\d+$/);
  });

  it("#23 returns the built-in stub when scrape is malformed JSON", async () => {
    swapInScrape("{ this is not json");
    const mod = await import("@/lib/data/baymardGuidelines");
    const guidelines = mod.guidelinesFor("homepage");
    expect(guidelines[0].id).toMatch(/^HP-\d+$/);
  });

  it("#24 parses fixture mini-scrape and buckets records", async () => {
    swapInScrape(fs.readFileSync(FIXTURE, "utf8"));
    const mod = await import("@/lib/data/baymardGuidelines");
    const homepage = mod.allGuidelinesFor("homepage");
    const pdp = mod.allGuidelinesFor("pdp");
    const cart = mod.allGuidelinesFor("cart");
    const checkout = mod.allGuidelinesFor("checkout");
    const category = mod.allGuidelinesFor("category");
    expect(homepage.find((g) => g.id === "BM-100")).toBeTruthy();
    expect(pdp.find((g) => g.id === "BM-200")).toBeTruthy();
    expect(cart.find((g) => g.id === "BM-300")).toBeTruthy(); // Save for Later cart keyword
    expect(checkout.find((g) => g.id === "BM-400")).toBeTruthy();
    expect(category.find((g) => g.id === "BM-500")).toBeTruthy();
  });

  it("#25 dedupes by BM-NNN id across multiple records", async () => {
    swapInScrape(fs.readFileSync(FIXTURE, "utf8"));
    const mod = await import("@/lib/data/baymardGuidelines");
    const all = mod.allGuidelinesFor("category");
    // Fixture has 500 + 500 dup; expect only one
    const ids = all.map((g) => g.id);
    expect(ids.filter((i) => i === "BM-500").length).toBe(1);
  });

  it("#26 'in the Cart' statement → cart bucket", async () => {
    swapInScrape(fs.readFileSync(FIXTURE, "utf8"));
    const mod = await import("@/lib/data/baymardGuidelines");
    expect(mod.allGuidelinesFor("cart").find((g) => g.id === "BM-300")).toBeTruthy();
  });

  it("#27 'Allow Guest Checkout' (no cart keyword) → checkout bucket only", async () => {
    swapInScrape(fs.readFileSync(FIXTURE, "utf8"));
    const mod = await import("@/lib/data/baymardGuidelines");
    expect(mod.allGuidelinesFor("checkout").find((g) => g.id === "BM-400")).toBeTruthy();
    expect(mod.allGuidelinesFor("cart").find((g) => g.id === "BM-400")).toBeFalsy();
  });

  it("#28 Product Page topic → pdp bucket", async () => {
    swapInScrape(fs.readFileSync(FIXTURE, "utf8"));
    const mod = await import("@/lib/data/baymardGuidelines");
    expect(mod.allGuidelinesFor("pdp").find((g) => g.id === "BM-200")).toBeTruthy();
  });

  it("#29 guidelinesFor caps at 40 entries per page", async () => {
    // Use the real scrape (if present) which has hundreds for homepage.
    restoreScrape();
    vi.resetModules();
    const mod = await import("@/lib/data/baymardGuidelines");
    expect(mod.guidelinesFor("homepage").length).toBeLessThanOrEqual(40);
  });

  it("#30 load() is a process-singleton", async () => {
    swapInScrape(fs.readFileSync(FIXTURE, "utf8"));
    const mod = await import("@/lib/data/baymardGuidelines");
    const a = mod.allGuidelinesFor("homepage");
    const b = mod.allGuidelinesFor("homepage");
    expect(a).toBe(b); // Same object reference proves no re-parse
  });
});
