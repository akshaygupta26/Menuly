# External-Call Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, shared cache layer in front of two external calls — DeepSeek AI ingredient normalization and USDA FoodData Central nutrition lookups — backed by two new Supabase tables, with a one-shot backfill from existing normalized data.

**Architecture:** Two wrapper modules sit in front of the existing pure functions. Each cache is a Supabase table keyed by a normalized text key with shared (global) read/write access. The AI cache is backfilled from `recipe_ingredients` on day one; the USDA cache starts empty and warms with use. The bare functions remain untouched and serve as the L3 (origin) tier.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + RLS), `@supabase/ssr`, OpenAI SDK (DeepSeek-compatible), Vercel.

**Spec:** `docs/superpowers/specs/2026-04-26-external-call-caching-design.md`

**Verification model:** This codebase has no automated test runner (per the spec, adding one is out of scope). Each task verifies via:
- `pnpm tsc --noEmit` — types compile
- `pnpm lint` — no lint errors
- Targeted SQL spot-checks via the Supabase MCP
- Browser tests via the Playwright MCP (or manual testing) for end-to-end flows

After every task, commit. Frequent commits keep the rollback surface small.

---

## File Structure

**Created:**
- `supabase/migrations/013_external_call_caches.sql` — schema, RLS, backfill (one transaction).
- `supabase/migrations/014_cache_hit_count_rpc.sql` — atomic hit-count increment functions.
- `src/lib/ai-ingredient-normalizer-cached.ts` — AI cache wrapper around `normalizeIngredients`.
- `src/lib/nutrition-cache.ts` — USDA cache wrapper. Owns L1 in-memory Map + L2 Supabase + delegates L3 to the existing `searchUSDAFood`.

**Modified:**
- `src/types/database.ts` — add `IngredientNormalizationCacheEntry` and `UsdaLookupCacheEntry` interfaces.
- `src/lib/nutrition.ts` — remove the L1 `usdaCache` Map (it moves into `nutrition-cache.ts`); change internal calls in the two batch functions from `searchUSDAFood` to `searchUSDAFoodCached`; both batch functions gain a `SupabaseClient` first argument.
- `src/actions/recipes.ts` — swap `normalizeIngredients` → `normalizeIngredientsWithCache(supabase, …)` in two places (createRecipe, duplicateRecipe).
- `src/app/api/recipes/normalize-all/route.ts` — same swap.
- `src/app/api/recipes/import/route.ts` — pass a `supabase` client into `calculateNutritionForIngredients`.
- `src/app/api/nutrition/calculate/route.ts` — pass a `supabase` client into `calculateNutritionWithBreakdown`.

---

## Task 1 — Migration: schema, RLS, and backfill

**Files:**
- Create: `supabase/migrations/013_external_call_caches.sql`

This task creates both cache tables, sets RLS policies, and runs the backfill in one atomic migration. No code changes yet — the tables sit unused after this task. Backfill produces ~263 rows in `ingredient_normalizations`; `usda_lookups` starts empty.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/013_external_call_caches.sql` with this exact contents:

```sql
-- =============================================================================
-- 013_external_call_caches.sql
--
-- Adds two cache tables for external-call results:
--   1. ingredient_normalizations — caches AI normalization of recipe ingredient text
--   2. usda_lookups              — caches USDA FoodData Central nutrition lookups
--
-- Both tables are global (shared across all authenticated users). Cache keys are
-- derived from normalized input text. Reads and writes are allowed for any
-- authenticated user; updates are restricted to incrementing hit_count via a
-- column-level grant.
--
-- The ingredient_normalizations table is backfilled in this same migration from
-- recipe_ingredients rows that already have grocery_name set. The usda_lookups
-- table starts empty.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ingredient_normalizations
-- -----------------------------------------------------------------------------

