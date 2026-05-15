import type { MetadataRoute } from "next";

// Next.js auto-compiles this into /manifest.webmanifest and injects the
// <link rel="manifest" /> tag into <head>. Pairs with the `appleWebApp` +
// `viewport.themeColor` config in app/layout.tsx — together they make the
// app installable on iOS (Add to Home Screen) and Android (Install app).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cardIO",
    short_name: "cardIO",
    description:
      "Personal YGO & MTG card-collection manager with collection-aware deck building.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#18181b", // zinc-900, matches splash background
    theme_color: "#18181b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
