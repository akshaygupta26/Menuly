import type { TasteProfile } from "./taste-profile";
import type { MealType, SuggestedRecipe } from "@/types/database";

export interface RecommendationContext {
  tasteProfile: TasteProfile;
  mealSlot: MealType;
  currentWeekMeals: {
    name: string;
    cuisine_type: string | null;
    protein_type: string | null;
  }[];
  weekNutritionSummary: {
    avg_calories: number | null;
    avg_protein_g: number | null;
    meals_planned: number;
  };
  existingRecipeNames: string[];
  count?: number;
}

export function buildRecommendationPrompt(ctx: RecommendationContext): {
  system: string;
  user: string;
} {
  const count = ctx.count ?? 3;

  const system = `You are a meal planning assistant for a home cook. You suggest new recipes that the user does NOT already have in their collection. Your suggestions should feel like what a knowledgeable friend who knows their taste would recommend.

Rules:
- Return ONLY a JSON object with a "recipes" key containing an array of recipe objects. No markdown, no explanation, no preamble.
- Each recipe must have: name (string), cuisine_type (string), protein_type (string), meal_type (array of strings from: "breakfast", "lunch", "dinner", "snack"), estimated_prep_minutes (number), estimated_cook_minutes (number), servings (number), why (1 sentence explaining why this fits), ingredients (array of strings like "2 cups flour"), instructions (array of step strings), estimated_nutrition (object with calories, protein_g, carbs_g, fat_g as numbers).
- Never suggest a recipe whose name matches or is very similar to any recipe in the user's existing collection.
- Respect the user's dietary pattern. If they are mostly vegetarian, suggest vegetarian recipes unless explicitly asked otherwise.
- Prioritize adequate protein (aim for 25-40g per main meal).
- Vary cuisines from what's already on this week's meal plan to promote diversity.
- Keep recipes practical for home cooking (under 60 min total time preferred).`;

  const weekMealsList =
    ctx.currentWeekMeals.length > 0
      ? ctx.currentWeekMeals
          .map(
            (m) =>
              `- ${m.name} (${m.cuisine_type ?? "unknown"} cuisine, ${m.protein_type ?? "unknown"} protein)`
          )
          .join("\n")
      : "No meals planned yet this week.";

  const nutritionLine = ctx.weekNutritionSummary.meals_planned > 0
    ? `Weekly nutrition average (${ctx.weekNutritionSummary.meals_planned} meals planned): ${ctx.weekNutritionSummary.avg_calories ?? "?"} kcal, ${ctx.weekNutritionSummary.avg_protein_g ?? "?"}g protein per meal`
    : "No nutrition data available for this week yet.";

  const existingNames = ctx.existingRecipeNames.slice(0, 50).join(", ");

  const dietaryPattern = ctx.tasteProfile.is_mostly_vegetarian
    ? `${ctx.tasteProfile.vegetarian_percentage}% vegetarian (please suggest vegetarian options)`
    : `${ctx.tasteProfile.vegetarian_percentage}% vegetarian`;

  const user = `Suggest ${count} recipes for ${ctx.mealSlot}.

My cooking profile:
- ${ctx.tasteProfile.total_recipes} recipes in my collection
- Top cuisines: ${ctx.tasteProfile.top_cuisines.join(", ") || "none yet"}
- Top proteins: ${ctx.tasteProfile.top_proteins.join(", ") || "none yet"}
- Dietary pattern: ${dietaryPattern}
- Favorite recipes: ${ctx.tasteProfile.favorite_recipes.join(", ") || "none marked"}${ctx.tasteProfile.avg_nutrition.calories != null ? `\n- Average nutrition per recipe: ${ctx.tasteProfile.avg_nutrition.calories} kcal, ${ctx.tasteProfile.avg_nutrition.protein_g}g protein, ${ctx.tasteProfile.avg_nutrition.carbs_g}g carbs, ${ctx.tasteProfile.avg_nutrition.fat_g}g fat` : ""}

This week's meal plan so far:
${weekMealsList}

${nutritionLine}

My existing recipe names (do NOT suggest these):
${existingNames || "none"}`;

  return { system, user };
}

export function parseRecommendationResponse(raw: string): SuggestedRecipe[] {
  let cleaned = raw.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }

  // Handle both { recipes: [...] } and direct array
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (
    typeof parsed === "object" &&
    parsed !== null &&
    "recipes" in parsed &&
    Array.isArray((parsed as Record<string, unknown>).recipes)
  ) {
    items = (parsed as Record<string, unknown>).recipes as unknown[];
  } else {
    throw new Error("AI response is not a valid recipe array");
  }

  const validMealTypes = ["breakfast", "lunch", "dinner", "snack"];

  const validated: SuggestedRecipe[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;

    if (
      typeof r.name !== "string" ||
      typeof r.cuisine_type !== "string" ||
      typeof r.protein_type !== "string" ||
      !Array.isArray(r.meal_type) ||
      !Array.isArray(r.ingredients) ||
      !Array.isArray(r.instructions)
    ) {
      continue;
    }

    const mealTypes = (r.meal_type as unknown[]).filter(
      (mt): mt is MealType =>
        typeof mt === "string" && validMealTypes.includes(mt)
    );
    if (mealTypes.length === 0) continue;

    const nutrition = r.estimated_nutrition as Record<string, unknown> | undefined;

    validated.push({
      name: r.name,
      cuisine_type: r.cuisine_type,
      protein_type: r.protein_type,
      meal_type: mealTypes,
      estimated_prep_minutes: Number(r.estimated_prep_minutes) || 15,
      estimated_cook_minutes: Number(r.estimated_cook_minutes) || 30,
      servings: Number(r.servings) || 4,
      why: typeof r.why === "string" ? r.why : "",
      ingredients: (r.ingredients as unknown[]).filter(
        (i): i is string => typeof i === "string"
      ),
      instructions: (r.instructions as unknown[]).filter(
        (i): i is string => typeof i === "string"
      ),
      estimated_nutrition: {
        calories: Number(nutrition?.calories) || 0,
        protein_g: Number(nutrition?.protein_g) || 0,
        carbs_g: Number(nutrition?.carbs_g) || 0,
        fat_g: Number(nutrition?.fat_g) || 0,
      },
    });
  }

  if (validated.length === 0) {
    throw new Error("No valid recipes in AI response");
  }

  return validated;
}