CREATE TABLE ingredient_normalizations (
  cache_key         TEXT PRIMARY KEY,
  raw_text          TEXT NOT NULL,
  grocery_name      TEXT NOT NULL,
  grocery_quantity  NUMERIC,
  grocery_unit      TEXT,
  grocery_category  TEXT NOT NULL,
  prompt_version    INTEGER NOT NULL DEFAULT 1,
  hit_count         INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ingredient_normalizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredient_normalizations_select_authenticated"
  ON ingredient_normalizations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ingredient_normalizations_insert_authenticated"
  ON ingredient_normalizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "ingredient_normalizations_update_hit_count"
  ON ingredient_normalizations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Column-level grant: authenticated users can only update hit_count.
REVOKE UPDATE ON ingredient_normalizations FROM authenticated;
GRANT  UPDATE (hit_count) ON ingredient_normalizations TO authenticated;

-- -----------------------------------------------------------------------------
-- usda_lookups
-- -----------------------------------------------------------------------------

CREATE TABLE usda_lookups (
  cache_key         TEXT PRIMARY KEY,
  original_query    TEXT NOT NULL,
  calories          NUMERIC,
  protein_g         NUMERIC,
  carbs_g           NUMERIC,
  fat_g             NUMERIC,
  usda_description  TEXT,
  hit_count         INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE usda_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usda_lookups_select_authenticated"
  ON usda_lookups
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "usda_lookups_insert_authenticated"
  ON usda_lookups
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "usda_lookups_update_hit_count"
  ON usda_lookups
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE UPDATE ON usda_lookups FROM authenticated;
GRANT  UPDATE (hit_count) ON usda_lookups TO authenticated;

-- -----------------------------------------------------------------------------
-- Backfill ingredient_normalizations from existing recipe_ingredients
-- -----------------------------------------------------------------------------
-- DISTINCT ON (cache_key) collapses duplicates; ORDER BY tiebreaker prefers the
-- most-recently-normalized recipe (joined via recipes.grocery_normalized_at,
-- since recipe_ingredients itself has no timestamp).

INSERT INTO ingredient_normalizations
  (cache_key, raw_text, grocery_name, grocery_quantity, grocery_unit, grocery_category, prompt_version)
SELECT DISTINCT ON (cache_key)
  LOWER(TRIM(REGEXP_REPLACE(ri.raw_text, '\s+', ' ', 'g'))) AS cache_key,
  ri.raw_text,
  ri.grocery_name,
  ri.grocery_quantity,
  ri.grocery_unit,
  ri.grocery_category,
  1 AS prompt_version
FROM recipe_ingredients ri
JOIN recipes r ON r.id = ri.recipe_id
WHERE ri.grocery_name IS NOT NULL
  AND ri.grocery_category IS NOT NULL
  AND ri.raw_text IS NOT NULL
  AND TRIM(ri.raw_text) <> ''
ORDER BY cache_key, r.grocery_normalized_at DESC NULLS LAST
ON CONFLICT (cache_key) DO NOTHING;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP `apply_migration` tool. Project ID: `rwqyrkgojkxhboqpzsrq`. Migration name: `013_external_call_caches`. Pass the file's contents as the `query` parameter.

- [ ] **Step 3: Verify schema and RLS**

Run via Supabase MCP `execute_sql`:

```sql
SELECT table_name, COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ingredient_normalizations', 'usda_lookups')
GROUP BY table_name
ORDER BY table_name;
```

Expected: two rows. `ingredient_normalizations` has 9 columns; `usda_lookups` has 9 columns.

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ingredient_normalizations', 'usda_lookups')
ORDER BY tablename, cmd;
```

Expected: 6 rows total — three policies (SELECT, INSERT, UPDATE) per table.

- [ ] **Step 4: Verify backfill landed**

Run via Supabase MCP `execute_sql`:

```sql
SELECT COUNT(*) AS row_count, MIN(created_at), MAX(created_at)
FROM ingredient_normalizations;
```

Expected: `row_count` ≈ 263 (matches the validation count from the spec). `MIN` and `MAX` should be within seconds of each other (single-transaction insert).

```sql
SELECT COUNT(*) AS row_count FROM usda_lookups;
```

Expected: `row_count` = 0.

- [ ] **Step 5: Verify a known cache_key transformation**

Run via Supabase MCP `execute_sql`:

```sql
SELECT cache_key, raw_text, grocery_name, hit_count
FROM ingredient_normalizations
WHERE cache_key = 'salt to taste';
```

Expected: 1 row. `hit_count` = 0. `grocery_name` reflects whatever the AI produced for that input ("Salt" most likely).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/013_external_call_caches.sql
git commit -m "feat(db): add ingredient_normalizations and usda_lookups cache tables

Two-table cache layer in front of DeepSeek AI normalization and USDA
FoodData Central lookups. Both tables are global, with read/insert
allowed for any authenticated user and update restricted to hit_count
via column grant. Backfills ingredient_normalizations from existing
recipe_ingredients rows in the same migration."
```

---

## Task 2 — Migration: atomic hit-count RPCs

**Files:**
- Create: `supabase/migrations/014_cache_hit_count_rpc.sql`

Two trivial Postgres functions, one per cache table, that do `hit_count = hit_count + 1` in a single atomic statement. This avoids read-modify-write races in client code and makes the wrapper code in later tasks straightforward.

- [ ] **Step 1: Write migration `014_cache_hit_count_rpc.sql`**

```sql
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
```

> **Why two functions?** `usda_lookups` is hit one at a time (per ingredient), so the simple form is fine. `ingredient_normalizations` is hit in batch (all ingredients of a recipe at once), so it accepts an array to avoid N round-trips per recipe import.

- [ ] **Step 2: Apply migration via Supabase MCP**

Use Supabase MCP `apply_migration`. Project ID: `rwqyrkgojkxhboqpzsrq`. Migration name: `014_cache_hit_count_rpc`. Pass the file contents as `query`.

- [ ] **Step 3: Verify functions exist and are callable**

Run via Supabase MCP `execute_sql`:

```sql
SELECT proname, pronargs
FROM pg_proc
WHERE proname IN ('increment_usda_hit_count', 'increment_ingredient_normalization_hit_count')
ORDER BY proname;
```

Expected: 2 rows.

```sql
-- Round-trip test: zero hit_count, increment, verify, restore
UPDATE ingredient_normalizations SET hit_count = 0 WHERE cache_key = 'salt to taste';
SELECT increment_ingredient_normalization_hit_count(ARRAY['salt to taste']);
SELECT cache_key, hit_count FROM ingredient_normalizations WHERE cache_key = 'salt to taste';
```

Expected: `hit_count` = 1 in the final SELECT.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/014_cache_hit_count_rpc.sql
git commit -m "feat(db): add atomic hit_count RPCs for cache tables"
```

---

## Task 3 — Add TypeScript types for the cache tables

**Files:**
- Modify: `src/types/database.ts` (append at end)

- [ ] **Step 1: Append type definitions**

Open `src/types/database.ts` and append these interfaces at the end of the file (after the last existing export):

```ts
// ---------------------------------------------------------------------------
// Cache tables (013_external_call_caches.sql)
// ---------------------------------------------------------------------------

export interface IngredientNormalizationCacheEntry {
  cache_key: string;
  raw_text: string;
  grocery_name: string;
  grocery_quantity: number | null;
  grocery_unit: string | null;
  grocery_category: IngredientCategory;
  prompt_version: number;
  hit_count: number;
  created_at: string;
}

export interface UsdaLookupCacheEntry {
  cache_key: string;
  original_query: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  usda_description: string | null;
  hit_count: number;
  created_at: string;
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add types for cache table entries"
```

---

## Task 4 — Create the USDA cache wrapper

**Files:**
- Create: `src/lib/nutrition-cache.ts`

This module owns the L1 in-memory `Map` (which Task 5 will remove from `nutrition.ts`), the L2 Supabase reads/writes, and falls through to the existing `searchUSDAFood` for L3.

- [ ] **Step 1: Create `src/lib/nutrition-cache.ts`**

```ts
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
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/nutrition-cache.ts
git commit -m "feat(nutrition): add three-tier USDA cache wrapper

L1 in-memory Map, L2 Supabase usda_lookups, L3 live USDA API.
All tiers fall through gracefully on failure; hit-count tracking
is fire-and-forget via the migration-014 RPC."
```

---

## Task 5 — Wire the USDA wrapper into `nutrition.ts`

**Files:**
- Modify: `src/lib/nutrition.ts` (remove L1 Map, change internal calls in batch functions, add `SupabaseClient` parameter to batch functions)
- Modify: `src/app/api/recipes/import/route.ts` (pass `supabase` into `calculateNutritionForIngredients`)
- Modify: `src/app/api/nutrition/calculate/route.ts` (pass `supabase` into `calculateNutritionWithBreakdown`)

The bare `searchUSDAFood` stays as the L3 origin. The batch functions gain a `SupabaseClient` first argument and call `searchUSDAFoodCached` instead.

- [ ] **Step 1: Edit `src/lib/nutrition.ts`**

Replace lines 41-46 (the L1 cache state and `normalizeKey` helper):

**Before:**
```ts
// Module-level cache for USDA lookups (resets on redeploy)
const usdaCache = new Map<string, NutritionInfo>();

function normalizeKey(query: string): string {
  return query.toLowerCase().trim();
}
```

**After:**
```ts
// L1 in-memory cache moved to src/lib/nutrition-cache.ts.
```

Then remove the cache check inside `searchUSDAFood`:

**Before (inside `searchUSDAFood`, after the `apiKey` check):**
```ts
  const cacheKey = normalizeKey(query);
  const cached = usdaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch(
```

**After:**
```ts
  const response = await fetch(
```

And remove the `usdaCache.set(cacheKey, result);` line near the end of `searchUSDAFood`:

**Before:**
```ts
  usdaCache.set(cacheKey, result);

  return result;
```

**After:**
```ts
  return result;
```

Then update the imports at the top of the file to add `SupabaseClient` and `searchUSDAFoodCached`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { NutritionInfo, IngredientNutritionDetail } from "@/types/database";
import { convertToGrams } from "@/lib/unit-conversion";
import { searchUSDAFoodCached } from "@/lib/nutrition-cache";

// Re-export for backward compatibility
export { convertToGrams } from "@/lib/unit-conversion";
```

Change `calculateNutritionForIngredients` signature:

**Before:**
```ts
export async function calculateNutritionForIngredients(
  ingredients: IngredientInput[],
  servings: number
): Promise<NutritionInfo> {
```

**After:**
```ts
export async function calculateNutritionForIngredients(
  supabase: SupabaseClient,
  ingredients: IngredientInput[],
  servings: number
): Promise<NutritionInfo> {
```

And change the internal call inside its body:

**Before:**
```ts
        const per100g = await searchUSDAFood(ing.name);
```

**After:**
```ts
        const per100g = await searchUSDAFoodCached(supabase, ing.name);
```

Same edits for `calculateNutritionWithBreakdown`. The signature becomes:

```ts
export async function calculateNutritionWithBreakdown(
  supabase: SupabaseClient,
  ingredients: IngredientInput[],
  servings: number
): Promise<NutritionWithBreakdown> {
```

And the internal call becomes:

```ts
        const per100g = await searchUSDAFoodCached(supabase, ing.name);
```

- [ ] **Step 2: Edit `src/app/api/recipes/import/route.ts`**

Update the imports at the top of the file:

```ts
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { scrapeRecipe } from "@/lib/recipe-scraper";
import { parseIngredient } from "@/lib/ingredient-parser";
import { calculateNutritionForIngredients } from "@/lib/nutrition";
```

Inside the `POST` handler, immediately after the `try {` and before any logic, instantiate the supabase client:

```ts
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
```

Then update the call to pass it through:

**Before:**
```ts
        const usdaNutrition = await calculateNutritionForIngredients(
          parsedIngredients.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
          })),
          servings
        );
```

**After:**
```ts
        const usdaNutrition = await calculateNutritionForIngredients(
          supabase,
          parsedIngredients.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
          })),
          servings
        );
```

- [ ] **Step 3: Edit `src/app/api/nutrition/calculate/route.ts`**

Update imports:

```ts
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { calculateNutritionWithBreakdown } from "@/lib/nutrition";
```

Inside `POST`, instantiate the client and pass it through. The full handler body becomes:

```ts
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body: CalculateRequestBody = await request.json();

    if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
      return NextResponse.json(
        { error: "At least one ingredient is required." },
        { status: 400 }
      );
    }

    const servings =
      typeof body.servings === "number" && body.servings > 0
        ? body.servings
        : 1;

    const result = await calculateNutritionWithBreakdown(
      supabase,
      body.ingredients,
      servings
    );

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to calculate nutrition." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Verify types compile and lint passes**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 5: Browser-test the USDA path end-to-end**

Start the dev server:

```bash
pnpm dev
```

In a browser (or via the Playwright MCP):

1. Log in.
2. Navigate to recipes/import.
3. Paste a URL whose page has **no JSON-LD nutrition** so the USDA fallback runs. Suggested test: any recipe blog URL not previously imported and lacking schema.org NutritionInformation. Self-published blogs often lack this; major sites (NYT Cooking, Bon Appétit) usually have it.
4. Watch the network tab — `/api/recipes/import` should return successfully with nutrition values in the response.
5. After import, run via Supabase MCP `execute_sql`:

```sql
SELECT cache_key, original_query, calories, hit_count, created_at
FROM usda_lookups
ORDER BY created_at DESC
LIMIT 10;
```

Expected: rows for the ingredients of the recipe just imported. `hit_count` = 0 (just inserted, no hits yet).

6. Re-import the same URL (or a different recipe with overlapping ingredients) and run the SQL again.

Expected: `hit_count` increments for the overlapping ingredients.

If no rows appear in `usda_lookups` after a real USDA-fallback path, stop and debug. Likely culprits: an import path that still references the bare `searchUSDAFood`, the route handler not passing `supabase` through, or RLS blocking the INSERT.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nutrition.ts \
        src/app/api/recipes/import/route.ts \
        src/app/api/nutrition/calculate/route.ts
git commit -m "feat(nutrition): wire USDA cache wrapper into batch functions

Removes the per-instance Map cache from nutrition.ts; batch functions
now take a SupabaseClient and route lookups through the new three-tier
cache. Recipe-import and nutrition-calc routes pass through their
already-existing supabase context."
```

---

## Task 6 — Create the AI normalizer cache wrapper

**Files:**
- Create: `src/lib/ai-ingredient-normalizer-cached.ts`

The wrapper batches every input's cache key into a single SELECT, calls the existing `normalizeIngredients` for misses only, and UPSERTs new entries.

- [ ] **Step 1: Create `src/lib/ai-ingredient-normalizer-cached.ts`**

```ts
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
```

- [ ] **Step 2: Verify types compile and lint passes**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-ingredient-normalizer-cached.ts
git commit -m "feat(ai): add cached AI normalizer wrapper

Single batch SELECT for all input cache keys, AI call only for
misses, UPSERT for new entries. Cache failures fall through to
the bare function silently. Versioned by CURRENT_PROMPT_VERSION
constant so prompt changes can invalidate the cache atomically."
```

---

## Task 7 — Swap call sites to the cached AI normalizer

**Files:**
- Modify: `src/actions/recipes.ts` (two call sites: `createRecipe`, `duplicateRecipe`)
- Modify: `src/app/api/recipes/normalize-all/route.ts` (one call site)

The swap is mechanical: replace `normalizeIngredients(inserted)` with `normalizeIngredientsWithCache(supabase, inserted)`. Both call sites already have a `supabase` client in scope.

- [ ] **Step 1: Edit `src/actions/recipes.ts`**

Update the import (around line 12):

**Before:**
```ts
import { normalizeIngredients } from "@/lib/ai-ingredient-normalizer";
```

**After:**
```ts
import { normalizeIngredientsWithCache } from "@/lib/ai-ingredient-normalizer-cached";
```

Update the first call site (around line 211, inside `createRecipe`):

**Before:**
```ts
        const normalized = await normalizeIngredients(inserted);
```

**After:**
```ts
        const normalized = await normalizeIngredientsWithCache(supabase, inserted);
```

Update the second call site (around line 313, inside `duplicateRecipe`):

**Before:**
```ts
        const normalized = await normalizeIngredients(inserted);
```

**After:**
```ts
        const normalized = await normalizeIngredientsWithCache(supabase, inserted);
```

- [ ] **Step 2: Edit `src/app/api/recipes/normalize-all/route.ts`**

Update the import:

**Before:**
```ts
import { normalizeIngredients } from "@/lib/ai-ingredient-normalizer";
```

**After:**
```ts
import { normalizeIngredientsWithCache } from "@/lib/ai-ingredient-normalizer-cached";
```

Update the call (around line 81):

**Before:**
```ts
        const normalized = await normalizeIngredients(
          ingredients.map((ing) => ({ id: ing.id, raw_text: ing.raw_text ?? "" }))
        );
```

**After:**
```ts
        const normalized = await normalizeIngredientsWithCache(
          supabase,
          ingredients.map((ing) => ({ id: ing.id, raw_text: ing.raw_text ?? "" }))
        );
```

- [ ] **Step 3: Verify types compile and lint passes**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/actions/recipes.ts src/app/api/recipes/normalize-all/route.ts
git commit -m "feat(recipes): switch AI normalization to cached wrapper

createRecipe, duplicateRecipe, and normalize-all backfill route
now route through normalizeIngredientsWithCache. Bare function
remains in place for direct/debug use."
```

---

## Task 8 — End-to-end verification

This task is browser + SQL only. No code changes. The goal is to confirm the cache works on real flows and produces the expected hit/miss patterns.

- [ ] **Step 1: Reset hit counts to a clean baseline**

Run via Supabase MCP `execute_sql`:

```sql
UPDATE ingredient_normalizations SET hit_count = 0;
UPDATE usda_lookups              SET hit_count = 0;
SELECT COUNT(*) AS rows, SUM(hit_count) AS hits FROM ingredient_normalizations;
SELECT COUNT(*) AS rows, SUM(hit_count) AS hits FROM usda_lookups;
```

Expected: `hits` = 0 in both. `rows` ≈ 263 in `ingredient_normalizations`, ≥ 0 in `usda_lookups` (depending on how much Task 5's browser test populated it).

- [ ] **Step 2: Cache-warm path (overlapping ingredients)**

```bash
pnpm dev
```

In the browser (or via Playwright MCP):

1. Navigate to the recipes import page.
2. Import a recipe whose ingredient list overlaps heavily with existing recipes — e.g., another Indian curry if existing data has Indian curries (it does — `1 tsp cumin seeds`, `1 tablespoon ginger-garlic paste`, etc.).
3. The recipe should save successfully. The AI normalization phase should be visibly fast or skipped entirely.

After import, run via Supabase MCP `execute_sql`:

```sql
SELECT cache_key, hit_count, grocery_name
FROM ingredient_normalizations
WHERE hit_count > 0
ORDER BY hit_count DESC;
```

Expected: rows with `hit_count` ≥ 1 for every cache_key that matched an ingredient in the new recipe. Number of hits = number of overlapping ingredients.

- [ ] **Step 3: Cache-cold path (novel ingredients)**

In the browser:

1. Import a recipe with mostly novel ingredients — e.g. a cuisine you haven't imported before (Filipino, Ethiopian, etc.) so the cache has to call the AI.
2. The AI call should complete normally (a brief delay is expected).
3. After import, run via Supabase MCP `execute_sql`:

```sql
SELECT cache_key, raw_text, grocery_name, hit_count, created_at
FROM ingredient_normalizations
WHERE created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

Expected: new rows for the novel ingredients. `hit_count` = 0 (they were just inserted on this miss).

- [ ] **Step 4: Re-import the same recipe to confirm full cache hit**

In the browser:

1. Re-import the same URL from Step 3 (or duplicate that recipe).
2. The AI call should be skipped entirely (every ingredient now hits cache).
3. Run via Supabase MCP `execute_sql`:

```sql
SELECT cache_key, hit_count
FROM ingredient_normalizations
WHERE created_at > NOW() - INTERVAL '5 minutes'
ORDER BY hit_count DESC;
```

Expected: every row from Step 3 now has `hit_count` ≥ 1.

- [ ] **Step 5: USDA cache verification**

Run via Supabase MCP `execute_sql`:

```sql
SELECT cache_key, calories, hit_count, created_at
FROM usda_lookups
ORDER BY created_at DESC
LIMIT 20;
```

Expected: rows for ingredients from any imported recipes that lacked JSON-LD nutrition. If empty: that's fine if every test URL had JSON-LD — pick a URL without it for at least one test.

- [ ] **Step 6: Failure-mode sanity check (optional but recommended)**

Temporarily simulate a Supabase outage by adding an early throw inside `nutrition-cache.ts`'s `readL2`:

```ts
async function readL2(/* ... */): Promise<NutritionInfo | null> {
  throw new Error("simulated outage");
  // ... rest of body unchanged
}
```

Run a recipe import. Expected: import still succeeds (the catch in `searchUSDAFoodCached` swallows the throw and falls through to L3). Revert the change before any further commits.

- [ ] **Step 7: Update CLAUDE.md and project memory if needed**

If any docs, READMEs, or `CLAUDE.md` updates are warranted to reference the new cache tables in the database section, add them now. Otherwise skip the commit.

If you make any updates:

```bash
git add -A
git commit -m "docs: note cache tables in CLAUDE.md and project memory"
```

---

## Self-Review Checklist (run before claiming done)

- [ ] All 8 tasks executed and committed.
- [ ] `pnpm tsc --noEmit` passes from a clean checkout.
- [ ] `pnpm lint` passes.
- [ ] `ingredient_normalizations` populated (~263 rows) and shows `hit_count > 0` after Task 8.
- [ ] `usda_lookups` populated with at least the rows from any USDA-fallback test imports.
- [ ] Three call-site swaps committed (`createRecipe`, `duplicateRecipe`, `normalize-all`).
- [ ] Two route handlers (`recipes/import`, `nutrition/calculate`) pass `supabase` into the batch nutrition functions.
- [ ] L1 `usdaCache` Map is gone from `nutrition.ts`.
- [ ] No references to the bare `normalizeIngredients` outside `ai-ingredient-normalizer-cached.ts` and the original module file.

If any of those fail, fix before declaring complete.
