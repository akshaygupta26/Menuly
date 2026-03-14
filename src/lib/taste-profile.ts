import type { Recipe, MealType } from "@/types/database";

export interface TasteProfile {
  total_recipes: number;
  cuisine_distribution: Record<string, number>;
  protein_distribution: Record<string, number>;
  is_mostly_vegetarian: boolean;
  vegetarian_percentage: number;
  avg_nutrition: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
  favorite_recipes: string[];
  top_cuisines: string[];
  top_proteins: string[];
  meal_type_distribution: Record<MealType, number>;
}

const VEGETARIAN_PROTEINS = [
  "tofu",
  "beans",
  "none/vegetarian",
  "eggs",
  "lentils",
  "chickpeas",
  "paneer",
  "",
];

function topN(dist: Record<string, number>, n: number): string[] {
  return Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function buildTasteProfile(
  recipes: Recipe[],
): TasteProfile {
  if (recipes.length === 0) {
    return {
      total_recipes: 0,
      cuisine_distribution: {},
      protein_distribution: {},
      is_mostly_vegetarian: false,
      vegetarian_percentage: 0,
      avg_nutrition: {
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
      },
      favorite_recipes: [],
      top_cuisines: [],
      top_proteins: [],
      meal_type_distribution: {
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        snack: 0,
      },
    };
  }

  // Cuisine distribution
  const cuisine_distribution: Record<string, number> = {};
  for (const r of recipes) {
    if (r.cuisine_type) {
      const key = r.cuisine_type.trim();
      cuisine_distribution[key] = (cuisine_distribution[key] ?? 0) + 1;
    }
  }

  // Protein distribution
  const protein_distribution: Record<string, number> = {};
  for (const r of recipes) {
    if (r.protein_type) {
      const key = r.protein_type.trim();
      protein_distribution[key] = (protein_distribution[key] ?? 0) + 1;
    }
  }

  // Vegetarian detection
  let vegCount = 0;
  for (const r of recipes) {
    const pt = (r.protein_type ?? "").trim().toLowerCase();
    if (VEGETARIAN_PROTEINS.includes(pt)) {
      vegCount++;
    }
  }
  const vegetarian_percentage = Math.round((vegCount / recipes.length) * 100);

  // Average nutrition
  const withCalories = recipes.filter((r) => r.calories != null);
  const withProtein = recipes.filter((r) => r.protein_g != null);
  const withCarbs = recipes.filter((r) => r.carbs_g != null);
  const withFat = recipes.filter((r) => r.fat_g != null);

  const avg_nutrition = {
    calories: withCalories.length
      ? Math.round(
          withCalories.reduce((s, r) => s + r.calories!, 0) /
            withCalories.length
        )
      : null,
    protein_g: withProtein.length
      ? Math.round(
          withProtein.reduce((s, r) => s + r.protein_g!, 0) /
            withProtein.length
        )
      : null,
    carbs_g: withCarbs.length
      ? Math.round(
          withCarbs.reduce((s, r) => s + r.carbs_g!, 0) / withCarbs.length
        )
      : null,
    fat_g: withFat.length
      ? Math.round(
          withFat.reduce((s, r) => s + r.fat_g!, 0) / withFat.length
        )
      : null,
  };

  // Favorites
  const favorite_recipes = recipes
    .filter((r) => r.is_favorite)
    .slice(0, 10)
    .map((r) => r.name);

  // Meal type distribution
  const meal_type_distribution: Record<MealType, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  };
  for (const r of recipes) {
    for (const mt of r.meal_type) {
      meal_type_distribution[mt] = (meal_type_distribution[mt] ?? 0) + 1;
    }
  }

  return {
    total_recipes: recipes.length,
    cuisine_distribution,
    protein_distribution,
    is_mostly_vegetarian: vegetarian_percentage > 50,
    vegetarian_percentage,
    avg_nutrition,
    favorite_recipes,
    top_cuisines: topN(cuisine_distribution, 3),
    top_proteins: topN(protein_distribution, 3),
    meal_type_distribution,
  };
}
