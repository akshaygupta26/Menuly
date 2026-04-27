# External-Call Caching Design

**Date:** 2026-04-26
**Status:** Design — pending implementation plan
**Scope:** Add a persistent, shared cache layer in front of two external calls — AI ingredient normalization (DeepSeek via the OpenAI SDK) and USDA FoodData Central nutrition lookups.

---

## 1. Problem

Menuly makes two slow, repetitive external calls during recipe import:

1. **AI ingredient normalization** (`src/lib/ai-ingredient-normalizer.ts:normalizeIngredients`) — sends raw ingredient text (e.g. `"2 lbs chicken breast, cubed"`) to DeepSeek and gets back canonical grocery fields (`grocery_name`, `grocery_quantity`, `grocery_unit`, `grocery_category`). Called from `createRecipe`, the duplicate path, and `/api/recipes/normalize-all`. **Zero caching today** — every recipe import sends every ingredient through DeepSeek even if it's been normalized a thousand times before.
2. **USDA nutrition lookup** (`src/lib/nutrition.ts:searchUSDAFood`) — looks up per-100g calorie/protein/carb/fat values for an ingredient name. Has an in-memory `Map` cache, but it's **per function instance and dies on every cold start**. On Vercel Fluid Compute, multiple concurrent function instances each maintain their own cache, none of which survive a redeploy.

Both calls are deterministic for the same input: the same `raw_text` always gets the same normalized output (modulo prompt drift), and `"chicken breast"` has the same USDA nutrient values today as last week. They are perfect cache candidates, and the absence of caching today translates directly into:

- **DeepSeek token spend** for every ingredient on every import, even on the most repetitive items (`"salt to taste"`, `"1 tsp cumin seeds"`, `"olive oil"`).
- **Latency** — every cold start re-pays the round trip for ingredients we've already looked up.
- **Inconsistency** — without a cache, the AI sometimes produces different normalizations for the same input across runs (validated below: `"1 tablespoon ginger-garlic paste"` is currently mapped to two different `grocery_name`s in the production database).

Real numbers from production (validated 2026-04-26 via Supabase MCP):

- 336 already-normalized rows in `recipe_ingredients` collapse to **263 unique cache keys** after dedup → ~22% of past AI work was on duplicates.
- Top duplicate: `"salt to taste"` appears 8× across recipes. `"1 tsp cumin seeds"` and `"1 teaspoon cumin seeds"` each 5× (cache will pay for each variant once).

## 2. Goals & non-goals

**Goals:**
- Cut DeepSeek token spend for ingredient normalization by serving repeat ingredient text from a database lookup.
- Make USDA lookups persistent across function instances and deploys.
- Improve canonical-name consistency by serving the same cached output to every caller.
- Ship as a non-disruptive layer: existing pure functions and call-site behavior preserved on cache miss, no user-facing changes.

**Non-goals:**
- Caching the recipe URL → HTML fetch in `/api/recipes/import`. (Considered, rejected: low payoff — recipes are imported once per user and the existing 1–3 second fetch is acceptable.)
- Caching meal-plan generation, recipe recommendations, or AI recipe generation.
- Per-user or per-household cache scoping. The cache is global. Ingredient text is functionally generic; no privacy benefit from isolation.
- Building a flag-bad-normalization UI. The escape hatch is bumping `prompt_version`.
- Adding an automated test runner. Verification is hands-on plus targeted SQL checks.

## 3. Architecture overview

Two new Supabase tables, two new wrapper files, edits to three existing files. `normalizeIngredients` (pure) remains untouched. `searchUSDAFood` (which currently owns an in-memory `Map`) becomes a thin pass-through to the existing USDA HTTP call; the cache state moves to `nutrition-cache.ts`.

```
src/lib/
├── ai-ingredient-normalizer.ts        (existing — unchanged)
├── ai-ingredient-normalizer-cached.ts  (NEW — wraps normalizeIngredients with cache)
├── nutrition.ts                       (existing — L1 Map and caching logic moved out, see §6.3)
└── nutrition-cache.ts                  (NEW — owns L1 Map + L2 Supabase + delegates to L3)
```

Existing call sites swap their import (3 files):
- `src/actions/recipes.ts` — `createRecipe` and the duplicate path.
- `src/app/api/recipes/normalize-all/route.ts` — backfill endpoint.
- `src/lib/nutrition.ts` — internal calls inside `calculateNutritionForIngredients` and `calculateNutritionWithBreakdown` switch to `searchUSDAFoodCached`.

