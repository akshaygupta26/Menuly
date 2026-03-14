"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getHouseholdContext,
} from "@/lib/household-context";
import { parseIngredient } from "@/lib/ingredient-parser";
import type { SuggestedRecipe, MealType } from "@/types/database";

type ActionResult<T = null> =
  | { data: T; error: null }
  | { data: null; error: string };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null };
  }

  return { supabase, user };
}

export async function acceptSuggestion(
  suggestion: SuggestedRecipe,
  mealPlanId?: string,
  dayOfWeek?: number,
  mealSlot?: MealType
): Promise<ActionResult<{ recipeId: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  // 1. Insert the recipe
  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      household_id: ctx.householdId,
      name: suggestion.name,
      cuisine_type: suggestion.cuisine_type,
      protein_type: suggestion.protein_type,
      meal_type: suggestion.meal_type,
      prep_time: suggestion.estimated_prep_minutes,
      cook_time: suggestion.estimated_cook_minutes,
      servings: suggestion.servings,
      instructions: suggestion.instructions,
      tags: ["ai-suggested"],
      calories: suggestion.estimated_nutrition.calories,
      protein_g: suggestion.estimated_nutrition.protein_g,
      carbs_g: suggestion.estimated_nutrition.carbs_g,
      fat_g: suggestion.estimated_nutrition.fat_g,
      nutrition_source: "manual" as const,
    })
    .select("id")
    .single();

  if (recipeError || !recipe) {
    return {
      data: null,
      error: recipeError?.message ?? "Failed to create recipe",
    };
  }

  // 2. Parse and insert ingredients
  const ingredientRows = suggestion.ingredients.map((raw, i) => {
    const parsed = parseIngredient(raw);
    return {
      recipe_id: recipe.id,
      name: parsed.name,
      quantity: parsed.quantity,
      unit: parsed.unit,
      category: parsed.category,
      raw_text: raw,
      sort_order: i,
      is_optional: false,
    };
  });

  const { error: ingredientError } = await supabase
    .from("recipe_ingredients")
    .insert(ingredientRows);

  if (ingredientError) {
    // Clean up the recipe if ingredients fail
    await supabase.from("recipes").delete().eq("id", recipe.id);
    return { data: null, error: "Failed to save ingredients" };
  }

  // 3. Optionally add to meal plan
  if (mealPlanId && dayOfWeek !== undefined && mealSlot) {
    const { error: planError } = await supabase
      .from("meal_plan_items")
      .insert({
        meal_plan_id: mealPlanId,
        day_of_week: dayOfWeek,
        meal_slot: mealSlot,
        recipe_id: recipe.id,
      });

    if (planError) {
      console.error("Failed to add to meal plan:", planError);
      // Non-fatal — recipe was still created
    }
  }

  revalidatePath("/plan", "layout");
  revalidatePath("/recipes");

  return { data: { recipeId: recipe.id }, error: null };
}
