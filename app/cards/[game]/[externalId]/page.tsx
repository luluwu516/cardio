import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getScryfallById, scryfallImage } from "@/lib/cards/scryfall";
import { getYgoById, ygoImage } from "@/lib/cards/ygoprodeck";
import {
  defaultVariant,
  mtgVariantsFromRaw,
  ygoVariantsFromRaw,
} from "@/lib/cards/variants";
import { tcgPlayerSearchUrl } from "@/lib/cards/tcgplayer";
import type { Game } from "@/lib/cards/types";
import { BackButton } from "@/components/BackButton";
import { InlineSymbols } from "@/components/ManaSymbols";
import { VariantPicker } from "./VariantPicker";

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
  mana_cost: string | null;
  attribute: string | null;
  atk: number | null;
  def: number | null;
  level: number | null;
  archetype: string | null;
  legalities: Record<string, string> | null;
  tcgplayer_url: string | null;
  scryfall_uri: string | null;
  set_name: string | null;
  set_query: string | null;
  /** Available variants for this card — rarities for YGO, finishes for MTG. */
  variants: string[];
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

async function loadFromCards(
  supabase: ReturnType<typeof createClient> extends Promise<infer S> ? S : never,
  game: Game,
  externalId: string,
): Promise<CardDetail | null> {
  const { data } = await supabase
    .from("cards")
    .select("*")
    .eq("game", game)
    .eq("external_id", externalId)
    .maybeSingle();
  if (!data) return null;
  const raw = (data.raw ?? {}) as Record<string, unknown>;
  const setInfo = pickSetFromRaw(game, raw);
  const variants =
    game === "YGO" ? ygoVariantsFromRaw(raw) : mtgVariantsFromRaw(raw);
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
    tcgplayer_url: tcgPlayerSearchUrl(game, data.name),
    scryfall_uri:
      typeof raw.scryfall_uri === "string" ? (raw.scryfall_uri as string) : null,
    ...setInfo,
    variants,
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
      tcgplayer_url: tcgPlayerSearchUrl("MTG", c.name),
      scryfall_uri: null,
      set_name: c.set_name ?? c.set ?? null,
      set_query: c.set ?? null,
      variants: mtgVariantsFromRaw(c),
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
    tcgplayer_url: tcgPlayerSearchUrl("YGO", c.name),
    scryfall_uri: null,
    set_name: ygoSetName,
    set_query: ygoSetName,
    variants: ygoVariantsFromRaw(c),
  };
}

interface OwnedRow {
  quantity: number;
  variant: string;
}

export default async function CardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string; externalId: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { game: rawGame, externalId } = await params;
  const { action } = await searchParams;
  if (!isGame(rawGame)) notFound();
  const game = rawGame;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let detail = await loadFromCards(supabase, game, externalId);
  if (!detail) {
    detail = await loadFromExternal(game, externalId);
  }
  if (!detail) notFound();

  // Initial owned quantities, keyed by variant. Aggregates over the small
  // possibility of duplicate rows (shouldn't happen with our unique index,
  // but be defensive).
  const ownedByVariant: Record<string, number> = {};
  if (user) {
    const { data: cardRow } = await supabase
      .from("cards")
      .select("id")
      .eq("game", game)
      .eq("external_id", externalId)
      .maybeSingle();
    if (cardRow) {
      // RLS already restricts user_cards to the current user, but the explicit
      // filter is cheap insurance and reads clearly at the call site.
      const { data } = await supabase
        .from("user_cards")
        .select("quantity, variant")
        .eq("card_id", cardRow.id)
        .eq("user_id", user.id);
      for (const row of (data ?? []) as OwnedRow[]) {
        ownedByVariant[row.variant] = (ownedByVariant[row.variant] ?? 0) + row.quantity;
      }
    }
  }

  // Make sure any variant a user already owns shows up in the picker even
  // if the card's current API payload no longer lists that rarity / finish.
  const seenVariants = new Set(detail.variants);
  for (const v of Object.keys(ownedByVariant)) {
    if (!seenVariants.has(v)) {
      detail.variants.push(v);
      seenVariants.add(v);
    }
  }

  const autoOpen = action === "add";

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

      <VariantPicker
        game={detail.game}
        externalId={detail.external_id}
        variants={detail.variants}
        initialOwned={ownedByVariant}
        autoOpen={autoOpen}
        defaultVariant={defaultVariant(detail.game, detail.variants)}
      />

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
