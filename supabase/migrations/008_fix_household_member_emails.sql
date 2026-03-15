-- ============================================================================
-- Migration 008: Fix household member emails
-- Provides a SECURITY DEFINER function to fetch member emails with fallback
-- to auth.users when profiles.email is NULL.
-- Also backfills any profiles still missing emails.
-- ============================================================================

-- Backfill any profiles that still have NULL email
UPDATE profiles
SET email = u.email
FROM auth.users u
WHERE profiles.user_id = u.id
  AND profiles.email IS NULL;

-- RPC function to get household member emails with auth.users fallback
CREATE OR REPLACE FUNCTION get_household_member_emails(p_household_id UUID)
RETURNS TABLE(user_id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT hm.user_id, COALESCE(p.email, au.email) AS email
  FROM household_members hm
  LEFT JOIN profiles p ON p.user_id = hm.user_id
  LEFT JOIN auth.users au ON au.id = hm.user_id
  WHERE hm.household_id = p_household_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
