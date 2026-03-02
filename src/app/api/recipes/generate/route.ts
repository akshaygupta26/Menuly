import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  buildRecipePrompt,
  type UserPreferences,
} from "@/lib/recipe-prompt-builder";
import type { RecipeFormValues } from "@/components/recipes/recipe-form";
import type { IngredientCategory, Recipe } from "@/types/database";

function analyzePreferences(recipes: Recipe[]): UserPreferences {
  const cuisineCounts: Record<string, number> = {};
  const proteinCounts: Record<string, number> = {};
  const mealTypeCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  const recipeNames: string[] = [];

  for (const r of recipes) {
    recipeNames.push(r.name);

    if (r.cuisine_type) {
      cuisineCounts[r.cuisine_type] = (cuisineCounts[r.cuisine_type] ?? 0) + 1;
    }
    if (r.protein_type) {
      proteinCounts[r.protein_type] = (proteinCounts[r.protein_type] ?? 0) + 1;
    }
    for (const mt of r.meal_type) {
      mealTypeCounts[mt] = (mealTypeCounts[mt] ?? 0) + 1;
    }
    for (const tag of r.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  const topN = (counts: Record<string, number>, n: number) =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key]) => key);

  return {
    topCuisines: topN(cuisineCounts, 3),
    topProteins: topN(proteinCounts, 3),
    topMealTypes: topN(mealTypeCounts, 3),
    commonTags: topN(tagCounts, 5),
    existingRecipeNames: recipeNames,
  };
}

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Validate input
    const body = await request.json();
    const prompt = body.prompt;

    if (
      typeof prompt !== "string" ||
      prompt.length < 3 ||
      prompt.length > 500
    ) {
      return NextResponse.json(
        { error: "Prompt must be between 3 and 500 characters" },
        { status: 400 }
      );
    }

    // Fetch user's existing recipes for preference learning
    const { data: recipes } = await supabase
      .from("recipes")
      .select(
        "name, cuisine_type, protein_type, meal_type, tags"
      )
      .eq("user_id", user.id);

    const userPreferences = analyzePreferences((recipes as Recipe[]) ?? []);

    // Build prompt
    const { systemPrompt, userPrompt } = buildRecipePrompt(prompt, {
      servings: body.servings,
      userPreferences,
    });

    // Call AI API
    const apiKey = process.env.AI_API_KEY;
    const baseURL = process.env.AI_BASE_URL;
    const model = process.env.AI_MODEL;

    if (!apiKey || !baseURL || !model) {
      console.error("AI environment variables are not configured");
      return NextResponse.json(
        { error: "AI recipe generation is not configured" },
        { status: 500 }
      );
    }

    const client = new OpenAI({ baseURL, apiKey });

    const completion = await client.chat.completions.create({
      model,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 422 }
      );
    }

    // Parse JSON response
    let recipe: Record<string, unknown>;
    try {
      recipe = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json(
        { error: "AI returned invalid recipe data. Please try again." },
        { status: 422 }
      );
    }

    // Validate required fields
    if (
      !recipe.name ||
      typeof recipe.name !== "string" ||
      !Array.isArray(recipe.ingredients) ||
      recipe.ingredients.length === 0
    ) {
      return NextResponse.json(
        { error: "AI returned incomplete recipe data. Please try again." },
        { status: 422 }
      );
    }

    // Transform to RecipeFormValues shape
    const ingredients = (
      recipe.ingredients as Array<Record<string, unknown>>
    ).map((ing, index) => ({
      name: String(ing.name ?? ""),
      quantity: typeof ing.quantity === "number" ? ing.quantity : null,
      unit: typeof ing.unit === "string" ? ing.unit : null,
      category: String(ing.category ?? "other") as IngredientCategory,
      notes: typeof ing.notes === "string" ? ing.notes : null,
      is_optional: Boolean(ing.is_optional),
      raw_text: String(ing.raw_text ?? ing.name ?? ""),
      sort_order: index,
    }));

    const formValues: Partial<RecipeFormValues> = {
      name: String(recipe.name),
      cuisine_type:
        typeof recipe.cuisine_type === "string" ? recipe.cuisine_type : "",
      protein_type:
        typeof recipe.protein_type === "string" ? recipe.protein_type : "",
      meal_type: Array.isArray(recipe.meal_type) ? recipe.meal_type : [],
      prep_time: typeof recipe.prep_time === "number" ? recipe.prep_time : "",
      cook_time: typeof recipe.cook_time === "number" ? recipe.cook_time : "",
      servings: typeof recipe.servings === "number" ? recipe.servings : "",
      instructions: Array.isArray(recipe.instructions)
        ? (recipe.instructions as string[]).join("\n")
        : "",
      tags: Array.isArray(recipe.tags)
        ? (recipe.tags as string[]).join(", ")
        : "",
      notes: typeof recipe.notes === "string" ? recipe.notes : "",
      source_url: "",
      image_url: "",
      is_favorite: false,
      ingredients,
      calories: "",
      protein_g: "",
      carbs_g: "",
      fat_g: "",
      nutrition_source: "",
    };

    return NextResponse.json({ data: formValues });
  } catch (err) {
    console.error("Error generating recipe:", err);
    return NextResponse.json(
      { error: "Failed to generate recipe. Please try again." },
      { status: 500 }
    );
  }
}
