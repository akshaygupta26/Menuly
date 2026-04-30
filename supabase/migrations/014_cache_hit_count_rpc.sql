-- =============================================================================
-- 014_cache_hit_count_rpc.sql
--
-- Atomic hit_count increment functions for the two cache tables. Called
-- fire-and-forget from server code on every cache hit.
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_usda_hit_count(p_cache_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE usda_lookups
  SET    hit_count = hit_count + 1
  WHERE  cache_key = p_cache_key;
END;
$$;

CREATE OR REPLACE FUNCTION increment_ingredient_normalization_hit_count(p_cache_keys TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE ingredient_normalizations
  SET    hit_count = hit_count + 1
  WHERE  cache_key = ANY(p_cache_keys);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_usda_hit_count(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_ingredient_normalization_hit_count(TEXT[]) TO authenticated;
