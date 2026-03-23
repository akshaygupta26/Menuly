# AI Grocery Normalization + Collapsible Meal Plan + "Already Have"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI ingredient normalization upstream to recipe save time, add collapsible day view to meal plan with "already have" ingredient marking, and simplify grocery list generation.

**Architecture:** AI normalizes ingredients into clean grocery items at recipe creation (stored as `grocery_*` columns on `recipe_ingredients`). Meal plan view becomes an accordion of days showing recipes with their grocery items. Users mark items they already have, which are excluded from grocery list generation. No AI call needed at grocery generation time.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL), TypeScript, OpenAI SDK (DeepSeek), Zod, shadcn/ui, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-22-ai-grocery-normalization-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/011_grocery_normalization.sql` | Add grocery_* columns to recipe_ingredients, grocery_normalized_at to recipes |
| `src/lib/ai-ingredient-normalizer.ts` | AI prompt + OpenAI call + Zod validation for ingredient normalization |
| `src/app/api/recipes/normalize-all/route.ts` | Backfill endpoint for normalizing existing recipes |
| `src/components/meal-plan/day-accordion.tsx` | Collapsible day section for meal plan |
| `src/components/meal-plan/recipe-grocery-items.tsx` | Grocery items checklist under each recipe |
| `supabase/migrations/012_already_have_items.sql` | Add already_have_items column to meal_plans |

### Modified files
| File | Changes |
|------|---------|
| `src/types/database.ts` | Add grocery_* fields to RecipeIngredient, grocery_normalized_at to Recipe, already_have_items to MealPlan |
| `src/actions/recipes.ts` | Call AI normalizer after ingredient insert in createRecipe/updateRecipe |
| `src/components/meal-plan/week-grid.tsx` | Replace grid layout with accordion of day-accordion components |
| `src/actions/meal-plans.ts` | Extend query to include recipe_ingredients, add toggleAlreadyHaveItem action |
| `src/actions/grocery.ts` | Simplify consolidation to use grocery_* fields, filter already_have_items |
| `src/lib/onboarding-config.ts` | Update plan page banner/spotlights, grocery page banner |

### Deleted files
| File | Reason |
|------|--------|
| `src/lib/ai-grocery-consolidator.ts` | Replaced by per-recipe normalization |

---

## Phase 1: AI Normalization at Recipe Save

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/011_grocery_normalization.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Add grocery normalization columns to recipe_ingredients
ALTER TABLE recipe_ingredients
  ADD COLUMN grocery_name TEXT,
  ADD COLUMN grocery_quantity NUMERIC,
  ADD COLUMN grocery_unit TEXT,
  ADD COLUMN grocery_category TEXT;

-- Add normalization timestamp to recipes
ALTER TABLE recipes
  ADD COLUMN grocery_normalized_at TIMESTAMPTZ;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` or apply via Supabase Dashboard SQL Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_grocery_normalization.sql
