import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Never let the browser cache the service worker itself, so an updated
        // offline strategy ships immediately instead of being pinned by HTTP
        // caching. (The SW's own runtime caches are versioned in public/sw.js.)
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  images: {
    // Card art comes from Scryfall / YGOPRODeck CDNs already sized and
    // compressed — routing it through Vercel's optimizer only burns the
    // Image Optimization transformation quota with no real benefit.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "cards.scryfall.io" },
      { protocol: "https", hostname: "c1.scryfall.com" },
      { protocol: "https", hostname: "images.ygoprodeck.com" },
    ],
  },
};

export default nextConfig;
