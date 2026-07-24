"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import type { Game, SearchHit } from "@/lib/cards/types";
import { csvEscape, downloadBlob, safeFilename, ymd } from "@/lib/csv";
import { SearchInput } from "@/components/SearchInput";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import {
  addMissingToWishlist,
  changeDeckCardQuantity,
  createWishlistFromDeck,
  setWishlistNote,
} from "../actions";
import { WishlistStoreView } from "./WishlistStoreView";

export interface DeckCardDisplay {
  cardId: string;
  externalId: string;
  game: Game;
  name: string;
  type: string | null;
  /** Set/printing the card comes from — shown in Store mode so the user can
   *  tell the clerk which set to pull. MTG: the specific printing; YGO: the
   *  card's first listed set. Null when the payload carries no set info. */
  setName: string | null;
  image_url: string | null;
  inDeck: number;
  owned: number;
  /** Optional per-item note (wanted rarity / printing), chiefly for wishlists. */
  note: string | null;
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
  isWishlist,
  wishlists,
  mainCards,
  extraCards,
}: {
  deckId: string;
  deckName: string;
  deckGame: Game;
  isWishlist: boolean;
  wishlists: Array<{ id: string; name: string }>;
  mainCards: DeckCardDisplay[];
  extraCards: DeckCardDisplay[];
}) {
  const router = useRouter();
  // Draft (live input) vs committed (drives the fetch) — same model as the
  // /search page. Both modes wait for an explicit submit so a single Enter /
  // Search press always produces one request; nothing races as the user types.
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  // Wishlists default to searching all cards — you're looking for things you
  // *don't* own yet, so "From collection" would be the wrong starting point.
  const [mode, setMode] = useState<Mode>(isWishlist ? "all" : "owned");
  const [storeMode, setStoreMode] = useState(false);
  const [wlBusy, setWlBusy] = useState(false);
  const [wlMenuOpen, setWlMenuOpen] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uncommitted +/− deltas keyed by externalId, shared between the search
  // results row and the board rows so the same card adjusted in either place
  // accumulates into one Confirm.
  const [pending, setPending] = useState<Record<string, number>>({});
  const [committing, setCommitting] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();
  // Deck search and edits both need the network; disable them offline. Viewing
  // a cached deck stays read-only. (Export buylist is client-side — stays on.)
  const online = useOnlineStatus();

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
  // A wishlist is entirely a buy-list, so its summary totals every card, not
  // just the not-yet-owned portion.
  const wishlistTotal = mainCards.reduce(
    (s, c) => s + (c.estPriceUsd ?? 0) * c.inDeck,
    0,
  );

  function handleExport() {
    const { csv } = buildMissingCsv(missingRows);
    const filename = `cardio-buylist-${safeFilename(deckName, "deck")}-${ymd(new Date())}.csv`;
    downloadBlob(csv, filename, "text/csv;charset=utf-8");
  }

  async function handleNote(cardId: string, note: string) {
    try {
      await setWishlistNote(deckId, cardId, note);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pushBuylist(run: () => Promise<string>) {
    if (wlBusy) return;
    setWlBusy(true);
    setError(null);
    setWlMenuOpen(false);
    try {
      const targetId = await run();
      router.push(`/decks/${targetId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWlBusy(false);
    }
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
    if (!canSubmit || !online) return;
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
    if (delta === 0 || committing[externalId] || !online) return;
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

  // Store mode fully replaces the editor with the read-only shopping view.
  if (isWishlist && storeMode) {
    return (
      <WishlistStoreView
        deckId={deckId}
        cards={mainCards}
        onExit={() => setStoreMode(false)}
      />
    );
  }

  return (
    <>
      {isWishlist ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <p className="text-sm font-medium">Shopping list</p>
            <p className="text-xs text-zinc-500">
              {mainCards.length} card{mainCards.length === 1 ? "" : "s"}
              {wishlistTotal > 0 ? ` · ~$${wishlistTotal.toFixed(2)}` : ""}
            </p>
          </div>
          <button
            onClick={() => setStoreMode(true)}
            disabled={mainCards.length === 0}
            className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Store mode →
          </button>
        </div>
      ) : missingRows.length > 0 ? (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Missing from collection</p>
              <p className="text-xs text-zinc-500">
                {missingRows.length} card{missingRows.length === 1 ? "" : "s"}
                {estTotal > 0 ? ` · ~$${estTotal.toFixed(2)} TCGPlayer` : ""}
              </p>
            </div>
            <div className="relative shrink-0">
              <button
                onClick={() => setWlMenuOpen((v) => !v)}
                disabled={wlBusy || !online}
                title={online ? undefined : "Unavailable offline"}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {wlBusy ? "Working…" : "Add to wishlist ▾"}
              </button>
              {wlMenuOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-zinc-200 bg-white text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <button
                    onClick={() =>
                      pushBuylist(() => createWishlistFromDeck(deckId))
                    }
                    className="block w-full px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    + New wishlist
                  </button>
                  {wishlists.length > 0 ? (
                    <>
                      <div className="border-t border-zinc-200 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-700">
                        Add to existing
                      </div>
                      {wishlists.map((w) => (
                        <button
                          key={w.id}
                          onClick={() =>
                            pushBuylist(() =>
                              addMissingToWishlist(deckId, w.id),
                            )
                          }
                          className="block w-full truncate px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          {w.name}
                        </button>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <button
            onClick={handleExport}
            className="mt-2 text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Export CSV instead
          </button>
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
            disabled={!canSubmit || !online}
            title={online ? undefined : "Search is unavailable offline"}
            className="shrink-0 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Search
          </button>
        </div>

        {!online ? (
          <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Offline — deck search and editing are disabled.
          </p>
        ) : null}
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
                  "flex flex-col gap-1 rounded-lg border p-2 " +
                  (alreadyInDeck
                    ? "border-emerald-500/40 bg-emerald-500/5 dark:border-emerald-400/40 dark:bg-emerald-400/5"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900")
                }
              >
                {/* Stacked layout (matches CollectionItem): on mobile the name +
                    detail line take the full width and the controls drop to
                    their own line below, so long card names stay readable. */}
                <div className="flex gap-3">
                  <Link
                    href={`/cards/${hit.game}/${encodeURIComponent(hit.external_id)}`}
                    aria-label={hit.name}
                    className="relative h-16 w-12 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800"
                  >
                    {hit.image_url ? (
                      <Image
                        src={hit.image_url}
                        alt={hit.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <Link
                      href={`/cards/${hit.game}/${encodeURIComponent(hit.external_id)}`}
                      className="block min-w-0 flex-1"
                    >
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
                    </Link>
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                      <button
                        onClick={() => adjust(hit.external_id, -1)}
                        disabled={isCommitting || displayQty === 0 || !online}
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
                            : "text-zinc-500")
                        }
                      >
                        {displayQty}
                      </span>
                      <button
                        onClick={() => adjust(hit.external_id, +1)}
                        disabled={isCommitting || !online}
                        aria-label="Add to deck"
                        className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        +
                      </button>
                      <button
                        onClick={() => confirm(hit.external_id)}
                        disabled={!dirty || isCommitting || !online}
                        className="ml-1 h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        {isCommitting ? "Saving…" : "Confirm"}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {isWishlist ? (
        <BoardSection
          title="Cards"
          cards={mainCards}
          pending={pending}
          committing={committing}
          onAdjust={adjust}
          onConfirm={confirm}
          onNote={handleNote}
          online={online}
          bounds={null}
          emptyHint="Search above to add cards you want to buy."
        />
      ) : (
        <>
          <BoardSection
            title="Main"
            cards={mainCards}
            pending={pending}
            committing={committing}
            onAdjust={adjust}
            onConfirm={confirm}
            online={online}
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
              online={online}
              bounds={YGO_BOUNDS.extra}
              emptyHint="Fusion / Synchro / Xyz / Link monsters land here automatically."
            />
          ) : null}
        </>
      )}
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
  onNote,
  online,
  bounds,
  emptyHint = "No cards yet. Use the search above to add.",
}: {
  title: string;
  cards: DeckCardDisplay[];
  pending: Record<string, number>;
  committing: Record<string, boolean>;
  onAdjust: (externalId: string, sign: 1 | -1) => void;
  onConfirm: (externalId: string) => void;
  /** When set, each row shows an editable note (wanted rarity / printing). */
  onNote?: (cardId: string, note: string) => Promise<void>;
  online: boolean;
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
                  "flex flex-col gap-1 rounded-md border p-2 " +
                  (hasViolation
                    ? "border-red-500/50 bg-red-500/5"
                    : "border-zinc-200 dark:border-zinc-800")
                }
              >
                {/* Stacked layout (matches CollectionItem): name + counts take
                    the full width on mobile; the −/+ / Confirm controls drop to
                    their own line so long card names stay readable. */}
                <div className="flex gap-3">
                  <Link
                    href={`/cards/${dc.game}/${encodeURIComponent(dc.externalId)}`}
                    aria-label={dc.name}
                    className="relative h-16 w-12 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800"
                  >
                    {dc.image_url ? (
                      <Image
                        src={dc.image_url}
                        alt={dc.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <Link
                      href={`/cards/${dc.game}/${encodeURIComponent(dc.externalId)}`}
                      className="block min-w-0 flex-1"
                    >
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
                    </Link>
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                      <button
                        onClick={() => onAdjust(dc.externalId, -1)}
                        disabled={isCommitting || displayQty === 0 || !online}
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
                        disabled={isCommitting || !online}
                        aria-label="Increase"
                        className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        +
                      </button>
                      <button
                        onClick={() => onConfirm(dc.externalId)}
                        disabled={!dirty || isCommitting || !online}
                        className="ml-1 h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        {isCommitting ? "Saving…" : "Confirm"}
                      </button>
                    </div>
                  </div>
                </div>
                {onNote ? (
                  <NoteField
                    initial={dc.note ?? ""}
                    onSave={(n) => onNote(dc.cardId, n)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Wishlist per-item note. Saves on blur (only when changed) and flashes a
// transient "Saved ✓" so the silent server write has a clear confirmation —
// cheaper and more contextual than a global toast for this one field.
function NoteField({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (note: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function commit() {
    if (value.trim() === initial.trim()) return;
    setStatus("saving");
    await onSave(value);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        placeholder="Note"
        className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 pr-14 text-xs outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
      />
      {status !== "idle" ? (
        <span
          className={
            "absolute right-2 top-1/2 -translate-y-1/2 text-xs " +
            (status === "saved"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-zinc-500")
          }
        >
          {status === "saving" ? "Saving…" : "Saved ✓"}
        </span>
      ) : null}
    </div>
  );
}
