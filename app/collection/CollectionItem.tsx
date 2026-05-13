"use client";

import Image from "next/image";
import Link from "next/link";

import { changeQuantity, removeFromCollection } from "./actions";
import type { CollectionRow } from "./types";

// One row in the collection list — image, name (+ variant suffix), type
// line, and the −/qty/+ / Remove controls. Server actions are submitted via
// hidden-input forms so each control posts independently without bouncing
// through a client-side handler.
export function CollectionItem({ row }: { row: CollectionRow }) {
  // CollectionRow.card is nullable in the type but the caller filters out
  // rows without a card before rendering — keep the bang assertion local.
  const card = row.card!;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <Link
        href={`/cards/${card.game}/${encodeURIComponent(card.external_id)}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
          {card.image_url ? (
            <Image
              src={card.image_url}
              alt={card.name}
              fill
              sizes="56px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {card.name}
            <span className="ml-1 text-xs font-normal text-zinc-500">
              ({row.variant})
            </span>
          </p>
          {card.type ? (
            <p className="truncate text-xs text-zinc-500">{card.type}</p>
          ) : null}
        </div>
      </Link>
      <div className="flex items-center gap-1">
        <form action={changeQuantity}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="delta" value="-1" />
          <button
            aria-label="Decrease quantity"
            className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            −
          </button>
        </form>
        <span className="w-6 text-center text-sm font-medium tabular-nums">
          {row.quantity}
        </span>
        <form action={changeQuantity}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="delta" value="1" />
          <button
            aria-label="Increase quantity"
            className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            +
          </button>
        </form>
        <form action={removeFromCollection} className="ml-2">
          <input type="hidden" name="id" value={row.id} />
          <button
            aria-label="Remove from collection"
            className="h-8 rounded-md border border-zinc-300 px-2 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Remove
          </button>
        </form>
      </div>
    </li>
  );
}
