# Migrations

`../schema.sql` is the single source of truth — a complete, idempotent build
of the current schema. Run it in the Supabase SQL Editor to (re)create
everything from scratch.

There is no Supabase CLI / ordered-migration workflow here. For an incremental
change to an **existing** database (where re-running `schema.sql` won't apply an
`ALTER`), drop a dated one-off snippet in this folder, e.g.
`2026-06-01-add-foo.sql`, run it in the SQL Editor, then:

1. Fold the change into `schema.sql` so a fresh build stays correct.
2. Note it in the change-log comment at the top of `schema.sql`.
3. Delete the snippet (git keeps the history).

So this folder is normally empty — applied snippets live on in git, not here.
