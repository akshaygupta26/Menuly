import type { SupabaseClient } from "@supabase/supabase-js";

import type { NutritionInfo, UsdaLookupCacheEntry } from "@/types/database";
import { searchUSDAFood } from "@/lib/nutrition";

// ---------------------------------------------------------------------------
// L1 cache: in-memory Map (per function instance, lost on cold start).
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, NutritionInfo>();

function normalizeKey(query: string): string {
  return query.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up per-100g USDA nutrition for an ingredient, with three-tier caching:
 *   L1: in-memory Map (free, instance-local)
 *   L2: usda_lookups Supabase table (persistent, shared across instances)
 *   L3: live USDA FoodData Central API (existing searchUSDAFood)
 *
 * Misses at L3 (USDA returns no match) are NOT cached. Errors at L2 fall through
 * to L3 silently — Supabase outages must not block a recipe import.
 */
export async function searchUSDAFoodCached(
  supabase: SupabaseClient,
  query: string
): Promise<NutritionInfo | null> {
  const cacheKey = normalizeKey(query);

  // L1
  const memoryHit = memoryCache.get(cacheKey);
  if (memoryHit) {
    return memoryHit;
  }

  // L2
  const l2Hit = await readL2(supabase, cacheKey);
  if (l2Hit) {
    memoryCache.set(cacheKey, l2Hit);
    incrementHitCount(supabase, cacheKey).catch(() => {
      // Fire-and-forget — analytics only.
    });
    return l2Hit;
  }

  // L3
  const l3Result = await searchUSDAFood(query);
  if (l3Result) {
    memoryCache.set(cacheKey, l3Result);
    writeL2(supabase, cacheKey, query, l3Result).catch(() => {
      // Fire-and-forget — cache write failure must not block the request.
    });
  }
  return l3Result;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function readL2(
  supabase: SupabaseClient,
  cacheKey: string
): Promise<NutritionInfo | null> {
  try {
    const { data, error } = await supabase
      .from("usda_lookups")
      .select("calories, protein_g, carbs_g, fat_g")
      .eq("cache_key", cacheKey)
      .maybeSingle<Pick<UsdaLookupCacheEntry, "calories" | "protein_g" | "carbs_g" | "fat_g">>();

    if (error || !data) return null;

    return {
      calories: data.calories,
      protein_g: data.protein_g,
      carbs_g: data.carbs_g,
      fat_g: data.fat_g,
    };
  } catch {
    return null;
  }
}

async function writeL2(
  supabase: SupabaseClient,
  cacheKey: string,
  originalQuery: string,
  result: NutritionInfo
): Promise<void> {
  // INSERT may conflict on cache_key in concurrent-miss races; that's fine.
  // We swallow errors at the caller (via .catch()) so this is non-blocking.
  await supabase.from("usda_lookups").insert({
    cache_key: cacheKey,
    original_query: originalQuery,
    calories: result.calories,
    protein_g: result.protein_g,
    carbs_g: result.carbs_g,
    fat_g: result.fat_g,
    usda_description: null,
  });
}

async function incrementHitCount(
  supabase: SupabaseClient,
  cacheKey: string
): Promise<void> {
  // RPC defined in migration 014. Errors are swallowed by the caller.
  await supabase.rpc("increment_usda_hit_count", { p_cache_key: cacheKey });
}
