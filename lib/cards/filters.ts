// Shape for the advanced-search form. Strings everywhere because the values
// hop between URL params, form inputs, and (for numeric ones) external API
// query strings — parsing only when we need a number keeps the round-trip
// trivial.

import type { Game } from "./types";

export interface SearchFilters {
  // YGO
  type?: string; // YGOPRODeck exact "type" (e.g. "Effect Monster", "Spell Card")
  attribute?: string; // YGO attribute (DARK/LIGHT/...)
  race?: string; // YGO race (Dragon, Continuous, Normal, ...)
  level?: string; // YGO level/rank exact match (0–12)
  atkMin?: string;
  atkMax?: string;
  defMin?: string;
  defMax?: string;

  // MTG
  colors?: string; // concatenation, e.g. "WU"; "C" = colorless (exclusive)
  cmcMin?: string;
  cmcMax?: string;
  powerMin?: string;
  powerMax?: string;
  toughMin?: string;
  toughMax?: string;

  // Both
  desc?: string; // free-text card-text search → YGO desc= / Scryfall o:
  set?: string;
  sort?: string; // backend-specific token (atk/def/cmc/power/toughness/name/...)
  dir?: "asc" | "desc";
}

const FILTER_KEYS: Array<keyof SearchFilters> = [
  "type",
  "attribute",
  "race",
  "level",
  "atkMin",
  "atkMax",
  "defMin",
  "defMax",
  "colors",
  "cmcMin",
  "cmcMax",
  "powerMin",
  "powerMax",
  "toughMin",
  "toughMax",
  "desc",
  "set",
  "sort",
  "dir",
];

export function readFiltersFromParams(
  params: URLSearchParams | { get: (k: string) => string | null },
): SearchFilters {
  const out: SearchFilters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) (out as Record<string, string>)[key] = value;
  }
  if (out.dir && out.dir !== "asc" && out.dir !== "desc") delete out.dir;
  return out;
}

export function writeFiltersToParams(
  base: URLSearchParams,
  filters: SearchFilters,
) {
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) base.set(key, String(value));
  }
}

/** Drop fields irrelevant to the active game so a YGO filter doesn't leak
 *  into an MTG query string and vice-versa. */
export function filtersForGame(
  filters: SearchFilters,
  game: Game,
): SearchFilters {
  const out: SearchFilters = {
    set: filters.set,
    sort: filters.sort,
    dir: filters.dir,
    desc: filters.desc,
  };
  if (game === "YGO") {
    return {
      ...out,
      type: filters.type,
      attribute: filters.attribute,
      race: filters.race,
      level: filters.level,
      atkMin: filters.atkMin,
      atkMax: filters.atkMax,
      defMin: filters.defMin,
      defMax: filters.defMax,
    };
  }
  return {
    ...out,
    type: filters.type,
    colors: filters.colors,
    cmcMin: filters.cmcMin,
    cmcMax: filters.cmcMax,
    powerMin: filters.powerMin,
    powerMax: filters.powerMax,
    toughMin: filters.toughMin,
    toughMax: filters.toughMax,
  };
}

export function hasAnyFilter(filters: SearchFilters): boolean {
  return FILTER_KEYS.some((k) => filters[k] !== undefined && filters[k] !== "");
}
