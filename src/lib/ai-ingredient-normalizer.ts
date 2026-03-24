import OpenAI from "openai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schema for AI response validation
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = [
  "produce",
  "dairy",
  "meat",
  "pantry",
  "frozen",
  "bakery",
  "beverages",
  "other",
] as const;

const NormalizedItemSchema = z.object({
  grocery_name: z.string().min(1),
  grocery_quantity: z.number().nullable(),
  grocery_unit: z.string().nullable(),
  grocery_category: z.enum(VALID_CATEGORIES),
});

const OutputSchema = z.object({
  items: z.array(NormalizedItemSchema).min(1),
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an ingredient normalizer for a grocery list app.
Given a numbered list of raw recipe ingredients, normalize each one into a clean grocery item.

Rules:
1. Use clean, title-case names without preparation details (e.g., "Garlic" not "garlic, minced"; "Chicken Breast" not "chicken breast, cut into cubes").
2. Standardize units to common grocery units: cup, tbsp, tsp, oz, lb, g, kg, ml, l, clove, can, bunch, piece, slice, or null if no unit applies.
3. Categorize each item into exactly one of: produce, dairy, meat, pantry, frozen, bakery, beverages, other.
4. For items with no clear quantity (e.g., "salt to taste", "oil for frying"), set grocery_quantity and grocery_unit to null.
5. Return items in EXACTLY the same order as the input — one output item per input item, no more, no less.
6. Do NOT merge or split ingredients. Every input line maps to exactly one output item.
7. Use consistent naming across items (always "Bell Pepper" not sometimes "Capsicum"; always "Cilantro" not sometimes "Coriander").

Respond ONLY with JSON in this exact format:
{ "items": [{ "grocery_name": string, "grocery_quantity": number|null, "grocery_unit": string|null, "grocery_category": string }] }`;

function buildUserPrompt(
  ingredients: { id: string; raw_text: string }[]
): string {
  const lines = ingredients.map(
    (ing, idx) => `${idx + 1}. ${ing.raw_text}`
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Use AI to normalize raw recipe ingredient text into clean grocery fields.
 * Throws on any failure — the caller wraps in try/catch and treats failure as non-blocking.
 */
export async function normalizeIngredients(
  ingredients: { id: string; raw_text: string }[]
): Promise<
  {
    id: string;
    grocery_name: string;
    grocery_quantity: number | null;
    grocery_unit: string | null;
    grocery_category: string;
  }[]
> {
  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;

  if (!apiKey || !baseURL || !model) {
    throw new Error("AI environment variables not configured");
  }

  if (ingredients.length === 0) {
    return [];
  }

  const openai = new OpenAI({ apiKey, baseURL });
  const userPrompt = buildUserPrompt(ingredients);

  const response = await openai.chat.completions.create({
    model,
    max_tokens: 4096,
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
  const parsed = JSON.parse(content) as unknown;
  const validated = OutputSchema.parse(parsed);

  if (validated.items.length < ingredients.length) {
    throw new Error(
      `AI returned ${validated.items.length} items but expected ${ingredients.length}`
    );
  }

  // Map validated items back to input IDs by index order
  return ingredients.map((ing, idx) => {
    const item = validated.items[idx];
    return {
      id: ing.id,
      grocery_name: item.grocery_name,
      grocery_quantity: item.grocery_quantity,
      grocery_unit: item.grocery_unit,
      grocery_category: item.grocery_category,
    };
  });
}
