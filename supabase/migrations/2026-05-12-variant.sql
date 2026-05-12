-- Batch A schema change: variant column on user_cards (rarity for YGO,
-- finish for MTG). Drops condition + foil. Wipes existing collection +
-- deck data per project decision; re-run create commands in schema.sql
-- afterwards if needed.
--
-- Run in the Supabase SQL Editor for project cardio.

begin;

-- Wipe owned + deck data.
truncate public.user_cards restart identity;
truncate public.deck_cards;

-- Drop the old unique constraint, then the obsolete columns.
alter table public.user_cards
  drop constraint if exists user_cards_user_id_card_id_condition_foil_key;
alter table public.user_cards drop column if exists condition;
alter table public.user_cards drop column if exists foil;

-- Add variant + new uniqueness rule.
alter table public.user_cards
  add column if not exists variant text not null;
alter table public.user_cards
  add constraint user_cards_user_id_card_id_variant_key unique (user_id, card_id, variant);

commit;
