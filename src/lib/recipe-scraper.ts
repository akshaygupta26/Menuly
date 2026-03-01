import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapedNutrition {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface ScrapedRecipe {
  name: string;
  ingredients: string[];
  instructions: string[];
  prepTime: number | null; // minutes
  cookTime: number | null; // minutes
  totalTime: number | null; // minutes
  servings: number | null;
  image: string | null;
  url: string | null;
  nutrition: ScrapedNutrition | null;
}

// ---------------------------------------------------------------------------
// ISO 8601 Duration Parser
// ---------------------------------------------------------------------------

/**
 * Parse an ISO 8601 duration string (e.g. "PT1H30M", "PT45M", "PT2H") into
 * total minutes.
 *
 * Supports: P[nY][nM][nW][nD]T[nH][nM][nS]
 * We only care about hours, minutes, and seconds for cooking.
 */
function parseISO8601Duration(duration: string | undefined | null): number | null {
  if (!duration || typeof duration !== "string") return null;

  const match = duration.match(
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );

  if (!match) return null;

  const hours = match[5] ? parseInt(match[5], 10) : 0;
  const minutes = match[6] ? parseInt(match[6], 10) : 0;
  const seconds = match[7] ? parseFloat(match[7]) : 0;
  const days = match[4] ? parseInt(match[4], 10) : 0;
  const weeks = match[3] ? parseInt(match[3], 10) : 0;

  const total = weeks * 7 * 24 * 60 + days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60);

  return total > 0 ? total : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse servings/yield from various recipe schema formats.
 * Handles: "4", "4 servings", "Makes 6", ["6 servings"], etc.
 */
function parseServings(
  value: string | string[] | number | undefined | null
): number | null {
  if (value == null) return null;

  if (typeof value === "number") {
    return value > 0 ? value : null;
  }

  const text = Array.isArray(value) ? value[0] : value;
  if (!text) return null;

  const match = String(text).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract a usable image URL from the schema.org image field, which can be
 * a string, array of strings, or an ImageObject.
 */
function parseImage(
  value: string | string[] | { url?: string } | { url?: string }[] | undefined | null
): string | null {
  if (!value) return null;

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "url" in first) return first.url ?? null;
    return null;
  }

  if (typeof value === "object" && "url" in value) {
    return (value as { url?: string }).url ?? null;
  }

  return null;
}

/**
 * Normalise instructions from the schema.org format. Handles:
 * - A plain string (split by newlines / numbered steps)
 * - An array of strings
 * - An array of HowToStep objects
 * - An array of HowToSection objects containing HowToStep items
 */
function parseInstructions(
  value:
    | string
    | string[]
    | { "@type"?: string; text?: string; itemListElement?: unknown[] }[]
    | undefined
    | null
): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    return splitInstructionText(value);
  }

  if (Array.isArray(value)) {
    const result: string[] = [];
    for (const item of value) {
      if (typeof item === "string") {
        result.push(...splitInstructionText(item));
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;

        // HowToStep
        if (obj.text && typeof obj.text === "string") {
          result.push(obj.text.trim());
        }
        // HowToSection with nested steps
        else if (Array.isArray(obj.itemListElement)) {
          for (const sub of obj.itemListElement) {
            if (sub && typeof sub === "object" && "text" in (sub as Record<string, unknown>)) {
              const text = (sub as Record<string, unknown>).text;
              if (typeof text === "string") {
                result.push(text.trim());
              }
            }
          }
        }
      }
    }
    return result.filter(Boolean);
  }

  return [];
}

/**
 * Split a block of instruction text into individual steps.
 */
function splitInstructionText(text: string): string[] {
  // Split on numbered steps like "1.", "2.", newlines, or <br> tags
  const cleaned = text.replace(/<br\s*\/?>/gi, "\n");

  return cleaned
    .split(/(?:\n|(?<=\.)\s+(?=\d+\.))/g)
    .map((line) => line.replace(/^\d+[\.)]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Clean a raw ingredient string from recipe schemas.
 * Strips HTML tags, normalises whitespace, removes list markers.
 */
function cleanIngredientText(text: string): string {
  return (
    text
      // Strip any HTML tags
      .replace(/<[^>]*>/g, "")
      // Decode common HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Normalise whitespace (tabs, newlines, multiple spaces → single space)
      .replace(/\s+/g, " ")
      // Strip leading list markers (▢, ●, ○, ■, *, -, etc.)
      .replace(
        /^[\-\u2022\u2023\u25E6\u2043\u2219\u25A0\u25A1\u25AA\u25AB\u25CB\u25CF\u25FB\u25FC\u25FD\u25FE\u2610\u2611\u2612\u2713\u2714\u2717\u2718*▢☐]\s*/,
        ""
      )
      .trim()
  );
}

/**
 * Parse ingredients list from schema. Handles array of strings or objects.
 */
function parseIngredients(
  value: string | string[] | unknown[] | undefined | null
): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    return value
      .split(/\n/)
      .map((s) => cleanIngredientText(s))
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return cleanIngredientText(item);
        if (item && typeof item === "object" && "text" in (item as Record<string, unknown>)) {
          return cleanIngredientText(String((item as Record<string, unknown>).text));
        }
        return "";
      })
      .filter(Boolean);
  }

  return [];
}

