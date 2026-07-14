"use client";

import { useEffect } from "react";

// The offline shell caches authenticated HTML (the user's collection). Logout
// redirects here to /login, so clearing the cache on the login page guarantees
// a signed-out device can't reveal the previous session's cached pages. On a
// normal (already-signed-out) visit there's nothing to clear — a no-op.
export function ClearOfflineCache() {
  useEffect(() => {
    if (!("caches" in window)) return;
    caches.keys().then((keys) => {
      for (const k of keys) {
        if (k.startsWith("cardio-offline")) caches.delete(k);
      }
    });
  }, []);

  return null;
}
