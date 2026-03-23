# AI Grocery Normalization + Collapsible Meal Plan + "Already Have"

## Problem

Grocery list generation produces unusable output because ingredients arrive as raw text with inconsistent names, units, and preparation details. "2 cloves garlic, minced" and "garlic, smashed" become separate items. The AI consolidator we added fixes this at generation time, but it runs late in the pipeline (on every grocery list generation), is rate-limited, and doesn't give users the chance to exclude items they already have at home.

## Solution

Move AI intelligence upstream to recipe creation time. Normalize ingredients once per recipe, then everything downstream — meal plan ingredient previews, "already have" marking, and grocery list generation — becomes simple data operations with no AI calls.

## Architecture

```
Recipe Created/Imported
  → Ingredients parsed (existing flow)
  → AI normalizes each ingredient into grocery format (new)
  → Stored as grocery_* columns on recipe_ingredients

Meal Plan View (collapsible by day)
  → Expand a day → see recipes + their normalized grocery items
  → User marks items they "already have" → stored on meal_plan

Generate Grocery List
  → Consolidate pre-normalized grocery items across recipes
  → Exclude "already have" items
  → No AI call needed
```

## Phases

### Phase 1: AI Normalization at Recipe Save

**Schema migration** — add columns to `recipe_ingredients`:

| Column | Type | Purpose |
|--------|------|---------|
| `grocery_name` | TEXT, nullable | Clean title-case name ("Garlic" not "garlic, minced") |
| `grocery_quantity` | NUMERIC, nullable | Normalized quantity |
| `grocery_unit` | TEXT, nullable | Normalized unit |
| `grocery_category` | TEXT, nullable | Proper category (produce, dairy, meat, pantry, frozen, bakery, beverages, other) |

Also add `grocery_normalized_at` (TIMESTAMPTZ, nullable) to `recipes` — tracks when normalization last ran. Null = not yet normalized. Useful for backfill queries and detecting stale normalization.

**Where in the pipeline:** AI normalization runs inside `createRecipe` and `updateRecipe` server actions, after ingredient rows are inserted/updated. This covers all recipe sources (manual entry, URL import, AI-generated). The flow:
1. Insert/update `recipe_ingredients` rows with parsed fields (existing)
2. Collect all ingredient `raw_text` values
3. Call AI normalizer → get back grocery_* values per ingredient
4. Update `recipe_ingredients` rows with grocery_* columns
5. Set `recipes.grocery_normalized_at = now()`

This means two DB operations for ingredients (insert then update), but keeps the normalization logic centralized in the save actions rather than scattered across import routes.

**AI prompt:** Receives all recipe ingredients as raw text, returns normalized grocery items per ingredient. Uses the existing DeepSeek API (OpenAI SDK, same env vars). Each input ingredient maps 1:1 to an output grocery item — the AI normalizes names/units but does not merge or split ingredients.

**Rate limiting:** Does NOT count against the 3/day AI generation limit. This is core infrastructure.

**Fallback:** If AI fails, `grocery_*` columns stay null, `grocery_normalized_at` stays null. Downstream code uses raw `name`, `quantity`, `unit`, `category` from the existing parsed fields. Recipe saves normally — normalization failure is never user-facing.

**Type changes:** `RecipeIngredientInput` (used by client forms) must make `grocery_*` fields optional since they're set server-side, not by the client.

**Backfill strategy:** Existing recipes get normalized via an API route (`POST /api/recipes/normalize-all`):
- Queries recipes where `grocery_normalized_at IS NULL`
- Processes in batches (e.g., 5 recipes at a time) to respect API rate limits
- Each recipe: fetch its ingredients, call AI normalizer, update rows
- Returns count of processed/failed recipes
- Can be triggered manually from Settings or via a CLI command
- Partial failures are safe — only successfully normalized recipes get their timestamp updated

**Files affected:**
- New migration: `supabase/migrations/011_grocery_normalization.sql`
- `src/actions/recipes.ts` — add AI normalization call after ingredient save
- New lib: `src/lib/ai-ingredient-normalizer.ts` — prompt + OpenAI call + Zod validation
- `src/types/database.ts` — update `RecipeIngredient` and `Recipe` types
- New API route: `src/app/api/recipes/normalize-all/route.ts` — backfill endpoint

### Phase 2: Collapsible Day View in Meal Plan

**Current state:** Desktop uses a 7-column grid, mobile uses a vertical card stack. Neither shows ingredients.

**New design:** Accordion-style day chiclets on all screen sizes.

