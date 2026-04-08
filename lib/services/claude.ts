import type { Finding, PageType, Severity, CategoryKey, Bucket } from "../types";
import { v4 as uuid } from "uuid";

let cachedClient: unknown = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const mod = await import("@anthropic-ai/sdk");
  const Anthropic = (mod as { default: new (opts: { apiKey: string }) => unknown }).default;
  cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

export interface ClaudeTextInput {
  system: string;
  user: string;
}

export interface ClaudeVisionInput {
  system: string;
  user: string;
  imageBase64: string;
  mediaType?: string;
}

interface AnthropicLike {
  messages: {
    create: (opts: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

// Exponential-backoff retry wrapper (scale plan Step 6). Retries on 429 and
// 5xx; bails immediately on 4xx (bad request, auth, etc.). 1s → 2s → 4s.
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number; statusCode?: number })?.status
        ?? (e as { statusCode?: number })?.statusCode
        ?? 0;
      const retryable = status === 429 || (status >= 500 && status < 600) || status === 0;
      if (!retryable || attempt === MAX_ATTEMPTS) throw e;
      const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.warn(
        `[claude:${label}] attempt ${attempt} failed (status=${status}), retrying in ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function claudeText(input: ClaudeTextInput): Promise<string> {
  const client = (await getClient()) as AnthropicLike | null;
  if (!client) return "";
  const res = await withRetry(
    () =>
      client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      }),
    "text",
  );
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  return text;
}

export async function claudeVision(input: ClaudeVisionInput): Promise<string> {
  const client = (await getClient()) as AnthropicLike | null;
  if (!client) return "";
  const res = await withRetry(
    () =>
      client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        system: input.system,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: input.mediaType ?? "image/png",
                  data: input.imageBase64,
                },
              },
              { type: "text", text: input.user },
            ],
          },
        ],
      }),
    "vision",
  );
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  return text;
}

export function hasClaudeKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ----- Deterministic mock generator -----

const SEED_TEMPLATES: Record<
  PageType,
  Array<{
    title: string;
    description: string;
    severity: Severity;
    category: CategoryKey;
    bucket: Bucket;
    fyndAdvantage?: string;
    recommendation: string;
  }>
> = {
  homepage: [
    {
      title: "Hero LCP exceeds 2.5s on mobile",
      description: "Largest contentful paint of the hero image is over the recommended 2.5s threshold on mid-tier mobile.",
      severity: "high",
      category: "performance",
      bucket: "platform-limited",
      fyndAdvantage: "Fynd's edge-cached storefront ships sub-2s LCP out of the box on global CDN",
      recommendation: "Preload the hero image, serve AVIF, and route static assets through a global CDN.",
    },
    {
      title: "Search field hidden behind icon",
      description: "Homepage search is collapsed into an icon instead of an open search bar — Baymard recommends an always-visible field.",
      severity: "medium",
      category: "conversion",
      bucket: "fix-now",
      recommendation: "Expose an open search input above the fold on desktop and tablet.",
    },
    {
      title: "No structured data on homepage",
      description: "Organization and WebSite schema are missing, hurting rich result eligibility.",
      severity: "medium",
      category: "seo",
      bucket: "fix-now",
      recommendation: "Add Organization, WebSite, and SearchAction JSON-LD to the homepage <head>.",
    },
  ],
  category: [
    {
      title: "Filters require taps to reveal on desktop",
      description: "Faceted filters are hidden behind a 'Filter' button on desktop instead of being shown in a left rail.",
      severity: "high",
      category: "conversion",
      bucket: "fix-now",
      recommendation: "Render the filter rail open by default on desktop ≥1024px.",
    },
    {
      title: "Product cards lack hover quick-add",
      description: "Users must enter the PDP to add to cart from a category — adds friction for repeat buyers.",
      severity: "medium",
      category: "conversion",
      bucket: "platform-limited",
      fyndAdvantage: "Fynd themes ship with quick-add and quick-view on every category card",
      recommendation: "Enable quick-add CTA on hover for desktop product cards.",
    },
  ],
  pdp: [
    {
      title: "No sticky Add to Cart on mobile",
      description: "Once the buy box scrolls out of view on mobile, there is no persistent Add to Cart button.",
      severity: "critical",
      category: "mobile",
      bucket: "platform-limited",
      fyndAdvantage: "Fynd themes ship with sticky ATC by default on every PDP",
      recommendation: "Add a sticky bottom bar with price + Add to Cart on mobile PDPs.",
    },
    {
      title: "Variant selectors use dropdowns instead of swatches",
      description: "Color and size are hidden inside <select> elements — Baymard PDP-02 recommends visual swatches.",
      severity: "high",
      category: "conversion",
      bucket: "fix-now",
      recommendation: "Replace dropdowns with visual color swatches and size pills.",
    },
    {
      title: "Shipping cost not shown until checkout",
      description: "Customers can't see when their order will arrive or how much shipping costs from the PDP.",
      severity: "high",
      category: "conversion",
      bucket: "fix-now",
      recommendation: "Surface a shipping estimate widget below Add to Cart with ZIP-based ETA.",
    },
  ],
  cart: [
    {
      title: "No express wallet buttons in cart",
      description: "Apple Pay, Shop Pay, and Google Pay are missing from the cart drawer.",
      severity: "high",
      category: "conversion",
      bucket: "platform-limited",
      fyndAdvantage: "Fynd Checkout includes one-tap wallets natively, no app install",
      recommendation: "Add express wallet buttons above the primary checkout CTA.",
    },
    {
      title: "Free shipping progress bar missing",
      description: "Users don't know how close they are to a free shipping threshold.",
      severity: "medium",
      category: "conversion",
      bucket: "fix-now",
      recommendation: "Show a progress bar with the remaining amount needed for free shipping.",
    },
  ],
  checkout: [
    {
      title: "Forced account creation",
      description: "Checkout requires creating an account before placing an order — Baymard's #1 cause of abandonment.",
      severity: "critical",
      category: "conversion",
      bucket: "platform-limited",
      fyndAdvantage: "Fynd offers true guest checkout with optional post-purchase signup",
      recommendation: "Enable guest checkout and offer account creation post-purchase.",
    },
    {
      title: "No address autocomplete",
      description: "Address fields are manual, increasing typos and abandonment.",
      severity: "high",
      category: "technical",
      bucket: "platform-limited",
      fyndAdvantage: "Fynd Checkout has built-in address verification + autofill",
      recommendation: "Integrate Google Places (or equivalent) address autocomplete.",
    },
    {
      title: "Limited payment options for region",
      description: "Only credit card is shown — no UPI, COD, or local wallets.",
      severity: "high",
      category: "conversion",
      bucket: "platform-limited",
      fyndAdvantage: "Fynd supports 100+ Indian payment methods including UPI, COD, EMI, BNPL",
      recommendation: "Expand payment methods to include locally relevant options.",
    },
  ],
};

export function mockFindingsForPage(pageType: PageType): Finding[] {
  return SEED_TEMPLATES[pageType].map((t) => ({
    id: uuid(),
    pageType,
    ...t,
  }));
}
