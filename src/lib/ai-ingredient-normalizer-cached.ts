import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeIngredients } from "@/lib/ai-ingredient-normalizer";
import type {
  IngredientCategory,
  IngredientNormalizationCacheEntry,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/**
 * Bump this when the system prompt, model, or output schema changes in a way
 * that should invalidate prior cache entries. The cache is filtered by version
 * on read; old rows stay in the table (cheap) until manually vacuumed.
 */
const CURRENT_PROMPT_VERSION = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedIngredient {
  id: string;
  grocery_name: string;
  grocery_quantity: number | null;
  grocery_unit: string | null;
  grocery_category: string;
}

interface CacheRow {
  cache_key: string;
  grocery_name: string;
  grocery_quantity: number | null;
  grocery_unit: string | null;
  grocery_category: IngredientCategory;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the cache key for raw ingredient text. Must produce identical output
 * to the SQL expression used in the migration:
 *   LOWER(TRIM(REGEXP_REPLACE(raw_text, '\s+', ' ', 'g')))
 */
export function computeCacheKey(rawText: string): string {
  return rawText.toLowerCase().trim().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Drop-in cached replacement for normalizeIngredients. Behavior:
 *   1. Build cache keys for every input.
 *   2. Single batch SELECT against ingredient_normalizations at CURRENT_PROMPT_VERSION.
 *   3. Fire-and-forget hit_count increment for hits.
 *   4. Call normalizeIngredients() with only the misses (skip if no misses).
 *   5. UPSERT new normalizations into the cache (ON CONFLICT DO NOTHING).
 *   6. Return outputs in the original input order.
 *
 * Cache failures (read or write) fall through to the bare AI call. The wrapper
 * never throws on cache problems — it only surfaces errors from the AI call
 * itself, matching the bare function's contract.
 */
export async function normalizeIngredientsWithCache(
  supabase: SupabaseClient,
  ingredients: { id: string; raw_text: string }[]
): Promise<NormalizedIngredient[]> {
  if (ingredients.length === 0) return [];

  // Map id → cache_key for every input.
  const idToKey = new Map<string, string>();
  for (const ing of ingredients) {
    idToKey.set(ing.id, computeCacheKey(ing.raw_text));
  }
  const allKeys = Array.from(new Set(idToKey.values()));

  // Batch SELECT.
  const cacheHits = await readCache(supabase, allKeys);

  // Fire-and-forget hit_count.
  if (cacheHits.size > 0) {
    incrementHits(supabase, Array.from(cacheHits.keys())).catch(() => {
      /* analytics only */
    });
  }

  // Determine misses.
  const misses = ingredients.filter(
    (ing) => !cacheHits.has(idToKey.get(ing.id)!)
  );

  // Call AI on misses only.
  let aiResults: NormalizedIngredient[] = [];
  if (misses.length > 0) {
    aiResults = await normalizeIngredients(misses);

    // Write through to cache (UPSERT).
    writeCache(supabase, misses, aiResults, idToKey).catch(() => {
      /* cache write failure must not block the request */
    });
  }

  // Build a map of id → result.
  const idToResult = new Map<string, NormalizedIngredient>();

  // Hits first.
  for (const ing of ingredients) {
    const key = idToKey.get(ing.id)!;
    const hit = cacheHits.get(key);
    if (hit) {
      idToResult.set(ing.id, {
        id: ing.id,
        grocery_name: hit.grocery_name,
        grocery_quantity: hit.grocery_quantity,
        grocery_unit: hit.grocery_unit,
        grocery_category: hit.grocery_category,
      });
    }
  }

  // Then AI results.
  for (const r of aiResults) {
    idToResult.set(r.id, r);
  }

  // Return in original input order, preserving id contract.
  return ingredients.map((ing) => {
    const r = idToResult.get(ing.id);
    if (!r) {
      // Should not happen — every input was either a hit or in misses.
      // Throw so callers' existing try/catch falls back to regex parser.
      throw new Error(
        `normalizeIngredientsWithCache: missing result for id ${ing.id}`
      );
    }
    return r;
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function readCache(
  supabase: SupabaseClient,
  keys: string[]
): Promise<Map<string, CacheRow>> {
  const result = new Map<string, CacheRow>();
  if (keys.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from("ingredient_normalizations")
      .select(
        "cache_key, grocery_name, grocery_quantity, grocery_unit, grocery_category"
      )
      .eq("prompt_version", CURRENT_PROMPT_VERSION)
      .in("cache_key", keys)
      .returns<CacheRow[]>();

    if (error || !data) return result;

    for (const row of data) {
      result.set(row.cache_key, row);
    }
  } catch {
    // Treat read failure as all-miss.
  }

  return result;
}

async function writeCache(
  supabase: SupabaseClient,
  misses: { id: string; raw_text: string }[],
  results: NormalizedIngredient[],
  idToKey: Map<string, string>
): Promise<void> {
  // Build rows. Dedupe by cache_key in case the same raw_text appears twice
  // in one input (e.g. a recipe with "salt" listed in two ingredient sections).
  const seen = new Set<string>();
  const rows: Pick<
    IngredientNormalizationCacheEntry,
    | "cache_key"
    | "raw_text"
    | "grocery_name"
    | "grocery_quantity"
    | "grocery_unit"
    | "grocery_category"
    | "prompt_version"
  >[] = [];

  for (const m of misses) {
    const key = idToKey.get(m.id)!;
    if (seen.has(key)) continue;
    seen.add(key);

    const r = results.find((x) => x.id === m.id);
    if (!r) continue;

    rows.push({
      cache_key: key,
      raw_text: m.raw_text,
      grocery_name: r.grocery_name,
      grocery_quantity: r.grocery_quantity,
      grocery_unit: r.grocery_unit,
      grocery_category: r.grocery_category as IngredientCategory,
      prompt_version: CURRENT_PROMPT_VERSION,
    });
  }

  if (rows.length === 0) return;

  await supabase
    .from("ingredient_normalizations")
    .upsert(rows, { onConflict: "cache_key", ignoreDuplicates: true });
}

async function incrementHits(
  supabase: SupabaseClient,
  cacheKeys: string[]
): Promise<void> {
  // RPC defined in migration 014.
  await supabase.rpc("increment_ingredient_normalization_hit_count", {
    p_cache_keys: cacheKeys,
  });
}
