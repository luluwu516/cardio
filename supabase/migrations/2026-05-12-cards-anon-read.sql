-- Grant the anon role SELECT on public.cards so /api/health (Vercel Cron,
-- no auth cookie) can read a single row. The existing RLS policy
-- `read cards using (true)` already allowed all reads logically, but
-- Postgres checks table-level GRANTs before RLS — without this, the
-- anon role gets `permission denied for table cards`.
--
-- The cards table is shared cached data from Scryfall / YGOPRODeck, so
-- public read is the intended posture.

grant select on public.cards to anon;
