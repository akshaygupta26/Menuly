import type { IngredientCategory, RecipeIngredient } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input ingredient from a specific recipe. */
export interface ConsolidationInput {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: IngredientCategory;
  recipeId: string;
}

/** Output grocery item (matches GroceryItem shape without DB-generated fields). */
export interface ConsolidatedGroceryItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: IngredientCategory;
  recipe_ids: string[];
}

/** Grocery items grouped by category. */
export interface GroupedGroceryItems {
  category: IngredientCategory;
  items: ConsolidatedGroceryItem[];
}

// ---------------------------------------------------------------------------
// Unit conversion tables
// ---------------------------------------------------------------------------

/** All volumes normalised to teaspoons. */
const VOLUME_TO_TSP: Record<string, number> = {
  tsp: 1,
  tbsp: 3,
  "fl oz": 6,
  cup: 48,
  pint: 96,
  quart: 192,
  gallon: 768,
  ml: 0.202884, // 1 ml ~ 0.2 tsp
  L: 202.884, // 1 L ~ 202.9 tsp
};

/** All weights normalised to grams. */
const WEIGHT_TO_G: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

type UnitFamily = "volume" | "weight" | "other";

function getUnitFamily(unit: string): UnitFamily {
  if (unit in VOLUME_TO_TSP) return "volume";
  if (unit in WEIGHT_TO_G) return "weight";
  return "other";
}

// ---------------------------------------------------------------------------
// Name normalisation
// ---------------------------------------------------------------------------

/** Common plural suffixes to attempt basic singularisation. */
const PLURAL_RULES: [RegExp, string][] = [
  [/ies$/i, "y"], // berries → berry
  [/ves$/i, "f"], // halves → half
  [/oes$/i, "o"], // tomatoes → tomato
  [/ses$/i, "s"], // sauces → sauce (avoid removing trailing 's' from words ending in 'se')
  [/ches$/i, "ch"], // peaches → peach
  [/shes$/i, "sh"], // radishes → radish
  [/xes$/i, "x"], // boxes → box
  [/zes$/i, "z"], // fizzes → fiz (rare but safe)
  [/s$/i, ""], // generic trailing s
];

/** Words that should NOT be singularised (already singular or mass nouns). */
const SINGULAR_EXCEPTIONS = new Set([
  "hummus",
  "couscous",
  "molasses",
  "asparagus",
  "lettuce",
  "rice",
  "sauce",
  "cheese",
  "quinoa",
  "pasta",
  "mozzarella",
  "ricotta",
  "feta",
  "salsa",
  "jus",
  "croutons", // keep as plural in practice
  "oats",
  "grits",
  "lentils",
  "capers",
  "chives",
]);

/**
 * Normalise an ingredient name for grouping:
 * - lowercase
 * - trim whitespace
 * - basic singularisation
 */
function normalizeName(raw: string): string {
  let name = raw.toLowerCase().trim();

  // Remove extra whitespace
  name = name.replace(/\s+/g, " ");

  // Skip singularisation for exception words
  if (SINGULAR_EXCEPTIONS.has(name)) return name;

  // Attempt singularisation on the last word only
  const words = name.split(" ");
  const lastWord = words[words.length - 1];

  if (!SINGULAR_EXCEPTIONS.has(lastWord) && lastWord.length > 2) {
    for (const [pattern, replacement] of PLURAL_RULES) {
      if (pattern.test(lastWord)) {
        words[words.length - 1] = lastWord.replace(pattern, replacement);
        break;
      }
    }
  }

  return words.join(" ");
}

// ---------------------------------------------------------------------------
// Conversion logic
// ---------------------------------------------------------------------------

interface QuantityUnit {
  quantity: number;
  unit: string;
}

/**
 * Pick the most human-friendly display unit for a total expressed in the
 * base unit (tsp for volume, g for weight).
 */
