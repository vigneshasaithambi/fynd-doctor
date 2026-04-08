import type { Page } from "puppeteer";
import type { PaymentMethods } from "../types";

// Spec §5.6.5 — full 14-method scan
const TEXT_PATTERNS: Record<keyof PaymentMethods, RegExp> = {
  cod: /cash on delivery|cash when delivered|pay on delivery|cod\b/i,
  netBanking: /net banking|online banking|bank transfer|direct bank/i,
  upi: /\bupi\b|unified payment|bhim/i,
  bnpl: /pay later|buy now pay later|klarna|afterpay|affirm|sezzle|zip pay/i,
  emi: /\bemi\b|equated monthly|installments?/i,
  giftCard: /gift card|gift certificate|e-gift/i,
  paypal: /paypal/i,
  googlePay: /google pay|gpay/i,
  applePay: /apple pay/i,
  shopPay: /shop pay/i,
  creditCard: /credit card|visa|mastercard|amex|american express/i,
  debitCard: /debit card|maestro|rupay/i,
  wallet: /paytm|phonepe|mobikwik|amazon pay|wallet/i,
  crypto: /bitcoin|crypto|btc|ethereum|usdc/i,
};

const SCRIPT_PATTERNS: Partial<Record<keyof PaymentMethods, RegExp>> = {
  paypal: /paypal/i,
  googlePay: /pay\.google|gpay/i,
  applePay: /apple.*pay/i,
  shopPay: /shop.*pay|shopify/i,
};

export async function detectPaymentMethods(page: Page): Promise<PaymentMethods> {
  const result: PaymentMethods = {
    cod: false,
    netBanking: false,
    upi: false,
    bnpl: false,
    emi: false,
    giftCard: false,
    paypal: false,
    googlePay: false,
    applePay: false,
    shopPay: false,
    creditCard: false,
    debitCard: false,
    wallet: false,
    crypto: false,
  };

  try {
    const data = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const html = document.documentElement.outerHTML || "";
      const scripts = Array.from(document.querySelectorAll("script"))
        .map((s) => s.src + " " + (s.textContent || ""))
        .join(" ");
      const imgAlts = Array.from(document.querySelectorAll("img"))
        .map((i) => (i.getAttribute("alt") || "") + " " + (i.getAttribute("src") || ""))
        .join(" ");
      return { text, html, scripts, imgAlts };
    });

    for (const key of Object.keys(TEXT_PATTERNS) as Array<keyof PaymentMethods>) {
      const pattern = TEXT_PATTERNS[key];
      if (pattern.test(data.text) || pattern.test(data.imgAlts)) {
        result[key] = true;
      }
    }
    for (const key of Object.keys(SCRIPT_PATTERNS) as Array<keyof PaymentMethods>) {
      const pattern = SCRIPT_PATTERNS[key];
      if (pattern && (pattern.test(data.scripts) || pattern.test(data.html))) {
        result[key] = true;
      }
    }
  } catch (e) {
    console.warn("detectPaymentMethods failed:", (e as Error).message);
  }

  return result;
}

export function countPayments(p: PaymentMethods): number {
  return Object.values(p).filter(Boolean).length;
}
