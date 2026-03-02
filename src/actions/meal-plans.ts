"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  MealPlan,
  MealPlanItem,
  MealPlanItemWithRecipe,
  MealType,
  Recipe,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionResult<T = null> =
  | { data: T; error: null }
  | { data: null; error: string };

interface MealPlanWithItems extends MealPlan {
  items: MealPlanItemWithRecipe[];
}

interface PickerRecipe {
  id: string;
  name: string;
  cuisine_type: string | null;
  protein_type: string | null;
  meal_type: MealType[];
  is_favorite: boolean;
  last_made_date: string | null;
  times_made: number;
}

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
// 1. getMealPlan
// ---------------------------------------------------------------------------

/**
 * Get the meal plan for a specific week. If none exists, one is created.
 * `weekStart` must be a Monday in YYYY-MM-DD format.
 */
export async function getMealPlan(
  weekStart: string
): Promise<ActionResult<MealPlanWithItems>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Try to find an existing meal plan for this week
  let { data: mealPlan, error: fetchError } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    // PGRST116 = "no rows returned" — that's OK, we'll create one
    return { data: null, error: fetchError.message };
  }

  // Create the meal plan if it doesn't exist
  if (!mealPlan) {
    const { data: newPlan, error: createError } = await supabase
      .from("meal_plans")
      .insert({
        user_id: user.id,
        week_start: weekStart,
        status: "draft",
      })
      .select("*")
      .single();

    if (createError) {
      return { data: null, error: createError.message };
    }

    mealPlan = newPlan;
  }

  // Fetch items with joined recipes
  const { data: items, error: itemsError } = await supabase
    .from("meal_plan_items")
    .select("*, recipe:recipes(*)")
    .eq("meal_plan_id", mealPlan.id)
    .order("day_of_week")
    .order("meal_slot");

  if (itemsError) {
    return { data: null, error: itemsError.message };
  }

  return {
    data: {
      ...(mealPlan as MealPlan),
      items: (items ?? []) as MealPlanItemWithRecipe[],
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 2. addMealPlanItem
// ---------------------------------------------------------------------------

/**
 * Add an item to a meal plan slot. Either `recipeId` or `customName` must be
 * provided.
 */
export async function addMealPlanItem(
  mealPlanId: string,
  dayOfWeek: number,
  mealSlot: MealType,
  recipeId?: string,
  customName?: string
): Promise<ActionResult<MealPlanItem>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Verify the meal plan belongs to this user
  const { data: plan, error: planError } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("id", mealPlanId)
    .eq("user_id", user.id)
    .single();

  if (planError || !plan) {
    return { data: null, error: "Meal plan not found" };
  }

  const { data: item, error: insertError } = await supabase
    .from("meal_plan_items")
    .insert({
      meal_plan_id: mealPlanId,
      day_of_week: dayOfWeek,
      meal_slot: mealSlot,
      recipe_id: recipeId ?? null,
      custom_name: customName ?? null,
    })
    .select("*")
    .single();

  if (insertError) {
    return { data: null, error: insertError.message };
  }

  revalidatePath("/meal-plan");

  return { data: item as MealPlanItem, error: null };
}

// ---------------------------------------------------------------------------
// 3. updateMealPlanItem
// ---------------------------------------------------------------------------

/**
 * Update an existing meal plan item's recipe or custom name.
 */
export async function updateMealPlanItem(
  itemId: string,
  recipeId?: string,
  customName?: string
): Promise<ActionResult<MealPlanItem>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Verify ownership via the meal plan
  const { data: existing, error: fetchError } = await supabase
    .from("meal_plan_items")
    .select("*, meal_plan:meal_plans!inner(user_id)")
    .eq("id", itemId)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: "Meal plan item not found" };
  }

  if ((existing as any).meal_plan?.user_id !== user.id) {
    return { data: null, error: "Meal plan item not found" };
  }

  const updateData: Record<string, unknown> = {};
  if (recipeId !== undefined) {
    updateData.recipe_id = recipeId;
    updateData.custom_name = null; // clear custom name when setting a recipe
  }
  if (customName !== undefined) {
    updateData.custom_name = customName;
    updateData.recipe_id = null; // clear recipe when setting a custom name
  }

  const { data: updated, error: updateError } = await supabase
    .from("meal_plan_items")
    .update(updateData)
    .eq("id", itemId)
    .select("*")
    .single();

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  revalidatePath("/meal-plan");

  return { data: updated as MealPlanItem, error: null };
}

// ---------------------------------------------------------------------------
// 4. removeMealPlanItem
// ---------------------------------------------------------------------------

/**
 * Remove an item from the meal plan.
 */
export async function removeMealPlanItem(
  itemId: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Verify ownership via the meal plan
  const { data: existing, error: fetchError } = await supabase
    .from("meal_plan_items")
    .select("*, meal_plan:meal_plans!inner(user_id)")
    .eq("id", itemId)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: "Meal plan item not found" };
  }

  if ((existing as any).meal_plan?.user_id !== user.id) {
    return { data: null, error: "Meal plan item not found" };
  }

  const { error: deleteError } = await supabase
    .from("meal_plan_items")
    .delete()
    .eq("id", itemId);

  if (deleteError) {
    return { data: null, error: deleteError.message };
  }

  revalidatePath("/meal-plan");

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 5. finalizeMealPlan
// ---------------------------------------------------------------------------