git commit -m "feat: add grocery normalization columns to recipe_ingredients"
```

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add grocery fields to RecipeIngredient**

Add after `sort_order: number;` (line ~113):

```typescript
grocery_name: string | null;
grocery_quantity: number | null;
grocery_unit: string | null;
grocery_category: string | null;
```

- [ ] **Step 2: Add grocery_normalized_at to Recipe**

Add after `updated_at: string;` (line ~101):

```typescript
grocery_normalized_at: string | null;
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add grocery normalization types to RecipeIngredient and Recipe"
```

### Task 3: AI Ingredient Normalizer

**Files:**
- Create: `src/lib/ai-ingredient-normalizer.ts`

- [ ] **Step 1: Write the normalizer module**

The normalizer takes a list of recipe ingredients (with `raw_text`) and returns AI-normalized grocery fields for each. Uses the same OpenAI SDK + DeepSeek pattern as `src/lib/ai-grocery-consolidator.ts`.

Key design:
- Input: array of `{ id, raw_text }` from recipe_ingredients
- Output: array of `{ id, grocery_name, grocery_quantity, grocery_unit, grocery_category }`
- 1:1 mapping — each input ingredient maps to exactly one output
- System prompt instructs AI to normalize names (title-case, no prep details), standardize units, and categorize
- Zod validation on AI response
- Throws on failure (caller handles fallback)

Prompt rules:
1. Clean title-case names without preparation details ("Garlic" not "garlic, minced")
2. Standardize units (use common units: cup, tbsp, tsp, oz, lb, g, clove, can, etc.)
3. Categorize: produce | dairy | meat | pantry | frozen | bakery | beverages | other
4. For "salt to taste" style items, set quantity and unit to null
5. Return items in the same order as input
6. One output per input — do not merge or split ingredients

Response format: `{ "items": [{ "grocery_name": string, "grocery_quantity": number|null, "grocery_unit": string|null, "grocery_category": string }] }`

Follow the exact same patterns from `ai-grocery-consolidator.ts` for: OpenAI init, `max_tokens: 4096`, `response_format: { type: "json_object" }`, finish_reason check, Zod parse.

- [ ] **Step 2: Verify types compile**

Run: `pnpm tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai-ingredient-normalizer.ts
git commit -m "feat: add AI ingredient normalizer for recipe save"
```

### Task 4: Integrate Normalizer into Recipe Save

**Files:**
- Modify: `src/actions/recipes.ts`

- [ ] **Step 1: Add import**

```typescript
import { normalizeIngredients } from "@/lib/ai-ingredient-normalizer";
```

- [ ] **Step 2: Add normalization to createRecipe**

After the ingredient insert block (after line ~200 where `ingredientsError` is checked), add:

```typescript
// AI-normalize grocery fields (non-blocking — failure leaves grocery_* as null)
try {
  const inserted = await supabase
    .from("recipe_ingredients")
    .select("id, raw_text")
    .eq("recipe_id", newRecipe.id);

  if (inserted.data && inserted.data.length > 0) {
    const normalized = await normalizeIngredients(inserted.data);

    for (const item of normalized) {
      await supabase
        .from("recipe_ingredients")
        .update({
          grocery_name: item.grocery_name,
          grocery_quantity: item.grocery_quantity,
          grocery_unit: item.grocery_unit,
          grocery_category: item.grocery_category,
        })
        .eq("id", item.id);
    }

    await supabase
      .from("recipes")
      .update({ grocery_normalized_at: new Date().toISOString() })
      .eq("id", newRecipe.id);
  }
} catch {
  // AI normalization failed — grocery_* stays null, recipe saves fine
}
```

- [ ] **Step 3: Add same normalization to updateRecipe**

After the new ingredients are inserted in `updateRecipe` (after line ~271), add the same normalization block but using `id` instead of `newRecipe.id`.

- [ ] **Step 4: Make RecipeIngredientInput exclude grocery fields**

Update the type at line ~28:

```typescript
type RecipeIngredientInput = Omit<RecipeIngredient, "id" | "recipe_id" | "grocery_name" | "grocery_quantity" | "grocery_unit" | "grocery_category">;
```

**Note:** `IngredientFormValues` in `src/components/recipes/recipe-form.tsx` does NOT need updating — it's a separate type that intentionally excludes grocery fields since those are set server-side by the AI normalizer.

- [ ] **Step 5: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add src/actions/recipes.ts
git commit -m "feat: integrate AI ingredient normalization into recipe create/update"
```

### Task 5: Backfill API Route

**Files:**
- Create: `src/app/api/recipes/normalize-all/route.ts`

- [ ] **Step 1: Write the backfill endpoint**

`POST /api/recipes/normalize-all` — authenticates user, queries recipes where `grocery_normalized_at IS NULL`, processes in batches of 5, calls normalizeIngredients for each, updates rows. Returns `{ processed, failed, remaining }`.

Uses the same auth pattern as other API routes (Supabase `getUser()`, household context). Only processes recipes owned by the authenticated user/household.

Add `export const maxDuration = 60;` at the top of the route file — backfill may take time for users with many recipes.

