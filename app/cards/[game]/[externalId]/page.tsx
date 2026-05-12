import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getScryfallById, scryfallImage } from "@/lib/cards/scryfall";
import { getYgoById, ygoImage } from "@/lib/cards/ygoprodeck";
import type { Game } from "@/lib/cards/types";
import {
  addToCollection,
  removeAllFromCollection,
  removeOneFromCollection,
} from "@/app/search/actions";
import { BackButton } from "@/components/BackButton";
import { InlineSymbols } from "@/components/ManaSymbols";

function isGame(g: string): g is Game {
  return g === "YGO" || g === "MTG";
}

interface CardDetail {
  game: Game;
  external_id: string;
  name: string;
  type: string | null;
  description: string | null;
  image_url: string | null;
  // game-specific
  mana_cost: string | null;
  attribute: string | null;
  atk: number | null;
  def: number | null;
  level: number | null;
  archetype: string | null;
  legalities: Record<string, string> | null;
  tcgplayer_url: string | null;
  scryfall_uri: string | null;
  // Set badge below the subtitle. `setQuery` is the value to pass to /search?set=
  // (set name for YGO, set code for MTG — what each API expects).
  set_name: string | null;
  set_query: string | null;
}

function pickSetFromRaw(
  game: Game,
  raw: Record<string, unknown>,
): { set_name: string | null; set_query: string | null } {
  if (game === "MTG") {
    const name = typeof raw.set_name === "string" ? raw.set_name : null;
    const code = typeof raw.set === "string" ? raw.set : null;
    return { set_name: name ?? code, set_query: code };
  }
  const sets = Array.isArray(raw.card_sets)
    ? (raw.card_sets as Array<Record<string, unknown>>)
    : [];
  const first = sets[0];
  const name =
    first && typeof first.set_name === "string"
      ? (first.set_name as string)
      : null;
  return { set_name: name, set_query: name };
}

async function loadFromCards(supabase: ReturnType<typeof createClient> extends Promise<infer S> ? S : never, game: Game, externalId: string): Promise<CardDetail | null> {
  const { data } = await supabase
    .from("cards")
    .select("*")
    .eq("game", game)
    .eq("external_id", externalId)
    .maybeSingle();
  if (!data) return null;
  // raw is jsonb; pull out a few extra fields for display.
  const raw = (data.raw ?? {}) as Record<string, unknown>;
  const setInfo = pickSetFromRaw(game, raw);
  return {
    game,
    external_id: data.external_id,
    name: data.name,
    type: data.type,
    description: data.description,
    image_url: data.image_url,
    mana_cost: data.mana_cost,
    attribute: data.attribute,
    atk: typeof raw.atk === "number" ? (raw.atk as number) : null,
    def: typeof raw.def === "number" ? (raw.def as number) : null,
    level: typeof raw.level === "number" ? (raw.level as number) : null,
    archetype:
      typeof raw.archetype === "string" ? (raw.archetype as string) : null,
    legalities:
      raw.legalities && typeof raw.legalities === "object"
        ? (raw.legalities as Record<string, string>)
        : null,
    tcgplayer_url:
      typeof (raw.purchase_uris as Record<string, string> | undefined)
        ?.tcgplayer === "string"
        ? (raw.purchase_uris as Record<string, string>).tcgplayer
        : null,
    scryfall_uri:
      typeof raw.scryfall_uri === "string" ? (raw.scryfall_uri as string) : null,
    ...setInfo,
  };
}

async function loadFromExternal(
  game: Game,
  externalId: string,
): Promise<CardDetail | null> {
  if (game === "MTG") {
    const c = await getScryfallById(externalId).catch(() => null);
    if (!c) return null;
    return {
      game,
      external_id: c.id,
      name: c.name,
      type: c.type_line ?? null,
      description: c.oracle_text ?? null,
      image_url: scryfallImage(c),
      mana_cost: c.mana_cost ?? null,
      attribute: null,
      atk: null,
      def: null,
      level: null,
      archetype: null,
      legalities: c.legalities ?? null,
      tcgplayer_url: c.purchase_uris?.tcgplayer ?? null,
      scryfall_uri: null,
      set_name: c.set_name ?? c.set ?? null,
      set_query: c.set ?? null,
    };
  }
  const c = await getYgoById(externalId).catch(() => null);
  if (!c) return null;
  const ygoSetName = c.card_sets?.[0]?.set_name ?? null;
  return {
    game,
    external_id: String(c.id),
    name: c.name,
    type: c.type,
    description: c.desc,
    image_url: ygoImage(c),
    mana_cost: null,
    attribute: c.attribute ?? null,
    atk: typeof c.atk === "number" ? c.atk : null,
    def: typeof c.def === "number" ? c.def : null,
    level: typeof c.level === "number" ? c.level : null,
    archetype: c.archetype ?? null,
    legalities: null,
    tcgplayer_url: c.card_prices?.[0]?.tcgplayer_price
      ? `https://www.tcgplayer.com/search/yugioh/product?q=${encodeURIComponent(
          c.name,
        )}`
      : null,
    scryfall_uri: null,
    set_name: ygoSetName,
    set_query: ygoSetName,
  };
}

