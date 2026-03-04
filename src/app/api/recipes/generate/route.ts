import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdContext, applyOwnershipFilter } from "@/lib/household-context";
import {
  buildRecipePrompt,
  type UserPreferences,
} from "@/lib/recipe-prompt-builder";
import type { RecipeFormValues } from "@/components/recipes/recipe-form";
import type { IngredientCategory, Recipe } from "@/types/database";
import {
  calculateNutritionForIngredients,
  type IngredientInput,
} from "@/lib/nutrition";

export const maxDuration = 60;

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

/** Transform parsed AI JSON into RecipeFormValues shape. */
function transformToFormValues(
  recipe: Record<string, unknown>
): Partial<RecipeFormValues> {
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

  return {
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
    calories: typeof recipe.calories === "number" ? recipe.calories : "",
    protein_g: typeof recipe.protein_g === "number" ? recipe.protein_g : "",
    carbs_g: typeof recipe.carbs_g === "number" ? recipe.carbs_g : "",
    fat_g: typeof recipe.fat_g === "number" ? recipe.fat_g : "",
    nutrition_source: typeof recipe.calories === "number" ? "manual" : "",
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

    // Rate-limit check
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("ai_generation_count, ai_generation_reset_at, ai_unlimited")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Could not load profile" },
        { status: 500 }
      );
    }

    const DAILY_LIMIT = 3;
    let currentCount = profile.ai_generation_count as number;

    if (!profile.ai_unlimited) {
      const resetAt = new Date(profile.ai_generation_reset_at as string);
      const now = new Date();
      const msIn24h = 24 * 60 * 60 * 1000;

      // Reset window if 24 hours have elapsed
      if (now.getTime() - resetAt.getTime() >= msIn24h) {
        await supabase
          .from("profiles")
          .update({ ai_generation_count: 0, ai_generation_reset_at: now.toISOString() })
          .eq("user_id", user.id);
        currentCount = 0;
      }

      if (currentCount >= DAILY_LIMIT) {
        return NextResponse.json(
          { error: "Daily limit reached. You can generate 3 recipes per day." },
          { status: 429 }
        );
      }
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

    const ctx = await getHouseholdContext(supabase, user.id);

    // Fetch user/household recipes for preference learning
    const { data: recipes } = await applyOwnershipFilter(
      supabase
        .from("recipes")
        .select("name, cuisine_type, protein_type, meal_type, tags"),
      ctx
    );

    const userPreferences = analyzePreferences((recipes as Recipe[]) ?? []);

    // Build prompt
    const { systemPrompt, userPrompt } = buildRecipePrompt(prompt, {
      servings: body.servings,
      userPreferences,
    });

    // Check AI env vars
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

    // Create streaming completion — if connection fails, return regular JSON error
    let stream: Awaited<
      ReturnType<typeof client.chat.completions.create>
    >;
    try {
      stream = await client.chat.completions.create({
        model,
        max_tokens: 2048,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
    } catch (err) {
      console.error("Failed to connect to AI provider:", err);
      return NextResponse.json(
        { error: "Failed to connect to AI service. Please try again." },
        { status: 502 }
      );
    }

    // Stream response via SSE
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullContent = "";

        try {
          for await (const chunk of stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
            const token = chunk.choices[0]?.delta?.content;
            if (token) {
              fullContent += token;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
              );
            }
          }

          // Stream complete — parse and validate
          const jsonStr = fullContent
            .replace(/^```(?:json)?\s*\n?/i, "")
            .replace(/\n?```\s*$/i, "")
            .trim();

          let recipe: Record<string, unknown>;
          try {
            recipe = JSON.parse(jsonStr);
          } catch {
            console.error("Failed to parse AI response:", fullContent);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: "AI returned invalid recipe data. Please try again." })}\n\n`
              )
            );
            return;
          }

          if (
            !recipe.name ||
            typeof recipe.name !== "string" ||
            !Array.isArray(recipe.ingredients) ||
            recipe.ingredients.length === 0
          ) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: "AI returned incomplete recipe data. Please try again." })}\n\n`
              )
            );
            return;
          }

          // Transform to form values
          const formValues = transformToFormValues(recipe);

          // USDA nutrition fallback
          if (formValues.ingredients && formValues.ingredients.length > 0) {
            const servings =
              typeof recipe.servings === "number" ? recipe.servings : 1;
            const nutritionInputs: IngredientInput[] =
              formValues.ingredients.map((ing) => ({
                name: ing.name,
                quantity: ing.quantity,
                unit: ing.unit,
              }));

            try {
              const nutrition = await calculateNutritionForIngredients(
                nutritionInputs,
                servings
              );

              if (nutrition.calories !== null) {
                formValues.calories = nutrition.calories;
                formValues.protein_g = nutrition.protein_g ?? "";
                formValues.carbs_g = nutrition.carbs_g ?? "";
                formValues.fat_g = nutrition.fat_g ?? "";
                formValues.nutrition_source = "usda";
              } else {
                console.log("USDA nutrition returned no data — keeping AI estimates if available");
              }
            } catch (err) {
              // Non-fatal — just skip nutrition
              console.warn("USDA nutrition calculation failed:", err);
            }
          }

          // Increment generation count after successful generation
          if (!profile.ai_unlimited) {
            await supabase
              .from("profiles")
              .update({ ai_generation_count: currentCount + 1 })
              .eq("user_id", user.id);
          }

          const remaining = profile.ai_unlimited
            ? null
            : DAILY_LIMIT - (currentCount + 1);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, data: formValues, remaining })}\n\n`
            )
          );
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream interrupted. Please try again." })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("Error generating recipe:", err);
    return NextResponse.json(
      { error: "Failed to generate recipe. Please try again." },
      { status: 500 }
    );
  }
}
