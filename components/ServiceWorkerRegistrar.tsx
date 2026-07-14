"use client";

import { useEffect } from "react";

// Registers the offline-shell service worker (public/sw.js). Production only:
// in dev, Turbopack rebuilds asset hashes constantly and a caching worker will
// happily serve stale chunks, which is maddening to debug. Test the offline
// behaviour against the Vercel deployment (real HTTPS + real build) or a local
// `next build && next start --experimental-https`.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => {
        // Registration failure just means no offline support — not fatal.
      });
  }, []);

  return null;
}
