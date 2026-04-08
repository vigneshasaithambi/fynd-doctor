import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Puppeteer is auto-externalized by Next, but puppeteer-extra and the stealth
  // plugin are not on the built-in list. Letting Turbopack bundle them breaks
  // the stealth plugin's internal use of merge-deep / clone-deep with a runtime
  // "utils.typeOf is not a function" error. Mark them external so they're
  // require()'d natively at runtime instead of being bundled.
  serverExternalPackages: [
    "puppeteer-extra",
    "puppeteer-extra-plugin-stealth",
  ],
};

export default nextConfig;
