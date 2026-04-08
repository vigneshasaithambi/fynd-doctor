import type { Page } from "puppeteer";
import { ATC_SELECTORS, ATC_TEXT_PATTERNS } from "../utils/selectors";

// Variant pre-selection per spec §3.4
export async function preselectVariants(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      // Click first available swatch / pill / radio for size and color
      const variantContainers = Array.from(
        document.querySelectorAll(
          '[data-option-name], .variant-input, .product-form__input, fieldset',
        ),
      );
      for (const c of variantContainers) {
        const option = c.querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled]):not([aria-disabled="true"]), label',
        );
        if (option) {
          option.click();
        }
      }
      // Selects
      const selects = document.querySelectorAll<HTMLSelectElement>("select");
      selects.forEach((s) => {
        for (const opt of Array.from(s.options)) {
          if (!opt.disabled && opt.value) {
            s.value = opt.value;
            s.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
        }
      });
    });
    await sleep(600);
  } catch (e) {
    console.warn("preselectVariants failed:", (e as Error).message);
  }
}

// ATC selector cascade — spec §3.3
export async function clickAddToCart(page: Page): Promise<boolean> {
  // Try CSS selectors first
  for (const sel of ATC_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click({ delay: 50 }).catch(() => {});
        await sleep(1500);
        return true;
      }
    } catch {}
  }
  // Try text-based fallback
  const clickedByText = await page.evaluate((patterns) => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, a, input[type=submit]"));
    for (const b of buttons) {
      const text = (b.innerText || (b as HTMLInputElement).value || "").trim();
      for (const p of patterns) {
        if (new RegExp(p, "i").test(text)) {
          (b as HTMLElement).click();
          return true;
        }
      }
    }
    return false;
  }, ATC_TEXT_PATTERNS.map((r) => r.source));
  if (clickedByText) {
    await sleep(1500);
    return true;
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
