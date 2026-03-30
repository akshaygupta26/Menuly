"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdContext, applyOwnershipFilter } from "@/lib/household-context";
import type {
  GroceryList,
  GroceryItem,
  IngredientCategory,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// 1. getActiveGroceryList
// ---------------------------------------------------------------------------

export async function getActiveGroceryList(): Promise<
  ActionResult<{ list: GroceryList; items: GroceryItem[] } | null>
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  const { data: list, error: listError } = await applyOwnershipFilter(
    supabase.from("grocery_lists").select("*").eq("is_active", true),
    ctx
  ).maybeSingle();

  if (listError) {
    return { data: null, error: listError.message };
  }

  if (!list) {
    return { data: null, error: null };
  }

  const { data: items, error: itemsError } = await supabase
    .from("grocery_items")
    .select("*")
    .eq("grocery_list_id", list.id)
    .order("category")
    .order("sort_order");

  if (itemsError) {
    return { data: null, error: itemsError.message };
  }

  return {
    data: {
      list: list as GroceryList,
      items: (items ?? []) as GroceryItem[],
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 2. generateGroceryList
// ---------------------------------------------------------------------------

export async function generateGroceryList(
  mealPlanId: string
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  // Verify the meal plan belongs to the user/household and is finalized
  const { data: mealPlan, error: planError } = await applyOwnershipFilter(
    supabase.from("meal_plans").select("id, status, week_start").eq("id", mealPlanId),
    ctx
  ).single();

  if (planError || !mealPlan) {
    return { data: null, error: "Meal plan not found" };
  }

  if (mealPlan.status !== "finalized") {
    return { data: null, error: "Meal plan must be finalized first" };
  }

  // Fetch all meal plan items (do NOT deduplicate — each occurrence contributes full quantities)
  const { data: planItems, error: itemsError } = await supabase
    .from("meal_plan_items")
    .select("recipe_id")
    .eq("meal_plan_id", mealPlanId)
    .not("recipe_id", "is", null);

  if (itemsError) {
    return { data: null, error: itemsError.message };
  }

  // Collect ALL recipe_ids (including duplicates for recipes used multiple times)
  const allRecipeIds = (planItems ?? [])
    .map((item) => item.recipe_id)
    .filter((id): id is string => id != null);

  if (allRecipeIds.length === 0) {
    return { data: null, error: "No recipes found in meal plan" };
  }

  // Fetch ingredients for unique recipes
  const uniqueRecipeIds = [...new Set(allRecipeIds)];
  const { data: allIngredients, error: ingredientsError } = await supabase
    .from("recipe_ingredients")
    .select("*")
    .in("recipe_id", uniqueRecipeIds);

  if (ingredientsError) {
    return { data: null, error: ingredientsError.message };
  }

  // Build a map of recipe_id → ingredients
  const ingredientsByRecipe = new Map<string, typeof allIngredients>();
  for (const ing of allIngredients ?? []) {
    const list = ingredientsByRecipe.get(ing.recipe_id) ?? [];
    list.push(ing);
    ingredientsByRecipe.set(ing.recipe_id, list);
  }

  // Fetch already_have_items from meal plan
  const { data: planData } = await supabase
    .from("meal_plans")
    .select("already_have_items")
    .eq("id", mealPlanId)
    .single();
  const alreadyHave = new Set<string>(
    ((planData?.already_have_items as string[]) ?? []).map((s) => s.toLowerCase())
  );

  // Consolidate: group by grocery_name (or fallback to name), sum quantities
  const CATEGORY_ORDER: IngredientCategory[] = [
    "produce", "meat", "dairy", "bakery", "frozen", "pantry", "beverages", "other",
  ];

  interface ConsolidatedItem {
    name: string;
    quantity: number | null;
    unit: string | null;
    category: IngredientCategory;
    recipeIds: Set<string>;
  }

  const consolidated = new Map<string, ConsolidatedItem>();

  // For each meal plan item occurrence (not deduplicated), add its recipe's ingredients
  for (const recipeId of allRecipeIds) {
    const ingredients = ingredientsByRecipe.get(recipeId) ?? [];
    for (const ing of ingredients) {
      const displayName = ing.grocery_name ?? ing.name;
      const key = displayName.toLowerCase();

      // Skip already-have items
      if (alreadyHave.has(key)) continue;

      const existing = consolidated.get(key);
      const qty = ing.grocery_quantity ?? ing.quantity;
      const unit = ing.grocery_unit ?? ing.unit;
      const category = (ing.grocery_category ?? ing.category) as IngredientCategory;

      if (existing) {
        // Sum quantities if both have values and units match
        if (existing.quantity != null && qty != null && existing.unit === unit) {
          existing.quantity += qty;
        } else if (existing.quantity == null && qty != null) {
          existing.quantity = qty;
          existing.unit = unit;
        }
        existing.recipeIds.add(ing.recipe_id);
      } else {
        consolidated.set(key, {
          name: displayName,
          quantity: qty,
          unit,
          category,
          recipeIds: new Set([ing.recipe_id]),
        });
      }
    }
  }

  // Clean up stale already_have_items (remove entries not matching any ingredient)
  const allIngredientKeys = new Set<string>();
  for (const recipeId of allRecipeIds) {
    for (const ing of ingredientsByRecipe.get(recipeId) ?? []) {
      allIngredientKeys.add((ing.grocery_name ?? ing.name).toLowerCase());
    }
  }
  const cleanedAlreadyHave = [...alreadyHave].filter((item) => allIngredientKeys.has(item));
  if (cleanedAlreadyHave.length !== alreadyHave.size) {
    await supabase
      .from("meal_plans")
      .update({ already_have_items: cleanedAlreadyHave })
      .eq("id", mealPlanId);
  }

  // Group by category in standard order
  type GroupedItems = { category: IngredientCategory; items: { name: string; quantity: number | null; unit: string | null; category: IngredientCategory; recipe_ids: string[] }[] };
  const grouped: GroupedItems[] = [];

  for (const cat of CATEGORY_ORDER) {
    const items = [...consolidated.values()]
      .filter((item) => item.category === cat)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        recipe_ids: [...item.recipeIds],
      }));
    if (items.length > 0) {
      grouped.push({ category: cat, items });
    }
  }

  // Deactivate any existing active grocery lists
  await applyOwnershipFilter(
    supabase.from("grocery_lists").update({ is_active: false }).eq("is_active", true),
    ctx
  );

  // Create the new grocery list
  const { data: newList, error: createError } = await supabase
    .from("grocery_lists")
    .insert({
      user_id: user.id,
      household_id: ctx.householdId,
      meal_plan_id: mealPlanId,
      name: `Grocery List - Week of ${mealPlan.week_start}`,
      is_active: true,
    })
    .select("id")
    .single();

  if (createError) {
    return { data: null, error: createError.message };
  }

  // Insert consolidated items
  let sortOrder = 0;
  const itemRows = grouped.flatMap((group) =>
    group.items.map((item) => ({
      grocery_list_id: newList.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      is_checked: false,
      recipe_ids: item.recipe_ids,
      added_manually: false,
      sort_order: sortOrder++,
    }))
  );

  if (itemRows.length > 0) {
    const { error: insertError } = await supabase
      .from("grocery_items")
      .insert(itemRows);

    if (insertError) {
      // Clean up the list if items fail
      await supabase.from("grocery_lists").delete().eq("id", newList.id);
      return { data: null, error: insertError.message };
    }
  }

  revalidatePath("/grocery");

  return { data: { id: newList.id }, error: null };
}

