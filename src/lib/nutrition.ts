import type { NutritionInfo } from "@/types/database";

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

interface IngredientInput {
  name: string;
  quantity: number | null;
  unit: string | null;
}

// ---------------------------------------------------------------------------
// Unit → grams conversion
// ---------------------------------------------------------------------------

const UNIT_TO_GRAMS: Record<string, number> = {
  // Volume (approximate for water-density ingredients)
  cup: 240,
  cups: 240,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  "fl oz": 30,
  "fluid ounce": 30,
  "fluid ounces": 30,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  // Weight
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
};

/**
 * Convert a quantity + unit to grams. Falls back to treating quantity as
 * "count" with an assumed 100g per item when the unit is unknown.
 */
export function convertToGrams(
  quantity: number | null,
  unit: string | null
): number {
  const qty = quantity ?? 1;

  if (!unit) {
    // No unit = assume "1 item ≈ 100g" as a rough default
    return qty * 100;
  }

  const normalised = unit.toLowerCase().trim();
  const factor = UNIT_TO_GRAMS[normalised];

  if (factor !== undefined) {
    return qty * factor;
  }

  // Unknown unit — treat as count × 100g
  return qty * 100;
}

// ---------------------------------------------------------------------------
// USDA FoodData Central API
// ---------------------------------------------------------------------------

// Nutrient IDs in FoodData Central
const NUTRIENT_ENERGY = [208, 957, 958]; // kcal (208 is standard, 957/958 are alternates)
const NUTRIENT_PROTEIN = 203;
const NUTRIENT_CARBS = 205;
const NUTRIENT_FAT = 204;

/**
 * Search the USDA FoodData Central database for a food item.
 * Returns per-100g nutrient values, or null if not found.
 */
export async function searchUSDAFood(
  query: string
): Promise<NutritionInfo | null> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.warn("USDA_API_KEY not set — skipping USDA lookup");
    return null;
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

  return {
    calories: getNutrient(NUTRIENT_ENERGY),
    protein_g: getNutrient(NUTRIENT_PROTEIN),
    carbs_g: getNutrient(NUTRIENT_CARBS),
    fat_g: getNutrient(NUTRIENT_FAT),
  };
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
