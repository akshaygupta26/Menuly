-- ============================================================================
-- Migration 006: Allow household owner to SELECT their own household
--
-- The createHousehold action does INSERT...RETURNING (via .insert().select()),
-- which requires the SELECT policy to pass on the newly inserted row.
-- But at that point the owner hasn't been added to household_members yet,
-- so is_household_member() returns false and the INSERT appears to fail.
--
-- Fix: Add owner_id = auth.uid() to the SELECT policy.
-- ============================================================================

DROP POLICY "Members can view their household" ON households;
CREATE POLICY "Members can view their household" ON households FOR SELECT
  USING (owner_id = auth.uid() OR is_household_member(id));
