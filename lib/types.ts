// Report data model — matches spec §7

export type Severity = "critical" | "high" | "medium" | "low";
export type Bucket = "fix-now" | "platform-limited";
export type PageType = "homepage" | "category" | "pdp" | "cart" | "checkout";

export interface CoreWebVitals {
  lcp: number;
  cls: number;
  inp: number;
  fcp: number;
  ttfb: number;
}

export interface PageSpeedResult {
  url: string;
  strategy: "mobile" | "desktop";
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  cwv: CoreWebVitals;
  mocked?: boolean;
}

export interface Finding {
  id: string;
  title: string;
  description: string;
  evidence?: string;
  severity: Severity;
  category: CategoryKey;
  bucket: Bucket;
  fyndAdvantage?: string;
  recommendation: string;
  pageType: PageType;
}

export type CategoryKey =
  | "performance"
  | "mobile"
  | "seo"
  | "conversion"
  | "technical"
  | "baymardUx";

export interface CategoryScore {
  key: CategoryKey;
  label: string;
  score: number; // 0-100
  weight: number; // 0-1
}

// Spec §5.7 — sticky / persistent UI signals from lib/crawler/stickyDetector.ts
export interface StickySignals {
  header: boolean;
  cartIcon: boolean;
  primaryCta: boolean;
  filterRail: boolean;
  checkoutCta: boolean;
}

export interface PageReport {
  pageType: PageType;
  url: string | null;
  reached: boolean;
  screenshots: {
    desktop?: string;
    mobile?: string;
  };
  pageSpeed?: {
    mobile?: PageSpeedResult;
    desktop?: PageSpeedResult;
  };
  sticky?: StickySignals;
  findings: Finding[];
  notes?: string[];
}

export interface PaymentMethods {
  cod: boolean;
  netBanking: boolean;
  upi: boolean;
  bnpl: boolean;
  emi: boolean;
  giftCard: boolean;
  paypal: boolean;
  googlePay: boolean;
  applePay: boolean;
  shopPay: boolean;
  creditCard: boolean;
  debitCard: boolean;
  wallet: boolean;
  crypto: boolean;
}

export interface CheckoutScorecardData {
  type: "multi-step" | "single-page" | "accordion" | "unknown";
  steps: number;
  guestCheckout: boolean;
  socialLogin: boolean;
  addressAutocomplete: boolean;
  trustBadges: boolean;
  payments: PaymentMethods;
  paymentCount: number;
  score: number; // 0-100
}

export interface BucketSummary {
  fixNow: Finding[];
  platformLimited: Finding[];
}

export interface Report {
  id: string;
  url: string;
  domain: string;
  createdAt: string;
  status: "running" | "complete" | "error";
  overallScore: number;
  categoryScores: CategoryScore[];
  stats: {
    totalIssues: number;
    criticalIssues: number;
    bucket1Count: number;
    bucket2Count: number;
  };
  pages: PageReport[];
  checkoutScorecard?: CheckoutScorecardData;
  bucketSummary: BucketSummary;
  execSummary: string;
  error?: string;
}

export interface StatusFile {
  id: string;
  phase: number; // 0..9, or -1 when queued
  step: string;
  done: boolean;
  error?: string;
  updatedAt: string;
  // Set when the crawl is waiting in the in-process queue (Step 2 of scale plan).
  // 0-indexed position; absent once running.
  queuePosition?: number;
}
