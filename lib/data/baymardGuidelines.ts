// Baymard guideline loader
//
// Source: lib/data/baymard-scrape.jsonl — a JSON array of scraped Baymard pages
// (~22k records, ~82 MB). Individual research guidelines have titles shaped like:
//
//   "#359: Support Keyword Query Suggestions within Autocomplete – Search Autocomplete – On-Site Search – Research Catalog – Baymard Premium"
//
// We extract the ones starting with "#NNN:", dedupe by id, and bucket by page
// type using the topic + collection breadcrumb. The static STUB at the bottom
// is the fallback if the scrape file is missing or empty (e.g. CI, fresh
// clone). Server-only — never import from a client component.

import fs from "fs";
import path from "path";
import type { PageType } from "../types";

export interface Guideline {
  id: string;
  text: string;
}

const SCRAPE_PATH = path.join(process.cwd(), "lib", "data", "baymard-scrape.jsonl");

interface ScrapeRecord {
  url: string;
  title: string;
  content: string;
}

let cache: Record<PageType, Guideline[]> | null = null;

function bucketFor(topic: string, collection: string, statement: string): PageType[] {
  const t = topic.toLowerCase();
  const c = collection.toLowerCase();
  const s = statement.toLowerCase();
  const buckets: PageType[] = [];

  if (t.includes("homepage")) buckets.push("homepage");
  if (
    t.includes("category taxonomy") ||
    t.includes("main navigation") ||
    t.includes("intermediary category") ||
    t.includes("site-wide")
  ) {
    buckets.push("homepage");
  }
  if (
    c.includes("product lists") ||
    c.includes("on-site search") ||
    t.includes("filtering") ||
    t.includes("sorting") ||
    t.includes("list ") ||
    t.includes("search results") ||
    t.includes("search form") ||
    t.includes("search autocomplete")
  ) {
    buckets.push("category");
  }
  if (c.includes("product page")) buckets.push("pdp");

  // Cart bucket: explicit cart topics, plus statement-level keyword scan for
  // ambiguous "Cart & Checkout" topics ("in the Cart", "Save for Later",
  // "Mini-Cart", "Persist Cart", quantity updates, etc.)
  const cartStatementKeywords = [
    "in the cart",
    "save for later",
    "mini-cart",
    "mini cart",
    "shopping cart",
    "persist cart",
    "cart contents",
    "cart quantity",
    "cart items",
    "cart icon",
    "cart page",
    "order cost",
    "full order",
    "coupon",
    "promotional field",
    "promo code",
    "free shipping threshold",
    "free-shipping threshold",
    "subtotal",
    "order summary",
  ];
  if (
    t.includes("shopping cart") ||
    (t.includes("cart") && !t.includes("checkout")) ||
    cartStatementKeywords.some((k) => s.includes(k))
  ) {
    buckets.push("cart");
  }

  if (
    t.includes("checkout") ||
    t.includes("payment") ||
    t.includes("address") ||
    t.includes("shipping") ||
    t.includes("order review") ||
    t.includes("guest") ||
    t.includes("form field") ||
    t.includes("form design") ||
    t.includes("account selection") ||
    t.includes("gifting flow") ||
    t.includes("booking")
  ) {
    buckets.push("checkout");
  }

  // Topic literally "Cart & Checkout" (the collection name reused as topic for
  // top-level guidelines): add to checkout by default; cart already added above
  // if statement matched cart keywords.
  if (t === "cart & checkout" && !buckets.includes("checkout")) {
    buckets.push("checkout");
  }

  // Last-resort fallback for anything still under the Cart & Checkout collection
  if (buckets.length === 0 && c.includes("cart & checkout")) {
    buckets.push("cart", "checkout");
  }
  return buckets;
}

