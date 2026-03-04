-- ============================================================================
-- Migration 005: Fix RLS infinite recursion in household policies
--
-- The household_members SELECT policy referenced household_members itself,
-- causing "infinite recursion detected in policy" errors. All dual-mode
-- policies on other tables also query household_members, triggering the
-- same recursion.
--
-- Fix: A SECURITY DEFINER function that checks membership without going
-- through RLS, then update all policies to use it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper function (bypasses RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_household_member(hid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = hid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- 2. Fix households policies
-- ---------------------------------------------------------------------------

DROP POLICY "Members can view their household" ON households;
CREATE POLICY "Members can view their household" ON households FOR SELECT
  USING (is_household_member(id));

-- Owner policies don't need fixing (they check owner_id = auth.uid())

-- ---------------------------------------------------------------------------
-- 3. Fix household_members policies
-- ---------------------------------------------------------------------------

DROP POLICY "Members can view household members" ON household_members;
CREATE POLICY "Members can view household members" ON household_members FOR SELECT
  USING (is_household_member(household_id));

-- INSERT is fine (checks user_id = auth.uid(), no subquery)

DROP POLICY "Users can leave or owner can remove" ON household_members;
CREATE POLICY "Users can leave or owner can remove" ON household_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT id FROM households WHERE owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Fix recipes policies (use helper function)
-- ---------------------------------------------------------------------------

DROP POLICY "Users can view recipes" ON recipes;
CREATE POLICY "Users can view recipes" ON recipes FOR SELECT
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY "Users can insert recipes" ON recipes;
CREATE POLICY "Users can insert recipes" ON recipes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY "Users can update recipes" ON recipes;
CREATE POLICY "Users can update recipes" ON recipes FOR UPDATE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY "Users can delete recipes" ON recipes;
CREATE POLICY "Users can delete recipes" ON recipes FOR DELETE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

-- ---------------------------------------------------------------------------
-- 5. Fix recipe_ingredients policies
-- ---------------------------------------------------------------------------

DROP POLICY "Users can view recipe ingredients" ON recipe_ingredients;
CREATE POLICY "Users can view recipe ingredients" ON recipe_ingredients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id
    AND ((r.household_id IS NULL AND r.user_id = auth.uid())
      OR (r.household_id IS NOT NULL AND is_household_member(r.household_id)))
  ));

DROP POLICY "Users can insert recipe ingredients" ON recipe_ingredients;
CREATE POLICY "Users can insert recipe ingredients" ON recipe_ingredients FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id
    AND ((r.household_id IS NULL AND r.user_id = auth.uid())
      OR (r.household_id IS NOT NULL AND is_household_member(r.household_id)))
  ));

DROP POLICY "Users can update recipe ingredients" ON recipe_ingredients;
CREATE POLICY "Users can update recipe ingredients" ON recipe_ingredients FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id
    AND ((r.household_id IS NULL AND r.user_id = auth.uid())
      OR (r.household_id IS NOT NULL AND is_household_member(r.household_id)))
  ));

DROP POLICY "Users can delete recipe ingredients" ON recipe_ingredients;
CREATE POLICY "Users can delete recipe ingredients" ON recipe_ingredients FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_ingredients.recipe_id
    AND ((r.household_id IS NULL AND r.user_id = auth.uid())
      OR (r.household_id IS NOT NULL AND is_household_member(r.household_id)))
  ));

-- ---------------------------------------------------------------------------
-- 6. Fix recipe_history policies
-- ---------------------------------------------------------------------------

DROP POLICY "Users can view recipe history" ON recipe_history;
CREATE POLICY "Users can view recipe history" ON recipe_history FOR SELECT
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY "Users can insert recipe history" ON recipe_history;
CREATE POLICY "Users can insert recipe history" ON recipe_history FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

-- ---------------------------------------------------------------------------
-- 7. Fix meal_plans policies
-- ---------------------------------------------------------------------------

DROP POLICY "Users can view meal plans" ON meal_plans;
CREATE POLICY "Users can view meal plans" ON meal_plans FOR SELECT
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY "Users can insert meal plans" ON meal_plans;
CREATE POLICY "Users can insert meal plans" ON meal_plans FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY "Users can update meal plans" ON meal_plans;
CREATE POLICY "Users can update meal plans" ON meal_plans FOR UPDATE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY "Users can delete meal plans" ON meal_plans;
CREATE POLICY "Users can delete meal plans" ON meal_plans FOR DELETE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

