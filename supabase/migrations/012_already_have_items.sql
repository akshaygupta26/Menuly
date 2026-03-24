-- Add "already have" items tracking to meal plans
-- Stores lowercased grocery names the user already has at home
ALTER TABLE meal_plans
  ADD COLUMN already_have_items TEXT[] DEFAULT '{}';
