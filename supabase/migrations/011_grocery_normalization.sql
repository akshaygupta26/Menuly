-- Add grocery normalization columns to recipe_ingredients
-- These are populated by AI at recipe save time to provide clean grocery item names
ALTER TABLE recipe_ingredients
  ADD COLUMN grocery_name TEXT,
  ADD COLUMN grocery_quantity NUMERIC,
  ADD COLUMN grocery_unit TEXT,
  ADD COLUMN grocery_category TEXT;

-- Track when a recipe's ingredients were last normalized
ALTER TABLE recipes
  ADD COLUMN grocery_normalized_at TIMESTAMPTZ;
