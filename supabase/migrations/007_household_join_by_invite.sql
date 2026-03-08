-- Migration 007: Allow joining households by invite code
--
-- Problem: The SELECT policy on households requires owner_id = auth.uid()
-- OR membership. When a new user tries to join by invite code, they can't
-- see the household because they're not a member yet (chicken-and-egg).
--
-- Solution: A SECURITY DEFINER function that bypasses RLS to look up a
-- household by invite code. The code itself acts as authorization.

CREATE OR REPLACE FUNCTION lookup_household_by_invite_code(code TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  invite_code TEXT,
  owner_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.name, h.invite_code, h.owner_id, h.created_at, h.updated_at
  FROM households h
  WHERE h.invite_code = code
  LIMIT 1;
$$;
