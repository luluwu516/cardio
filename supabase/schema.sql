-- cardIO database schema
-- Run this in the Supabase SQL Editor for project cardio.
-- Idempotent enough to re-run if you tweak something (create-if-not-exists where it matters).

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
  acquired_at        date,
  acquired_price_usd numeric(10,2),
  notes              text,
  created_at         timestamptz not null default now(),
  unique (user_id, card_id, variant)
);
create index if not exists user_cards_user_id_idx on public.user_cards (user_id);
-- Speeds up the "what does the user own of these card ids?" lookup that
-- the deck editor + card detail pages run on every render.
create index if not exists user_cards_card_id_idx on public.user_cards (card_id);

-- Decks (Phase 5 schema landed early to avoid migrations later).
create table if not exists public.decks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  game       text not null check (game in ('YGO','MTG')),
  name       text not null,
  format     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_cards (
  deck_id   uuid not null references public.decks on delete cascade,
  card_id   uuid not null references public.cards on delete restrict,
  quantity  int  not null default 1 check (quantity > 0),
  board     text not null default 'main' check (board in ('main','side','extra','commander')),
  primary key (deck_id, card_id, board)
);

-- ============================================================
-- Grants
-- Supabase auto-grants only for tables created via the Dashboard
-- Table Editor. For tables created via raw SQL we have to grant
-- explicitly, otherwise authenticated requests get `42501 permission
-- denied` before RLS even runs.
-- ============================================================

grant select, insert, update on public.cards       to authenticated;
grant select, insert, update, delete on public.user_cards  to authenticated;
grant select, insert, update, delete on public.decks       to authenticated;
grant select, insert, update, delete on public.deck_cards  to authenticated;

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

drop policy if exists "auth update cards" on public.cards;
create policy "auth update cards" on public.cards
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

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
