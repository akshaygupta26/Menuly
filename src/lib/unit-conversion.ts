// ---------------------------------------------------------------------------
// Unit → grams conversion (shared between server & client)
// ---------------------------------------------------------------------------

const UNIT_TO_GRAMS: Record<string, number> = {
  // Volume (approximate for water-density ingredients)
  cup: 240,
  cups: 240,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  "fl oz": 30,
  "fluid ounce": 30,
  "fluid ounces": 30,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  // Weight
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
};

/**
 * Convert a quantity + unit to grams. Falls back to treating quantity as
 * "count" with an assumed 100g per item when the unit is unknown.
 */
export function convertToGrams(
  quantity: number | null,
  unit: string | null
): number {
  const qty = quantity ?? 1;

  if (!unit) {
    // No unit = assume "1 item ≈ 100g" as a rough default
    return qty * 100;
  }

  const normalised = unit.toLowerCase().trim();
  const factor = UNIT_TO_GRAMS[normalised];

  if (factor !== undefined) {
    return qty * factor;
  }

  // Unknown unit — treat as count × 100g
  return qty * 100;
}
