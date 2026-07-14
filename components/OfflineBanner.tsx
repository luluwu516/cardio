"use client";

import { useOnlineStatus } from "@/lib/useOnlineStatus";

// Slim app-wide bar shown only while offline, so it's obvious why edit/search
// buttons are disabled and that the collection view is a saved snapshot.
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
      Offline · viewing your saved collection (read-only)
    </div>
  );
}
