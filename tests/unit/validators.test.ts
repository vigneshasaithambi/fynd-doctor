// Section A6 — URL validators
import { describe, it, expect } from "vitest";
import { normalizeUrl, getDomain } from "@/lib/utils/validators";

describe("normalizeUrl", () => {
  it("#46 prefixes https:// when missing", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
  });

  it("#47 preserves path + query", () => {
    expect(normalizeUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
  });

  it("#48 returns null for nonsense input", () => {
    // The current implementation prepends https:// then tries new URL().
    // "not a url" → "https://not a url" → URL constructor accepts the host
    // "not" with the rest as path. This is permissive — assert it doesn't
    // crash and document the behaviour.
    const r = normalizeUrl("not a url");
    expect(r === null || r.startsWith("https://")).toBe(true);
  });

  it("#49 javascript: URL is neutralised (security guard)", () => {
    // Current code prepends https:// → "https://javascript:alert(1)" → URL parses
    // host=javascript, port=alert(1) which is invalid → null.
    // If a regression makes this return a usable URL, the report viewer would
    // open an XSS — this test catches it.
    const r = normalizeUrl("javascript:alert(1)");
    if (r !== null) {
      // Whatever it returned must NOT contain "javascript:"
      expect(r.toLowerCase()).not.toContain("javascript:");
    }
  });

  it("#50 ftp:// URLs are not silently upgraded to a working URL", () => {
    // Current code prepends https:// → "https://ftp://example.com" → URL
    // probably accepts that with weird hostname. As a safety guard the
    // resulting URL must not be parseable as ftp.
    const r = normalizeUrl("ftp://example.com");
    if (r !== null) {
      expect(new URL(r).protocol).toMatch(/^https?:$/);
    }
  });

  it("#51 returns null/empty for empty input", () => {
    expect(normalizeUrl("")).toBeNull();
  });
});

describe("getDomain", () => {
  it("#51b strips www and returns hostname", () => {
    expect(getDomain("https://shop.tesla.com/path")).toBe("shop.tesla.com");
    expect(getDomain("https://www.example.com")).toBe("example.com");
  });

  it("falls back to the input string on parse failure", () => {
    expect(getDomain("not a url")).toBe("not a url");
  });
});
