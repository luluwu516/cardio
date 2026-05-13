"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { mtgPrimaryType } from "@/lib/cards/rawFields";
import { parseGameParam, type Game } from "@/lib/cards/types";

import { AdvancedPanel } from "./AdvancedPanel";
import { CollectionItem } from "./CollectionItem";
import { CollectionToolbar } from "./CollectionToolbar";
import type {
  CollectionRow,
  CollectionState,
  SortDir,
  SortKey,
} from "./types";

const PAGE_SIZE = 20;

// ─── CSV export utilities ───────────────────────────────────────────────────

function csvEscape(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

const CSV_HEADER = [
  "game",
  "external_id",
  "name",
  "type",
  "variant",
  "quantity",
  "set",
  "created_at",
].join(",");

function buildCollectionCsv(rows: CollectionRow[]): string {
  const lines: string[] = [CSV_HEADER];
  for (const row of rows) {
    const card = row.card;
    if (!card) continue;
    lines.push(
      [
        card.game,
        csvEscape(card.external_id),
        csvEscape(card.name),
        csvEscape(card.type),
        csvEscape(row.variant),
        row.quantity,
        csvEscape(card.set),
        row.created_at,
      ].join(","),
    );
  }
  return lines.join("\n");
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

// ─── Sort / filter helpers ──────────────────────────────────────────────────

function compareBySort(
  a: CollectionRow,
  b: CollectionRow,
  key: SortKey,
  dir: SortDir,
): number {
  const sign = dir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (key) {
    case "name":
      cmp = (a.card?.name ?? "").localeCompare(b.card?.name ?? "");
      break;
    case "quantity":
      cmp = a.quantity - b.quantity;
      break;
    case "recent":
      cmp = a.created_at.localeCompare(b.created_at);
      break;
    case "set":
      cmp = (a.card?.set ?? "").localeCompare(b.card?.set ?? "");
      break;
  }
  if (cmp !== 0) return cmp * sign;
  // Stable secondary order: name → variant so same-card variants stay together.
  const byName = (a.card?.name ?? "").localeCompare(b.card?.name ?? "");
  if (byName !== 0) return byName;
  return a.variant.localeCompare(b.variant);
}

// MTG groups by primary type ("Creature" covers "Legendary Creature — Goblin");
// YGO uses the type column verbatim.
function rowPrimaryType(card: NonNullable<CollectionRow["card"]>): string | null {
  return card.game === "MTG" ? mtgPrimaryType(card.type) : card.type;
}

function colorsMatch(cardColors: string[], filter: string): boolean {
  if (!filter) return true;
  if (filter === "C") return cardColors.length === 0;
  // filter is a concatenation of W/U/B/R/G — card must contain ALL of them.
  for (const c of filter) {
    if (!cardColors.includes(c)) return false;
  }
  return true;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CollectionList({ rows }: { rows: CollectionRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Everything page-local lives in one bag of state. Mutations go through
  // `patch`, which collapses what used to be ~13 individual useStates into a
  // single update path. Game / query seed from the URL so a back-nav from a
  // card detail page restores the user's view.
  const [state, setState] = useState<CollectionState>(() => ({
    query: searchParams.get("q") ?? "",
    gameFilter: parseGameParam(searchParams.get("game")),
    showAdvanced: false,
    typeFilter: "",
    keywordFilter: "",
    variantFilter: "",
    attributeFilter: "",
    raceFilter: "",
    levelFilter: "",
    colorsFilter: "",
    sortKey: "name",
    sortDir: "asc",
    page: 1,
  }));
  function patch(p: Partial<CollectionState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  const {
    query,
    gameFilter,
    showAdvanced,
    typeFilter,
    keywordFilter,
    variantFilter,
    attributeFilter,
    raceFilter,
    levelFilter,
    colorsFilter,
    sortKey,
    sortDir,
    page,
  } = state;

  // Reset to page 1 whenever the filter/sort signature changes. Uses the
  // React-recommended "adjust state during render" pattern (see "Storing
  // information from previous renders" in the React docs). `page` is
  // deliberately excluded — otherwise paging would reset itself in a loop.
  const filterSig = JSON.stringify({
    q: query.trim(),
    gameFilter,
    typeFilter,
    kw: keywordFilter.trim(),
    variantFilter,
    attributeFilter,
    raceFilter,
    levelFilter,
    colorsFilter,
    sortKey,
    sortDir,
  });
  const [prevFilterSig, setPrevFilterSig] = useState(filterSig);
  if (prevFilterSig !== filterSig) {
    setPrevFilterSig(filterSig);
    patch({ page: 1 });
  }

  function changeGame(g: Game) {
    if (g === gameFilter) return;
    // Switching games clears the advanced filters — most are game-specific,
    // and even shared ones (Type) won't match the other game's vocabulary.
    patch({
      gameFilter: g,
      typeFilter: "",
      keywordFilter: "",
      variantFilter: "",
      attributeFilter: "",
      raceFilter: "",
      levelFilter: "",
      colorsFilter: "",
    });
  }

  function resetAdvanced() {
    patch({
      typeFilter: "",
      keywordFilter: "",
      variantFilter: "",
      attributeFilter: "",
      raceFilter: "",
      levelFilter: "",
      colorsFilter: "",
    });
  }

  // Mirror state → URL (debounced) so the back-navigation restore works.
  useEffect(() => {
    const params = new URLSearchParams();
    if (gameFilter !== "YGO") params.set("game", gameFilter);
    const trimmed = query.trim();
    if (trimmed) params.set("q", trimmed);
    const target = params.toString() ? `/collection?${params}` : "/collection";
    const t = setTimeout(() => {
      router.replace(target, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [gameFilter, query, router]);

  // Dropdown options are scoped to the current game and to what the user
  // actually owns — no point offering "Foil" to a YGO-only player or
  // "Creature" when no creature is in the collection.
  const options = useMemo(() => {
    const types = new Set<string>();
    const variants = new Set<string>();
    const attributes = new Set<string>();
    const races = new Set<string>();
    const levels = new Set<number>();
    for (const r of rows) {
      if (!r.card || r.card.game !== gameFilter) continue;
      const t = rowPrimaryType(r.card);
      if (t) types.add(t);
      variants.add(r.variant);
      if (r.card.attribute) attributes.add(r.card.attribute);
      if (r.card.race) races.add(r.card.race);
      if (r.card.level !== null) levels.add(r.card.level);
    }
    return {
      typeOptions: Array.from(types).sort((a, b) => a.localeCompare(b)),
      variantOptions: Array.from(variants).sort((a, b) => a.localeCompare(b)),
      attributeOptions: Array.from(attributes).sort((a, b) => a.localeCompare(b)),
      raceOptions: Array.from(races).sort((a, b) => a.localeCompare(b)),
      levelOptions: Array.from(levels).sort((a, b) => a - b),
    };
  }, [rows, gameFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kw = keywordFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (!row.card) return false;
      if (row.card.game !== gameFilter) return false;
      if (q && !row.card.name.toLowerCase().includes(q)) return false;
      if (typeFilter && rowPrimaryType(row.card) !== typeFilter) return false;
      if (kw && !(row.card.description ?? "").toLowerCase().includes(kw))
        return false;
      if (variantFilter && row.variant !== variantFilter) return false;
      if (row.card.game === "YGO") {
        if (attributeFilter && row.card.attribute !== attributeFilter)
          return false;
        if (raceFilter && row.card.race !== raceFilter) return false;
        if (levelFilter && row.card.level !== Number(levelFilter)) return false;
      } else {
        if (colorsFilter && !colorsMatch(row.card.colors, colorsFilter))
          return false;
      }
      return true;
    });
  }, [
    rows,
    query,
    gameFilter,
    typeFilter,
    keywordFilter,
    variantFilter,
    attributeFilter,
    raceFilter,
    levelFilter,
    colorsFilter,
  ]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareBySort(a, b, sortKey, sortDir)),
    [filtered, sortKey, sortDir],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(pageStart, pageStart + PAGE_SIZE);
  const showingFrom = sorted.length === 0 ? 0 : pageStart + 1;
  const showingTo = pageStart + pageRows.length;

  function goToPage(p: number) {
    patch({ page: p });
    // Scroll back to the top so the new first row is visible — otherwise on
    // a long page the user lands mid-scroll on stale rows.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportCsv(game: Game) {
    // Export every row of the chosen game — not just what's currently visible
    // through the filter — so the file is a complete backup.
    const subset = rows.filter((r) => r.card?.game === game);
    if (subset.length === 0) return;
    const csv = buildCollectionCsv(subset);
    const filename = `cardio-${game.toLowerCase()}-collection-${ymd(new Date())}.csv`;
    downloadBlob(csv, filename, "text/csv;charset=utf-8");
  }

  const ygoCount = rows.filter((r) => r.card?.game === "YGO").length;
  const mtgCount = rows.filter((r) => r.card?.game === "MTG").length;
  const advancedActive = !!(
    typeFilter ||
    keywordFilter ||
    variantFilter ||
    attributeFilter ||
    raceFilter ||
    levelFilter ||
    colorsFilter
  );

  return (
    <>
      <CollectionToolbar
        state={state}
        patch={patch}
        ygoCount={ygoCount}
        mtgCount={mtgCount}
        advancedActive={advancedActive}
        onGameChange={changeGame}
        onExport={exportCsv}
      />

      {showAdvanced ? (
        <div className="mb-3">
          <AdvancedPanel
            state={state}
            patch={patch}
            options={options}
            advancedActive={advancedActive}
            onReset={resetAdvanced}
          />
        </div>
      ) : null}

      <p className="mb-2 text-xs text-zinc-500">
        {sorted.length === 0
          ? `0 of ${rows.length} card${rows.length === 1 ? "" : "s"}`
          : `Showing ${showingFrom}–${showingTo} of ${sorted.length}${
              sorted.length !== rows.length ? ` (filtered from ${rows.length})` : ""
            }`}
      </p>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No matches.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {pageRows.map((row) => (
              <CollectionItem key={row.id} row={row} />
            ))}
          </ul>

          {totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <button
                onClick={() => goToPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                ← Prev
              </button>
              <span className="text-zinc-500">
                Page {safePage} of {totalPages}
              </span>
              <button
                onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Next →
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