## 4. Schema

Migration file: `supabase/migrations/013_external_call_caches.sql`. Single migration, two tables, RLS, backfill — atomic.

### 4.1 `ingredient_normalizations`

| Column | Type | Notes |
|---|---|---|
| `cache_key` | `TEXT PRIMARY KEY` | `LOWER(TRIM(REGEXP_REPLACE(raw_text, '\s+', ' ', 'g')))` |
| `raw_text` | `TEXT NOT NULL` | Original input — kept for debugging, analytics |
| `grocery_name` | `TEXT NOT NULL` | AI output |
| `grocery_quantity` | `NUMERIC` | AI output, nullable (e.g. "salt to taste") |
| `grocery_unit` | `TEXT` | AI output, nullable |
| `grocery_category` | `TEXT NOT NULL` | One of the 8 IngredientCategory values |
| `prompt_version` | `INTEGER NOT NULL DEFAULT 1` | Bump in code when prompt or model changes; old rows filtered out |
| `hit_count` | `INTEGER NOT NULL DEFAULT 0` | Incremented on every cache hit (fire-and-forget) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### 4.2 `usda_lookups`

| Column | Type | Notes |
|---|---|---|
| `cache_key` | `TEXT PRIMARY KEY` | `LOWER(TRIM(query))` |
| `original_query` | `TEXT NOT NULL` | What was actually sent to USDA |
| `calories` | `NUMERIC` | per-100g, nullable |
| `protein_g` | `NUMERIC` | per-100g, nullable |
| `carbs_g` | `NUMERIC` | per-100g, nullable |
| `fat_g` | `NUMERIC` | per-100g, nullable |
| `usda_description` | `TEXT` | The food name USDA matched (debugging — "did we pick the right thing?") |
| `hit_count` | `INTEGER NOT NULL DEFAULT 0` | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

### 4.3 RLS

Both tables are global (no `user_id` column). Policies:

- **SELECT:** any authenticated user. The data is functionally public — recipe ingredient names — and must be readable by every server action.
- **INSERT:** any authenticated user. Wrappers run on the server with the calling user's JWT (not the service role), so they need this. The risk surface is small: a malicious user could insert a bad normalization for a cache_key, but cache_keys are derived from the user's own ingredient text, so they could only poison entries they themselves would otherwise hit. `ON CONFLICT (cache_key) DO NOTHING` also prevents overwriting existing entries.
- **UPDATE:** any authenticated user, restricted to `hit_count` only — implemented as a column-level `GRANT UPDATE (hit_count)` plus an RLS policy that allows the row update. Hit-count increments must be writable by anyone; nothing else should be mutable post-insert.
- **DELETE:** no policy. Deletions only via migrations or admin tooling using the service role.

### 4.4 Indexes

Primary key on `cache_key` is the only index needed. Lookups are always exact-match by key. With ~263 rows initially and a projected growth of <10k rows per year, the b-tree on the PK is more than enough.

## 5. Backfill

**`ingredient_normalizations` is backfilled inside the migration.** Single `INSERT … SELECT`:

