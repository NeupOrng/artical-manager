-- Backfill categories.position — step 2 of the additive-first sequence
-- (docs/database-and-migrations.md): the column was added nullable in the
-- previous migration and is made NOT NULL in the next.
--
-- Positions are 0-based and dense per tenant, ordered by name — which is exactly
-- the order navigation used before manual ordering existed, so no reader sees a
-- tenant's nav reshuffle when this lands. `id` breaks ties so two categories
-- with the same name still get distinct positions.
--
-- Retired rows are numbered too. Restoring one appends it to the end anyway,
-- but leaving them NULL would make the NOT NULL step fail.
UPDATE "categories" AS c
SET "position" = ranked.pos
FROM (
  SELECT "id",
         (row_number() OVER (PARTITION BY "tenant_id" ORDER BY "name", "id") - 1) AS pos
  FROM "categories"
) AS ranked
WHERE c."id" = ranked."id"
  AND c."position" IS NULL;
