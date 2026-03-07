import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type {
  IngredientCategory,
  MealType,
  NutritionSource,
} from "@/types/database";
import { getHouseholdContext } from "@/lib/household-context";

// ---------------------------------------------------------------------------
// POST /api/recipes/webhook
//
// Creates one or more recipes via a webhook-friendly JSON endpoint.
// Authenticated via Bearer token (the user's Supabase access token).
//
// Single recipe:  { "name": "...", "ingredients": [...], ... }
// Batch (max 20): { "recipes": [{ "name": "...", ... }, ...] }
//
// Returns 201 with { data, error: null } on success.
// ---------------------------------------------------------------------------

const VALID_MEAL_TYPES: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

const VALID_CATEGORIES: IngredientCategory[] = [
  "produce",
  "dairy",
  "meat",
  "pantry",
  "frozen",
  "bakery",
  "beverages",
  "other",
];

const VALID_NUTRITION_SOURCES: NutritionSource[] = [
  "json_ld",
  "usda",
  "manual",
];

interface WebhookIngredientInput {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string;
  notes?: string | null;
  is_optional?: boolean;
  raw_text?: string;
}

interface WebhookRecipeInput {
  name: string;
  cuisine_type?: string;
  protein_type?: string;
  meal_type?: string[];
  prep_time?: number;
  cook_time?: number;
  servings?: number;
  instructions?: string[];
  tags?: string[];
  ingredients?: WebhookIngredientInput[];
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  nutrition_source?: string;
  notes?: string;
  source_url?: string;
  image_url?: string;
}

function validateRecipe(
  recipe: WebhookRecipeInput,
  index: number
): string | null {
  const prefix = index >= 0 ? `recipes[${index}]: ` : "";

  if (!recipe.name || typeof recipe.name !== "string" || !recipe.name.trim()) {
    return `${prefix}"name" is required and must be a non-empty string`;
  }

  if (recipe.meal_type) {
    if (!Array.isArray(recipe.meal_type)) {
      return `${prefix}"meal_type" must be an array`;
    }
    for (const mt of recipe.meal_type) {
      if (!VALID_MEAL_TYPES.includes(mt as MealType)) {
        return `${prefix}invalid meal_type "${mt}". Must be one of: ${VALID_MEAL_TYPES.join(", ")}`;
      }
    }
  }

  if (
    recipe.nutrition_source &&
    !VALID_NUTRITION_SOURCES.includes(recipe.nutrition_source as NutritionSource)
  ) {
    return `${prefix}invalid nutrition_source "${recipe.nutrition_source}". Must be one of: ${VALID_NUTRITION_SOURCES.join(", ")}`;
  }

  if (recipe.ingredients) {
    if (!Array.isArray(recipe.ingredients)) {
      return `${prefix}"ingredients" must be an array`;
    }
    for (let i = 0; i < recipe.ingredients.length; i++) {
      const ing = recipe.ingredients[i];
      if (!ing.name || typeof ing.name !== "string") {
        return `${prefix}ingredients[${i}].name is required`;
      }
      if (
        ing.category &&
        !VALID_CATEGORIES.includes(ing.category as IngredientCategory)
      ) {
        return `${prefix}ingredients[${i}].category "${ing.category}" is invalid. Must be one of: ${VALID_CATEGORIES.join(", ")}`;
      }
    }
  }

  return null;
}

export async function POST(request: Request) {
  // ---- Auth ----------------------------------------------------------------
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { data: null, error: "Missing or malformed Authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.replace("Bearer ", "");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op
        },
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { data: null, error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  // ---- Household context ---------------------------------------------------
  const ctx = await getHouseholdContext(supabase, user.id);
  const householdId = ctx.householdId;

  // ---- Parse body ----------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const isBatch = Array.isArray(body.recipes);
  const inputs: WebhookRecipeInput[] = isBatch
    ? (body.recipes as WebhookRecipeInput[])
    : [body as unknown as WebhookRecipeInput];

  if (inputs.length === 0) {
    return NextResponse.json(
      { data: null, error: "At least one recipe is required" },
      { status: 400 }
    );
  }

  if (inputs.length > 20) {
    return NextResponse.json(
      { data: null, error: "Maximum 20 recipes per request" },
      { status: 400 }
    );
  }

  // ---- Validate ------------------------------------------------------------
  for (let i = 0; i < inputs.length; i++) {
    const err = validateRecipe(inputs[i], isBatch ? i : -1);
    if (err) {
      return NextResponse.json({ data: null, error: err }, { status: 400 });
    }
  }

  // ---- Insert recipes ------------------------------------------------------
  const created: Array<{ id: string; name: string }> = [];

  for (const recipe of inputs) {
    const hasNutrition =
      recipe.calories != null ||
      recipe.protein_g != null ||
      recipe.carbs_g != null ||
      recipe.fat_g != null;

    const { data: newRecipe, error: recipeError } = await supabase
      .from("recipes")
      .insert({
        name: recipe.name.trim(),
        user_id: user.id,
        household_id: householdId,
        cuisine_type: recipe.cuisine_type ?? null,
        protein_type: recipe.protein_type ?? null,
        meal_type: (recipe.meal_type as MealType[]) ?? [],
        prep_time: recipe.prep_time ?? null,
        cook_time: recipe.cook_time ?? null,
        servings: recipe.servings ?? null,
        instructions: recipe.instructions ?? [],
        tags: recipe.tags ?? [],
        is_favorite: false,
        source_url: recipe.source_url ?? null,
        image_url: recipe.image_url ?? null,
        notes: recipe.notes ?? null,
        calories: recipe.calories ?? null,
        protein_g: recipe.protein_g ?? null,
        carbs_g: recipe.carbs_g ?? null,
        fat_g: recipe.fat_g ?? null,
        nutrition_source: hasNutrition
          ? ((recipe.nutrition_source as NutritionSource) ?? "manual")
          : null,
      })
      .select("id, name")
      .single();

    if (recipeError) {
      return NextResponse.json(
        { data: null, error: `Failed to create recipe "${recipe.name}": ${recipeError.message}` },
        { status: 500 }
      );
    }

    // Insert ingredients
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      const ingredientRows = recipe.ingredients.map((ing, index) => ({
        recipe_id: newRecipe.id,
        name: ing.name,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        category: (ing.category as IngredientCategory) ?? "other",
        notes: ing.notes ?? null,
        is_optional: ing.is_optional ?? false,
        raw_text:
          ing.raw_text ??
          `${ing.quantity ?? ""} ${ing.unit ?? ""} ${ing.name}`.trim(),
        sort_order: index,
      }));

      const { error: ingredientsError } = await supabase
        .from("recipe_ingredients")
        .insert(ingredientRows);

      if (ingredientsError) {
        // Rollback the recipe
        await supabase.from("recipes").delete().eq("id", newRecipe.id);
        return NextResponse.json(
          {
            data: null,
            error: `Failed to create ingredients for "${recipe.name}": ${ingredientsError.message}`,
          },
          { status: 500 }
        );
      }
    }

    created.push({ id: newRecipe.id, name: newRecipe.name });
  }

  return NextResponse.json(
    { data: isBatch ? created : created[0], error: null },
    { status: 201 }
  );
}