**Collapsed state (per day):**
- Day name + date: "Monday, Mar 16"
- Compact summary: "3 meals planned"
- Chevron indicator

**Expanded state (per day):**
- Meal slots grouped by type (breakfast, lunch, dinner, snack)
- Each recipe shows:
  - Recipe name + nutrition info (existing)
  - Normalized grocery items as a compact checklist below
  - Each item: checkbox + grocery name + quantity/unit
  - Checked = "I already have this"
- Drag-and-drop: preserved within an expanded day. Cross-day drag requires both source and target days to be expanded. The existing `@hello-pangea/dnd` setup works since droppable areas are keyed by `${dayOfWeek}-${mealSlot}` — as long as both are rendered (expanded), drag works.

**State persistence:**
- Expanded/collapsed state → localStorage (same pattern as grocery categories)
- Default: today's day expanded, others collapsed

**Data fetching:** The existing `getMealPlan` action fetches `meal_plan_items` with `recipe:recipes(*)`. Phase 2 requires `recipe_ingredients` too. Two options:
- **Eager (recommended for now):** Extend the query to `recipe:recipes(*, recipe_ingredients(*))`. A week's plan typically has 7-20 unique recipes × ~10 ingredients = 70-200 rows. Acceptable payload.
- **Lazy:** Fetch ingredients on accordion expand via a separate action. Better for very large plans but adds complexity and loading states.

Start with eager fetching; optimize to lazy if performance becomes an issue.

**Household context:** Recipes are shared within households. One user normalizing a recipe's ingredients benefits the other household member's view. This is correct — normalized data is a property of the recipe, not the user.

**Files affected:**
- `src/components/meal-plan/week-grid.tsx` — replace grid with accordion layout
- `src/actions/meal-plans.ts` — extend query to include recipe_ingredients
- `src/types/database.ts` — update `MealPlanItemWithRecipe` to include ingredients
- New component: `src/components/meal-plan/day-accordion.tsx`
- New component: `src/components/meal-plan/recipe-grocery-items.tsx`
- `src/lib/onboarding-config.ts` — update plan page banner + add day-accordion and already-have spotlights

### Phase 3: "Already Have" + Grocery Generation

**Schema change** — add column to `meal_plans`:

| Column | Type | Purpose |
|--------|------|---------|
| `already_have_items` | TEXT[], default '{}' | Normalized grocery names the user already has |

**"Already have" behavior:**
- Checking an item adds its `grocery_name` (lowercased) to `meal_plans.already_have_items`
- This is **global for the week** — if garlic appears in 3 recipes, checking it in any one marks it everywhere
- Unchecking removes it from the array
- Persisted via server action (updates meal_plan row)
- Household-shared: `already_have_items` is on the meal plan, which is shared within a household. Both members see the same marks. The `toggleAlreadyHaveItem` action uses `applyOwnershipFilter` to verify access.

**"Already have" matching:** To handle AI inconsistency (e.g., "Bell Pepper" vs "Bell Peppers"), all comparisons use lowercased strings. The `already_have_items` array stores lowercased names. When displaying checkboxes, match `grocery_name.toLowerCase()` against the array. This handles pluralization and casing differences. For more complex synonyms (scallion vs green onion), the AI prompt explicitly instructs consistent naming — but exact matching after lowercasing handles the common cases.

**Duplicate recipes in meal plan:** A recipe can appear multiple times in a week (e.g., Chicken Tikka on Monday and Thursday). Each occurrence contributes its full ingredient quantities to the grocery list. If Chicken Tikka needs 2 lb chicken and appears twice, the grocery list shows 4 lb chicken. This matches user expectations — you need ingredients for each time you cook it.

**Grocery list generation (simplified):**
- Fetch all `recipe_ingredients` for the meal plan's recipes (NOT deduplicated by recipe_id — each meal_plan_item contributes separately)
- Group by `grocery_name` lowercased (or fall back to `name` lowercased if `grocery_name` is null)
- Sum quantities for matching names with compatible units
- Filter out items whose lowercased `grocery_name` is in `meal_plans.already_have_items`
- Clean up `already_have_items` array: remove entries that don't match any ingredient in the current plan
- Insert into `grocery_items` table (existing flow)
- No AI call needed

**Removals:**
- `src/lib/ai-grocery-consolidator.ts` — delete entirely
- AI consolidation logic in `src/actions/grocery.ts` — revert to simple consolidation using normalized data

**Grocery export API** (`/api/grocery/export`) — unaffected. It reads from `grocery_items` table which has the same shape regardless of how items were generated.

