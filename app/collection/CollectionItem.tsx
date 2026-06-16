"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";

import { changeQuantity } from "./actions";
import type { CollectionRow } from "./types";

// One row in the collection list. The −/+ buttons only mutate a local
// `delta`; the server is only hit when the user presses Confirm. When the
// resulting quantity reaches 0 the server action deletes the row, which
// replaces the dedicated Remove button.
export function CollectionItem({ row }: { row: CollectionRow }) {
  // CollectionRow.card is nullable in the type but the caller filters out
  // rows without a card before rendering — keep the bang assertion local.
  const card = row.card!;

  const [delta, setDelta] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const display = Math.max(0, row.quantity + delta);
  const dirty = delta !== 0;

  function adjust(sign: 1 | -1) {
    if (committing) return;
    setDelta((d) => {
      const next = d + sign;
      if (row.quantity + next < 0) return d;
      return next;
    });
  }

  function confirm() {
    if (!dirty || committing) return;
    setCommitting(true);
    setError(null);
    const submitted = delta;
    // Clear delta optimistically so once revalidation lands the row's
    // quantity matches what we already show. Restore on failure.
    setDelta(0);
    startTransition(async () => {
      try {
        await changeQuantity(row.id, submitted);
      } catch (e) {
        setDelta(submitted);
        setError((e as Error).message);
      } finally {
        setCommitting(false);
      }
    });
  }

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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
        <div className="flex items-center gap-1 self-end sm:self-auto">
          <button
            onClick={() => adjust(-1)}
            disabled={committing || display === 0}
            aria-label="Decrease quantity"
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
            {display}
          </span>
          <button
            onClick={() => adjust(+1)}
            disabled={committing}
            aria-label="Increase quantity"
            className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            +
          </button>
          <button
            onClick={confirm}
            disabled={!dirty || committing}
            className="ml-2 h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {committing ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </li>
  );
}
