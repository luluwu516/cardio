"use client";

import { MTG_COLOR_CHIPS, toggleColor } from "@/lib/cards/mtgColors";

import type { AdvancedOptions, CollectionState, Patch } from "./types";

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

interface Props {
  state: CollectionState;
  patch: Patch;
  options: AdvancedOptions;
  advancedActive: boolean;
  onReset: () => void;
}

// Advanced search form for /collection. Row 1 (Type / Keyword / Variant) is
// shared across games; row 2 swaps in YGO-specific dropdowns or the MTG
// color chip picker. Live-filter — every change applies immediately, no
// Apply button (the underlying filter is client-side and free).
export function AdvancedPanel({
  state,
  patch,
  options,
  advancedActive,
  onReset,
}: Props) {
  const {
    gameFilter,
    typeFilter,
    keywordFilter,
    variantFilter,
    attributeFilter,
    raceFilter,
    levelFilter,
    colorsFilter,
  } = state;
  const { typeOptions, variantOptions, attributeOptions, raceOptions, levelOptions } =
    options;

  function toggleColorChip(c: string) {
    patch({ colorsFilter: toggleColor(colorsFilter, c) });
  }

  return (
    <section className="rounded-lg border border-zinc-300 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Row 1 — common to both games. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Type
          </span>
          <select
            value={typeFilter}
            onChange={(e) => patch({ typeFilter: e.target.value })}
            className={inputCls}
          >
            <option value="">Any</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Keyword
          </span>
          <input
            type="text"
            value={keywordFilter}
            onChange={(e) => patch({ keywordFilter: e.target.value })}
            placeholder={
              gameFilter === "YGO" ? "e.g. negate" : "e.g. draw a card"
            }
            className={inputCls}
          />
        </label>
        <label className="col-span-2 block sm:col-span-1">
          <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Variant
          </span>
          <select
            value={variantFilter}
            onChange={(e) => patch({ variantFilter: e.target.value })}
            className={inputCls}
          >
            <option value="">Any</option>
            {variantOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Row 2 — YGO: Attribute / Race / Level, MTG: Colors. */}
      {gameFilter === "YGO" ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Attribute
            </span>
            <select
              value={attributeFilter}
              onChange={(e) => patch({ attributeFilter: e.target.value })}
              className={inputCls}
            >
              <option value="">Any</option>
              {attributeOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Race
            </span>
            <select
              value={raceFilter}
              onChange={(e) => patch({ raceFilter: e.target.value })}
              className={inputCls}
            >
              <option value="">Any</option>
              {raceOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block sm:col-span-1">
            <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Level
            </span>
            <select
              value={levelFilter}
              onChange={(e) => patch({ levelFilter: e.target.value })}
              className={inputCls}
            >
              <option value="">Any</option>
              {levelOptions.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="mt-3">
          <span className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Colors
          </span>
          <div className="flex gap-1">
            {MTG_COLOR_CHIPS.map((c) => {
              const active = colorsFilter.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleColorChip(c)}
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
        </div>
      )}

      <div className="mt-3 flex items-center justify-end border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button
          onClick={onReset}
          disabled={!advancedActive}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
