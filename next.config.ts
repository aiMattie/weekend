import type { NextConfig } from "next";

// NOTE: `cacheComponents` / `partialPrefetching` were removed from the scaffold on purpose:
// this app is almost entirely request-time data behind a login, and Cache Components forbids
// the route-segment config and request-time reads that our services/route handlers rely on.
const nextConfig: NextConfig = {
  // Every agent/dev server uses its own dist dir (NEXT_DIST_DIR=.next-<name>) so they never clash.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Native module: must not be bundled.
  serverExternalPackages: ["better-sqlite3"],
  // @vibe/* ships pure ESM with runtime-injected CSS; transpile so it works in both layers.
  transpilePackages: ["@vibe/core", "@vibe/icons"],
  turbopack: {
    rules: {
      // Tailwind only for the entry stylesheet that imports it. A blanket "*.css" rule would also
      // swallow *.module.css and turn CSS modules into global CSS.
      "*.css": {
        condition: { all: [{ not: "foreign" }, { content: /@import\s+["']tailwindcss["']/ }] },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