// ---------------------------------------------------------------------------
// JSON-LD Extraction
// ---------------------------------------------------------------------------

interface JsonLdNutrition {
  calories?: string;
  proteinContent?: string;
  carbohydrateContent?: string;
  fatContent?: string;
}

interface JsonLdRecipe {
  "@type"?: string | string[];
  name?: string;
  recipeIngredient?: unknown;
  recipeInstructions?: unknown;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeYield?: unknown;
  image?: unknown;
  url?: string;
  nutrition?: JsonLdNutrition;
}

/**
 * Extract the leading number from a nutrition string like "240 calories"
 * or "4 grams" or "12g".
 */
function parseNutritionValue(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Parse nutrition data from JSON-LD NutritionInformation.
 */
function parseNutrition(
  nutrition: JsonLdNutrition | undefined | null
): ScrapedNutrition | null {
  if (!nutrition) return null;

  const calories = parseNutritionValue(nutrition.calories);
  const protein_g = parseNutritionValue(nutrition.proteinContent);
  const carbs_g = parseNutritionValue(nutrition.carbohydrateContent);
  const fat_g = parseNutritionValue(nutrition.fatContent);

  // Only return if we got at least one value
  if (calories == null && protein_g == null && carbs_g == null && fat_g == null) {
    return null;
  }

  return { calories, protein_g, carbs_g, fat_g };
}

/**
 * Find Recipe JSON-LD objects from the page. Handles both top-level objects
 * and @graph arrays.
 */
function extractJsonLdRecipes($: cheerio.CheerioAPI): JsonLdRecipe[] {
  const recipes: JsonLdRecipe[] = [];

  $('script[type="application/ld+json"]').each((_i, el) => {
    const text = $(el).text();
    if (!text) return;

    try {
      const data = JSON.parse(text);
      collectRecipesFromJsonLd(data, recipes);
    } catch {
      // Malformed JSON — skip silently
    }
  });

  return recipes;
}

function collectRecipesFromJsonLd(data: unknown, recipes: JsonLdRecipe[]): void {
  if (!data || typeof data !== "object") return;

  if (Array.isArray(data)) {
    for (const item of data) {
      collectRecipesFromJsonLd(item, recipes);
    }
    return;
  }

  const obj = data as Record<string, unknown>;

  // Check if this object itself is a Recipe
  const type = obj["@type"];
  const isRecipe =
    type === "Recipe" ||
    (Array.isArray(type) && type.includes("Recipe"));

  if (isRecipe) {
    recipes.push(obj as unknown as JsonLdRecipe);
    return;
  }

  // Check for @graph containing recipes
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      collectRecipesFromJsonLd(item, recipes);
    }
  }
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

/**
 * Extract recipe data from an HTML string. Looks for JSON-LD schema.org/Recipe
 * data embedded in the page.
 *
 * @param html - Full HTML content of the page.
 * @returns Parsed recipe data, or null if no recipe was found.
 *
 * @example
 * ```ts
 * const html = await fetch("https://example.com/recipe").then(r => r.text());
 * const recipe = scrapeRecipe(html);
 * if (recipe) {
 *   console.log(recipe.name);         // "Chicken Parmesan"
 *   console.log(recipe.ingredients);   // ["2 lbs chicken breast", ...]
 *   console.log(recipe.prepTime);      // 15 (minutes)
 * }
 * ```
 */
export function scrapeRecipe(html: string): ScrapedRecipe | null {
  const $ = cheerio.load(html);
  const jsonLdRecipes = extractJsonLdRecipes($);

  if (jsonLdRecipes.length === 0) {
    return null;
  }

  // Use the first recipe found
  const recipe = jsonLdRecipes[0];

  const name = recipe.name?.trim() ?? "";
  if (!name) return null;

  const ingredients = parseIngredients(recipe.recipeIngredient as string[] | undefined);
  const instructions = parseInstructions(
    recipe.recipeInstructions as string | string[] | { "@type"?: string; text?: string }[] | undefined
  );
  const prepTime = parseISO8601Duration(recipe.prepTime);
  const cookTime = parseISO8601Duration(recipe.cookTime);
  const totalTime = parseISO8601Duration(recipe.totalTime);
  const servings = parseServings(recipe.recipeYield as string | string[] | number | undefined);
  const image = parseImage(
    recipe.image as string | string[] | { url?: string } | undefined
  );
  const url = recipe.url ?? null;

  const nutrition = parseNutrition(recipe.nutrition);

  return {
    name,
    ingredients,
    instructions,
    prepTime,
    cookTime,
    totalTime,
    servings,
    image,
    url,
    nutrition,
  };
}