**Note:** No Settings UI button for triggering backfill in this plan — it's invoked via curl/API for now. A Settings button can be added later as a follow-up.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/recipes/normalize-all/route.ts
git commit -m "feat: add backfill endpoint for normalizing existing recipes"
```

### Task 6: Manual Verification — Phase 1

- [ ] **Step 1: Test recipe creation**

1. Start dev server: `pnpm dev`
2. Create a new recipe manually with ingredients like "2 cloves garlic, minced" and "1 large capsicum, sliced"
3. After save, check Supabase Dashboard: `recipe_ingredients` table should have `grocery_name`, `grocery_quantity`, `grocery_unit`, `grocery_category` populated
4. Verify `recipes.grocery_normalized_at` is set

- [ ] **Step 2: Test URL import**

1. Import a recipe via URL
2. After save, verify `grocery_*` columns are populated

- [ ] **Step 3: Test fallback**

1. Temporarily remove `AI_API_KEY` from `.env.local`
2. Create a recipe
3. Verify recipe saves normally, `grocery_*` columns are null

- [ ] **Step 4: Test duplicate recipes in meal plan**

1. Add the same recipe to Monday lunch and Thursday dinner
2. Generate grocery list
3. Verify quantities are doubled (e.g., 2 lb chicken × 2 occurrences = 4 lb)

- [ ] **Step 5: Test household sharing** (if household feature is active)

1. Log in as household member A, mark "Garlic" as already-have
2. Log in as household member B, verify "Garlic" shows as checked in the meal plan

- [ ] **Step 6: Test backfill**

1. Call `POST /api/recipes/normalize-all` via curl or browser
2. Verify old recipes get `grocery_*` columns populated

---

## Phase 2: Collapsible Day View in Meal Plan

### Task 7: Extend Meal Plan Data Fetching

**Files:**
- Modify: `src/actions/meal-plans.ts`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Update MealPlanItemWithRecipe type**

In `src/types/database.ts`, find the `MealPlanItemWithRecipe` type and ensure the recipe field includes `recipe_ingredients`:

```typescript
export interface MealPlanItemWithRecipe extends MealPlanItem {
  recipe: (Recipe & { recipe_ingredients: RecipeIngredient[] }) | null;
}
```

- [ ] **Step 2: Update getMealPlan query**

In `src/actions/meal-plans.ts`, find the `getMealPlan` action's select query and extend it:

Change: `.select("*, recipe:recipes(*)")`
To: `.select("*, recipe:recipes(*, recipe_ingredients(*))")`

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts src/actions/meal-plans.ts
git commit -m "feat: include recipe_ingredients in meal plan data fetch"
```

### Task 8: Day Accordion Component

**Files:**
- Create: `src/components/meal-plan/day-accordion.tsx`

- [ ] **Step 1: Write the day accordion component**

Props:
- `dayOfWeek: number` (0-6)
- `date: Date`
- `items: MealPlanItemWithRecipe[]` (meals for this day)
- `mealSlots: MealType[]`
- `isFinalized: boolean`
- `alreadyHaveItems: string[]` (from meal plan)
- `onToggleAlreadyHave: (groceryName: string) => void`
- Children for drag-and-drop meal slot content

Features:
- Collapsible with chevron animation (use the same CSS grid pattern as grocery category collapse)
- Collapsed: day name + date + "N meals planned" summary
- Expanded: meal slots with recipes, each showing grocery items underneath
- Persist expanded/collapsed state to localStorage keyed by week
- Default: today expanded, others collapsed
- `data-onboarding="day-accordion"` on the first day for spotlight

Use existing theme variables: `--duration-smooth` (500ms), CSS grid `gridTemplateRows` animation.

