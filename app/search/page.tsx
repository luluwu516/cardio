"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import type { Game, SearchHit } from "@/lib/cards/types";
import { applyDelta } from "./actions";

const GAMES: Game[] = ["YGO", "MTG"];

function keyOf(hit: { game: Game; external_id: string }): string {
  return `${hit.game}:${hit.external_id}`;
}

export default function SearchPage() {
  const [game, setGame] = useState<Game>("YGO");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-card uncommitted delta. Non-zero entry → card is in "edit mode"
  // showing a Confirm button. Zero / missing → committed/idle state.
  const [pending, setPending] = useState<Record<string, number>>({});
  // Per-card in-flight Confirm.
  const [committing, setCommitting] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const trimmed = query.trim();
  const isValidQuery = trimmed.length >= 2;
  const display = isValidQuery ? results : [];

  useEffect(() => {
    if (!isValidQuery) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/search/${game}?q=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal },
        );
        const data = (await res.json()) as
          | { results: SearchHit[] }
          | { error: string };
        if ("error" in data) {
          setError(data.error);
          setResults([]);
        } else {
          setResults(data.results);
          // Fresh server numbers — drop any unconfirmed edits.
          setPending({});
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed, game, isValidQuery]);

  function handleGameChange(g: Game) {
    if (g === game) return;
    setGame(g);
    setResults([]);
    setError(null);
    setPending({});
  }

  function adjust(hit: SearchHit, sign: 1 | -1) {
    const key = keyOf(hit);
    if (committing[key]) return;
    setPending((p) => {
      const nextDelta = (p[key] ?? 0) + sign;
      // Floor displayed count at 0.
      if (hit.owned + nextDelta < 0) return p;
      const next = { ...p };
      if (nextDelta === 0) {
        delete next[key];
      } else {
        next[key] = nextDelta;
      }
      return next;
    });
  }

  function confirm(hit: SearchHit) {
    const key = keyOf(hit);
    const delta = pending[key] ?? 0;
    if (delta === 0) return;
    setCommitting((c) => ({ ...c, [key]: true }));
    startTransition(async () => {
      try {
        await applyDelta(hit.game, hit.external_id, delta);
        // Optimistically reflect the new committed quantity locally so the
        // UI flips back to the green idle state without a refetch.
        setResults((rs) =>
          rs.map((r) =>
            keyOf(r) === key
              ? { ...r, owned: Math.max(0, r.owned + delta) }
              : r,
          ),
        );
        setPending((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setCommitting((c) => {
          const next = { ...c };
          delete next[key];
          return next;
        });
      }
    });
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Search</h1>

      <div className="mb-3 inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
        {GAMES.map((g) => (
          <button
            key={g}
            onClick={() => handleGameChange(g)}
            className={
              "rounded px-3 py-1 text-sm font-medium transition-colors " +
              (game === g
                ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                : "text-zinc-700 dark:text-zinc-300")
            }
          >
            {g}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          game === "MTG"
            ? "Search MTG (e.g. Black Lotus)"
            : "Search YGO (e.g. Blue-Eyes White Dragon)"
        }
        className="mb-4 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      />

      {error ? (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Searching…</p>
      ) : isValidQuery && display.length === 0 ? (
        <p className="text-sm text-zinc-500">No results.</p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {display.map((hit) => {
          const key = keyOf(hit);
          const delta = pending[key] ?? 0;
          const isPending = delta !== 0;
          const isCommitting = !!committing[key];
          const count = Math.max(0, hit.owned + delta);

          return (
            <li
              key={key}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Link
                href={`/cards/${hit.game}/${encodeURIComponent(hit.external_id)}`}
                className="block"
              >
                <div className="relative aspect-[5/7] w-full bg-zinc-100 dark:bg-zinc-800">
                  {hit.image_url ? (
                    <Image
                      src={hit.image_url}
                      alt={hit.name}
                      fill
                      sizes="(min-width:640px) 200px, 50vw"
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                      No image
                    </div>
                  )}
                </div>
                <div className="space-y-1 px-2 pt-2">
                  <p className="line-clamp-2 text-sm font-medium">{hit.name}</p>
                  <p className="line-clamp-1 text-xs text-zinc-500">{hit.type}</p>
                </div>
              </Link>

              <div className="px-2 pb-2 pt-1">
                {count === 0 && !isPending ? (
                  <button
                    onClick={() => adjust(hit, +1)}
                    className="h-8 w-full rounded-md border border-zinc-300 px-2 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Add
                  </button>
                ) : (
                  <div className="grid grid-cols-5 gap-1">
                    <div className="col-span-3 flex items-center gap-1">
                      <button
                        onClick={() => adjust(hit, -1)}
                        disabled={isCommitting}
                        aria-label="Decrease"
                        className="h-8 w-8 shrink-0 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        −
                      </button>
                      <span
                        className={
                          "flex-1 text-center text-sm font-medium tabular-nums " +
                          (isPending
                            ? "text-zinc-900 dark:text-zinc-100"
                            : "text-emerald-600 dark:text-emerald-400")
                        }
                      >
                        {count}
                      </span>
                      <button
                        onClick={() => adjust(hit, +1)}
                        disabled={isCommitting}
                        aria-label="Increase"
                        className="h-8 w-8 shrink-0 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => confirm(hit)}
                      disabled={!isPending || isCommitting}
                      className="col-span-2 h-8 rounded-md bg-zinc-900 px-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    >
                      {isCommitting ? "Saving…" : "Confirm"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
