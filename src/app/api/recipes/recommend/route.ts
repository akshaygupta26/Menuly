import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  getHouseholdContext,
  applyOwnershipFilter,
} from "@/lib/household-context";
import { buildTasteProfile } from "@/lib/taste-profile";
import {
  buildRecommendationPrompt,
  parseRecommendationResponse,
} from "@/lib/recommendation-prompt";
import type { MealType, Recipe, MealPlanItemWithRecipe } from "@/types/database";

export const maxDuration = 60;

const DAILY_LIMIT = 3;

export async function POST(request: Request) {
  try {
    // Check AI env vars first
    const apiKey = process.env.AI_API_KEY;
    const baseURL = process.env.AI_BASE_URL;
    const model = process.env.AI_MODEL;

    if (!apiKey || !baseURL || !model) {
      return NextResponse.json(
        { error: "AI suggestions are not configured.", suggestions: [] },
        { status: 200 }
      );
    }

    // Auth
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

    // Rate limit check
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

    let currentCount = profile.ai_generation_count as number;

    if (!profile.ai_unlimited) {
      const resetAt = new Date(profile.ai_generation_reset_at as string);
      const now = new Date();
      const msIn24h = 24 * 60 * 60 * 1000;

      if (now.getTime() - resetAt.getTime() >= msIn24h) {
        await supabase
          .from("profiles")
          .update({
            ai_generation_count: 0,
            ai_generation_reset_at: now.toISOString(),
          })
          .eq("user_id", user.id);
        currentCount = 0;
      }

      if (currentCount >= DAILY_LIMIT) {
        return NextResponse.json(
          {
            error:
              "Daily limit reached. You can use AI suggestions 3 times per day.",
            suggestions: [],
          },
          { status: 429 }
        );
      }
    }

    // Parse request body
    const body = await request.json();
    const mealSlot = body.mealSlot as MealType;
    const mealPlanId = body.mealPlanId as string | undefined;
    const count = Math.min(Math.max(body.count ?? 3, 1), 5);

    const validMealSlots: MealType[] = [
      "breakfast",
      "lunch",
      "dinner",
      "snack",
    ];
    if (!validMealSlots.includes(mealSlot)) {
      return NextResponse.json(
        { error: "Invalid meal slot", suggestions: [] },
        { status: 400 }
      );
    }

    const ctx = await getHouseholdContext(supabase, user.id);

    // Fetch user's recipes
    const { data: recipes } = await applyOwnershipFilter(
      supabase.from("recipes").select("*"),
      ctx
    );

    const allRecipes = (recipes as Recipe[]) ?? [];

    if (allRecipes.length === 0) {
      return NextResponse.json(
        {
          error:
            "Add some recipes first so we can learn your taste.",
          suggestions: [],
        },
        { status: 200 }
      );
    }

    // Fetch current meal plan items if mealPlanId provided
    let currentWeekMeals: {
      name: string;
      cuisine_type: string | null;
      protein_type: string | null;
    }[] = [];
    let weekNutritionSummary = {
      avg_calories: null as number | null,
      avg_protein_g: null as number | null,
      meals_planned: 0,
    };

    if (mealPlanId) {
      const { data: items } = await supabase
        .from("meal_plan_items")
        .select("*, recipe:recipes(*)")
        .eq("meal_plan_id", mealPlanId);

      const mealItems = (items as MealPlanItemWithRecipe[] | null) ?? [];

      currentWeekMeals = mealItems
        .filter((i) => i.recipe)
        .map((i) => ({
          name: i.recipe!.name,
          cuisine_type: i.recipe!.cuisine_type,
          protein_type: i.recipe!.protein_type,
        }));

      // Compute week nutrition summary
      const withNutrition = mealItems.filter(
        (i) => i.recipe?.calories != null
      );
      if (withNutrition.length > 0) {
        weekNutritionSummary = {
          avg_calories: Math.round(
            withNutrition.reduce(
              (sum, i) => sum + (i.recipe!.calories ?? 0),
              0
            ) / withNutrition.length
          ),
          avg_protein_g: Math.round(
            withNutrition.reduce(
              (sum, i) => sum + (i.recipe!.protein_g ?? 0),
              0
            ) / withNutrition.length
          ),
          meals_planned: withNutrition.length,
        };
      }
    }

    // Build taste profile and prompt
    const tasteProfile = buildTasteProfile(allRecipes);
    const { system, user: userPrompt } = buildRecommendationPrompt({
      tasteProfile,
      mealSlot,
      currentWeekMeals,
      weekNutritionSummary,
      existingRecipeNames: allRecipes.map((r) => r.name),
      count,
    });

    // Call AI
    const client = new OpenAI({ baseURL, apiKey });

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      });
    } catch (err) {
      console.error("Failed to connect to AI provider:", err);
      return NextResponse.json(
        {
          error: "Failed to generate suggestions. Please try again.",
          suggestions: [],
        },
        { status: 200 }
      );
    }

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json(
        {
          error: "AI returned an empty response. Please try again.",
          suggestions: [],
        },
        { status: 200 }
      );
    }

    // Parse response
    let suggestions;
    try {
      suggestions = parseRecommendationResponse(rawContent);
    } catch (err) {
      console.error("Failed to parse AI response:", err, rawContent);
      return NextResponse.json(
        {
          error: "AI returned invalid data. Please try again.",
          suggestions: [],
        },
        { status: 200 }
      );
    }

    // Increment generation count
    if (!profile.ai_unlimited) {
      await supabase
        .from("profiles")
        .update({ ai_generation_count: currentCount + 1 })
        .eq("user_id", user.id);
    }

    const remaining = profile.ai_unlimited
      ? null
      : DAILY_LIMIT - (currentCount + 1);

    return NextResponse.json({ suggestions, remaining });
  } catch (err) {
    console.error("Error generating recommendations:", err);
    return NextResponse.json(
      {
        error: "Failed to generate suggestions. Please try again.",
        suggestions: [],
      },
      { status: 500 }
    );
  }
}
