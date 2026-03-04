-- ============================================================================
-- Migration 004: Households — shared recipes, meal plans & grocery lists
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------------

CREATE TABLE households (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE household_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(household_id, user_id)
);

CREATE INDEX idx_household_members_user ON household_members(user_id);
CREATE INDEX idx_household_members_household ON household_members(household_id);
CREATE INDEX idx_households_invite_code ON households(invite_code);

-- updated_at trigger for households
CREATE TRIGGER trigger_households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Invite code generator (6-char alphanumeric, excludes 0/O/1/I)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 3. Add email to profiles
-- ---------------------------------------------------------------------------

ALTER TABLE profiles ADD COLUMN email TEXT;

-- Update handle_new_user() to capture email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email) VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing users
UPDATE profiles
SET email = u.email
FROM auth.users u
WHERE profiles.user_id = u.id
  AND profiles.email IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Add household_id to existing tables
-- ---------------------------------------------------------------------------

ALTER TABLE recipes ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE meal_plans ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE grocery_lists ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE recipe_history ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE SET NULL;

CREATE INDEX idx_recipes_household ON recipes(household_id) WHERE household_id IS NOT NULL;
CREATE INDEX idx_meal_plans_household ON meal_plans(household_id) WHERE household_id IS NOT NULL;
CREATE INDEX idx_grocery_lists_household ON grocery_lists(household_id) WHERE household_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Meal plan unique constraint — replace with partial indexes
-- ---------------------------------------------------------------------------

ALTER TABLE meal_plans DROP CONSTRAINT meal_plans_user_id_week_start_key;

CREATE UNIQUE INDEX idx_meal_plans_solo_unique
  ON meal_plans(user_id, week_start) WHERE household_id IS NULL;

CREATE UNIQUE INDEX idx_meal_plans_household_unique
  ON meal_plans(household_id, week_start) WHERE household_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. RLS policies — households & household_members
-- ---------------------------------------------------------------------------

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Households: members can view their own household
CREATE POLICY "Members can view their household" ON households FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.household_id = households.id AND hm.user_id = auth.uid()
  ));

-- Households: any authenticated user can insert (they become owner)
CREATE POLICY "Users can create households" ON households FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Households: only owner can update
CREATE POLICY "Owner can update household" ON households FOR UPDATE
  USING (owner_id = auth.uid());

-- Households: only owner can delete
CREATE POLICY "Owner can delete household" ON households FOR DELETE
  USING (owner_id = auth.uid());

-- Household members: members can view their household's members
CREATE POLICY "Members can view household members" ON household_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM household_members hm
    WHERE hm.household_id = household_members.household_id AND hm.user_id = auth.uid()
  ));

-- Household members: user can insert their own membership
CREATE POLICY "Users can join households" ON household_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Household members: user can delete their own membership, or owner can delete any
CREATE POLICY "Users can leave or owner can remove" ON household_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM households h
      WHERE h.id = household_members.household_id AND h.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. RLS policy overhaul — dual-mode for existing tables
-- ---------------------------------------------------------------------------

-- ---- Recipes ----
DROP POLICY "Users can view own recipes" ON recipes;
DROP POLICY "Users can insert own recipes" ON recipes;
DROP POLICY "Users can update own recipes" ON recipes;
DROP POLICY "Users can delete own recipes" ON recipes;

CREATE POLICY "Users can view recipes" ON recipes FOR SELECT
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = recipes.household_id AND hm.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can insert recipes" ON recipes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      household_id IS NULL
      OR EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = recipes.household_id AND hm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update recipes" ON recipes FOR UPDATE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = recipes.household_id AND hm.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can delete recipes" ON recipes FOR DELETE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = recipes.household_id AND hm.user_id = auth.uid()
    ))
  );

-- ---- Recipe ingredients (via parent recipe) ----
DROP POLICY "Users can view recipe ingredients" ON recipe_ingredients;
DROP POLICY "Users can insert recipe ingredients" ON recipe_ingredients;
DROP POLICY "Users can update recipe ingredients" ON recipe_ingredients;
DROP POLICY "Users can delete recipe ingredients" ON recipe_ingredients;

