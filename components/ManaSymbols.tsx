// Inline renderer for MTG symbology. Splits text like "{2}{W/U}: Add {G}"
// into text + symbol tokens and renders each token as a tiny SVG from
// Scryfall's symbology CDN.
//
// URL convention (per Scryfall docs):
//   {W}    → W
//   {2/W}  → 2W
//   {W/P}  → WP
//   {T}    → T
//   {X}    → X
// Strip curly braces, drop slashes, uppercase.

import type { ReactNode } from "react";

const SYMBOL_RE = /\{([^}]+)\}/g;

function symbolUrl(token: string): string {
  const slug = token.replace(/\//g, "").toUpperCase();
  return `https://svgs.scryfall.io/card-symbols/${slug}.svg`;
}

export function InlineSymbols({
  text,
  size = 16,
}: {
  text: string | null | undefined;
  size?: number;
}) {
  if (!text) return null;

  const out: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  for (const match of text.matchAll(SYMBOL_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      out.push(text.slice(lastIndex, start));
    }
    out.push(
      // svgs.scryfall.io: static tiny SVGs, no benefit from next/image and
      // Next.js refuses SVGs through its optimizer without a global config
      // toggle. A plain <img> with explicit dimensions is the right call here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`s${i++}`}
        src={symbolUrl(match[1])}
        alt={`{${match[1]}}`}
        width={size}
        height={size}
        className="inline-block align-text-bottom"
        style={{ marginInline: 1 }}
      />,
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }
  return <>{out}</>;
}
