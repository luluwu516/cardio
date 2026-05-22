import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