function parseScrape(): Record<PageType, Guideline[]> | null {
  if (!fs.existsSync(SCRAPE_PATH)) return null;
  const stat = fs.statSync(SCRAPE_PATH);
  if (stat.size === 0) return null;

  let raw: ScrapeRecord[];
  try {
    raw = JSON.parse(fs.readFileSync(SCRAPE_PATH, "utf8")) as ScrapeRecord[];
  } catch (e) {
    console.warn("[baymardGuidelines] failed to parse scrape:", (e as Error).message);
    return null;
  }

  const seen = new Set<string>();
  const out: Record<PageType, Guideline[]> = {
    homepage: [],
    category: [],
    pdp: [],
    cart: [],
    checkout: [],
  };

  for (const rec of raw) {
    const title = rec.title || "";
    const m = title.match(/^#(\d+):\s*(.+)$/);
    if (!m) continue;
    const id = `BM-${m[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);

    // Title format: "#NNN: Statement – Topic – Collection – Research Catalog – Baymard Premium"
    const parts = m[2].split(" – ").map((s) => s.trim());
    const statement = parts[0] || "";
    // last two segments are "Research Catalog" and "Baymard Premium"
    const collection = parts[parts.length - 3] || "";
    const topic = parts[parts.length - 4] || collection;
    if (!statement) continue;

    const guideline: Guideline = { id, text: statement };
    const buckets = bucketFor(topic, collection, statement);
    for (const b of buckets) out[b].push(guideline);
  }

  // If a bucket ended up empty, fall back to the stub for that bucket
  for (const k of Object.keys(out) as PageType[]) {
    if (out[k].length === 0) out[k] = STUB[k];
  }

  return out;
}

function load(): Record<PageType, Guideline[]> {
  if (cache) return cache;
  const parsed = parseScrape();
  cache = parsed ?? STUB;
  if (parsed) {
    const counts = (Object.keys(parsed) as PageType[])
      .map((k) => `${k}=${parsed[k].length}`)
      .join(" ");
    console.log(`[baymardGuidelines] loaded from scrape: ${counts}`);
  } else {
    console.log("[baymardGuidelines] using built-in stub (scrape file missing/empty)");
  }
  return cache;
}

// Vision calls can't take 200+ guidelines per page. Cap what we expose.
const MAX_PER_PAGE = 40;

export function guidelinesFor(page: PageType): Guideline[] {
  const all = load()[page] || [];
  return all.slice(0, MAX_PER_PAGE);
}

export function allGuidelinesFor(page: PageType): Guideline[] {
  return load()[page] || [];
}

// ---------------------------------------------------------------------------
// Built-in fallback stub — used when baymard-scrape.jsonl is missing/empty.
// ---------------------------------------------------------------------------
const STUB: Record<PageType, Guideline[]> = {
  homepage: [
    { id: "HP-01", text: "Primary value proposition is visible above the fold without scrolling" },
    { id: "HP-02", text: "Homepage search field is prominent, wide, and visible without scrolling" },
    { id: "HP-03", text: "Main navigation reveals categories with clear hierarchy" },
    { id: "HP-04", text: "Hero banner conveys what the site sells within 5 seconds" },
    { id: "HP-05", text: "Promotional offers and free shipping thresholds are surfaced" },
    { id: "HP-06", text: "Trust signals (reviews, press, security) are visible above or near fold" },
    { id: "HP-07", text: "Featured category tiles use real product imagery, not abstract icons" },
    { id: "HP-08", text: "Account / wishlist / cart icons are top-right and persistent" },
    { id: "HP-09", text: "Newsletter signup is present but not blocking" },
    { id: "HP-10", text: "Mobile homepage uses a hamburger menu with full category drilldown" },
  ],
  category: [
    { id: "CAT-01", text: "Category page shows applied filter chips with clear remove affordance" },
    { id: "CAT-02", text: "Filtering panel is visible (left rail desktop) without requiring tap" },
    { id: "CAT-03", text: "Sort dropdown is visible with sensible default (Featured / Best Sellers)" },
    { id: "CAT-04", text: "Each product card shows price, title, image, and rating" },
    { id: "CAT-05", text: "Product card image swatches preview color/material variants" },
    { id: "CAT-06", text: "Pagination uses Load More or infinite scroll with footer access" },
    { id: "CAT-07", text: "Out of stock products are clearly indicated, not hidden silently" },
    { id: "CAT-08", text: "Compare-at price (strikethrough) is displayed when on sale" },
    { id: "CAT-09", text: "Quick-view or hover-to-add interactions exist on desktop" },
    { id: "CAT-10", text: "Mobile shows 2 products per row, not 1, on standard viewports" },
  ],
  pdp: [
    { id: "PDP-01", text: "Product images support zoom and multiple angles" },
    { id: "PDP-02", text: "Variant selectors (size, color) use visual swatches not dropdowns" },
    { id: "PDP-03", text: "Stock availability is shown per variant, not just product-level" },
    { id: "PDP-04", text: "Add to Cart button is sticky on mobile when scrolling" },
    { id: "PDP-05", text: "Shipping cost and delivery date estimate is visible on PDP" },
    { id: "PDP-06", text: "Return policy summary appears near the buy box" },
    { id: "PDP-07", text: "Customer reviews summary (star + count) sits near the title" },
    { id: "PDP-08", text: "Detailed reviews section includes filtering and verified badges" },
    { id: "PDP-09", text: "Size guide is one tap away with measurement table" },
    { id: "PDP-10", text: "Cross-sell / related items appear below the fold, not blocking" },
    { id: "PDP-11", text: "Trust signals (secure checkout, returns) bracket the Add to Cart" },
    { id: "PDP-12", text: "Product description is structured with bullets, not a wall of text" },
  ],
  cart: [
    { id: "CRT-01", text: "Cart shows line item images, titles, variants, and editable quantity" },
    { id: "CRT-02", text: "Subtotal, shipping, tax, and final total are itemized" },
    { id: "CRT-03", text: "Promo / discount code field is visible but not distracting" },
    { id: "CRT-04", text: "Free shipping progress bar is shown if a threshold exists" },
    { id: "CRT-05", text: "Primary checkout CTA is visible without scrolling" },
    { id: "CRT-06", text: "Express checkout buttons (Apple Pay, Shop Pay) are above the main CTA" },
    { id: "CRT-07", text: "Cross-sells / 'You might also like' appear below totals, not above" },
    { id: "CRT-08", text: "Save for later / wishlist exists for users not ready to buy" },
    { id: "CRT-09", text: "Trust badges (secure, returns) appear near the checkout button" },
  ],
  checkout: [
    { id: "CHK-01", text: "Guest checkout is offered without forced account creation" },
    { id: "CHK-02", text: "Address autocomplete (Google Places or similar) is enabled" },
    { id: "CHK-03", text: "Form fields use proper input types and autocomplete attributes" },
    { id: "CHK-04", text: "Errors appear inline next to the field, not as a top banner" },
    { id: "CHK-05", text: "Shipping options are shown with cost and ETA" },
    { id: "CHK-06", text: "Payment methods relevant to the locale are present (UPI/COD in IN)" },
    { id: "CHK-07", text: "Express wallet buttons are at the top of checkout" },
    { id: "CHK-08", text: "Order summary is visible throughout checkout (sidebar or accordion)" },
    { id: "CHK-09", text: "Progress indicator shows current step in multi-step flow" },
    { id: "CHK-10", text: "Discount code, gift card, and store credit fields are accessible" },
  ],
};

// Back-compat: a few callers may import the static map. Resolve at access time.
export const baymardGuidelines: Record<PageType, Guideline[]> = new Proxy(
  {} as Record<PageType, Guideline[]>,
  {
    get(_t, prop: string) {
      return load()[prop as PageType];
    },
  },
);
