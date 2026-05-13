"use client";

import type { Game } from "@/lib/cards/types";
import { SearchInput } from "@/components/SearchInput";

import type { CollectionState, Patch, SortDir, SortKey } from "./types";

const GAMES: Game[] = ["YGO", "MTG"];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "name:asc", label: "Name ↑" },
  { value: "name:desc", label: "Name ↓" },
  { value: "quantity:desc", label: "Quantity ↓" },
  { value: "quantity:asc", label: "Quantity ↑" },
  { value: "recent:desc", label: "Recently added ↓" },
  { value: "recent:asc", label: "Recently added ↑" },
  { value: "set:asc", label: "Set ↑" },
  { value: "set:desc", label: "Set ↓" },
];

interface Props {
  state: CollectionState;
  patch: Patch;
  ygoCount: number;
  mtgCount: number;
  advancedActive: boolean;
  onGameChange: (g: Game) => void;
  onExport: (g: Game) => void;
}

// Top of the collection page: game tabs + CSV export, then the name search
// box, then the Advanced toggle + Sort selector. The game/export row sits
// above the search input per the original design — the user wants the tab
// state visible before scanning their cards.
export function CollectionToolbar({
  state,
  patch,
  ygoCount,
  mtgCount,
  advancedActive,
  onGameChange,
  onExport,
}: Props) {
  const { query, gameFilter, showAdvanced, sortKey, sortDir } = state;

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
          {GAMES.map((f) => (
            <button
              key={f}
              onClick={() => onGameChange(f)}
              className={
                "rounded px-3 py-1 text-xs font-medium transition-colors " +
                (gameFilter === f
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                  : "text-zinc-700 dark:text-zinc-300")
              }
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onExport("YGO")}
            disabled={ygoCount === 0}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Export YGO CSV
          </button>
          <button
            onClick={() => onExport("MTG")}
            disabled={mtgCount === 0}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Export MTG CSV
          </button>
        </div>
      </div>
      <SearchInput
        value={query}
        onChange={(v) => patch({ query: v })}
        placeholder="Search your collection by name"
      />

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => patch({ showAdvanced: !showAdvanced })}
          aria-expanded={showAdvanced}
          className="text-xs font-medium text-zinc-600 underline decoration-dotted hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {showAdvanced ? "Hide advanced" : "Advanced search"}
          {advancedActive ? " (active)" : ""}
        </button>
        <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="hidden sm:inline">Sort by</span>
          <select
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":") as [SortKey, SortDir];
              patch({ sortKey: k, sortDir: d });
            }}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
