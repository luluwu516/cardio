"use client";

import { useRouter } from "next/navigation";

export function BackButton({ fallback = "/collection" }: { fallback?: string }) {
  const router = useRouter();

  function handleClick() {
    // history.length === 1 means the user landed directly on this page
    // (deep link / refresh) — no back stack to pop, so route to a sensible fallback.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }

  return (
    <button
      onClick={handleClick}
      className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      ← Back
    </button>
  );
}