-- ---------------------------------------------------------------------------
-- 8. Fix meal_plan_items policies
-- ---------------------------------------------------------------------------

DROP POLICY "Users can view meal plan items" ON meal_plan_items;
CREATE POLICY "Users can view meal plan items" ON meal_plan_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meal_plans mp WHERE mp.id = meal_plan_items.meal_plan_id
    AND ((mp.household_id IS NULL AND mp.user_id = auth.uid())
      OR (mp.household_id IS NOT NULL AND is_household_member(mp.household_id)))
  ));

DROP POLICY "Users can insert meal plan items" ON meal_plan_items;
CREATE POLICY "Users can insert meal plan items" ON meal_plan_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meal_plans mp WHERE mp.id = meal_plan_items.meal_plan_id
    AND ((mp.household_id IS NULL AND mp.user_id = auth.uid())
      OR (mp.household_id IS NOT NULL AND is_household_member(mp.household_id)))
  ));

DROP POLICY "Users can update meal plan items" ON meal_plan_items;
CREATE POLICY "Users can update meal plan items" ON meal_plan_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM meal_plans mp WHERE mp.id = meal_plan_items.meal_plan_id
    AND ((mp.household_id IS NULL AND mp.user_id = auth.uid())
      OR (mp.household_id IS NOT NULL AND is_household_member(mp.household_id)))
  ));

DROP POLICY "Users can delete meal plan items" ON meal_plan_items;
CREATE POLICY "Users can delete meal plan items" ON meal_plan_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM meal_plans mp WHERE mp.id = meal_plan_items.meal_plan_id
    AND ((mp.household_id IS NULL AND mp.user_id = auth.uid())
      OR (mp.household_id IS NOT NULL AND is_household_member(mp.household_id)))
  ));

-- ---------------------------------------------------------------------------
-- 9. Fix grocery_lists policies
-- ---------------------------------------------------------------------------

DROP POLICY "Users can view grocery lists" ON grocery_lists;
CREATE POLICY "Users can view grocery lists" ON grocery_lists FOR SELECT
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY "Users can insert grocery lists" ON grocery_lists;
CREATE POLICY "Users can insert grocery lists" ON grocery_lists FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY "Users can update grocery lists" ON grocery_lists;
CREATE POLICY "Users can update grocery lists" ON grocery_lists FOR UPDATE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY "Users can delete grocery lists" ON grocery_lists;
CREATE POLICY "Users can delete grocery lists" ON grocery_lists FOR DELETE
  USING (
    (household_id IS NULL AND user_id = auth.uid())
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

-- ---------------------------------------------------------------------------
-- 10. Fix grocery_items policies
-- ---------------------------------------------------------------------------

DROP POLICY "Users can view grocery items" ON grocery_items;
CREATE POLICY "Users can view grocery items" ON grocery_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM grocery_lists gl WHERE gl.id = grocery_items.grocery_list_id
    AND ((gl.household_id IS NULL AND gl.user_id = auth.uid())
      OR (gl.household_id IS NOT NULL AND is_household_member(gl.household_id)))
  ));

DROP POLICY "Users can insert grocery items" ON grocery_items;
CREATE POLICY "Users can insert grocery items" ON grocery_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM grocery_lists gl WHERE gl.id = grocery_items.grocery_list_id
    AND ((gl.household_id IS NULL AND gl.user_id = auth.uid())
      OR (gl.household_id IS NOT NULL AND is_household_member(gl.household_id)))
  ));

DROP POLICY "Users can update grocery items" ON grocery_items;
CREATE POLICY "Users can update grocery items" ON grocery_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM grocery_lists gl WHERE gl.id = grocery_items.grocery_list_id
    AND ((gl.household_id IS NULL AND gl.user_id = auth.uid())
      OR (gl.household_id IS NOT NULL AND is_household_member(gl.household_id)))
  ));

DROP POLICY "Users can delete grocery items" ON grocery_items;
CREATE POLICY "Users can delete grocery items" ON grocery_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM grocery_lists gl WHERE gl.id = grocery_items.grocery_list_id
    AND ((gl.household_id IS NULL AND gl.user_id = auth.uid())
      OR (gl.household_id IS NOT NULL AND is_household_member(gl.household_id)))
  ));