// ---------------------------------------------------------------------------
// 3. toggleGroceryItem
// ---------------------------------------------------------------------------

export async function toggleGroceryItem(
  itemId: string
): Promise<ActionResult<{ is_checked: boolean }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  // Get current value (verify ownership via join)
  const { data: item, error: fetchError } = await supabase
    .from("grocery_items")
    .select("is_checked, grocery_list_id")
    .eq("id", itemId)
    .single();

  if (fetchError || !item) {
    return { data: null, error: "Item not found" };
  }

  // Verify list ownership
  const { data: list, error: listError } = await applyOwnershipFilter(
    supabase.from("grocery_lists").select("id").eq("id", item.grocery_list_id),
    ctx
  ).single();

  if (listError || !list) {
    return { data: null, error: "Not authorized" };
  }

  const newValue = !item.is_checked;

  const { error: updateError } = await supabase
    .from("grocery_items")
    .update({ is_checked: newValue })
    .eq("id", itemId);

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  revalidatePath("/grocery");

  return { data: { is_checked: newValue }, error: null };
}

// ---------------------------------------------------------------------------
// 4. addManualItem
// ---------------------------------------------------------------------------

export async function addManualItem(
  listId: string,
  name: string,
  category: IngredientCategory = "other"
): Promise<ActionResult<GroceryItem>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  // Verify list ownership
  const { data: list, error: listError } = await applyOwnershipFilter(
    supabase.from("grocery_lists").select("id").eq("id", listId),
    ctx
  ).single();

  if (listError || !list) {
    return { data: null, error: "List not found" };
  }

  // Get max sort_order for this list
  const { data: maxItem } = await supabase
    .from("grocery_items")
    .select("sort_order")
    .eq("grocery_list_id", listId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (maxItem?.sort_order ?? -1) + 1;

  const { data: newItem, error: insertError } = await supabase
    .from("grocery_items")
    .insert({
      grocery_list_id: listId,
      name,
      quantity: null,
      unit: null,
      category,
      is_checked: false,
      recipe_ids: [],
      added_manually: true,
      sort_order: nextSortOrder,
    })
    .select("*")
    .single();

  if (insertError) {
    return { data: null, error: insertError.message };
  }

  revalidatePath("/grocery");

  return { data: newItem as GroceryItem, error: null };
}

