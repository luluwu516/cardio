"use client";

import { useEffect, useState } from "react";

// Tracks network reachability via the browser's online/offline events. Seeds
// to `true` so server render and first client render agree (avoids a hydration
// mismatch); the effect corrects it from navigator.onLine on mount. Used to
// disable write / search actions when offline — the offline shell (public/sw.js)
// still serves the last-cached collection for read-only browsing.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
