// Selectors and text patterns from spec §3.3

export const ATC_SELECTORS = [
  'button[data-action="add-to-cart"]',
  'button[name="add"]',
  "button.add-to-cart",
  "button.product-form__submit",
  "#add-to-cart",
  "#AddToCart",
  ".btn-add-to-cart",
  "[data-add-to-cart]",
  'form[action*="/cart/add"] button[type="submit"]',
  'form[action*="/cart"] button[type="submit"]',
];

export const ATC_TEXT_PATTERNS = [
  /add to cart/i,
  /add to bag/i,
  /buy now/i,
  /add to basket/i,
];

export const CART_LINK_SELECTORS = [
  'a[href*="/cart"]',
  'a[href="/cart"]',
  ".cart-link",
  '[data-cart-link]',
  '.site-header__cart',
  '#cart-icon',
];

export const CHECKOUT_BUTTON_SELECTORS = [
  'a[href*="/checkout"]',
  'button[name="checkout"]',
  '#checkout',
  '.checkout-button',
  'input[name="checkout"]',
];

export const CATEGORY_LINK_HINTS = [
  "/collections/",
  "/category/",
  "/categories/",
  "/shop/",
  "/c/",
  "/department/",
];

export const PRODUCT_LINK_HINTS = [
  "/products/",
  "/product/",
  "/p/",
  "/item/",
  "/dp/",
];
