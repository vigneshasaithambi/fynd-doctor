// Spec §5.7 — programmatic sticky / persistent UI pattern detection.
//
// Run after the page is loaded and screenshots captured. Scrolls 800px so
// position:sticky elements actually pin, then walks the DOM checking for
// fixed/sticky positioning on the elements that matter for CRO:
//
//   - header        : sticky top bar / nav
//   - cartIcon      : persistent cart link in the header
//   - primaryCta    : sticky Add-to-Cart on PDP, Checkout button on cart, etc.
//   - filterRail    : sticky left rail on category page
//   - checkoutCta   : sticky "Place Order" / "Continue" on checkout
//
// Eval body is shipped as a raw string so esbuild/Turbopack can't inject
// `__name` helpers (same fix we used in lighthouseLite/scrape.ts).

import type { Page } from "puppeteer";
import type { StickySignals } from "../types";

const STICKY_JS = `
(() => {
  var isSticky = function (el) {
    if (!el) return false;
    var p = getComputedStyle(el).position;
    return p === "fixed" || p === "sticky";
  };

  // Walk up to find any sticky ancestor (sticky often lives on a wrapper).
  var stickyAncestor = function (el) {
    var n = el;
    for (var i = 0; i < 5 && n; i++) {
      if (isSticky(n)) return true;
      n = n.parentElement;
    }
    return false;
  };

  // ---- header ----------------------------------------------------------
  var header =
    document.querySelector("header") ||
    document.querySelector('[role="banner"]') ||
    document.querySelector(".site-header, #header, #site-header");
  var headerSticky = !!header && stickyAncestor(header);

  // ---- cart icon -------------------------------------------------------
  var cartEl =
    document.querySelector('a[href*="/cart"]') ||
    document.querySelector('[data-cart-link], #cart-icon, .cart-link, .site-header__cart');
  var cartIconSticky = !!cartEl && stickyAncestor(cartEl);

  // ---- primary CTA (PDP add-to-cart, cart checkout button) -------------
  var ctaSelectors = [
    'button[data-action="add-to-cart"]',
    'button[name="add"]',
    "button.add-to-cart",
    "button.product-form__submit",
    "#add-to-cart",
    "#AddToCart",
    "[data-add-to-cart]",
    'a[href*="/checkout"]',
    'button[name="checkout"]',
    ".checkout-button"
  ];
  var primaryCtaSticky = false;
  for (var i = 0; i < ctaSelectors.length; i++) {
    var els = document.querySelectorAll(ctaSelectors[i]);
    for (var j = 0; j < els.length; j++) {
      if (stickyAncestor(els[j])) { primaryCtaSticky = true; break; }
    }
    if (primaryCtaSticky) break;
  }

  // ---- filter rail (category) ------------------------------------------
  var filterEl =
    document.querySelector('aside[class*="filter" i]') ||
    document.querySelector('[class*="facets" i], [class*="sidebar" i]');
  var filterRailSticky = !!filterEl && stickyAncestor(filterEl);

  // ---- checkout CTA ----------------------------------------------------
  var checkoutCtaEl =
    document.querySelector('button[type="submit"][name*="checkout" i]') ||
    document.querySelector('button[class*="place-order" i], button[class*="continue" i]') ||
    document.querySelector('input[type="submit"][value*="place order" i]');
  var checkoutCtaSticky = !!checkoutCtaEl && stickyAncestor(checkoutCtaEl);

  return {
    header: headerSticky,
    cartIcon: cartIconSticky,
    primaryCta: primaryCtaSticky,
    filterRail: filterRailSticky,
    checkoutCta: checkoutCtaSticky
  };
})();
`;

export async function detectSticky(page: Page): Promise<StickySignals> {
  try {
    await page.evaluate("window.scrollTo(0, 800)");
    await new Promise((r) => setTimeout(r, 400));
    const result = (await page.evaluate(STICKY_JS)) as StickySignals;
    return result;
  } catch (e) {
    console.warn("[stickyDetector] failed:", (e as Error).message);
    return {
      header: false,
      cartIcon: false,
      primaryCta: false,
      filterRail: false,
      checkoutCta: false,
    };
  }
}
