"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import type { DeckCardDisplay } from "./DeckEditor";

// Read-only "at the store" view of a wishlist: big images + names + wanted
// quantity, made to be held up to a shop clerk. Non-destructive check-off marks
// what's been pulled (kept client-side so the list stays reusable), a sticky
// bar shows progress + the remaining estimated spend, tapping a card opens the
// art fullscreen, and a Screen Wake Lock keeps the display from dimming mid-buy.
export function WishlistStoreView({
  deckId,
  cards,
  onExit,
}: {
  deckId: string;
  cards: DeckCardDisplay[];
  onExit: () => void;
}) {
  const storageKey = `wishlist-acquired-${deckId}`;
  // Lazy init from sessionStorage — this view only ever mounts client-side
  // (after the "Store mode" click), so there's no SSR/hydration pass to mismatch.
  const [acquired, setAcquired] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [zoom, setZoom] = useState<DeckCardDisplay | null>(null);

  function toggle(cardId: string) {
    setAcquired((prev) => {
      const next = { ...prev, [cardId]: !prev[cardId] };
      if (!next[cardId]) delete next[cardId];
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  // Keep the screen awake while shopping (best-effort; unsupported browsers
  // just no-op). Re-acquire on visibility regain — iOS drops the lock when the
  // tab backgrounds.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        // permission denied / not supported
      }
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  const doneCount = cards.filter((c) => acquired[c.cardId]).length;
  const remainingTotal = useMemo(
    () =>
      cards.reduce(
        (sum, c) =>
          acquired[c.cardId] ? sum : sum + (c.estPriceUsd ?? 0) * c.inDeck,
        0,
      ),
    [cards, acquired],
  );

  return (
    // Bottom padding clears both the sticky total bar and the app's tab bar so
    // the last card is never hidden behind them.
    <div className="pb-[calc(8rem+env(safe-area-inset-bottom))]">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={onExit}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← Edit
        </button>
        <span className="text-xs text-zinc-500">Tap a card to enlarge</span>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nothing on this list yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {cards.map((c) => {
            const got = !!acquired[c.cardId];
            return (
              <li
                key={c.cardId}
                className={
                  "flex gap-3 rounded-xl border p-3 transition-colors " +
                  (got
                    ? "border-emerald-500/50 bg-emerald-500/5 opacity-60"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900")
                }
              >
                <button
                  onClick={() => setZoom(c)}
                  aria-label={`Enlarge ${c.name}`}
                  className="relative h-28 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800"
                >
                  {c.image_url ? (
                    <Image
                      src={c.image_url}
                      alt={c.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : null}
                </button>

                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="text-base font-semibold leading-tight">
                    {c.name}
                  </p>
                  {c.note ? (
                    <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-300">
                      {c.note}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {c.estPriceUsd !== null
                      ? `~$${(c.estPriceUsd * c.inDeck).toFixed(2)}`
                      : "price n/a"}
                    {c.owned > 0 ? ` · own ${c.owned}` : ""}
                  </p>

                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="text-xl font-bold tabular-nums">
                      ×{c.inDeck}
                    </span>
                    <button
                      onClick={() => toggle(c.cardId)}
                      aria-pressed={got}
                      className={
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                        (got
                          ? "bg-emerald-600 text-white"
                          : "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800")
                      }
                    >
                      {got ? "✓ Got it" : "Mark bought"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Sticky progress + remaining spend. Sits above the app's bottom tab bar
          (≈ tab height + the iOS home-indicator inset) so the two never overlap. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-3xl px-4">
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white/95 px-4 py-2 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
          <span className="text-sm font-medium">
            {doneCount}/{cards.length} bought
          </span>
          <span className="text-sm text-zinc-600 dark:text-zinc-300">
            ~${remainingTotal.toFixed(2)} left
          </span>
        </div>
      </div>

      {/* Fullscreen art to show the clerk the exact card. */}
      {zoom ? (
        <button
          onClick={() => setZoom(null)}
          className="animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
          aria-label="Close"
        >
          {zoom.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={zoom.image_url}
              alt={zoom.name}
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
          ) : null}
          <p className="mt-3 text-center text-lg font-semibold text-white">
            {zoom.name} · ×{zoom.inDeck}
          </p>
          {zoom.note ? (
            <p className="text-sm text-amber-300">{zoom.note}</p>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