/**
 * Set the meal plan status to 'finalized' and insert a recipe_history entry
 * for each recipe in the plan. The DB trigger will update last_made_date and
 * times_made on each recipe.
 */
export async function finalizeMealPlan(
  mealPlanId: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Verify ownership and current status
  const { data: plan, error: planError } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("id", mealPlanId)
    .eq("user_id", user.id)
    .single();

  if (planError || !plan) {
    return { data: null, error: "Meal plan not found" };
  }

  if (plan.status === "finalized") {
    return { data: null, error: "Meal plan is already finalized" };
  }

  // Get all items with recipes
  const { data: items, error: itemsError } = await supabase
    .from("meal_plan_items")
    .select("recipe_id")
    .eq("meal_plan_id", mealPlanId)
    .not("recipe_id", "is", null);

  if (itemsError) {
    return { data: null, error: itemsError.message };
  }

  // Deduplicate recipe IDs — a recipe might appear multiple times in a week
  const recipeIds = [...new Set((items ?? []).map((i) => i.recipe_id as string))];

  // Insert history entries for each unique recipe
  if (recipeIds.length > 0) {
    const historyRows = recipeIds.map((recipeId) => ({
      recipe_id: recipeId,
      user_id: user.id,
      made_date: plan.week_start,
    }));

    const { error: historyError } = await supabase
      .from("recipe_history")
      .insert(historyRows);

    if (historyError) {
      return { data: null, error: historyError.message };
    }
  }

  // Update the meal plan status
  const { error: updateError } = await supabase
    .from("meal_plans")
    .update({ status: "finalized" })
    .eq("id", mealPlanId)
    .eq("user_id", user.id);

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  revalidatePath("/meal-plan");
  revalidatePath("/recipes");

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 6. unfinalizeMealPlan
// ---------------------------------------------------------------------------

/**
 * Set the meal plan status back to 'draft'. Does NOT undo recipe_history
 * entries — those are permanent records.
 */
export async function unfinalizeMealPlan(
  mealPlanId: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const { data: plan, error: planError } = await supabase
    .from("meal_plans")
    .select("id, status")
    .eq("id", mealPlanId)
    .eq("user_id", user.id)
    .single();

  if (planError || !plan) {
    return { data: null, error: "Meal plan not found" };
  }

  if (plan.status === "draft") {
    return { data: null, error: "Meal plan is already a draft" };
  }

  const { error: updateError } = await supabase
    .from("meal_plans")
    .update({ status: "draft" })
    .eq("id", mealPlanId)
    .eq("user_id", user.id);

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  revalidatePath("/meal-plan");

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 7. clearAllMealPlanItems
// ---------------------------------------------------------------------------

/**
 * Remove all items from a meal plan (bulk clear).
 */
export async function clearAllMealPlanItems(
  mealPlanId: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Verify ownership
  const { data: plan, error: planError } = await supabase
    .from("meal_plans")
    .select("id, status")
    .eq("id", mealPlanId)
    .eq("user_id", user.id)
    .single();

  if (planError || !plan) {
    return { data: null, error: "Meal plan not found" };
  }

  if (plan.status === "finalized") {
    return { data: null, error: "Cannot clear a finalized meal plan" };
  }

  const { error: deleteError } = await supabase
    .from("meal_plan_items")
    .delete()
    .eq("meal_plan_id", mealPlanId);

  if (deleteError) {
    return { data: null, error: deleteError.message };
  }

  revalidatePath("/meal-plan");

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 8. clearMealPlanSlot
// ---------------------------------------------------------------------------

/**
 * Remove all items for a specific meal slot (e.g. all breakfasts) from a meal plan.
 */
export async function clearMealPlanSlot(
  mealPlanId: string,
  mealSlot: MealType
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Verify ownership
  const { data: plan, error: planError } = await supabase
    .from("meal_plans")
    .select("id, status")
    .eq("id", mealPlanId)
    .eq("user_id", user.id)
    .single();

  if (planError || !plan) {
    return { data: null, error: "Meal plan not found" };
  }

  if (plan.status === "finalized") {
    return { data: null, error: "Cannot modify a finalized meal plan" };
  }

  const { error: deleteError } = await supabase
    .from("meal_plan_items")
    .delete()
    .eq("meal_plan_id", mealPlanId)
    .eq("meal_slot", mealSlot);

  if (deleteError) {
    return { data: null, error: deleteError.message };
  }

  revalidatePath("/meal-plan");

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 9. getRecipesForPicker
// ---------------------------------------------------------------------------

/**
 * Lightweight recipe fetch for the picker dialog. Returns only the fields
 * needed for display and filtering.
 */
export async function getRecipesForPicker(
  search?: string,
  mealType?: MealType
): Promise<ActionResult<PickerRecipe[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  let query = supabase
    .from("recipes")
    .select(
      "id, name, cuisine_type, protein_type, meal_type, is_favorite, last_made_date, times_made"
    )
    .eq("user_id", user.id)
    .order("name");

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  if (mealType) {
    query = query.contains("meal_type", [mealType]);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data ?? []) as PickerRecipe[], error: null };
}
