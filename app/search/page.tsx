"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";

import type { Game, SearchHit } from "@/lib/cards/types";
import { addToCollection } from "./actions";

const GAMES: Game[] = ["YGO", "MTG"];

export default function SearchPage() {
  const [game, setGame] = useState<Game>("YGO");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
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
  }

  function handleAdd(hit: SearchHit) {
    const key = `${hit.game}:${hit.external_id}`;
    setAdding(key);
    startTransition(async () => {
      try {
        await addToCollection(hit.game, hit.external_id);
        setAdded((prev) => new Set(prev).add(key));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setAdding(null);
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
          const key = `${hit.game}:${hit.external_id}`;
          const isAdding = adding === key;
          const isAdded = added.has(key);
          return (
            <li
              key={key}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
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
              <div className="space-y-1 p-2">
                <p className="line-clamp-2 text-sm font-medium">{hit.name}</p>
                <p className="line-clamp-1 text-xs text-zinc-500">{hit.type}</p>
                {isAdded ? (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    In collection
                  </p>
                ) : null}
                <button
                  onClick={() => handleAdd(hit)}
                  disabled={isAdding}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {isAdding ? "Adding…" : isAdded ? "Add another" : "Add"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
