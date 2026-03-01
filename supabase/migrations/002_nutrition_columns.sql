-- Add nutrition columns to recipes table
ALTER TABLE recipes
  ADD COLUMN calories NUMERIC,
  ADD COLUMN protein_g NUMERIC,
  ADD COLUMN carbs_g NUMERIC,
  ADD COLUMN fat_g NUMERIC,
  ADD COLUMN nutrition_source TEXT CHECK (nutrition_source IN ('json_ld', 'usda', 'manual'));
