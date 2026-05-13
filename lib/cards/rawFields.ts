// Helpers that pluck specific fields out of the cached external-API JSON
// stored on `cards.raw`. Consolidated here so every consumer (collection
// list, card detail, future filters) reaches for the same well-typed
// accessors instead of re-implementing the same type-guard dance.

import type { Game } from "./types";

export function pickSetName(game: Game, raw: unknown): string | null {
  return pickSetInfo(game, raw).set_name;
}

/** Both fields the card detail page needs: display name + a token suitable
 *  for plugging into a /search?set= query. */
export function pickSetInfo(
  game: Game,
  raw: unknown,
): { set_name: string | null; set_query: string | null } {
  if (!raw || typeof raw !== "object") {
    return { set_name: null, set_query: null };
  }
  const r = raw as Record<string, unknown>;
  if (game === "MTG") {
    const name = typeof r.set_name === "string" ? r.set_name : null;
    const code = typeof r.set === "string" ? r.set : null;
    return { set_name: name ?? code, set_query: code };
  }
  const sets = Array.isArray(r.card_sets)
    ? (r.card_sets as Array<Record<string, unknown>>)
    : [];
  const first = sets[0];
  const name =
    first && typeof first.set_name === "string"
      ? (first.set_name as string)
      : null;
  return { set_name: name, set_query: name };
}

export function pickYgoRace(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return typeof r.race === "string" ? r.race : null;
}

export function pickYgoLevel(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return typeof r.level === "number" ? r.level : null;
}

export function pickMtgColors(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.colors)) return [];
  return r.colors.filter((c): c is string => typeof c === "string");
}

// Reduce an MTG type_line (e.g. "Legendary Creature — Human Wizard",
// "Artifact Creature — Golem", "Basic Land — Mountain") to the dominant
// primary type so a dropdown can group all creatures together regardless
// of supertype or subtype. Iteration order matters: Creature wins over
// Artifact for "Artifact Creature" because users mentally file those as
// creatures first.
const MTG_PRIMARY_TYPES = [
  "Creature",
  "Land",
  "Instant",
  "Sorcery",
  "Enchantment",
  "Artifact",
  "Planeswalker",
  "Battle",
  "Tribal",
];

export function mtgPrimaryType(typeLine: string | null): string | null {
  if (!typeLine) return null;
  const before = typeLine.split(" — ")[0] ?? typeLine;
  for (const t of MTG_PRIMARY_TYPES) {
    if (before.includes(t)) return t;
  }
  return null;
}