interface OwnedRow {
  quantity: number;
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ game: string; externalId: string }>;
}) {
  const { game: rawGame, externalId } = await params;
  if (!isGame(rawGame)) notFound();
  const game = rawGame;

  const supabase = await createClient();

  let detail = await loadFromCards(supabase, game, externalId);
  if (!detail) {
    detail = await loadFromExternal(game, externalId);
  }
  if (!detail) notFound();

  // Figure out ownership.
  let owned: OwnedRow[] = [];
  const { data: cardRow } = await supabase
    .from("cards")
    .select("id")
    .eq("game", game)
    .eq("external_id", externalId)
    .maybeSingle();
  if (cardRow) {
    const { data } = await supabase
      .from("user_cards")
      .select("quantity")
      .eq("card_id", cardRow.id);
    owned = (data ?? []) as OwnedRow[];
  }
  const ownedTotal = owned.reduce((sum, r) => sum + r.quantity, 0);

  const addAction = addToCollection.bind(null, game, externalId);
  const removeOneAction = removeOneFromCollection.bind(null, game, externalId);
  const removeAllAction = removeAllFromCollection.bind(null, game, externalId);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="relative mx-auto aspect-[5/7] w-full max-w-[260px] overflow-hidden rounded-lg bg-zinc-100 sm:w-1/2 dark:bg-zinc-800">
          {detail.image_url ? (
            <Image
              src={detail.image_url}
              alt={detail.name}
              fill
              sizes="(min-width:640px) 260px, 90vw"
              priority
              className="object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              No image
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div>
            <span className="inline-block rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {detail.game}
            </span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{detail.name}</h1>
          {detail.type ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {detail.type}
            </p>
          ) : null}
          {detail.set_name && detail.set_query ? (
            <p className="text-sm">
              <Link
                href={`/search?game=${detail.game}&set=${encodeURIComponent(detail.set_query)}`}
                className="font-medium text-zinc-700 underline decoration-dotted hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                {detail.set_name}
              </Link>
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 text-sm">
            {detail.mana_cost ? (
              <>
                <dt className="text-zinc-500">Mana</dt>
                <dd className="font-medium">
                  <InlineSymbols text={detail.mana_cost} size={18} />
                </dd>
              </>
            ) : null}
            {detail.attribute ? (
              <>
                <dt className="text-zinc-500">Attribute</dt>
                <dd className="font-medium">{detail.attribute}</dd>
              </>
            ) : null}
            {detail.level !== null ? (
              <>
                <dt className="text-zinc-500">Level</dt>
                <dd className="font-medium">{detail.level}</dd>
              </>
            ) : null}
            {detail.atk !== null ? (
              <>
                <dt className="text-zinc-500">ATK / DEF</dt>
                <dd className="font-medium">
                  {detail.atk} / {detail.def ?? "—"}
                </dd>
              </>
            ) : null}
            {detail.archetype ? (
              <>
                <dt className="text-zinc-500">Archetype</dt>
                <dd className="font-medium">{detail.archetype}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      {detail.description ? (
        <section className="mt-5 whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-3 text-sm leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
          {detail.game === "MTG" ? (
            <InlineSymbols text={detail.description} />
          ) : (
            detail.description
          )}
        </section>
      ) : null}

      <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {ownedTotal === 0
              ? "Not in collection"
              : `In collection · ${ownedTotal}`}
          </p>
          {ownedTotal === 0 ? (
            <form action={addAction}>
              <button className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
                Add
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1">
              <form action={removeOneAction}>
                <button
                  aria-label="Decrease"
                  className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  −
                </button>
              </form>
              <span className="w-6 text-center text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                {ownedTotal}
              </span>
              <form action={addAction}>
                <button
                  aria-label="Increase"
                  className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  +
                </button>
              </form>
              <form action={removeAllAction} className="ml-1">
                <button className="h-8 rounded-md border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  Remove
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      {detail.tcgplayer_url ? (
        <a
          href={detail.tcgplayer_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          View on TCGPlayer ↗
        </a>
      ) : null}
    </main>
  );
}
