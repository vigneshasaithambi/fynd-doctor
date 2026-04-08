import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";

puppeteer.use(StealthPlugin());

export const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
export const MOBILE_VIEWPORT = {
  width: 375,
  height: 812,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};

const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function launchBrowser(): Promise<Browser> {
  // puppeteer-extra wraps puppeteer; cast for Browser type
  const browser = (await (puppeteer as unknown as {
    launch: (opts: Record<string, unknown>) => Promise<Browser>;
  }).launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  })) as Browser;
  return browser;
}

export async function newDesktopPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport(DESKTOP_VIEWPORT);
  await page.setUserAgent(UA_DESKTOP);
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(15000);
  return page;
}

export async function newMobilePage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport(MOBILE_VIEWPORT);
  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  );
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(15000);
  return page;
}
