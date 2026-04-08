// Section A4 (moved to integration because it needs a real Page) — 14-method
// payment detector via DOM scrape.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Browser } from "puppeteer";
import { launchBrowser } from "@/lib/crawler/browser";
import { detectPaymentMethods, countPayments } from "@/lib/crawler/paymentDetector";

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
}, 60_000);

afterAll(async () => {
  if (browser) await browser.close().catch(() => {});
});

async function loadHtml(html: string) {
  const page = await browser.newPage();
  await page.goto("data:text/html," + encodeURIComponent(html), { waitUntil: "networkidle0" });
  return page;
}

describe("detectPaymentMethods", () => {
  it("#31 detects all 14 methods individually from text patterns", async () => {
    const page = await loadHtml(`
      <p>We accept Cash on Delivery, Net Banking, UPI, Klarna (pay later), EMI,
      Gift Card, PayPal, Google Pay, Apple Pay, Shop Pay, Visa credit card,
      Maestro debit card, Paytm wallet, Bitcoin.</p>
    `);
    try {
      const result = await detectPaymentMethods(page);
      expect(result.cod).toBe(true);
      expect(result.netBanking).toBe(true);
      expect(result.upi).toBe(true);
      expect(result.bnpl).toBe(true);
      expect(result.emi).toBe(true);
      expect(result.giftCard).toBe(true);
      expect(result.paypal).toBe(true);
      expect(result.googlePay).toBe(true);
      expect(result.applePay).toBe(true);
      expect(result.shopPay).toBe(true);
      expect(result.creditCard).toBe(true);
      expect(result.debitCard).toBe(true);
      expect(result.wallet).toBe(true);
      expect(result.crypto).toBe(true);
      expect(countPayments(result)).toBe(14);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("#32 detects payment methods via script tags (paypal SDK)", async () => {
    const page = await loadHtml(`
      <script src="https://www.paypal.com/sdk/js"></script>
      <p>checkout</p>
    `);
    try {
      const result = await detectPaymentMethods(page);
      expect(result.paypal).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("#33 paymentCount matches detected methods", async () => {
    const page = await loadHtml(`<p>Apple Pay and Google Pay only</p>`);
    try {
      const result = await detectPaymentMethods(page);
      expect(countPayments(result)).toBe(2);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("#34 empty DOM → all flags false, count 0", async () => {
    const page = await loadHtml("<p>nothing here</p>");
    try {
      const result = await detectPaymentMethods(page);
      expect(countPayments(result)).toBe(0);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("#35 locale-relevant: UPI + COD detection from Indian D2C copy", async () => {
    const page = await loadHtml(`
      <p>Pay with UPI, COD available across India. Cash on delivery for Tier 2/3 cities.</p>
    `);
    try {
      const result = await detectPaymentMethods(page);
      expect(result.upi).toBe(true);
      expect(result.cod).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("#36 case-insensitive matching (GOOGLE PAY)", async () => {
    const page = await loadHtml(`<p>GOOGLE PAY accepted</p>`);
    try {
      const result = await detectPaymentMethods(page);
      expect(result.googlePay).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);
});
