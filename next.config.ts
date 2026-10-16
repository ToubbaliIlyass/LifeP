import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/*
 * This machine's own addresses on the network, so the dev server can be
 * opened from a phone on the same Wi-Fi.
 *
 * `next dev` refuses its scripts to any origin but the one it was started on
 * (localhost). The page itself still arrives, so on a phone the app looked
 * fine and did nothing: no JavaScript ever ran, and "Continue with Google"
 * was a picture of a button. Looked up fresh each start rather than written
 * down, because the address changes with the network.
 */
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
  // Defaults to `.next` so `next dev` is unaffected. Setting NEXT_DIST_DIR
  // lets a production build be produced and served alongside a running dev
  // server without the two fighting over the same build directory — useful
  // for testing on a phone, where the dev build's multi-megabyte unminified
  // bundle is too slow to be representative (or even usable).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // The site and the app each have their own root layout, so a missing
    // page has none to share — see src/app/global-not-found.tsx.
    globalNotFound: true,
  },
  async headers() {
    return [
      {
        // The service worker is fetched fresh every time, so a fix to it
        // reaches installed copies at once instead of whenever a cache expires.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
