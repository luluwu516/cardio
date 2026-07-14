-- cardIO database schema
-- Run this in the Supabase SQL Editor for project cardio.
-- Idempotent enough to re-run if you tweak something (create-if-not-exists where it matters).
--
-- This file is the single source of truth for the schema. Earlier one-off
-- ad-hoc migrations have been folded in and removed (see git history):
--   * 2026-05-12 variant: replaced user_cards.condition + foil with a single
--     `variant` column and the (user_id, card_id, variant) unique key
--     (one-time data wipe; not part of a fresh build).
--   * 2026-05-12 cards-anon-read: granted SELECT on cards to the anon role
--     for the /api/health cron ping.
--   * 2026-05-26 indexes: added decks(user_id); dropped the redundant
--     user_cards(user_id) index (covered by the unique constraint's btree).
--   * 2026-07-14 wishlist: added decks.is_wishlist (bool) and deck_cards.note
--     (text) for shopping-list decks — see the `add column if not exists`
--     lines under each table.
--   * 2026-07-14 cards-insert-only: dropped the "auth update cards" policy and
--     the UPDATE grant on cards, so clients can only read/insert the shared
--     master rows (closes a card-vandalism vector).
--   * 2026-07-14 drop-acquisition: removed the never-wired user_cards
--     acquired_at, acquired_price_usd and notes columns. The wishlist note
--     stays on deck_cards.note and is never copied into the collection.
-- For future changes to an existing DB, see supabase/migrations/README.md.

-- ============================================================
-- Tables
-- ============================================================

-- Shared master card data (cached from Scryfall / YGOPRODeck).
create table if not exists public.cards (
  id            uuid primary key default gen_random_uuid(),
  game          text not null check (game in ('YGO','MTG')),
  external_id   text not null,                 -- YGO passcode or Scryfall id
  name          text not null,
  type          text,
  frame_type    text,
  description   text,
  image_url     text,
  mana_cost     text,                          -- MTG only
  attribute     text,                          -- YGO only
  raw           jsonb,                         -- full API payload, for forward compat
  fetched_at    timestamptz not null default now(),
  unique (game, external_id)
);
create index if not exists cards_game_name_idx on public.cards (game, name);

-- Per-user ownership.
-- `variant` is the user's rarity (YGO: "Common", "Secret Rare", …) or finish
-- (MTG: "Nonfoil", "Foil", "Etched"). One row per (card, variant) per user.
create table if not exists public.user_cards (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  card_id            uuid not null references public.cards on delete restrict,
  variant            text not null,
  quantity           int  not null default 1 check (quantity > 0),
  created_at         timestamptz not null default now(),
  unique (user_id, card_id, variant)
);
-- Drop the columns we never wired up (no-op if already gone / on a fresh create
-- above): acquisition tracking, and the owned-card note. The wishlist note
-- lives on deck_cards.note and is never copied into the collection.
alter table public.user_cards drop column if exists acquired_at;
alter table public.user_cards drop column if exists acquired_price_usd;
alter table public.user_cards drop column if exists notes;
-- No standalone (user_id) index: the unique (user_id, card_id, variant)
-- constraint is backed by a btree whose leftmost column is user_id, so it
-- already serves user_id-prefix lookups.
-- Speeds up the "what does the user own of these card ids?" lookup that
-- the deck editor + card detail pages run on every render.
create index if not exists user_cards_card_id_idx on public.user_cards (card_id);

-- Decks (Phase 5 schema landed early to avoid migrations later).
create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  game        text not null check (game in ('YGO','MTG')),
  name        text not null,
  format      text,
  -- A wishlist is a deck used as a shopping list (buy-these cards, shown by
  -- image/name at the store). Same table so it reuses the deck editor; the UI
  -- suppresses deck-only rules (size bounds, banlist, main/extra split).
  is_wishlist boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Bring an existing DB up to date (no-op on a fresh create above).
alter table public.decks add column if not exists is_wishlist boolean not null default false;
-- Decks are listed and RLS-gated by owner.
create index if not exists decks_user_id_idx on public.decks (user_id);

create table if not exists public.deck_cards (
  deck_id   uuid not null references public.decks on delete cascade,
  card_id   uuid not null references public.cards on delete restrict,
  quantity  int  not null default 1 check (quantity > 0),
  board     text not null default 'main' check (board in ('main','side','extra','commander')),
  -- Optional per-item note, chiefly for wishlists: the wanted rarity / printing
  -- ("1st ed", "any printing", "foil") that a plain card row can't capture.
  note      text,
  primary key (deck_id, card_id, board)
);
alter table public.deck_cards add column if not exists note text;

-- ============================================================
-- Grants
-- Supabase auto-grants only for tables created via the Dashboard
-- Table Editor. For tables created via raw SQL we have to grant
-- explicitly, otherwise authenticated requests get `42501 permission
-- denied` before RLS even runs.
-- ============================================================

-- cards is shared master data: authenticated users may read and insert (to
-- cache a newly-seen card) but NOT update — otherwise any one user could
-- overwrite a card row everyone sees. The app only ever inserts-if-missing.
grant select, insert on public.cards       to authenticated;
grant select, insert, update, delete on public.user_cards  to authenticated;
grant select, insert, update, delete on public.decks       to authenticated;
grant select, insert, update, delete on public.deck_cards  to authenticated;

-- cards is shared, public-read master data. The /api/health endpoint
-- (Vercel Cron, no auth cookie) hits it as the `anon` role to keep the
-- Supabase project from auto-pausing on the free tier. Without this grant,
-- Postgres rejects the SELECT at the table level before RLS even runs.
grant select on public.cards to anon;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.cards       enable row level security;
alter table public.user_cards  enable row level security;
alter table public.decks       enable row level security;
alter table public.deck_cards  enable row level security;

-- cards is shared master data: any authenticated user can read.
-- Writes go through the server (anon/auth role can insert as well; we trust the app code).
drop policy if exists "read cards" on public.cards;
create policy "read cards" on public.cards
  for select using (true);

drop policy if exists "auth insert cards" on public.cards;
create policy "auth insert cards" on public.cards
  for insert with check (auth.uid() is not null);

-- No update policy: `cards` is write-once shared master data from the client's
-- side. Removing it (and any prior "auth update cards" policy) closes the
-- card-vandalism vector — a refresh-from-authoritative-API flow, if ever
-- wanted, would run server-side with the service role instead.
drop policy if exists "auth update cards" on public.cards;

-- user_cards: owner-only access.
drop policy if exists "own user_cards" on public.user_cards;
create policy "own user_cards" on public.user_cards
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- decks: owner-only access.
drop policy if exists "own decks" on public.decks;
create policy "own decks" on public.decks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- deck_cards: gate through deck ownership.
drop policy if exists "own deck_cards" on public.deck_cards;
create policy "own deck_cards" on public.deck_cards
  for all
  using (exists (select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid()));

-- ============================================================
-- Auto-update updated_at on decks
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists decks_set_updated_at on public.decks;
create trigger decks_set_updated_at
  before update on public.decks
  for each row execute function public.set_updated_at();
