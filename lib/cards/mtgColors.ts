// The canonical chip order both /search and /collection render. WUBRG first
// (mana wheel), Colorless last because it's the odd-one-out.
export const MTG_COLOR_CHIPS = ["W", "U", "B", "R", "G", "C"] as const;

// Toggle a WUBRG / C chip in a concatenated colors string. Same rules as
// Scryfall's color-identity semantics:
//   - Colorless (C) is mutually exclusive with WUBRG: picking C wipes the
//     others; picking a colored chip while C is set drops the C.
//   - For WUBRG: chip is appended if absent, removed if present.
//
// Used by both /search and /collection so the two pickers stay in lockstep.
export function toggleColor(current: string, c: string): string {
  const has = current.includes(c);
  if (c === "C") return has ? "" : "C";
  if (current.includes("C")) return c;
  return has ? current.replace(c, "") : current + c;
}
