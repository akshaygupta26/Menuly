import type { NutritionInfo, IngredientNutritionDetail } from "@/types/database";
import { convertToGrams } from "@/lib/unit-conversion";

// Re-export for backward compatibility
export { convertToGrams } from "@/lib/unit-conversion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface USDANutrient {
  nutrientId: number;
  value: number;
}

interface USDAFood {
  description: string;
  foodNutrients: USDANutrient[];
}

interface USDASearchResponse {
  foods: USDAFood[];
}

export interface IngredientInput {
  name: string;
  quantity: number | null;
  unit: string | null;
}

// ---------------------------------------------------------------------------
// USDA FoodData Central API
// ---------------------------------------------------------------------------

// Nutrient IDs in FoodData Central
const NUTRIENT_ENERGY = [208, 957, 958]; // kcal (208 is standard, 957/958 are alternates)
const NUTRIENT_PROTEIN = 203;
const NUTRIENT_CARBS = 205;
const NUTRIENT_FAT = 204;

// Module-level cache for USDA lookups (resets on redeploy)
const usdaCache = new Map<string, NutritionInfo>();

function normalizeKey(query: string): string {
  return query.toLowerCase().trim();
}

/**
 * Search the USDA FoodData Central database for a food item.
 * Returns per-100g nutrient values, or null if not found.
 * Results are cached in-memory to avoid redundant API calls.
 */
export async function searchUSDAFood(
  query: string
): Promise<NutritionInfo | null> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.warn("USDA_API_KEY not set — skipping USDA lookup");
    return null;
  }

  const cacheKey = normalizeKey(query);
  const cached = usdaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch(
    "https://api.nal.usda.gov/fdc/v1/foods/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        dataType: ["SR Legacy"],
        pageSize: 1,
        api_key: apiKey,
      }),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!response.ok) {
    return null;
  }

  const data: USDASearchResponse = await response.json();

  if (!data.foods || data.foods.length === 0) {
    return null;
  }

  const food = data.foods[0];
  const nutrients = food.foodNutrients;

  const getNutrient = (ids: number | number[]): number | null => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    for (const id of idArray) {
      const found = nutrients.find((n) => n.nutrientId === id);
      if (found && found.value > 0) return found.value;
    }
    return null;
  };

  const result: NutritionInfo = {
    calories: getNutrient(NUTRIENT_ENERGY),
    protein_g: getNutrient(NUTRIENT_PROTEIN),
    carbs_g: getNutrient(NUTRIENT_CARBS),
    fat_g: getNutrient(NUTRIENT_FAT),
  };

  usdaCache.set(cacheKey, result);

  return result;
}

// ---------------------------------------------------------------------------
// Batch nutrition calculation
// ---------------------------------------------------------------------------

/**
 * Calculate total nutrition for a list of ingredients, divided by servings.
 * Uses USDA FoodData Central to look up each ingredient.
 *
 * Processes ingredients in batches of 5 to respect the USDA rate limit
 * (~1000 requests/hour).
 */
export async function calculateNutritionForIngredients(
  ingredients: IngredientInput[],
  servings: number
): Promise<NutritionInfo> {
  const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  let hasAnyData = false;

  const BATCH_SIZE = 5;

  for (let i = 0; i < ingredients.length; i += BATCH_SIZE) {
    const batch = ingredients.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (ing) => {
        const per100g = await searchUSDAFood(ing.name);
        if (!per100g) return null;

        const grams = convertToGrams(ing.quantity, ing.unit);
        const scale = grams / 100;

        return {
          calories: (per100g.calories ?? 0) * scale,
          protein_g: (per100g.protein_g ?? 0) * scale,
          carbs_g: (per100g.carbs_g ?? 0) * scale,
          fat_g: (per100g.fat_g ?? 0) * scale,
        };
      })
    );

    for (const result of results) {
      if (result) {
        hasAnyData = true;
        totals.calories += result.calories;
        totals.protein_g += result.protein_g;
        totals.carbs_g += result.carbs_g;
        totals.fat_g += result.fat_g;
      }
    }
  }

  if (!hasAnyData) {
    return {
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    };
  }

  const divisor = Math.max(servings, 1);

  return {
    calories: Math.round(totals.calories / divisor),
    protein_g: Math.round(totals.protein_g / divisor),
    carbs_g: Math.round(totals.carbs_g / divisor),
    fat_g: Math.round(totals.fat_g / divisor),
  };
}

// ---------------------------------------------------------------------------
// Batch nutrition calculation with per-ingredient breakdown
// ---------------------------------------------------------------------------

interface NutritionWithBreakdown {
  totals: NutritionInfo;
  ingredients: IngredientNutritionDetail[];
}

/**
 * Same as calculateNutritionForIngredients but also returns per-ingredient
 * per-100g values so the client can recalculate when quantities change.
 */
export async function calculateNutritionWithBreakdown(
  ingredients: IngredientInput[],
  servings: number
): Promise<NutritionWithBreakdown> {
  const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const details: IngredientNutritionDetail[] = [];
  let hasAnyData = false;

  const BATCH_SIZE = 5;

  for (let i = 0; i < ingredients.length; i += BATCH_SIZE) {
    const batch = ingredients.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (ing) => {
        const per100g = await searchUSDAFood(ing.name);
        if (!per100g) return null;

        const grams = convertToGrams(ing.quantity, ing.unit);
        const scale = grams / 100;

        const scaled: NutritionInfo = {
          calories: Math.round((per100g.calories ?? 0) * scale),
          protein_g: Math.round((per100g.protein_g ?? 0) * scale),
          carbs_g: Math.round((per100g.carbs_g ?? 0) * scale),
          fat_g: Math.round((per100g.fat_g ?? 0) * scale),
        };

        return { name: ing.name, per100g, scaled };
      })
    );

    for (const result of results) {
      if (result) {
        hasAnyData = true;
        details.push(result);
        totals.calories += result.scaled.calories ?? 0;
        totals.protein_g += result.scaled.protein_g ?? 0;
        totals.carbs_g += result.scaled.carbs_g ?? 0;
        totals.fat_g += result.scaled.fat_g ?? 0;
      }
    }
  }

  if (!hasAnyData) {
    return {
      totals: {
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
      },
      ingredients: [],
    };
  }

  const divisor = Math.max(servings, 1);

  return {
    totals: {
      calories: Math.round(totals.calories / divisor),
      protein_g: Math.round(totals.protein_g / divisor),
      carbs_g: Math.round(totals.carbs_g / divisor),
      fat_g: Math.round(totals.fat_g / divisor),
    },
    ingredients: details,
  };
}
