"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import type { Game, SearchHit } from "@/lib/cards/types";
import { csvEscape, downloadBlob, safeFilename, ymd } from "@/lib/csv";
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
        csvEscape(r.tcgplayerUrl ?? ""),
        r.estPriceUsd !== null ? r.estPriceUsd.toFixed(2) : "",
        subtotal !== null ? subtotal.toFixed(2) : "",
      ].join(","),
    );
  }
  lines.push(["", "TOTAL", "", "", "", total.toFixed(2)].join(","));
  return { csv: lines.join("\n"), total };
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
  // Draft (live input) vs committed (drives the fetch) — same model as the
  // /search page. Both modes wait for an explicit submit so a single Enter /
  // Search press always produces one request; nothing races as the user types.
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [mode, setMode] = useState<Mode>("owned");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uncommitted +/− deltas keyed by externalId, shared between the search
  // results row and the board rows so the same card adjusted in either place
  // accumulates into one Confirm.
  const [pending, setPending] = useState<Record<string, number>>({});
  const [committing, setCommitting] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  // Clearing the input shouldn't keep showing the prior search's results.
  // Mask the committed query whenever the live input is empty rather than
  // writing back to state from an effect (which lint flags as cascading
  // renders). Old results stay in `results` until a new fetch replaces them;
  // `display` below already hides them when isValid is false.
  const effectiveCommitted = query.length === 0 ? "" : committedQuery;
  const trimmed = effectiveCommitted.trim();
  const isValid = trimmed.length >= 2;
  const canSubmit = query.trim().length >= 2;
  const display = isValid ? results : [];

  const searchPlaceholder =
    deckGame === "YGO"
      ? "Search YGO (e.g. Blue-Eyes White Dragon)"
      : "Search MTG (e.g. Black Lotus)";

  // Lookup so a search result can show "− N +" with the live in-deck count.
  // Same map keyed by externalId works for both boards because a card never
  // straddles main and extra in the same deck (see boardForCard in actions).
  // Memoised so keystrokes in the search box don't rebuild the map.
  const inDeckByExt = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of mainCards) m.set(c.externalId, c.inDeck);
    for (const c of extraCards) m.set(c.externalId, c.inDeck);
    return m;
  }, [mainCards, extraCards]);

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
    const filename = `cardio-buylist-${safeFilename(deckName, "deck")}-${ymd(new Date())}.csv`;
    downloadBlob(csv, filename, "text/csv;charset=utf-8");
  }

  useEffect(() => {
    if (!isValid) return;
    const ctrl = new AbortController();
    (async () => {
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
    })();
    return () => ctrl.abort();
  }, [trimmed, mode, deckGame, isValid]);

  function submitSearch() {
    if (!canSubmit) return;
    setCommittedQuery(query);
  }

  function handleModeChange(next: Mode) {
    if (next === mode) return;
    setMode(next);
    // Clear committed so the previous mode's results don't linger; the user
    // explicitly re-presses Search to query the new mode.
    setCommittedQuery("");
    setResults([]);
    setError(null);
  }

  function adjust(externalId: string, sign: 1 | -1) {
    if (committing[externalId]) return;
    const committedQty = inDeckByExt.get(externalId) ?? 0;
    setPending((p) => {
      const cur = p[externalId] ?? 0;
      const next = cur + sign;
      // Clamp so display can't go below 0.
      if (committedQty + next < 0) return p;
      const out = { ...p };
      if (next === 0) delete out[externalId];
      else out[externalId] = next;
      return out;
    });
  }

  function confirm(externalId: string) {
    const delta = pending[externalId] ?? 0;
    if (delta === 0 || committing[externalId]) return;
    setCommitting((c) => ({ ...c, [externalId]: true }));
    // Clear pending optimistically so once server revalidation updates the
    // props the row's display matches. Restore on failure.
    setPending((p) => {
      const next = { ...p };
      delete next[externalId];
      return next;
    });
    setError(null);
    startTransition(async () => {
      try {
        await changeDeckCardQuantity(deckId, deckGame, externalId, delta);
      } catch (e) {
        setPending((p) => ({ ...p, [externalId]: delta }));
        setError((e as Error).message);
      } finally {
        setCommitting((c) => {
          const next = { ...c };
          delete next[externalId];
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
        <div className="mb-2 flex items-stretch gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitSearch();
            }}
            placeholder={searchPlaceholder}
            className="flex-1"
          />
          <button
            type="button"
            onClick={submitSearch}
            disabled={!canSubmit}
            className="shrink-0 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Search
          </button>
        </div>
        <div className="mb-2 inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
          {(["owned", "all"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
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
            const inDeck = inDeckByExt.get(key) ?? 0;
            const delta = pending[key] ?? 0;
            const dirty = delta !== 0;
            const isCommitting = !!committing[key];
            const displayQty = Math.max(0, inDeck + delta);
            const alreadyInDeck = displayQty > 0;
            return (
              <li
                key={`${hit.game}:${key}`}
                className={
                  "flex items-center gap-3 rounded-lg border p-2 " +
                  (alreadyInDeck
                    ? "border-emerald-500/40 bg-emerald-500/5 dark:border-emerald-400/40 dark:bg-emerald-400/5"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900")
                }
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
                      {alreadyInDeck ? (
                        <span className="text-emerald-700 dark:text-emerald-300">
                          {" "}
                          · in deck {displayQty}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => adjust(hit.external_id, -1)}
                    disabled={isCommitting || displayQty === 0}
                    aria-label="Remove one from deck"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    −
                  </button>
                  <span
                    className={
                      "w-6 text-center text-sm font-medium tabular-nums " +
                      (displayQty > 0
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-400")
                    }
                  >
                    {displayQty}
                  </span>
                  <button
                    onClick={() => adjust(hit.external_id, +1)}
                    disabled={isCommitting}
                    aria-label="Add to deck"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    +
                  </button>
                  <button
                    onClick={() => confirm(hit.external_id)}
                    disabled={!dirty || isCommitting}
                    className="ml-1 h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    {isCommitting ? "Saving…" : "Confirm"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <BoardSection
        title="Main"
        cards={mainCards}
        pending={pending}
        committing={committing}
        onAdjust={adjust}
        onConfirm={confirm}
        bounds={deckGame === "YGO" ? YGO_BOUNDS.main : null}
      />
      {deckGame === "YGO" ? (
        <BoardSection
          title="Extra"
          cards={extraCards}
          pending={pending}
          committing={committing}
          onAdjust={adjust}
          onConfirm={confirm}
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
  pending,
  committing,
  onAdjust,
  onConfirm,
  bounds,
  emptyHint = "No cards yet. Use the search above to add.",
}: {
  title: string;
  cards: DeckCardDisplay[];
  pending: Record<string, number>;
  committing: Record<string, boolean>;
  onAdjust: (externalId: string, sign: 1 | -1) => void;
  onConfirm: (externalId: string) => void;
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
            const delta = pending[dc.externalId] ?? 0;
            const dirty = delta !== 0;
            const isCommitting = !!committing[dc.externalId];
            const displayQty = Math.max(0, dc.inDeck + delta);
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
                    disabled={isCommitting || displayQty === 0}
                    aria-label="Decrease"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    −
                  </button>
                  <span
                    className={
                      "w-6 text-center text-sm font-medium tabular-nums " +
                      (dirty ? "text-zinc-900 dark:text-zinc-100" : "")
                    }
                  >
                    {displayQty}
                  </span>
                  <button
                    onClick={() => onAdjust(dc.externalId, +1)}
                    disabled={isCommitting}
                    aria-label="Increase"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    +
                  </button>
                  <button
                    onClick={() => onConfirm(dc.externalId)}
                    disabled={!dirty || isCommitting}
                    className="ml-1 h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    {isCommitting ? "Saving…" : "Confirm"}
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
