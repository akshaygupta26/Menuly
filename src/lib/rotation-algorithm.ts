import type { Recipe, MealType, MealPlanItem } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MealPlanSlot {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  mealSlot: MealType;
}

export interface ScoredRecipe {
  recipe: Recipe;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  recency: number;
  cuisineDiversity: number;
  proteinDiversity: number;
  favoriteBonus: number;
  jitter: number;
}

/** Output representing a filled meal plan slot. */
export interface MealPlanAssignment {
  day_of_week: number;
  meal_slot: MealType;
  recipe_id: string;
  recipe: Recipe;
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECENCY_SCORE = 40;
const MAX_CUISINE_SCORE = 25;
const MAX_PROTEIN_SCORE = 25;
const MAX_FAVORITE_SCORE = 5;
const MAX_JITTER_SCORE = 5;

/** Number of days after which a recipe reaches max recency score. */
const RECENCY_FULL_CYCLE_DAYS = 28;

/** Penalty per same-cuisine occurrence already placed this week. */
const CUISINE_PENALTY_PER_OCCURRENCE = 15;

/** Penalty per same-protein occurrence already placed this week. */
const PROTEIN_PENALTY_PER_OCCURRENCE = 15;

/** Slot fill priority order: dinners first, then lunches, breakfasts, snacks. */
const SLOT_PRIORITY: MealType[] = ["dinner", "lunch", "breakfast", "snack"];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Compute the recency score for a recipe.
 * - Never made: full points (40)
 * - Otherwise: proportional to days since last made, capped at 40
 */
function scoreRecency(recipe: Recipe): number {
  if (!recipe.last_made_date) {
    return MAX_RECENCY_SCORE;
  }

  const lastMade = new Date(recipe.last_made_date);
  const now = new Date();
  const daysSince = Math.max(
    0,
    Math.floor((now.getTime() - lastMade.getTime()) / (1000 * 60 * 60 * 24))
  );

  return Math.min(MAX_RECENCY_SCORE, (daysSince / RECENCY_FULL_CYCLE_DAYS) * MAX_RECENCY_SCORE);
}

/**
 * Compute cuisine diversity score based on how many times the same cuisine
 * has already been assigned this week.
 */
function scoreCuisineDiversity(
  recipe: Recipe,
  cuisineCounts: Map<string, number>
): number {
  if (!recipe.cuisine_type) return MAX_CUISINE_SCORE;

  const key = recipe.cuisine_type.toLowerCase().trim();
  const count = cuisineCounts.get(key) ?? 0;
  return Math.max(0, MAX_CUISINE_SCORE - count * CUISINE_PENALTY_PER_OCCURRENCE);
}

/**
 * Compute protein diversity score based on how many times the same protein
 * has already been assigned this week.
 */
function scoreProteinDiversity(
  recipe: Recipe,
  proteinCounts: Map<string, number>
): number {
  if (!recipe.protein_type) return MAX_PROTEIN_SCORE;

  const key = recipe.protein_type.toLowerCase().trim();
  const count = proteinCounts.get(key) ?? 0;
  return Math.max(0, MAX_PROTEIN_SCORE - count * PROTEIN_PENALTY_PER_OCCURRENCE);
}

/**
 * Bonus for favorite recipes.
 */
function scoreFavorite(recipe: Recipe): number {
  return recipe.is_favorite ? MAX_FAVORITE_SCORE : 0;
}

/**
 * Small random jitter to break ties and add variety.
 */
function scoreJitter(): number {
  return Math.random() * MAX_JITTER_SCORE;
}

/**
 * Score a single recipe given the current state of the weekly plan.
 */
function scoreRecipe(
  recipe: Recipe,
  cuisineCounts: Map<string, number>,
  proteinCounts: Map<string, number>
): ScoredRecipe {
  const recency = scoreRecency(recipe);
  const cuisineDiversity = scoreCuisineDiversity(recipe, cuisineCounts);
  const proteinDiversity = scoreProteinDiversity(recipe, proteinCounts);
  const favoriteBonus = scoreFavorite(recipe);
  const jitter = scoreJitter();

  return {
    recipe,
    score: recency + cuisineDiversity + proteinDiversity + favoriteBonus + jitter,
    breakdown: {
      recency,
      cuisineDiversity,
      proteinDiversity,
      favoriteBonus,
      jitter,
    },
  };
}

// ---------------------------------------------------------------------------
// Tracking helpers
// ---------------------------------------------------------------------------

function incrementCount(map: Map<string, number>, key: string | null): void {
  if (!key) return;
  const normalized = key.toLowerCase().trim();
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

/**
 * Build cuisine/protein count maps from existing meal plan items.
 */
function buildCountsFromExisting(
  existingItems: MealPlanItem[],
  recipes: Recipe[]
): { cuisineCounts: Map<string, number>; proteinCounts: Map<string, number>; usedRecipeIds: Set<string> } {
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const cuisineCounts = new Map<string, number>();
  const proteinCounts = new Map<string, number>();
  const usedRecipeIds = new Set<string>();

  for (const item of existingItems) {
    if (!item.recipe_id) continue;
    usedRecipeIds.add(item.recipe_id);

    const recipe = recipeMap.get(item.recipe_id);
    if (!recipe) continue;

    incrementCount(cuisineCounts, recipe.cuisine_type);
    incrementCount(proteinCounts, recipe.protein_type);
  }

  return { cuisineCounts, proteinCounts, usedRecipeIds };
}

// ---------------------------------------------------------------------------
// Slot generation
// ---------------------------------------------------------------------------

/**
 * Generate meal plan slots for a full week (7 days) given the desired
 * meal types per day.
 */
function generateSlots(mealSlots: MealType[]): MealPlanSlot[] {
  const slots: MealPlanSlot[] = [];
  for (let day = 0; day < 7; day++) {
    for (const slot of mealSlots) {
      slots.push({ dayOfWeek: day, mealSlot: slot });
    }
  }
  return slots;
}

/**
 * Sort slots by fill priority: dinners first across all days, then lunches, etc.
 */
function sortSlotsByPriority(slots: MealPlanSlot[]): MealPlanSlot[] {
  return [...slots].sort((a, b) => {
    const aPriority = SLOT_PRIORITY.indexOf(a.mealSlot);
    const bPriority = SLOT_PRIORITY.indexOf(b.mealSlot);
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.dayOfWeek - b.dayOfWeek;
  });
}

// ---------------------------------------------------------------------------
// Candidate filtering
// ---------------------------------------------------------------------------

/**
 * Get recipes eligible for a given meal slot type.
 * A recipe matches if its meal_type array includes the slot type.
 * If no recipes match, fall back to all recipes (better than an empty slot).
 */
function getCandidates(recipes: Recipe[], mealSlot: MealType): Recipe[] {
  const matching = recipes.filter((r) => r.meal_type.includes(mealSlot));
  return matching.length > 0 ? matching : recipes;
}

// ---------------------------------------------------------------------------
// Main algorithm
// ---------------------------------------------------------------------------

/**
 * Generate a meal plan by greedily assigning recipes to slots using a
 * multi-factor scoring algorithm that promotes variety.
 *
 * Scoring factors (0-100 total):
 * - **Recency** (0-40): Recipes not made recently score higher. Never-made recipes get full points.
 * - **Cuisine diversity** (0-25): Penalises repeating the same cuisine within the week.
 * - **Protein diversity** (0-25): Penalises repeating the same protein within the week.
 * - **Favorite bonus** (0-5): Small boost for recipes marked as favorites.
 * - **Jitter** (0-5): Random noise to break ties and add variety between runs.
 *
 * Slots are filled greedily in priority order (dinner > lunch > breakfast > snack).
 * After each pick the cuisine/protein counts are updated so subsequent scoring
 * reflects the current plan state.
 *
 * @param recipes       - Pool of available recipes.
 * @param mealSlots     - Meal types to plan for each day (e.g. ["breakfast", "lunch", "dinner"]).
 * @param existingItems - Optional pre-filled slots (e.g. user locked in a recipe). Their cuisine/protein
 *                        counts are considered during scoring.
 * @returns Array of meal plan assignments sorted by day then slot priority.
 *
 * @example
 * ```ts
 * const plan = generateMealPlan(
 *   recipes,
 *   ["breakfast", "lunch", "dinner"],
 * );
 * // Returns 21 assignments (3 meals x 7 days) with diverse recipes.
 * ```
 */
export function generateMealPlan(
  recipes: Recipe[],
  mealSlots: MealType[],
  existingItems?: MealPlanItem[]
): MealPlanAssignment[] {
  if (recipes.length === 0 || mealSlots.length === 0) {
    return [];
  }

  // Build initial counts from any existing (locked) items
  const {
    cuisineCounts,
    proteinCounts,
    usedRecipeIds,
  } = buildCountsFromExisting(existingItems ?? [], recipes);

  // Generate and prioritise slots
  const allSlots = generateSlots(mealSlots);

  // Filter out slots that already have an existing item
  const existingSlotKeys = new Set(
    (existingItems ?? []).map((item) => `${item.day_of_week}-${item.meal_slot}`)
  );
  const openSlots = allSlots.filter(
    (s) => !existingSlotKeys.has(`${s.dayOfWeek}-${s.mealSlot}`)
  );

  const prioritisedSlots = sortSlotsByPriority(openSlots);

  // Track which recipes we've already assigned this week to avoid back-to-back
  // repeats when the recipe pool is large enough.
  const assignedThisWeek = new Set<string>(usedRecipeIds);

  const assignments: MealPlanAssignment[] = [];

  for (const slot of prioritisedSlots) {
    const candidates = getCandidates(recipes, slot.mealSlot);

    if (candidates.length === 0) continue;

    // Score all candidates
    const scored = candidates.map((r) =>
      scoreRecipe(r, cuisineCounts, proteinCounts)
    );

    // If the pool is large enough, prefer recipes not yet used this week
    let pool = scored;
    if (assignedThisWeek.size < recipes.length) {
      const unused = scored.filter((s) => !assignedThisWeek.has(s.recipe.id));
      if (unused.length > 0) {
        pool = unused;
      }
    }

    // Pick the highest-scoring recipe
    pool.sort((a, b) => b.score - a.score);
    const pick = pool[0];

    // Record the assignment
    assignments.push({
      day_of_week: slot.dayOfWeek,
      meal_slot: slot.mealSlot,
      recipe_id: pick.recipe.id,
      recipe: pick.recipe,
      score: pick.score,
    });

    // Update state for subsequent scoring
    assignedThisWeek.add(pick.recipe.id);
    incrementCount(cuisineCounts, pick.recipe.cuisine_type);
    incrementCount(proteinCounts, pick.recipe.protein_type);
  }

  // Sort final output by day, then by slot priority
  assignments.sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return SLOT_PRIORITY.indexOf(a.meal_slot) - SLOT_PRIORITY.indexOf(b.meal_slot);
  });

  return assignments;
}

/**
 * Score a single recipe against the current plan state without mutating
 * anything. Useful for UI previews showing why a recipe was recommended.
 */
export function previewScore(
  recipe: Recipe,
  currentPlanRecipes: Recipe[]
): ScoredRecipe {
  const cuisineCounts = new Map<string, number>();
  const proteinCounts = new Map<string, number>();

  for (const r of currentPlanRecipes) {
    incrementCount(cuisineCounts, r.cuisine_type);
    incrementCount(proteinCounts, r.protein_type);
  }

  return scoreRecipe(recipe, cuisineCounts, proteinCounts);
}
