import type { Page } from "puppeteer";
import { testPersona } from "../utils/testPersona";
import type { CheckoutScorecardData } from "../types";
import { detectPaymentMethods, countPayments } from "./paymentDetector";

// Multi-step / single-page / accordion detection + safe form fill (NEVER click Place Order)

export async function fillCheckoutForms(page: Page): Promise<void> {
  try {
    await page.evaluate((p) => {
      const set = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => {
        const proto = (el as HTMLInputElement) instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const map: Array<[RegExp, string]> = [
        [/email/i, p.email],
        [/first.?name|fname|given/i, p.firstName],
        [/last.?name|lname|surname|family/i, p.lastName],
        [/full.?name|^name$/i, p.fullName],
        [/phone|mobile|tel/i, p.phone],
        [/address.?1|street|line.?1|^address$/i, p.address1],
        [/address.?2|line.?2|apt|suite|unit/i, p.address2],
        [/city|town/i, p.city],
        [/state|province|region/i, p.state],
        [/zip|postal|postcode/i, p.zip],
        [/country/i, p.country],
      ];

      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input, select, textarea",
        ),
      );
      for (const el of inputs) {
        const id = (el.id + " " + el.getAttribute("name") + " " + el.getAttribute("placeholder") + " " + el.getAttribute("autocomplete")).toLowerCase();
        if (!id) continue;
        for (const [re, val] of map) {
          if (re.test(id)) {
            set(el, val);
            break;
          }
        }
      }
    }, testPersona);
  } catch (e) {
    console.warn("fillCheckoutForms failed:", (e as Error).message);
  }
}

export async function buildCheckoutScorecard(page: Page): Promise<CheckoutScorecardData> {
  const meta = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const html = document.documentElement.outerHTML || "";
    const stepIndicators = document.querySelectorAll(
      '[class*="step"], [class*="progress"], [data-step]',
    ).length;
    return {
      text,
      hasGuest: /guest|continue as guest|checkout as guest/i.test(text),
      hasSocial: /sign in with (google|facebook|apple)|continue with (google|facebook|apple)/i.test(html),
      hasAutocomplete: /google.*places|address.*autocomplete|loqate|smartystreets/i.test(html),
      hasTrustBadges: /secure checkout|256-bit|ssl|trustwave|norton|mcafee/i.test(text),
      stepIndicators,
      hasMultipleSteps: /step \d|\bstep [a-z]/i.test(text),
    };
  });

  const payments = await detectPaymentMethods(page);
  const paymentCount = countPayments(payments);

  let type: CheckoutScorecardData["type"] = "single-page";
  if (meta.stepIndicators >= 2 || meta.hasMultipleSteps) type = "multi-step";

  // Score
  let score = 50;
  if (meta.hasGuest) score += 15;
  if (meta.hasAutocomplete) score += 10;
  if (meta.hasTrustBadges) score += 5;
  if (meta.hasSocial) score += 5;
  score += Math.min(15, paymentCount * 2);
  score = Math.min(100, score);

  return {
    type,
    steps: Math.max(1, meta.stepIndicators || (type === "multi-step" ? 3 : 1)),
    guestCheckout: meta.hasGuest,
    socialLogin: meta.hasSocial,
    addressAutocomplete: meta.hasAutocomplete,
    trustBadges: meta.hasTrustBadges,
    payments,
    paymentCount,
    score,
  };
}