// ---------------------------------------------------------------------------
// 5. removeGroceryItem
// ---------------------------------------------------------------------------

export async function removeGroceryItem(
  itemId: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  // Get the item to verify ownership
  const { data: item, error: fetchError } = await supabase
    .from("grocery_items")
    .select("grocery_list_id")
    .eq("id", itemId)
    .single();

  if (fetchError || !item) {
    return { data: null, error: "Item not found" };
  }

  // Verify list ownership
  const { data: list, error: listError } = await applyOwnershipFilter(
    supabase.from("grocery_lists").select("id").eq("id", item.grocery_list_id),
    ctx
  ).single();

  if (listError || !list) {
    return { data: null, error: "Not authorized" };
  }

  const { error: deleteError } = await supabase
    .from("grocery_items")
    .delete()
    .eq("id", itemId);

  if (deleteError) {
    return { data: null, error: deleteError.message };
  }

  revalidatePath("/grocery");

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 6. getGroceryList
// ---------------------------------------------------------------------------

export async function getGroceryList(
  id: string
): Promise<ActionResult<{ list: GroceryList; items: GroceryItem[] }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  const { data: list, error: listError } = await applyOwnershipFilter(
    supabase.from("grocery_lists").select("*").eq("id", id),
    ctx
  ).single();

  if (listError || !list) {
    return { data: null, error: "List not found" };
  }

  const { data: items, error: itemsError } = await supabase
    .from("grocery_items")
    .select("*")
    .eq("grocery_list_id", id)
    .order("category")
    .order("sort_order");

  if (itemsError) {
    return { data: null, error: itemsError.message };
  }

  return {
    data: {
      list: list as GroceryList,
      items: (items ?? []) as GroceryItem[],
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 7. clearGroceryList
// ---------------------------------------------------------------------------

export async function clearGroceryList(
  listId: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  // Verify list ownership
  const { data: list, error: listError } = await applyOwnershipFilter(
    supabase.from("grocery_lists").select("id").eq("id", listId),
    ctx
  ).single();

  if (listError || !list) {
    return { data: null, error: "List not found" };
  }

  const { error: deleteError } = await supabase
    .from("grocery_items")
    .delete()
    .eq("grocery_list_id", listId);

  if (deleteError) {
    return { data: null, error: deleteError.message };
  }

  revalidatePath("/grocery");

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 8. clearCheckedItems
// ---------------------------------------------------------------------------

export async function clearCheckedItems(
  listId: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  // Verify list ownership
  const { data: list, error: listError } = await applyOwnershipFilter(
    supabase.from("grocery_lists").select("id").eq("id", listId),
    ctx
  ).single();

  if (listError || !list) {
    return { data: null, error: "List not found" };
  }

  const { error: deleteError } = await supabase
    .from("grocery_items")
    .delete()
    .eq("grocery_list_id", listId)
    .eq("is_checked", true);

  if (deleteError) {
    return { data: null, error: deleteError.message };
  }

  revalidatePath("/grocery");

  return { data: null, error: null };
}
