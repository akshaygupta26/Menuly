import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getHouseholdContext,
  applyOwnershipFilter,
} from "@/lib/household-context";
import { normalizeIngredients } from "@/lib/ai-ingredient-normalizer";

// ---------------------------------------------------------------------------
// POST /api/recipes/normalize-all
// Backfill endpoint: normalizes existing recipes that have no grocery_normalized_at
// ---------------------------------------------------------------------------

export const maxDuration = 60;

const BATCH_SIZE = 5;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const ctx = await getHouseholdContext(supabase, user.id);

    // Fetch all un-normalized recipes owned by this user/household
    const { data: recipes, error: recipesError } = await applyOwnershipFilter(
      supabase
        .from("recipes")
        .select("id, name, servings")
        .is("grocery_normalized_at", null),
      ctx
    );

    if (recipesError) {
      return NextResponse.json(
        { error: recipesError.message },
        { status: 500 }
      );
    }

    const total = recipes?.length ?? 0;
    if (total === 0) {
      return NextResponse.json({ processed: 0, failed: 0, remaining: 0 });
    }

    // Process in batches of BATCH_SIZE
    const batch = (recipes ?? []).slice(0, BATCH_SIZE);
    let processed = 0;
    let failed = 0;

    for (const recipe of batch) {
      try {
        // Fetch raw ingredients for this recipe
        const { data: ingredients, error: ingError } = await supabase
          .from("recipe_ingredients")
          .select("id, raw_text")
          .eq("recipe_id", recipe.id);

        if (ingError) {
          throw new Error(ingError.message);
        }

        if (!ingredients || ingredients.length === 0) {
          // No ingredients — mark as normalized so we skip it next time
          await supabase
            .from("recipes")
            .update({ grocery_normalized_at: new Date().toISOString() })
            .eq("id", recipe.id);
          processed++;
          continue;
        }

        // Call the AI normalizer
        const normalized = await normalizeIngredients(
          ingredients.map((ing) => ({ id: ing.id, raw_text: ing.raw_text ?? "" }))
        );

        // Update each ingredient row with the normalized grocery fields
        for (const item of normalized) {
          await supabase
            .from("recipe_ingredients")
            .update({
              grocery_name: item.grocery_name,
              grocery_quantity: item.grocery_quantity,
              grocery_unit: item.grocery_unit,
              grocery_category: item.grocery_category,
            })
            .eq("id", item.id);
        }

        // Mark the recipe as normalized
        await supabase
          .from("recipes")
          .update({ grocery_normalized_at: new Date().toISOString() })
          .eq("id", recipe.id);

        processed++;
      } catch (err) {
        console.error(
          `[normalize-all] Failed to normalize recipe ${recipe.id} ("${recipe.name}"):`,
          err
        );
        failed++;
      }
    }

    const remaining = total - processed - failed;

    return NextResponse.json({ processed, failed, remaining });
  } catch (err) {
    console.error("[normalize-all] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
