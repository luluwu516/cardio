"use client";

import { useState, useTransition } from "react";

import type { Game } from "@/lib/cards/types";
import { applyDelta } from "@/app/search/actions";

interface Props {
  game: Game;
  externalId: string;
  variants: string[];
  /** Initial owned quantity keyed by variant name. */
  initialOwned: Record<string, number>;
  /** Open the picker on mount with `defaultVariant` pre-incremented (+1) but
   *  unconfirmed — used when the user clicks "Add" from the search results
   *  page (`?action=add`). */
  autoOpen: boolean;
  defaultVariant: string;
}

export function VariantPicker({
  game,
  externalId,
  variants,
  initialOwned,
  autoOpen,
  defaultVariant,
}: Props) {
  const initialTotal = Object.values(initialOwned).reduce(
    (s, n) => s + n,
    0,
  );

  const [owned, setOwned] = useState<Record<string, number>>(initialOwned);
  const [pending, setPending] = useState<Record<string, number>>(() =>
    autoOpen && initialTotal === 0 ? { [defaultVariant]: 1 } : {},
  );
  const [committing, setCommitting] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<boolean>(autoOpen || initialTotal > 0);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const total = Object.values(owned).reduce((s, n) => s + n, 0);

  function adjust(variant: string, sign: 1 | -1) {
    if (committing[variant]) return;
    setPending((p) => {
      const nextDelta = (p[variant] ?? 0) + sign;
      const current = owned[variant] ?? 0;
      if (current + nextDelta < 0) return p;
      const next = { ...p };
      if (nextDelta === 0) delete next[variant];
      else next[variant] = nextDelta;
      return next;
    });
  }

  function confirm(variant: string) {
    const delta = pending[variant] ?? 0;
    if (delta === 0) return;
    setCommitting((c) => ({ ...c, [variant]: true }));
    startTransition(async () => {
      try {
        await applyDelta(game, externalId, variant, delta);
        setOwned((o) => ({
          ...o,
          [variant]: Math.max(0, (o[variant] ?? 0) + delta),
        }));
        setPending((p) => {
          const next = { ...p };
          delete next[variant];
          return next;
        });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setCommitting((c) => {
          const next = { ...c };
          delete next[variant];
          return next;
        });
      }
    });
  }

  return (
    <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {total === 0
            ? "Not in collection"
            : `In collection · ${total}`}
        </p>
        {!open ? (
          <button
            onClick={() => {
              setOpen(true);
              setPending({ [defaultVariant]: 1 });
            }}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Add
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {open ? (
        <ul className="mt-3 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {variants.map((variant) => {
            const ownedQty = owned[variant] ?? 0;
            const delta = pending[variant] ?? 0;
            const dirty = delta !== 0;
            const isCommitting = !!committing[variant];
            const display = Math.max(0, ownedQty + delta);
            return (
              <li
                key={variant}
                className="grid grid-cols-[1fr_auto] items-center gap-2"
              >
                <span className="truncate text-sm font-medium">{variant}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => adjust(variant, -1)}
                    disabled={isCommitting || display === 0}
                    aria-label="Decrease"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    −
                  </button>
                  <span
                    className={
                      "w-7 text-center text-sm font-medium tabular-nums " +
                      (dirty
                        ? "text-zinc-900 dark:text-zinc-100"
                        : ownedQty > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-zinc-400")
                    }
                  >
                    {display}
                  </span>
                  <button
                    onClick={() => adjust(variant, +1)}
                    disabled={isCommitting}
                    aria-label="Increase"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    +
                  </button>
                  <button
                    onClick={() => confirm(variant)}
                    disabled={!dirty || isCommitting}
                    className="ml-1 rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    {isCommitting ? "Saving…" : "Confirm"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