function pickDisplayUnit(totalBase: number, family: "volume" | "weight"): QuantityUnit {
  if (family === "volume") {
    // totalBase is in tsp
    if (totalBase >= 768) return { quantity: round(totalBase / 768), unit: "gallon" };
    if (totalBase >= 192) return { quantity: round(totalBase / 192), unit: "quart" };
    if (totalBase >= 48) return { quantity: round(totalBase / 48), unit: "cup" };
    if (totalBase >= 3) return { quantity: round(totalBase / 3), unit: "tbsp" };
    return { quantity: round(totalBase), unit: "tsp" };
  }

  // family === "weight", totalBase is in g
  if (totalBase >= 1000) return { quantity: round(totalBase / 1000), unit: "kg" };
  if (totalBase >= 453.592) return { quantity: round(totalBase / 453.592), unit: "lb" };
  if (totalBase >= 28.3495) return { quantity: round(totalBase / 28.3495), unit: "oz" };
  return { quantity: round(totalBase), unit: "g" };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

interface AccumulatorEntry {
  displayName: string;
  category: IngredientCategory;
  recipeIds: Set<string>;
  /** Accumulations grouped by unit family + unit. */
  quantities: {
    unit: string | null;
    family: UnitFamily;
    /** Running total in the family's base unit (tsp / g) or raw if "other". */
    baseTotal: number;
    count: number; // how many items had no quantity (for unit-less accumulation)
  }[];
  hasNullQuantity: boolean;
}

/**
 * Consolidate ingredients from multiple recipes into a unified grocery list.
 *
 * - Groups by normalised ingredient name
 * - Sums quantities where units are compatible (volume-to-volume, weight-to-weight)
 * - Converts to human-friendly display units
 * - Groups results by category
 *
 * @param inputs - Array of ingredients from one or more recipes.
 * @returns Grocery items grouped by aisle category.
 *
 * @example
 * ```ts
 * const items = consolidateIngredients([
 *   { name: "chicken breast", quantity: 1, unit: "lb", category: "meat", recipeId: "r1" },
 *   { name: "Chicken Breast", quantity: 0.5, unit: "lb", category: "meat", recipeId: "r2" },
 *   { name: "garlic", quantity: 3, unit: "clove", category: "produce", recipeId: "r1" },
 *   { name: "garlic", quantity: 2, unit: "clove", category: "produce", recipeId: "r2" },
 * ]);
 * // Returns grouped items: chicken breast 1.5 lb, garlic 5 clove
 * ```
 */
export function consolidateIngredients(
  inputs: ConsolidationInput[]
): GroupedGroceryItems[] {
  const map = new Map<string, AccumulatorEntry>();

  for (const input of inputs) {
    const key = normalizeName(input.name);
    let entry = map.get(key);

    if (!entry) {
      entry = {
        displayName: input.name.trim(),
        category: input.category,
        recipeIds: new Set(),
        quantities: [],
        hasNullQuantity: false,
      };
      map.set(key, entry);
    }

    entry.recipeIds.add(input.recipeId);

    if (input.quantity == null) {
      entry.hasNullQuantity = true;
      continue;
    }

    const unit = input.unit;
    const family = unit ? getUnitFamily(unit) : "other";

    if (family === "other" || !unit) {
      // Same-unit accumulation or unit-less
      const existing = entry.quantities.find(
        (q) => q.family === "other" && q.unit === unit
      );
      if (existing) {
        existing.baseTotal += input.quantity;
        existing.count += 1;
      } else {
        entry.quantities.push({
          unit,
          family: "other",
          baseTotal: input.quantity,
          count: 1,
        });
      }
    } else {
      // Convertible unit family
      const conversionTable = family === "volume" ? VOLUME_TO_TSP : WEIGHT_TO_G;
      const factor = conversionTable[unit] ?? 1;
      const baseAmount = input.quantity * factor;

      const existing = entry.quantities.find((q) => q.family === family);
      if (existing) {
        existing.baseTotal += baseAmount;
        existing.count += 1;
      } else {
        entry.quantities.push({
          unit,
          family,
          baseTotal: baseAmount,
          count: 1,
        });
      }
    }
  }

  // Build consolidated items
  const consolidated: ConsolidatedGroceryItem[] = [];

  for (const entry of Array.from(map.values())) {
    if (entry.quantities.length === 0) {
      // Only null-quantity entries (e.g. "salt to taste")
      consolidated.push({
        name: entry.displayName,
        quantity: null,
        unit: null,
        category: entry.category,
        recipe_ids: Array.from(entry.recipeIds),
      });
      continue;
    }

    // For each distinct unit family/unit, emit a grocery item.
    // In most cases there will be exactly one.
    for (const q of entry.quantities) {
      let finalQuantity: number;
      let finalUnit: string | null;

      if (q.family === "volume" || q.family === "weight") {
        const display = pickDisplayUnit(q.baseTotal, q.family);
        finalQuantity = display.quantity;
        finalUnit = display.unit;
      } else {
        finalQuantity = round(q.baseTotal);
        finalUnit = q.unit;
      }

      consolidated.push({
        name: entry.displayName,
        quantity: finalQuantity,
        unit: finalUnit,
        category: entry.category,
        recipe_ids: Array.from(entry.recipeIds),
      });
    }
  }

  // Group by category
  const categoryOrder: IngredientCategory[] = [
    "produce",
    "meat",
    "dairy",
    "bakery",
    "frozen",
    "pantry",
    "beverages",
    "other",
  ];

  const grouped = new Map<IngredientCategory, ConsolidatedGroceryItem[]>();

  for (const item of consolidated) {
    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }

  // Sort items within each category alphabetically
  for (const items of Array.from(grouped.values())) {
    items.sort((a, b) => a.name.localeCompare(b.name));
  }

  return categoryOrder
    .filter((cat) => grouped.has(cat))
    .map((cat) => ({
      category: cat,
      items: grouped.get(cat)!,
    }));
}

/**
 * Convenience function: convert RecipeIngredient[] from a recipe into
 * ConsolidationInput[], attaching the recipe ID.
 */
export function recipeIngredientsToInputs(
  ingredients: RecipeIngredient[],
  recipeId: string
): ConsolidationInput[] {
  return ingredients.map((ing) => ({
    name: ing.name,
    quantity: ing.quantity,
    unit: ing.unit,
    category: ing.category,
    recipeId,
  }));
}
