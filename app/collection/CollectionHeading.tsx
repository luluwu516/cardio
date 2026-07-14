"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { parseCsv } from "@/lib/csv";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import {
  importCollectionBackup,
  type ImportResult,
  type ImportRow,
} from "./actions";

// How long the "Collection" title must be held before the (rarely needed)
// restore-import control appears. Deliberately long so it's never triggered by
// accident — cloud data loss is unlikely, this is a break-glass feature.
const HOLD_MS = 6000;

// Send rows to the server action in small batches: a full backup embeds each
// card's `raw`, so one payload could blow past the server-action body limit.
const IMPORT_BATCH = 100;

// Map parsed CSV (rows of fields) to ImportRows by header name, so column order
// or extra columns don't matter. Requires the identity + ownership columns;
// the rest (incl. raw) are optional — a human-readable export imports too, just
// without raw.
function rowsFromCsv(text: string): ImportRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const header = table[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  for (const required of ["game", "external_id", "variant", "quantity"]) {
    if (col(required) === -1) {
      throw new Error(`Missing required column: ${required}`);
    }
  }
  const out: ImportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const fields = table[r];
    if (fields.length === 1 && fields[0] === "") continue; // blank line
    const get = (name: string) => {
      const i = col(name);
      return i >= 0 ? (fields[i] ?? "") : "";
    };
    let raw: unknown = null;
    const rawStr = get("raw");
    if (rawStr) {
      try {
        raw = JSON.parse(rawStr);
      } catch {
        raw = null;
      }
    }
    out.push({
      game: get("game"),
      external_id: get("external_id"),
      name: get("name"),
      type: get("type") || null,
      frame_type: get("frame_type") || null,
      description: get("description") || null,
      image_url: get("image_url") || null,
      mana_cost: get("mana_cost") || null,
      attribute: get("attribute") || null,
      raw,
      variant: get("variant"),
      quantity: Number(get("quantity")),
      created_at: get("created_at") || null,
    });
  }
  return out;
}

export function CollectionHeading() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function startHold() {
    if (revealed || holdTimer.current) return;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      setRevealed(true);
    }, HOLD_MS);
  }
  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-selected later
    if (!file) return;
    // The picker may have been opened online and the file chosen after going
    // offline — bail with a clear message instead of a raw network error.
    if (!online) {
      setError("You're offline — reconnect to import.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const rows = rowsFromCsv(text);
      if (rows.length === 0) throw new Error("No rows found in the file.");
      const total: ImportResult = { cards: 0, entries: 0, skipped: 0 };
      for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
        const res = await importCollectionBackup(rows.slice(i, i + IMPORT_BATCH));
        total.cards += res.cards;
        total.entries += res.entries;
        total.skipped += res.skipped;
      }
      setMessage(
        `Imported ${total.entries} entries (${total.cards} cards)` +
          (total.skipped ? `, skipped ${total.skipped}.` : "."),
      );
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1">
      <h1
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        className="select-none text-2xl font-semibold tracking-tight"
      >
        Collection
      </h1>

      {revealed ? (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              Restore from a backup CSV. Existing cards are updated to the
              backup&apos;s quantities; nothing is deleted.
            </p>
            <button
              onClick={() => setRevealed(false)}
              className="shrink-0 text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Hide
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy || !online}
            title={online ? undefined : "Unavailable offline"}
            className="mt-2 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {busy ? "Importing…" : "Import backup CSV"}
          </button>
          {!online ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Offline — import needs a connection.
            </p>
          ) : null}
          {message ? (
            <p className="mt-2 text-xs text-green-700 dark:text-green-400">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              Import failed: {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
