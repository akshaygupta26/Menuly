"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  Recipe,
  RecipeIngredient,
  RecipeHistory,
  MealType,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecipeFilters {
  search?: string;
  cuisine_type?: string;
  protein_type?: string;
  meal_type?: MealType;
  is_favorite?: boolean;
  tags?: string[];
}

type RecipeInput = Omit<Recipe, "id" | "user_id" | "created_at" | "updated_at" | "last_made_date" | "times_made">;

type RecipeIngredientInput = Omit<RecipeIngredient, "id" | "recipe_id">;

interface CreateRecipeData {
  recipe: RecipeInput;
  ingredients: RecipeIngredientInput[];
}

interface UpdateRecipeData {
  recipe?: Partial<RecipeInput>;
  ingredients?: RecipeIngredientInput[];
}

type ActionResult<T = null> =
  | { data: T; error: null }
  | { data: null; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 1. getRecipes
// ---------------------------------------------------------------------------

export async function getRecipes(
  filters?: RecipeFilters
): Promise<ActionResult<Recipe[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  let query = supabase
    .from("recipes")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  if (filters?.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }

  if (filters?.cuisine_type) {
    query = query.eq("cuisine_type", filters.cuisine_type);
  }

  if (filters?.protein_type) {
    query = query.eq("protein_type", filters.protein_type);
  }

  if (filters?.meal_type) {
    query = query.contains("meal_type", [filters.meal_type]);
  }

  if (filters?.is_favorite !== undefined) {
    query = query.eq("is_favorite", filters.is_favorite);
  }

  if (filters?.tags && filters.tags.length > 0) {
    query = query.overlaps("tags", filters.tags);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Recipe[], error: null };
}

// ---------------------------------------------------------------------------
// 2. getRecipe
// ---------------------------------------------------------------------------

export async function getRecipe(
  id: string
): Promise<ActionResult<{ recipe: Recipe; ingredients: RecipeIngredient[] }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (recipeError) {
    return { data: null, error: recipeError.message };
  }

  const { data: ingredients, error: ingredientsError } = await supabase
    .from("recipe_ingredients")
    .select("*")
    .eq("recipe_id", id)
    .order("sort_order");

  if (ingredientsError) {
    return { data: null, error: ingredientsError.message };
  }

  return {
    data: {
      recipe: recipe as Recipe,
      ingredients: (ingredients ?? []) as RecipeIngredient[],
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 3. createRecipe
// ---------------------------------------------------------------------------

export async function createRecipe(
  data: CreateRecipeData
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Insert the recipe
  const { data: newRecipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      ...data.recipe,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (recipeError) {
    return { data: null, error: recipeError.message };
  }

  // Bulk insert ingredients
  if (data.ingredients.length > 0) {
    const ingredientRows = data.ingredients.map((ingredient) => ({
      ...ingredient,
      recipe_id: newRecipe.id,
    }));

    const { error: ingredientsError } = await supabase
      .from("recipe_ingredients")
      .insert(ingredientRows);

    if (ingredientsError) {
      // Clean up the recipe if ingredients fail to insert
      await supabase.from("recipes").delete().eq("id", newRecipe.id);
      return { data: null, error: ingredientsError.message };
    }
  }

  revalidatePath("/recipes");

  return { data: { id: newRecipe.id }, error: null };
}

// ---------------------------------------------------------------------------
// 4. updateRecipe
// ---------------------------------------------------------------------------

export async function updateRecipe(
  id: string,
  data: UpdateRecipeData
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: "Recipe not found" };
  }

  // Update recipe fields
  if (data.recipe) {
    const { error: updateError } = await supabase
      .from("recipes")
      .update(data.recipe)
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return { data: null, error: updateError.message };
    }
  }

  // Replace all ingredients
  if (data.ingredients) {
    // Delete existing ingredients
    const { error: deleteError } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", id);

    if (deleteError) {
      return { data: null, error: deleteError.message };
    }

    // Insert new ingredients
    if (data.ingredients.length > 0) {
      const ingredientRows = data.ingredients.map((ingredient) => ({
        ...ingredient,
        recipe_id: id,
      }));

      const { error: insertError } = await supabase
        .from("recipe_ingredients")
        .insert(ingredientRows);

      if (insertError) {
        return { data: null, error: insertError.message };
      }
    }
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 5. deleteRecipe
// ---------------------------------------------------------------------------

export async function deleteRecipe(id: string): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Fetch recipe name so we can preserve it in any meal plan items.
  // The FK is ON DELETE SET NULL, which would violate the check constraint
  // (recipe_id IS NOT NULL OR custom_name IS NOT NULL) if custom_name is NULL.
  const { data: recipe } = await supabase
    .from("recipes")
    .select("name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (recipe) {
    await supabase
      .from("meal_plan_items")
      .update({ custom_name: recipe.name })
      .eq("recipe_id", id)
      .is("custom_name", null);
  }

  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/recipes");
  revalidatePath("/plan");

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 6. toggleFavorite
// ---------------------------------------------------------------------------

export async function toggleFavorite(
  id: string
): Promise<ActionResult<{ is_favorite: boolean }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Get current value
  const { data: recipe, error: fetchError } = await supabase
    .from("recipes")
    .select("is_favorite")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !recipe) {
    return { data: null, error: "Recipe not found" };
  }

  const newValue = !recipe.is_favorite;

  const { error: updateError } = await supabase
    .from("recipes")
    .update({ is_favorite: newValue })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);

  return { data: { is_favorite: newValue }, error: null };
}

// ---------------------------------------------------------------------------
// 7. markAsMade
// ---------------------------------------------------------------------------

export async function markAsMade(
  recipeId: string,
  rating?: number,
  notes?: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Verify ownership
  const { data: recipe, error: fetchError } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !recipe) {
    return { data: null, error: "Recipe not found" };
  }

  const { error } = await supabase.from("recipe_history").insert({
    recipe_id: recipeId,
    user_id: user.id,
    made_date: new Date().toISOString(),
    rating: rating ?? null,
    notes: notes ?? null,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 8. getRecipeHistory
// ---------------------------------------------------------------------------

export async function getRecipeHistory(
  recipeId: string
): Promise<ActionResult<RecipeHistory[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("recipe_history")
    .select("*")
    .eq("recipe_id", recipeId)
    .eq("user_id", user.id)
    .order("made_date", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data ?? []) as RecipeHistory[], error: null };
}