**Drag-and-drop constraint:** Cross-day drag only works when both source and target days are expanded (collapsed days don't render droppable areas). This is natural behavior — document it in a comment on the component.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/meal-plan/day-accordion.tsx
git commit -m "feat: add collapsible day accordion component"
```

### Task 9: Recipe Grocery Items Component

**Files:**
- Create: `src/components/meal-plan/recipe-grocery-items.tsx`

- [ ] **Step 1: Write the grocery items checklist**

Props:
- `ingredients: RecipeIngredient[]`
- `alreadyHaveItems: string[]`
- `onToggleAlreadyHave: (groceryName: string) => void`
- `isFinalized: boolean` (only show checkboxes when finalized)

Features:
- Compact list under each recipe in the accordion
- Each item: checkbox + grocery_name (or fallback to name) + quantity/unit
- Checked state driven by `alreadyHaveItems.includes(grocery_name.toLowerCase())`
- On check/uncheck, calls `onToggleAlreadyHave(grocery_name.toLowerCase())`
- Subtle styling: muted text, small font, indented under recipe
- `data-onboarding="already-have"` on first checkbox for spotlight

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/meal-plan/recipe-grocery-items.tsx
git commit -m "feat: add recipe grocery items checklist component"
```

### Task 10: Replace Week Grid with Accordion

**Files:**
- Modify: `src/components/meal-plan/week-grid.tsx`
- Modify: `src/app/(app)/plan/[weekStart]/meal-plan-client.tsx`

- [ ] **Step 1: Refactor week-grid.tsx**

Replace the existing 7-column grid (desktop) and vertical card stack (mobile) with a list of `DayAccordion` components. Each day gets its own accordion section.

Key changes:
- Remove the desktop grid layout and mobile card layout
- Map over days 0-6, render a `DayAccordion` for each
- Pass meal plan items filtered by `day_of_week` to each accordion
- Preserve drag-and-drop: wrap each accordion's content in `Droppable` areas (same `${dayOfWeek}-${mealSlot}` keys)
- Pass `alreadyHaveItems` and `onToggleAlreadyHave` through from parent

- [ ] **Step 2: Update WeekGrid props interface**

Add new props to `WeekGridProps` in `week-grid.tsx`:
- `alreadyHaveItems: string[]`
- `onToggleAlreadyHave: (groceryName: string) => void`

- [ ] **Step 3: Wire up alreadyHaveItems in meal-plan-client.tsx**

- Add import: `import { toggleAlreadyHaveItem } from "@/actions/meal-plans";`
- Add local state: `const [alreadyHaveItems, setAlreadyHaveItems] = useState<string[]>(initialMealPlan?.already_have_items ?? [])`
- Create handler: `handleToggleAlreadyHave(groceryName)` — updates local state optimistically, then calls `toggleAlreadyHaveItem` server action
- Pass `alreadyHaveItems` and `handleToggleAlreadyHave` to WeekGrid

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 4: Manual test**

1. Open the meal plan page
2. Verify days show as collapsible accordions
3. Expand a day — see recipes with grocery items
4. Test drag-and-drop between expanded days
5. Test on mobile viewport

- [ ] **Step 5: Commit**

```bash
git add src/components/meal-plan/week-grid.tsx src/app/\(app\)/plan/\[weekStart\]/meal-plan-client.tsx
git commit -m "feat: replace meal plan grid with collapsible day accordion"
```

### Task 11: Update Onboarding Config — Phase 2

**Files:**
- Modify: `src/lib/onboarding-config.ts`

- [ ] **Step 1: Update plan page config**

Update the `plan` entry:
- Banner: icon "📅", title "Plan your week and mark what you have", description "Expand any day to see your meals and their ingredients. Mark items you already have at home — they'll be excluded from your grocery list."
- Add spotlight: target "day-accordion", title "Expand a Day", description "Tap a day to see your meals and the grocery items you'll need. Mark anything you already have at home."
- Add spotlight: target "already-have", title "Already Have It?", description "Check off ingredients you already have. This applies to the whole week — if garlic is needed in multiple recipes, checking it once excludes it from your grocery list."

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/lib/onboarding-config.ts
git commit -m "feat: update meal plan onboarding for accordion and already-have"
```

---

## Phase 3: "Already Have" + Grocery Generation

### Task 12: Database Migration — Already Have

**Files:**
- Create: `supabase/migrations/012_already_have_items.sql`

- [ ] **Step 1: Write migration**

```sql
ALTER TABLE meal_plans
  ADD COLUMN already_have_items TEXT[] DEFAULT '{}';
```

- [ ] **Step 2: Apply migration**

- [ ] **Step 3: Update MealPlan type in `src/types/database.ts`**

Add to the MealPlan interface:

```typescript
already_have_items: string[];
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_already_have_items.sql src/types/database.ts
git commit -m "feat: add already_have_items column to meal_plans"
```

### Task 13: Toggle Already Have Server Action

**Files:**
- Modify: `src/actions/meal-plans.ts`

- [ ] **Step 1: Add toggleAlreadyHaveItem action**

```typescript
export async function toggleAlreadyHaveItem(
  mealPlanId: string,
  groceryName: string
): Promise<ActionResult>
```

Implementation:
- Authenticate user, get household context
- Verify meal plan ownership via `applyOwnershipFilter`
- Fetch current `already_have_items` array
- If `groceryName` (lowercased) is in array → remove it
- If not → add it
- Update meal plan row
- `revalidatePath("/plan")`

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/actions/meal-plans.ts
git commit -m "feat: add toggleAlreadyHaveItem server action"
```

### Task 14: Simplify Grocery List Generation

**Files:**
- Modify: `src/actions/grocery.ts`
- Delete: `src/lib/ai-grocery-consolidator.ts`

- [ ] **Step 1: Remove AI consolidator import and usage**

In `src/actions/grocery.ts`:
- Remove import of `aiConsolidateIngredients`
- Remove the AI consolidation try/catch block, rate limit check, and profile query
- Remove `regexConsolidate` helper

- [ ] **Step 2: Rewrite consolidation logic**

Replace the consolidation section in `generateGroceryList` with new logic. Do NOT reuse `consolidateIngredients` from `grocery-consolidator.ts` — the old consolidator's complex name normalization and unit conversion is no longer needed since AI already normalized the data. Write a simpler inline grouping:

1. Fetch ingredients for ALL meal plan items (do NOT deduplicate by recipe_id — each occurrence contributes its full quantities)
2. For each ingredient, use `grocery_name ?? name` as the display name and `(grocery_name ?? name).toLowerCase()` as the grouping key
3. Group by key — accumulate quantities (sum when units match, keep separate when they don't)
4. Use `grocery_category ?? category` for categorization
5. Fetch `meal_plan.already_have_items`
6. Filter out items whose lowercased name is in `already_have_items`
7. Clean up `already_have_items`: remove entries that don't match any ingredient in the current plan (prune stale entries), update the meal plan row
8. Group by category in standard order (produce → meat → dairy → bakery → frozen → pantry → beverages → other)

`grocery-consolidator.ts` is NOT deleted — it's still used as a fallback for old recipes without grocery_* data. But the primary path uses the simpler inline grouping above.

- [ ] **Step 3: Delete AI grocery consolidator**

```bash
rm src/lib/ai-grocery-consolidator.ts
```

Remove its import from `src/actions/grocery.ts`.

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/actions/grocery.ts
git rm src/lib/ai-grocery-consolidator.ts
git commit -m "feat: simplify grocery generation with pre-normalized data, remove AI consolidator"
```

### Task 15: Update Onboarding Config — Phase 3

**Files:**
- Modify: `src/lib/onboarding-config.ts`

- [ ] **Step 1: Update grocery page banner**

Update the `grocery` entry's banner description:
"Generated from your finalized meal plan — ingredients you marked as 'already have' are excluded. Quantities are combined across recipes."

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/lib/onboarding-config.ts
git commit -m "feat: update grocery onboarding banner for already-have exclusion"
```

### Task 16: End-to-End Verification

- [ ] **Step 1: Full flow test**

1. Create a new recipe → verify grocery_* columns populated
2. Import a recipe via URL → verify grocery_* columns populated
3. Add both to a meal plan
4. Expand a day in the accordion → see grocery items
5. Mark "Garlic" as already-have → verify it's checked in all recipes
6. Finalize the plan
7. Generate grocery list → verify Garlic is excluded, quantities are correct
8. Check grocery export API still works: `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/grocery/export`

- [ ] **Step 2: Fallback test**

1. Remove AI_API_KEY from .env.local
2. Create a recipe → should save with grocery_* as null
3. Generate grocery list → should work using raw ingredient fields

- [ ] **Step 3: Backfill test**

1. Call `POST /api/recipes/normalize-all`
2. Verify old recipes get grocery_* columns filled in
