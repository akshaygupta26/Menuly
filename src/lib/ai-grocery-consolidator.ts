import OpenAI from "openai";
import { z } from "zod";
import type { RecipeIngredient, IngredientCategory } from "@/types/database";
import type { GroupedGroceryItems } from "@/lib/grocery-consolidator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecipeMeta {
  id: string;
  name: string;
  servings: number | null;
}

// ---------------------------------------------------------------------------
// Zod schema for AI response validation
// ---------------------------------------------------------------------------

const VALID_CATEGORIES: [IngredientCategory, ...IngredientCategory[]] = [
  "produce",
  "dairy",
  "meat",
  "pantry",
  "frozen",
  "bakery",
  "beverages",
  "other",
];

const GroceryItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  category: z.enum(VALID_CATEGORIES),
  source_recipes: z.array(z.string()),
});

const OutputSchema = z.object({
  items: z.array(GroceryItemSchema).min(1),
});

// ---------------------------------------------------------------------------
// Category ordering (matches grocery-consolidator.ts)
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: IngredientCategory[] = [
  "produce",
  "meat",
  "dairy",
  "bakery",
  "frozen",
  "pantry",
  "beverages",
  "other",
];

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a grocery list consolidator for a meal planning app.
Given a week's recipes with their ingredients, produce one consolidated shopping list.

Rules:
1. Merge identical ingredients even if named differently (e.g., capsicum = bell pepper, coriander = cilantro, eggplant = aubergine).
2. Sum quantities when units are compatible (e.g., 1 cup + 2 cups = 3 cups).
3. Convert units to merge when possible (e.g., 4 tbsp butter + 0.5 cup butter = 0.75 cup butter).
4. Use practical, human-friendly quantities (round to nearest 0.25 or use common fractions like 0.5, 0.25, 0.75).
5. Categorize each item into exactly one of: produce, dairy, meat, pantry, frozen, bakery, beverages, other.
6. For items with no clear quantity (e.g., "salt to taste", "oil for frying"), set quantity and unit to null.
7. NEVER add ingredients that are not present in the input.
8. NEVER omit any ingredient from the input.
9. In source_recipes, list the exact recipe names that use this ingredient.
10. Use clean, title-case names without preparation details (e.g., "Chicken Breast" not "chicken breast, cut into cubes").

Respond ONLY with JSON in this exact format:
{ "items": [{ "name": string, "quantity": number|null, "unit": string|null, "category": string, "source_recipes": string[] }] }`;

function buildUserPrompt(
  recipes: RecipeMeta[],
  ingredients: RecipeIngredient[]
): string {
  // Group ingredients by recipe_id
  const byRecipe = new Map<string, RecipeIngredient[]>();
  for (const ing of ingredients) {
    const list = byRecipe.get(ing.recipe_id) ?? [];
    list.push(ing);
    byRecipe.set(ing.recipe_id, list);
  }

  const sections: string[] = ["Here are the recipes for the week:\n"];

  for (const recipe of recipes) {
    const recipeIngredients = byRecipe.get(recipe.id) ?? [];
    if (recipeIngredients.length === 0) continue;

    const servingsLabel =
      recipe.servings != null ? ` (serves ${recipe.servings})` : "";
    sections.push(`### ${recipe.name}${servingsLabel}`);

    for (const ing of recipeIngredients) {
      // Use raw_text for the most natural representation
      sections.push(`- ${ing.raw_text}`);
    }

    sections.push(""); // blank line between recipes
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Use AI to consolidate recipe ingredients into a grocery list.
 * Throws on any failure — caller should catch and fall back to regex consolidator.
 */
export async function aiConsolidateIngredients(
  recipes: RecipeMeta[],
  ingredients: RecipeIngredient[]
): Promise<GroupedGroceryItems[]> {
  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;

  if (!apiKey || !baseURL || !model) {
    throw new Error("AI environment variables not configured");
  }

  const openai = new OpenAI({ apiKey, baseURL });
  const userPrompt = buildUserPrompt(recipes, ingredients);

  const response = await openai.chat.completions.create({
    model,
    max_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const choice = response.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error("AI response was truncated (max_tokens reached)");
  }

  const content = choice?.message?.content;
  if (!content) {
    throw new Error("AI returned empty response");
  }

  // Parse and validate
  const parsed = JSON.parse(content);
  const validated = OutputSchema.parse(parsed);

  // Build recipe name → id lookup (case-insensitive)
  const nameToId = new Map<string, string>();
  for (const recipe of recipes) {
    nameToId.set(recipe.name.toLowerCase(), recipe.id);
  }

  // Transform AI items into GroupedGroceryItems
  const categoryMap = new Map<IngredientCategory, GroupedGroceryItems>();

  for (const item of validated.items) {
    // Resolve source_recipes to recipe_ids
    const recipeIds: string[] = [];
    for (const recipeName of item.source_recipes) {
      const id = nameToId.get(recipeName.toLowerCase());
      if (id) recipeIds.push(id);
    }

    const category = item.category as IngredientCategory;

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { category, items: [] });
    }

    categoryMap.get(category)!.items.push({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category,
      recipe_ids: recipeIds,
    });
  }

  // Sort categories in standard order, alphabetize items within each
  const grouped: GroupedGroceryItems[] = [];
  for (const cat of CATEGORY_ORDER) {
    const group = categoryMap.get(cat);
    if (group) {
      group.items.sort((a, b) => a.name.localeCompare(b.name));
      grouped.push(group);
    }
  }

  return grouped;
}
