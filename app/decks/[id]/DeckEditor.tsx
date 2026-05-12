"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import type { Game, SearchHit } from "@/lib/cards/types";
import { SearchInput } from "@/components/SearchInput";
import { changeDeckCardQuantity } from "../actions";

export interface DeckCardDisplay {
  cardId: string;
  externalId: string;
  game: Game;
  name: string;
  type: string | null;
  image_url: string | null;
  inDeck: number;
  owned: number;
  /** Human-readable reason this row violates a deck-building rule, or null if legal. */
  violation: string | null;
  estPriceUsd: number | null;
  tcgplayerUrl: string | null;
}

interface BoardBounds {
  min: number;
  max: number;
}

const YGO_BOUNDS: { main: BoardBounds; extra: BoardBounds } = {
  main: { min: 40, max: 60 },
  extra: { min: 0, max: 15 },
};

type Mode = "owned" | "all";

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function safeFilename(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "deck"
  );
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

interface MissingRow {
  game: Game;
  name: string;
  needed: number;
  estPriceUsd: number | null;
  tcgplayerUrl: string | null;
}

function buildMissingCsv(rows: MissingRow[]): { csv: string; total: number } {
  const header = [
    "game",
    "card_name",
    "quantity_needed",
    "set",
    "tcgplayer_url",
    "est_price_usd",
    "est_subtotal_usd",
  ].join(",");
  const lines: string[] = [header];
  let total = 0;
  for (const r of rows) {
    const subtotal =
      r.estPriceUsd !== null ? r.estPriceUsd * r.needed : null;
    if (subtotal !== null) total += subtotal;
    lines.push(
      [
        r.game,
        csvEscape(r.name),
        r.needed,
        "",
        csvEscape(r.tcgplayerUrl ?? ""),
        r.estPriceUsd !== null ? r.estPriceUsd.toFixed(2) : "",
        subtotal !== null ? subtotal.toFixed(2) : "",
      ].join(","),
    );
  }
  lines.push(["", "TOTAL", "", "", "", "", total.toFixed(2)].join(","));
  return { csv: lines.join("\n"), total };
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DeckEditor({
  deckId,
  deckName,
  deckGame,
  mainCards,
  extraCards,
}: {
  deckId: string;
  deckName: string;
  deckGame: Game;
  mainCards: DeckCardDisplay[];
  extraCards: DeckCardDisplay[];
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("owned");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, "add" | "sub">>({});
  const [, startTransition] = useTransition();

  const trimmed = query.trim();
  const isValid = trimmed.length >= 2;
  const display = isValid ? results : [];

  const missingRows: MissingRow[] = [...mainCards, ...extraCards]
    .map((c) => {
      const needed = Math.max(0, c.inDeck - c.owned);
      if (needed === 0) return null;
      return {
        game: c.game,
        name: c.name,
        needed,
        estPriceUsd: c.estPriceUsd,
        tcgplayerUrl: c.tcgplayerUrl,
      };
    })
    .filter((x): x is MissingRow => !!x);
  const estTotal = missingRows.reduce(
    (s, r) => s + (r.estPriceUsd ?? 0) * r.needed,
    0,
  );

  function handleExport() {
    const { csv } = buildMissingCsv(missingRows);
    const filename = `cardio-buylist-${safeFilename(deckName)}-${ymd(new Date())}.csv`;
    downloadBlob(csv, filename, "text/csv;charset=utf-8");
  }

  useEffect(() => {
    if (!isValid) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url =
          mode === "owned"
            ? `/api/collection/search?game=${deckGame}&q=${encodeURIComponent(trimmed)}`
            : `/api/search/${deckGame}?q=${encodeURIComponent(trimmed)}`;
        const res = await fetch(url, { signal: ctrl.signal });
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
  }, [trimmed, mode, deckGame, isValid]);

  function adjust(externalId: string, sign: 1 | -1) {
    const key = externalId;
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: sign > 0 ? "add" : "sub" }));
    startTransition(async () => {
      try {
        await changeDeckCardQuantity(deckId, deckGame, externalId, sign);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[key];
          return next;
        });
      }
    });
  }

  return (
    <>
      {missingRows.length > 0 ? (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Missing from collection</p>
              <p className="text-xs text-zinc-500">
                {missingRows.length} card{missingRows.length === 1 ? "" : "s"}
                {estTotal > 0 ? ` · ~$${estTotal.toFixed(2)} TCGPlayer` : ""}
              </p>
            </div>
            <button
              onClick={handleExport}
              className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Export buylist
            </button>
          </div>
        </div>
      ) : null}

      <section className="mb-5">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search cards to add"
          className="mb-2"
        />
        <div className="mb-2 inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
          {(["owned", "all"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                "rounded px-3 py-1 text-xs font-medium transition-colors " +
                (mode === m
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                  : "text-zinc-700 dark:text-zinc-300")
              }
            >
              {m === "owned" ? "From collection" : "All cards"}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-500">Searching…</p>
        ) : isValid && display.length === 0 ? (
          mode === "owned" ? (
            <p className="text-sm text-zinc-500">
              No matches in your collection.{" "}
              <button
                onClick={() => setMode("all")}
                className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Search outside collection?
              </button>
            </p>
          ) : (
            <p className="text-sm text-zinc-500">No results.</p>
          )
        ) : null}

        <ul className="space-y-2">
          {display.map((hit) => {
            const key = hit.external_id;
            const isAdding = busy[key] === "add";
            return (
              <li
                key={`${hit.game}:${key}`}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <Link
                  href={`/cards/${hit.game}/${encodeURIComponent(hit.external_id)}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    {hit.image_url ? (
                      <Image
                        src={hit.image_url}
                        alt={hit.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{hit.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {hit.type || "—"}
                      {hit.owned > 0 ? ` · owned ${hit.owned}` : ""}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => adjust(hit.external_id, +1)}
                  disabled={!!busy[key]}
                  aria-label="Add to deck"
                  className="h-8 w-10 shrink-0 rounded-md border border-zinc-300 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {isAdding ? "…" : "+"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <BoardSection
        title="Main"
        cards={mainCards}
        busy={busy}
        onAdjust={adjust}
        bounds={deckGame === "YGO" ? YGO_BOUNDS.main : null}
      />
      {deckGame === "YGO" ? (
        <BoardSection
          title="Extra"
          cards={extraCards}
          busy={busy}
          onAdjust={adjust}
          bounds={YGO_BOUNDS.extra}
          emptyHint="Fusion / Synchro / Xyz / Link monsters land here automatically."
        />
      ) : null}
    </>
  );
}

function BoardSection({
  title,
  cards,
  busy,
  onAdjust,
  bounds,
  emptyHint = "No cards yet. Use the search above to add.",
}: {
  title: string;
  cards: DeckCardDisplay[];
  busy: Record<string, "add" | "sub">;
  onAdjust: (externalId: string, sign: 1 | -1) => void;
  bounds: BoardBounds | null;
  emptyHint?: string;
}) {
  const totalCards = cards.reduce((s, c) => s + c.inDeck, 0);
  const missingTotal = cards.reduce(
    (s, c) => s + Math.max(0, c.inDeck - c.owned),
    0,
  );
  const outOfBounds =
    bounds !== null && (totalCards < bounds.min || totalCards > bounds.max);

  return (
    <section className="mb-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-zinc-500">
          <span
            className={
              outOfBounds ? "text-red-600 dark:text-red-400" : undefined
            }
          >
            {totalCards} card{totalCards === 1 ? "" : "s"}
          </span>
          {missingTotal > 0 ? (
            <>
              {" · "}
              <span className="text-red-600 dark:text-red-400">
                missing {missingTotal}
              </span>
            </>
          ) : null}
        </span>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700">
          {emptyHint}
        </p>
      ) : (
        <ul className="space-y-2">
          {cards.map((dc) => {
            const missing = Math.max(0, dc.inDeck - dc.owned);
            const inFlight = !!busy[dc.externalId];
            const hasViolation = !!dc.violation;
            return (
              <li
                key={dc.cardId}
                className={
                  "flex items-center gap-3 rounded-md border p-2 " +
                  (hasViolation
                    ? "border-red-500/50 bg-red-500/5"
                    : "border-zinc-200 dark:border-zinc-800")
                }
              >
                <Link
                  href={`/cards/${dc.game}/${encodeURIComponent(dc.externalId)}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    {dc.image_url ? (
                      <Image
                        src={dc.image_url}
                        alt={dc.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{dc.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      in {dc.inDeck} · owned {dc.owned}
                      {missing > 0 ? (
                        <span className="text-red-600 dark:text-red-400">
                          {" "}
                          · need {missing}
                        </span>
                      ) : null}
                    </p>
                    {dc.violation ? (
                      <p className="truncate text-xs font-medium text-red-600 dark:text-red-400">
                        {dc.violation}
                      </p>
                    ) : null}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => onAdjust(dc.externalId, -1)}
                    disabled={inFlight}
                    aria-label="Decrease"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-medium tabular-nums">
                    {dc.inDeck}
                  </span>
                  <button
                    onClick={() => onAdjust(dc.externalId, +1)}
                    disabled={inFlight}
                    aria-label="Increase"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
