-- =============================================================================
-- 013_external_call_caches.sql
--
-- Adds two cache tables for external-call results:
--   1. ingredient_normalizations — caches AI normalization of recipe ingredient text
--   2. usda_lookups              — caches USDA FoodData Central nutrition lookups
--
-- Both tables are global (shared across all authenticated users). Cache keys are
-- derived from normalized input text. Reads and writes are allowed for any
-- authenticated user; updates are restricted to incrementing hit_count via a
-- column-level grant.
--
-- The ingredient_normalizations table is backfilled in this same migration from
-- recipe_ingredients rows that already have grocery_name set. The usda_lookups
-- table starts empty.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ingredient_normalizations
-- -----------------------------------------------------------------------------

CREATE TABLE ingredient_normalizations (
  cache_key         TEXT PRIMARY KEY,
  raw_text          TEXT NOT NULL,
  grocery_name      TEXT NOT NULL,
  grocery_quantity  NUMERIC,
  grocery_unit      TEXT,
  grocery_category  TEXT NOT NULL,
  prompt_version    INTEGER NOT NULL DEFAULT 1,
  hit_count         INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ingredient_normalizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredient_normalizations_select_authenticated"
  ON ingredient_normalizations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ingredient_normalizations_insert_authenticated"
  ON ingredient_normalizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "ingredient_normalizations_update_hit_count"
  ON ingredient_normalizations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Column-level grant: authenticated users can only update hit_count.
REVOKE UPDATE ON ingredient_normalizations FROM authenticated;
GRANT  UPDATE (hit_count) ON ingredient_normalizations TO authenticated;

-- -----------------------------------------------------------------------------
-- usda_lookups
-- -----------------------------------------------------------------------------

CREATE TABLE usda_lookups (
  cache_key         TEXT PRIMARY KEY,
  original_query    TEXT NOT NULL,
  calories          NUMERIC,
  protein_g         NUMERIC,
  carbs_g           NUMERIC,
  fat_g             NUMERIC,
  usda_description  TEXT,
  hit_count         INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE usda_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usda_lookups_select_authenticated"
  ON usda_lookups
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "usda_lookups_insert_authenticated"
  ON usda_lookups
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "usda_lookups_update_hit_count"
  ON usda_lookups
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE UPDATE ON usda_lookups FROM authenticated;
GRANT  UPDATE (hit_count) ON usda_lookups TO authenticated;

-- -----------------------------------------------------------------------------
-- Backfill ingredient_normalizations from existing recipe_ingredients
-- -----------------------------------------------------------------------------
-- DISTINCT ON (cache_key) collapses duplicates; ORDER BY tiebreaker prefers the
-- most-recently-normalized recipe (joined via recipes.grocery_normalized_at,
-- since recipe_ingredients itself has no timestamp).

INSERT INTO ingredient_normalizations
  (cache_key, raw_text, grocery_name, grocery_quantity, grocery_unit, grocery_category, prompt_version)
SELECT DISTINCT ON (cache_key)
  LOWER(TRIM(REGEXP_REPLACE(ri.raw_text, '\s+', ' ', 'g'))) AS cache_key,
  ri.raw_text,
  ri.grocery_name,
  ri.grocery_quantity,
  ri.grocery_unit,
  ri.grocery_category,
  1 AS prompt_version
FROM recipe_ingredients ri
JOIN recipes r ON r.id = ri.recipe_id
WHERE ri.grocery_name IS NOT NULL
  AND ri.grocery_category IS NOT NULL
  AND ri.raw_text IS NOT NULL
  AND TRIM(ri.raw_text) <> ''
ORDER BY cache_key, r.grocery_normalized_at DESC NULLS LAST
ON CONFLICT (cache_key) DO NOTHING;