```sql
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

Notes:
- **`recipe_ingredients` has no timestamp columns.** Tiebreak via `recipes.grocery_normalized_at` (joined). When a `cache_key` appears in multiple recipes, the row from the most-recently-normalized recipe wins, on the assumption that newer normalizations reflect later prompt iterations.
- `grocery_category` is filtered `IS NOT NULL` even though the source column is nullable — protects against rows that have `grocery_name` set but missing other fields (defensive).
- Expected output: ~263 rows on the first apply. The migration is idempotent — re-running on a populated cache is a no-op due to `ON CONFLICT DO NOTHING`.

**`usda_lookups` is not backfilled.** No source data exists in the DB; per-100g USDA values are computed on-the-fly today and never persisted. This table starts empty and warms over the first few hours of use. Acceptable — the first-touch latency on each ingredient is the same as today (already paid).

## 6. Wrapper APIs

### 6.1 `ai-ingredient-normalizer-cached.ts`

Single export, same shape as `normalizeIngredients`:

```ts
export async function normalizeIngredientsWithCache(
  ingredients: { id: string; raw_text: string }[]
): Promise<{
  id: string;
  grocery_name: string;
  grocery_quantity: number | null;
  grocery_unit: string | null;
  grocery_category: string;
}[]>
```

Algorithm:

1. **Build cache keys** for all inputs: `LOWER(TRIM(REGEXP_REPLACE(raw_text, '\s+', ' ', 'g')))`.
2. **Single batch SELECT** against `ingredient_normalizations` filtering by `cache_key IN (...)` AND `prompt_version = CURRENT_PROMPT_VERSION` (constant defined in the wrapper file).
3. **Fire-and-forget hit_count UPDATE** for hit rows (no `await`, errors swallowed).
4. **Call `normalizeIngredients(misses)`** with only the ingredients that missed the cache. If misses is empty, skip the AI entirely.
5. **UPSERT new normalizations** into `ingredient_normalizations` with `ON CONFLICT (cache_key) DO NOTHING` (handles concurrent-miss races).
6. **Return** results in the original input order, same shape as `normalizeIngredients`.

The wrapper has the **same signature** as the bare function so callers can swap imports without other edits.

`CURRENT_PROMPT_VERSION` is a module-level constant (initially `1`). When the system prompt or model changes meaningfully, bump this in code; cache filtering automatically excludes old rows.

### 6.2 `nutrition-cache.ts`

Single export, same shape as `searchUSDAFood`:

```ts
export async function searchUSDAFoodCached(query: string): Promise<NutritionInfo | null>
```

Three-tier lookup:

1. **L1 in-memory `Map`** (the existing `usdaCache` from `nutrition.ts` — moved into the wrapper). Cheap, instance-local. Hit → return.
2. **L2 Supabase** `usda_lookups` table SELECT by `cache_key`. Hit → fire-and-forget `hit_count++`, populate L1, return.
3. **L3 USDA API** via the existing `searchUSDAFood`. Result → write-through INSERT into `usda_lookups` (UPSERT `ON CONFLICT DO NOTHING`), populate L1, return.

A miss at L3 (USDA returns no match) is **not cached**. Re-asking USDA an hour later might find a match if their data has been updated. Negative caching adds complexity for marginal value.

### 6.3 `nutrition.ts` edit

The existing `usdaCache: Map` and the body of `searchUSDAFood` move to `nutrition-cache.ts` (L1 + L2 + L3 logic). The exported `searchUSDAFood` function stays as a thin pass-through to L3 for callers that want to bypass the cache (debugging, tests). The two batch functions (`calculateNutritionForIngredients`, `calculateNutritionWithBreakdown`) are edited to import `searchUSDAFoodCached` instead of `searchUSDAFood`.

## 7. Data flow (end-to-end)

### 7.1 Recipe import — 10 ingredients, 7 cached

```
[scrapeRecipe] → 10 raw ingredient strings
[createRecipe] → insert recipe + 10 recipe_ingredients rows
[normalizeIngredientsWithCache(10 items)]
  ├─ build 10 cache_keys
  ├─ SELECT * FROM ingredient_normalizations
  │  WHERE cache_key IN (...) AND prompt_version = 1
  │  → 7 hits, 3 misses
  ├─ UPDATE hit_count += 1 for the 7 hits   (fire-and-forget)
  ├─ normalizeIngredients(3 misses)          (AI call, 3 items only)
  ├─ UPSERT 3 new rows                        (ON CONFLICT DO NOTHING)
  └─ return 10 results in input order
[update recipe_ingredients with grocery_*]
[mark recipes.grocery_normalized_at = NOW()]
```

70% AI token reduction on a typical 10-ingredient import once the cache is warm.

### 7.2 Nutrition calc — recipe with no JSON-LD nutrition

```
For each ingredient (batches of 5):
  searchUSDAFoodCached(name)
    ├─ L1 in-memory Map → miss
    ├─ L2 SELECT FROM usda_lookups WHERE cache_key = ?
    │   on hit:  fire-and-forget hit_count++, populate L1, return
    │   on miss: continue
    ├─ L3 fetch USDA API → result (or null)
    └─ if result not null:
         INSERT into usda_lookups ON CONFLICT DO NOTHING
         populate L1
       return result