CREATE POLICY "Users can view recipe ingredients" ON recipe_ingredients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.id = recipe_ingredients.recipe_id
    AND (
      (r.household_id IS NULL AND r.user_id = auth.uid())
      OR (r.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = r.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

CREATE POLICY "Users can insert recipe ingredients" ON recipe_ingredients FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.id = recipe_ingredients.recipe_id
    AND (
      (r.household_id IS NULL AND r.user_id = auth.uid())
      OR (r.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = r.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

CREATE POLICY "Users can update recipe ingredients" ON recipe_ingredients FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.id = recipe_ingredients.recipe_id
    AND (
      (r.household_id IS NULL AND r.user_id = auth.uid())
      OR (r.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = r.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

CREATE POLICY "Users can delete recipe ingredients" ON recipe_ingredients FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.id = recipe_ingredients.recipe_id
    AND (
      (r.household_id IS NULL AND r.user_id = auth.uid())
      OR (r.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = r.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

-- ---- Recipe history ----
DROP POLICY "Users can view own recipe history" ON recipe_history;
DROP POLICY "Users can insert own recipe history" ON recipe_history;

CREATE POLICY "Users can view recipe history" ON recipe_history FOR SELECT
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = recipe_history.household_id AND hm.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can insert recipe history" ON recipe_history FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      household_id IS NULL
      OR EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = recipe_history.household_id AND hm.user_id = auth.uid()
      )
    )
  );

-- ---- Meal plans ----
DROP POLICY "Users can view own meal plans" ON meal_plans;
DROP POLICY "Users can insert own meal plans" ON meal_plans;
DROP POLICY "Users can update own meal plans" ON meal_plans;
DROP POLICY "Users can delete own meal plans" ON meal_plans;

CREATE POLICY "Users can view meal plans" ON meal_plans FOR SELECT
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = meal_plans.household_id AND hm.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can insert meal plans" ON meal_plans FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      household_id IS NULL
      OR EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = meal_plans.household_id AND hm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update meal plans" ON meal_plans FOR UPDATE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = meal_plans.household_id AND hm.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can delete meal plans" ON meal_plans FOR DELETE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = meal_plans.household_id AND hm.user_id = auth.uid()
    ))
  );

-- ---- Meal plan items (via parent meal plan) ----
DROP POLICY "Users can view meal plan items" ON meal_plan_items;
DROP POLICY "Users can insert meal plan items" ON meal_plan_items;
DROP POLICY "Users can update meal plan items" ON meal_plan_items;
DROP POLICY "Users can delete meal plan items" ON meal_plan_items;

CREATE POLICY "Users can view meal plan items" ON meal_plan_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meal_plans mp
    WHERE mp.id = meal_plan_items.meal_plan_id
    AND (
      (mp.household_id IS NULL AND mp.user_id = auth.uid())
      OR (mp.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = mp.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

CREATE POLICY "Users can insert meal plan items" ON meal_plan_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meal_plans mp
    WHERE mp.id = meal_plan_items.meal_plan_id
    AND (
      (mp.household_id IS NULL AND mp.user_id = auth.uid())
      OR (mp.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = mp.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

CREATE POLICY "Users can update meal plan items" ON meal_plan_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM meal_plans mp
    WHERE mp.id = meal_plan_items.meal_plan_id
    AND (
      (mp.household_id IS NULL AND mp.user_id = auth.uid())
      OR (mp.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = mp.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

CREATE POLICY "Users can delete meal plan items" ON meal_plan_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM meal_plans mp
    WHERE mp.id = meal_plan_items.meal_plan_id
    AND (
      (mp.household_id IS NULL AND mp.user_id = auth.uid())
      OR (mp.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = mp.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

-- ---- Grocery lists ----
DROP POLICY "Users can view own grocery lists" ON grocery_lists;
DROP POLICY "Users can insert own grocery lists" ON grocery_lists;
DROP POLICY "Users can update own grocery lists" ON grocery_lists;
DROP POLICY "Users can delete own grocery lists" ON grocery_lists;

CREATE POLICY "Users can view grocery lists" ON grocery_lists FOR SELECT
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = grocery_lists.household_id AND hm.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can insert grocery lists" ON grocery_lists FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      household_id IS NULL
      OR EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = grocery_lists.household_id AND hm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update grocery lists" ON grocery_lists FOR UPDATE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = grocery_lists.household_id AND hm.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can delete grocery lists" ON grocery_lists FOR DELETE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR
    (household_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = grocery_lists.household_id AND hm.user_id = auth.uid()
    ))
  );

-- ---- Grocery items (via parent grocery list) ----
DROP POLICY "Users can view grocery items" ON grocery_items;
DROP POLICY "Users can insert grocery items" ON grocery_items;
DROP POLICY "Users can update grocery items" ON grocery_items;
DROP POLICY "Users can delete grocery items" ON grocery_items;

CREATE POLICY "Users can view grocery items" ON grocery_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM grocery_lists gl
    WHERE gl.id = grocery_items.grocery_list_id
    AND (
      (gl.household_id IS NULL AND gl.user_id = auth.uid())
      OR (gl.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = gl.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

CREATE POLICY "Users can insert grocery items" ON grocery_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM grocery_lists gl
    WHERE gl.id = grocery_items.grocery_list_id
    AND (
      (gl.household_id IS NULL AND gl.user_id = auth.uid())
      OR (gl.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = gl.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

CREATE POLICY "Users can update grocery items" ON grocery_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM grocery_lists gl
    WHERE gl.id = grocery_items.grocery_list_id
    AND (
      (gl.household_id IS NULL AND gl.user_id = auth.uid())
      OR (gl.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = gl.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

CREATE POLICY "Users can delete grocery items" ON grocery_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM grocery_lists gl
    WHERE gl.id = grocery_items.grocery_list_id
    AND (
      (gl.household_id IS NULL AND gl.user_id = auth.uid())
      OR (gl.household_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = gl.household_id AND hm.user_id = auth.uid()
      ))
    )
  ));

-- ---------------------------------------------------------------------------
-- 8. Realtime — add meal_plan_items to publication
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE meal_plan_items;
