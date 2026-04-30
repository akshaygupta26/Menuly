import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { scrapeRecipe } from "@/lib/recipe-scraper";
import { parseIngredient } from "@/lib/ingredient-parser";
import { calculateNutritionForIngredients } from "@/lib/nutrition";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { url } = body;

    // Validate URL
    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A valid URL is required." },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format." },
        { status: 400 }
      );
    }

    // Only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { error: "Only HTTP and HTTPS URLs are supported." },
        { status: 400 }
      );
    }

    // Fetch the page HTML
    let html: string;
    try {
      const response = await fetch(parsedUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Menuly/1.0; +https://menuly.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return NextResponse.json(
          {
            error: `Failed to fetch the page (HTTP ${response.status}).`,
          },
          { status: 422 }
        );
      }

      html = await response.text();
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : "Unknown error";
      return NextResponse.json(
        { error: `Could not reach the URL: ${message}` },
        { status: 422 }
      );
    }

    // Scrape recipe from HTML
    const scraped = scrapeRecipe(html);

    if (!scraped) {
      return NextResponse.json(
        {
          error:
            "No recipe data found on this page. Make sure the page contains structured recipe data (JSON-LD).",
        },
        { status: 422 }
      );
    }

    // Parse each ingredient string through the ingredient parser
    const parsedIngredients = scraped.ingredients.map((raw) => {
      const parsed = parseIngredient(raw);
      return {
        raw_text: raw,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        category: parsed.category,
      };
    });

    // Determine nutrition data and source
    let nutrition = scraped.nutrition ?? null;
    let nutrition_source: "json_ld" | "usda" | null = nutrition
      ? "json_ld"
      : null;

    // USDA fallback when JSON-LD has no nutrition data
    if (!nutrition && parsedIngredients.length > 0) {
      try {
        const servings = scraped.servings ?? 1;
        const usdaNutrition = await calculateNutritionForIngredients(
          supabase,
          parsedIngredients.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
          })),
          servings
        );
        // Only use USDA result if we got actual data
        if (usdaNutrition.calories != null) {
          nutrition = usdaNutrition;
          nutrition_source = "usda";
        }
      } catch {
        // USDA failed — continue without nutrition data
      }
    }

    // Return structured recipe data
    return NextResponse.json({
      name: scraped.name,
      description: scraped.description ?? undefined,
      ingredients: parsedIngredients,
      instructions: scraped.instructions,
      prepTime: scraped.prepTime,
      cookTime: scraped.cookTime,
      servings: scraped.servings,
      image: scraped.image,
      url: scraped.url ?? url,
      nutrition,
      nutrition_source,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred while importing the recipe." },
      { status: 500 }
    );
  }
}