**Files affected:**
- New migration: `supabase/migrations/012_already_have_items.sql`
- `src/actions/grocery.ts` — simplified consolidation, "already have" filtering, no deduplication of recipe_ids
- `src/actions/meal-plans.ts` — new action: `toggleAlreadyHaveItem(mealPlanId, groceryName)`
- `src/types/database.ts` — update `MealPlan` type
- Delete: `src/lib/ai-grocery-consolidator.ts`
- `src/lib/onboarding-config.ts` — update grocery page banner to mention "already have" exclusion

## Data Flow Example

```
Recipe "Chicken Tikka" saved with ingredients:
  raw: "2 lbs chicken breast, cut into cubes"
  → AI normalizes → grocery_name: "Chicken Breast", grocery_quantity: 2, grocery_unit: "lb", grocery_category: "meat"

  raw: "1 large capsicum, sliced"
  → AI normalizes → grocery_name: "Bell Pepper", grocery_quantity: 1, grocery_unit: "large", grocery_category: "produce"

User opens meal plan, expands Monday:
  Monday
  ├─ Lunch: Chicken Tikka (serves 4)
  │  ☐ Chicken Breast — 2 lb
  │  ☐ Bell Pepper — 1 large
  │  ☑ Garlic — 4 cloves  ← user marked "already have"
  │  ...

Chicken Tikka also appears on Thursday:
  Thursday
  ├─ Dinner: Chicken Tikka (serves 4)
  │  ☐ Chicken Breast — 2 lb
  │  ☐ Bell Pepper — 1 large
  │  ☑ Garlic — 4 cloves  ← auto-checked (global "already have")
  │  ...

Generate Grocery List:
  → Chicken Breast: 2 lb (Mon) + 2 lb (Thu) = 4 lb  ← doubled because recipe used twice
  → Bell Pepper: 1 (Mon) + 1 (Thu) = 2
  → Garlic: EXCLUDED (already have)
```

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Old recipes without grocery_* data | Fall back to raw name/quantity/unit/category fields |
| AI normalization fails on save | grocery_* columns stay null, recipe saves normally |
| Same ingredient, different grocery_names across recipes | Lowercased matching handles casing/plurals; AI prompt instructs consistent naming |
| User edits ingredients after normalization | Re-run AI normalization on recipe update |
| "Already have" item not in current meal plan | Cleaned up at grocery list generation time |
| Recipe removed from meal plan | Its grocery items disappear from preview; stale "already have" entries cleaned at generation |
| Recipe used multiple times in meal plan | Each occurrence contributes full quantities (not deduplicated) |
| Household context | Normalized data is per-recipe (shared). "Already have" is per-meal-plan (shared in household). Both members see same state. |
| Drag-and-drop in accordion view | Works between expanded days; cross-day drag requires both days expanded |

## Onboarding & Tooltips

Integrate with the existing onboarding system (`OnboardingProvider` + `PageGuide` + `SpotlightTour`). Changes go in `src/lib/onboarding-config.ts`.

### Meal Plan page (`plan`)

**Update banner** — Revise to mention the new accordion layout and "already have" feature:
- Icon: "📅"
- Title: "Plan your week and mark what you have"
- Description: "Expand any day to see your meals and their ingredients. Mark items you already have at home — they'll be excluded from your grocery list."

**New spotlights:**
- **Day accordion** (`data-onboarding="day-accordion"`): "Expand a Day" — "Tap a day to see your meals and the grocery items you'll need. Mark anything you already have at home."
- **Already-have checkbox** (`data-onboarding="already-have"`): "Already Have It?" — "Check off ingredients you already have. This applies to the whole week — if garlic is needed in multiple recipes, checking it once excludes it from your grocery list."

### Grocery page (`grocery`)

**Update banner** — Mention that "already have" items are pre-excluded:
- Description: "Generated from your finalized meal plan — ingredients you marked as 'already have' are excluded. Quantities are combined across recipes."

### Recipes page (no changes needed)

AI normalization is invisible to the user — no onboarding needed for Phase 1.

### Settings page

If a backfill button is added ("Normalize all recipes"), add a brief tooltip:
- "Updates your recipes with clean grocery names for better shopping lists."

## Migration Path

1. Deploy Phase 1 → existing recipes work as before (grocery_* is null, uses raw fields)
2. Run backfill via `/api/recipes/normalize-all` → normalizes existing recipes
3. Deploy Phase 2 → new accordion UI, shows grocery items under recipes
4. Deploy Phase 3 → "already have" checkboxes, simplified grocery generation, remove AI consolidator