```

The win here is mostly latency, not cost — USDA is free but slow and rate-limited.

## 8. Failure modes

| Scenario | Behavior |
|---|---|
| Supabase SELECT slow / times out (1500ms) | Treat as all-miss; fall through to existing AI/USDA call. User sees no error, slightly higher latency. |
| Supabase INSERT fails | Log, continue. Result is still returned to user; cache just doesn't grow this time. |
| `normalizeIngredients` throws (existing failure) | Caller's existing try/catch falls back to `grocery-consolidator.ts` regex parser. Wrapper does not introduce new failure surfaces here. |
| USDA returns no match | Result is `null`, not cached (see §6.2). |
| Concurrent misses on the same key | Both call AI, both attempt INSERT, second one's write is silently dropped via `ON CONFLICT DO NOTHING`. Both requests still succeed. First-writer-wins is acceptable since both answers are valid. |
| Cache returns wrong normalization | Per-row override is the existing grocery-item edit UI. Global override is `prompt_version` bump in code (next deploy). |

The cache is **never on the critical path**. Every failure degrades to "act like there is no cache."

## 9. Observability

No new logs, dashboards, or instrumentation. SQL on the cache tables answers the questions worth asking:

```sql
-- AI calls saved since launch:
SELECT SUM(hit_count) FROM ingredient_normalizations;

-- Cache growth (new entries / day):
SELECT DATE(created_at), COUNT(*) FROM ingredient_normalizations
GROUP BY 1 ORDER BY 1 DESC LIMIT 14;

-- Top hits — what's actually pulling weight:
SELECT cache_key, hit_count, grocery_name FROM ingredient_normalizations
ORDER BY hit_count DESC LIMIT 20;

-- Same queries swapping table name for usda_lookups.
```

## 10. Testing & verification

No test runner exists. Verification is hands-on plus SQL.

**Manual browser tests** (per the user's "always browser-test" rule):

1. **Cache-warm path:** Import a recipe whose ingredients overlap with existing recipes (e.g., another Indian curry). Confirm:
   - Network tab: `/api/recipes/import` completes faster than equivalent imports do today.
   - Spot-check: in the Supabase UI, `ingredient_normalizations.hit_count` increased for the matching keys.
2. **Cache-cold path:** Import a recipe with novel ingredients (e.g., an obscure cuisine). Confirm normal-speed AI call and new rows appear in `ingredient_normalizations`.
3. **USDA fallback:** Import a recipe URL with no JSON-LD nutrition (forces USDA path). First import: normal speed. Subsequent recipe with overlapping ingredients: visibly faster.
4. **Duplicate path:** Duplicate an existing recipe in the UI. Confirm normalization completes (hits cache for every ingredient).
5. **Failure path:** No automated test for this; trust the try/catch wrappers and the §8 table.

**SQL spot-checks** (run via Supabase MCP after each browser test):

```sql
SELECT COUNT(*), MAX(created_at), SUM(hit_count) FROM ingredient_normalizations;
SELECT COUNT(*), MAX(created_at), SUM(hit_count) FROM usda_lookups;
```

**Code-review checklist for the wrapper:**

- Returns one output per input.
- Returns outputs in the original input order.
- Returns the exact same `id` for every input.
- Falls through cleanly on Supabase failure (no thrown errors that bypass the AI).
- `CURRENT_PROMPT_VERSION` constant exists and is used in both SELECT and INSERT.

## 11. Rollout

1. Apply migration `013_external_call_caches.sql` (creates tables + RLS + backfill in one transaction). Expected post-migration row count: ~263 in `ingredient_normalizations`, 0 in `usda_lookups`.
2. Deploy code with the three call-site swaps and the two new wrapper files.

No feature flag. The wrapper degrades to "behave like the bare function" on every failure, so a separate flag would just be redundant scaffolding.

## 12. Rollback

| Failure | Rollback |
|---|---|
| Code regression (wrong order, wrong shape) | Revert the wrapper-import swap in 3 files (~4 lines each). The bare functions are unchanged and immediately operational. |
| Bad cache data globally | In code, bump `CURRENT_PROMPT_VERSION` from 1 → 2 and deploy. Cache effectively becomes empty; refills with new prompts. Old rows stay (cheap), can be vacuumed later if size becomes a concern. |
| Schema problem | Drop the two tables; re-deploy reverted code. Original code paths untouched and fully functional. |

No data loss in any rollback path. The cache is purely additive — `recipe_ingredients` continues to hold the canonical normalized values.

## 13. Open questions

None. All design decisions made and validated against production data on 2026-04-26.
