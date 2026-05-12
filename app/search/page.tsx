"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";

import type { Game, SearchHit } from "@/lib/cards/types";
import {
  filtersForGame,
  hasAnyFilter,
  readFiltersFromParams,
  writeFiltersToParams,
  type SearchFilters,
} from "@/lib/cards/filters";
import { SearchInput } from "@/components/SearchInput";
import { applyDelta } from "./actions";

const GAMES: Game[] = ["YGO", "MTG"];

// Full YGOPRODeck `type=` enumeration. Ordered: Main Deck monsters →
// Extra Deck monsters → Spell/Trap → other.
const YGO_TYPES = [
  // Main Deck
  "Effect Monster",
  "Flip Effect Monster",
  "Flip Tuner Effect Monster",
  "Gemini Monster",
  "Normal Monster",
  "Normal Tuner Monster",
  "Pendulum Effect Monster",
  "Pendulum Effect Ritual Monster",
  "Pendulum Flip Effect Monster",
  "Pendulum Normal Monster",
  "Pendulum Tuner Effect Monster",
  "Ritual Effect Monster",
  "Ritual Monster",
  "Spirit Monster",
  "Toon Monster",
  "Tuner Monster",
  "Union Effect Monster",
  // Extra Deck
  "Fusion Monster",
  "Link Monster",
  "Pendulum Effect Fusion Monster",
  "Synchro Monster",
  "Synchro Pendulum Effect Monster",
  "Synchro Tuner Monster",
  "XYZ Monster",
  "XYZ Pendulum Effect Monster",
  // Non-monster
  "Spell Card",
  "Trap Card",
  // Other
  "Skill Card",
  "Token",
];
const YGO_ATTRIBUTES = ["DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"];
// `value` packs both sort field and direction into one select option:
//   ""        → relevance (no sort)
//   "atk:desc" → sort=atk dir=desc
const YGO_SORTS: Array<{ value: string; label: string }> = [
  { value: "", label: "Relevance" },
  { value: "name:asc", label: "Name ↑" },
  { value: "name:desc", label: "Name ↓" },
  { value: "atk:asc", label: "ATK ↑" },
  { value: "atk:desc", label: "ATK ↓" },
  { value: "def:asc", label: "DEF ↑" },
  { value: "def:desc", label: "DEF ↓" },
  { value: "level:asc", label: "Level ↑" },
  { value: "level:desc", label: "Level ↓" },
];

const MTG_TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Enchantment",
  "Artifact",
  "Planeswalker",
  "Land",
  "Battle",
];
const MTG_COLORS = ["W", "U", "B", "R", "G", "C"] as const;
const MTG_SORTS: Array<{ value: string; label: string }> = [
  { value: "", label: "Relevance" },
  { value: "name:asc", label: "Name ↑" },
  { value: "name:desc", label: "Name ↓" },
  { value: "cmc:asc", label: "Mana ↑" },
  { value: "cmc:desc", label: "Mana ↓" },
  { value: "power:asc", label: "Power ↑" },
  { value: "power:desc", label: "Power ↓" },
  { value: "toughness:asc", label: "Toughness ↑" },
  { value: "toughness:desc", label: "Toughness ↓" },
  { value: "usd:asc", label: "Price ↑" },
  { value: "usd:desc", label: "Price ↓" },
  { value: "released:asc", label: "Released ↑" },
  { value: "released:desc", label: "Released ↓" },
];

function packSort(filters: SearchFilters): string {
  if (!filters.sort) return "";
  return `${filters.sort}:${filters.dir ?? "asc"}`;
}

function keyOf(hit: { game: Game; external_id: string }): string {
  return `${hit.game}:${hit.external_id}`;
}

function parseGameParam(v: string | null): Game {
  return v === "MTG" ? "MTG" : "YGO";
}

function SearchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [game, setGame] = useState<Game>(() =>
    parseGameParam(searchParams.get("game")),
  );

  // The form state ("draft") and the search state ("committed") are kept
  // separate. Typing/toggling only updates the draft; results don't move
  // until the user presses Search / Enter / Apply / Reset. This is a different
  // model from earlier where every keystroke re-searched.
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<SearchFilters>(() =>
    readFiltersFromParams(searchParams),
  );
  const [committedQuery, setCommittedQuery] = useState(
    () => searchParams.get("q") ?? "",
  );
  const [committedFilters, setCommittedFilters] = useState<SearchFilters>(() =>
    readFiltersFromParams(searchParams),
  );
  const [showAdvanced, setShowAdvanced] = useState(() => {
    const f = readFiltersFromParams(searchParams);
    return hasAnyFilter(f);
  });

  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Record<string, number>>({});
  const [committing, setCommitting] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const committedTrimmed = committedQuery.trim();
  const committedGameFilters = filtersForGame(committedFilters, game);
  const isValidQuery = committedTrimmed.length >= 2;
  const hasFiltersCommitted = hasAnyFilter(committedGameFilters);
  const hasFiltersDraft = hasAnyFilter(filtersForGame(filters, game));
  const shouldSearch = isValidQuery || hasFiltersCommitted;
  const display = shouldSearch ? results : [];

  // Mirror committed state → URL. No debounce: commits are user-driven, so
  // each commit should produce exactly one URL entry.
  useEffect(() => {
    const params = new URLSearchParams();
    if (game !== "YGO") params.set("game", game);
    if (committedTrimmed) params.set("q", committedTrimmed);
    writeFiltersToParams(params, committedGameFilters);
    const target = params.toString() ? `/search?${params}` : "/search";
    router.replace(target, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, committedTrimmed, router, JSON.stringify(committedGameFilters)]);

  useEffect(() => {
    if (!shouldSearch) return;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (committedTrimmed) params.set("q", committedTrimmed);
        writeFiltersToParams(params, committedGameFilters);
        const res = await fetch(`/api/search/${game}?${params}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as
          | { results: SearchHit[] }
          | { error: string };
        if ("error" in data) {
          setError(data.error);
          setResults([]);
        } else {
          setResults(data.results);
          setPending({});
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedTrimmed, game, shouldSearch, JSON.stringify(committedGameFilters)]);

  function handleGameChange(g: Game) {
    if (g === game) return;
    setGame(g);
    // Filters between games are mostly disjoint; clear to avoid sending
    // YGO-only fields to Scryfall and vice-versa.
    setFilters({});
    setCommittedFilters({});
    setResults([]);
    setError(null);
    setPending({});
  }

  function setField(key: keyof SearchFilters, value: string | undefined) {
    setFilters((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next[key];
      } else {
        (next as Record<string, string>)[key] = value;
      }
      return next;
    });
  }

  function applySortValue(value: string) {
    // Sort is outside the Advanced panel and applies immediately to both the
    // form and the committed search.
    const mutate = (prev: SearchFilters): SearchFilters => {
      const next = { ...prev };
      delete next.sort;
      delete next.dir;
      if (value) {
        const [s, d] = value.split(":");
        next.sort = s;
        if (d === "desc") next.dir = "desc";
      }
      return next;
    };
    setFilters(mutate);
    setCommittedFilters(mutate);
  }

  function toggleColor(c: string) {
    setFilters((prev) => {
      const current = prev.colors ?? "";
      const has = current.includes(c);
      // Colorless is mutually exclusive with WUBRG. Picking C wipes others;
      // picking a colored chip while C is set drops the C.
      let nextStr: string;
      if (c === "C") {
        nextStr = has ? "" : "C";
      } else if (current.includes("C")) {
        nextStr = c;
      } else {
        nextStr = has ? current.replace(c, "") : current + c;
      }
      const next = { ...prev };
      if (nextStr) next.colors = nextStr;
      else delete next.colors;
      return next;
    });
  }

  function submitAll() {
    setCommittedQuery(query);
    setCommittedFilters(filters);
  }

  function resetFilters() {
    // Reset wipes the advanced-search form AND clears any committed filters,
    // so the user immediately sees a search with no filters. Sort is preserved
    // because it lives outside the Advanced panel.
    const keep: SearchFilters = {};
    if (filters.sort) keep.sort = filters.sort;
    if (filters.dir) keep.dir = filters.dir;
    setFilters(keep);
    setCommittedFilters(keep);
  }

  function adjust(hit: SearchHit, sign: 1 | -1) {
    const key = keyOf(hit);
    if (committing[key]) return;
    setPending((p) => {
      const nextDelta = (p[key] ?? 0) + sign;
      if (hit.owned + nextDelta < 0) return p;
      const next = { ...p };
      if (nextDelta === 0) delete next[key];
      else next[key] = nextDelta;
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
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6">
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

      <div className="mb-2 flex items-stretch gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitAll();
          }}
          placeholder={
            game === "MTG"
              ? "Search MTG (e.g. Black Lotus)"
              : "Search YGO (e.g. Blue-Eyes White Dragon)"
          }
          className="flex-1"
        />
        <button
          onClick={submitAll}
          className="shrink-0 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Search
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className="text-xs font-medium text-zinc-600 underline decoration-dotted hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {showAdvanced ? "Hide advanced" : "Advanced search"}
        </button>
        <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="hidden sm:inline">Sort by</span>
          <select
            value={packSort(filters)}
            onChange={(e) => applySortValue(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {(game === "YGO" ? YGO_SORTS : MTG_SORTS).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showAdvanced ? (
        <section className="mb-4 rounded-lg border border-zinc-300 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          {game === "YGO" ? (
            <YgoFilterPanel
              filters={filters}
              onField={setField}
            />
          ) : (
            <MtgFilterPanel
              filters={filters}
              onField={setField}
              onToggleColor={toggleColor}
            />
          )}
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <button
              onClick={resetFilters}
              disabled={!hasFiltersDraft && !hasFiltersCommitted}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Reset
            </button>
            <button
              onClick={submitAll}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Apply
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Searching…</p>
      ) : shouldSearch && display.length === 0 ? (
        <p className="text-sm text-zinc-500">No results.</p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {display.map((hit) => {
          const key = keyOf(hit);
          const delta = pending[key] ?? 0;
          const isPending = delta !== 0;
          const isCommitting = !!committing[key];
          const count = Math.max(0, hit.owned + delta);

          return (
            <li
              key={key}
              className="overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
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
                      sizes="(min-width:1024px) 200px, (min-width:640px) 240px, 50vw"
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                      No image
                    </div>
                  )}
                </div>
                <div className="space-y-1 px-2 pt-2">
                  <p className="truncate text-sm font-medium">{hit.name}</p>
                  <p className="truncate text-xs text-zinc-500">{hit.type}</p>
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

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

function YgoFilterPanel({
  filters,
  onField,
}: {
  filters: SearchFilters;
  onField: (k: keyof SearchFilters, v: string | undefined) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <FilterField label="Type">
        <select
          value={filters.type ?? ""}
          onChange={(e) => onField("type", e.target.value || undefined)}
          className={inputCls}
        >
          <option value="">Any</option>
          {YGO_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Attribute">
        <select
          value={filters.attribute ?? ""}
          onChange={(e) => onField("attribute", e.target.value || undefined)}
          className={inputCls}
        >
          <option value="">Any</option>
          {YGO_ATTRIBUTES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </FilterField>
      <div className="col-span-2 sm:col-span-1">
        <FilterField label="Race">
          <input
            type="text"
            value={filters.race ?? ""}
            onChange={(e) => onField("race", e.target.value || undefined)}
            placeholder="e.g. Dragon"
            className={inputCls}
          />
        </FilterField>
      </div>
      {/* sm+ spacer so Set / Keyword open a fresh row on desktop. */}
      <div className="hidden sm:block" aria-hidden />
      <FilterField label="Set">
        <input
          type="text"
          value={filters.set ?? ""}
          onChange={(e) => onField("set", e.target.value || undefined)}
          placeholder="e.g. Chaos Origins"
          className={inputCls}
        />
      </FilterField>
      <FilterField label="Keyword">
        <input
          type="text"
          value={filters.desc ?? ""}
          onChange={(e) => onField("desc", e.target.value || undefined)}
          placeholder="e.g. negate"
          className={inputCls}
        />
      </FilterField>
      {/* sm+ row-fillers so ATK/DEF wrap to their own row instead of trailing
          behind Set / Keyword. */}
      <div className="hidden sm:block" aria-hidden />
      <div className="hidden sm:block" aria-hidden />
      <FilterField label="ATK ≥">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={5000}
          value={filters.atkMin ?? ""}
          onChange={(e) => onField("atkMin", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
      <FilterField label="ATK ≤">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={5000}
          value={filters.atkMax ?? ""}
          onChange={(e) => onField("atkMax", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
      <FilterField label="DEF ≥">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={5000}
          value={filters.defMin ?? ""}
          onChange={(e) => onField("defMin", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
      <FilterField label="DEF ≤">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={5000}
          value={filters.defMax ?? ""}
          onChange={(e) => onField("defMax", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
    </div>
  );
}

function MtgFilterPanel({
  filters,
  onField,
  onToggleColor,
}: {
  filters: SearchFilters;
  onField: (k: keyof SearchFilters, v: string | undefined) => void;
  onToggleColor: (color: string) => void;
}) {
  const colors = filters.colors ?? "";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <FilterField label="Type">
        <select
          value={filters.type ?? ""}
          onChange={(e) => onField("type", e.target.value || undefined)}
          className={inputCls}
        >
          <option value="">Any</option>
          {MTG_TYPES.map((t) => (
            <option key={t} value={t.toLowerCase()}>
              {t}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Set">
        <input
          type="text"
          value={filters.set ?? ""}
          onChange={(e) => onField("set", e.target.value || undefined)}
          placeholder="e.g. Lorwyn Eclipsed"
          className={inputCls}
        />
      </FilterField>
      <FilterField label="Keyword">
        <input
          type="text"
          value={filters.desc ?? ""}
          onChange={(e) => onField("desc", e.target.value || undefined)}
          placeholder="e.g. draw a card"
          className={inputCls}
        />
      </FilterField>
      <div className="col-span-2 sm:col-span-4">
        <FilterField label="Colors">
          <div className="flex gap-1">
            {MTG_COLORS.map((c) => {
              const active = colors.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onToggleColor(c)}
                  aria-pressed={active}
                  aria-label={`Toggle ${c}`}
                  className={
                    "flex h-9 flex-1 items-center justify-center rounded-md border transition-colors " +
                    (active
                      ? "border-zinc-900 bg-zinc-200 ring-2 ring-zinc-900 ring-offset-1 dark:border-white dark:bg-zinc-700 dark:ring-white"
                      : "border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://svgs.scryfall.io/card-symbols/${c}.svg`}
                    alt={c}
                    width={22}
                    height={22}
                  />
                </button>
              );
            })}
          </div>
        </FilterField>
      </div>
      <FilterField label="Mana value ≥">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={16}
          value={filters.cmcMin ?? ""}
          onChange={(e) => onField("cmcMin", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
      <FilterField label="Mana value ≤">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={16}
          value={filters.cmcMax ?? ""}
          onChange={(e) => onField("cmcMax", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
      <FilterField label="Power ≥">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={filters.powerMin ?? ""}
          onChange={(e) => onField("powerMin", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
      <FilterField label="Power ≤">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={filters.powerMax ?? ""}
          onChange={(e) => onField("powerMax", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
      <FilterField label="Toughness ≥">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={filters.toughMin ?? ""}
          onChange={(e) => onField("toughMin", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
      <FilterField label="Toughness ≤">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={filters.toughMax ?? ""}
          onChange={(e) => onField("toughMax", e.target.value || undefined)}
          className={inputCls}
        />
      </FilterField>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchInner />
    </Suspense>
  );
}
