import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Defaults to `.next` so `next dev` is unaffected. Setting NEXT_DIST_DIR
  // lets a production build be produced and served alongside a running dev
  // server without the two fighting over the same build directory — useful
  // for testing on a phone, where the dev build's multi-megabyte unminified
  // bundle is too slow to be representative (or even usable).
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
