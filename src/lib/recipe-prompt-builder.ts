export interface UserPreferences {
  topCuisines: string[];
  topProteins: string[];
  topMealTypes: string[];
  commonTags: string[];
  existingRecipeNames: string[];
}

export interface RecipePromptContext {
  cuisinePreference?: string;
  dietaryRestrictions?: string[];
  servings?: number;
  userPreferences?: UserPreferences;
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export function buildRecipePrompt(
  userInput: string,
  context?: RecipePromptContext
): BuiltPrompt {
  const servings = context?.servings ?? 4;
  const prefs = context?.userPreferences;

  let preferencesBlock = "";
  if (prefs) {
    const parts: string[] = [];

    if (prefs.topCuisines.length > 0) {
      parts.push(
        `- The user frequently cooks: ${prefs.topCuisines.join(", ")} cuisine. Lean toward these styles when the prompt is open-ended.`
      );
    }
    if (prefs.topProteins.length > 0) {
      parts.push(
        `- Preferred proteins: ${prefs.topProteins.join(", ")}. Use these when the prompt doesn't specify a protein.`
      );
    }
    if (prefs.topMealTypes.length > 0) {
      parts.push(
        `- Most-cooked meal types: ${prefs.topMealTypes.join(", ")}.`
      );
    }
    if (prefs.commonTags.length > 0) {
      parts.push(
        `- Common recipe tags in their library: ${prefs.commonTags.join(", ")}. Consider these when choosing recipe style.`
      );
    }
    if (prefs.existingRecipeNames.length > 0) {
      parts.push(
        `- The user already has these recipes: ${prefs.existingRecipeNames.join(", ")}. Generate something DIFFERENT — do not duplicate or closely replicate any of these.`
      );
    }

    if (parts.length > 0) {
      preferencesBlock = `\n\nUser Preferences (learned from their recipe library):\n${parts.join("\n")}`;
    }
  }

  const systemPrompt = `You are a professional recipe developer. Given a user's freeform input (ingredients they have, a dish idea, or dietary constraints), generate a complete recipe.

Return ONLY a raw JSON object (no markdown, no code fences, no explanation) matching this exact schema:

{
  "name": "string — recipe title",
  "cuisine_type": "string | null — one of: italian, mexican, indian, chinese, japanese, thai, mediterranean, american, french, korean, vietnamese, middle_eastern, greek, spanish, ethiopian, caribbean, british, german, brazilian, other",
  "protein_type": "string | null — one of: chicken, beef, pork, fish, shrimp, tofu, paneer, chickpeas, lentils, lamb, turkey, eggs, beans, none, other",
  "meal_type": ["array of: breakfast, lunch, dinner, snack"],
  "prep_time": "number | null — minutes",
  "cook_time": "number | null — minutes",
  "servings": ${servings},
  "instructions": ["array of step strings — imperative mood, concise"],
  "tags": ["array of short tag strings, e.g. quick, one-pot, spicy"],
  "notes": "string | null — any tips, storage notes, or variations",
  "ingredients": [
    {
      "raw_text": "string — e.g. '2 cups all-purpose flour'",
      "name": "string — just the ingredient name, e.g. 'all-purpose flour'",
      "quantity": "number | null",
      "unit": "string | null — e.g. cup, tbsp, tsp, g, oz, lb, ml, whole, clove, etc.",
      "category": "one of: produce, dairy, meat, pantry, frozen, bakery, beverages, other",
      "notes": "string | null — e.g. 'diced', 'room temperature'",
      "is_optional": false
    }
  ],
  "calories": null,
  "protein_g": null,
  "carbs_g": null,
  "fat_g": null
}

Rules:
- Provide your best estimate for nutrition fields (calories, protein_g, carbs_g, fat_g) as integers per serving. If unsure, leave as null.
- Default servings to ${servings} unless the user specifies otherwise.
- Use metric-friendly units where sensible, but respect common cooking conventions (cups for flour, etc.).
- Put preparation details (e.g. "diced", "minced") in the ingredient "notes" field, NOT in "name".
- Every ingredient MUST have a "raw_text" that reads naturally (e.g. "2 cups all-purpose flour").
- Instructions should be numbered implicitly by array order — do not prefix with "1.", "Step 1", etc.
- If the user mentions specific ingredients, use ALL of them in the recipe.${preferencesBlock}`;

  let userPrompt = userInput.trim();

  if (context?.cuisinePreference) {
    userPrompt += `\n\nPreferred cuisine: ${context.cuisinePreference}`;
  }

  if (context?.dietaryRestrictions?.length) {
    userPrompt += `\n\nDietary restrictions: ${context.dietaryRestrictions.join(", ")}`;
  }

  return { systemPrompt, userPrompt };
}
