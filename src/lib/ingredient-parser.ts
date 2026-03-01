import type { IngredientCategory } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedIngredient {
  quantity: number | null;
  unit: string | null;
  name: string;
  category: IngredientCategory;
}

// ---------------------------------------------------------------------------
// Unicode fraction map
// ---------------------------------------------------------------------------

const UNICODE_FRACTIONS: Record<string, number> = {
  "\u00BC": 0.25, // 1/4
  "\u00BD": 0.5, // 1/2
  "\u00BE": 0.75, // 3/4
  "\u2150": 1 / 7, // 1/7
  "\u2151": 1 / 9, // 1/9
  "\u2152": 0.1, // 1/10
  "\u2153": 1 / 3, // 1/3
  "\u2154": 2 / 3, // 2/3
  "\u2155": 0.2, // 1/5
  "\u2156": 2 / 5, // 2/5
  "\u2157": 3 / 5, // 3/5
  "\u2158": 4 / 5, // 4/5
  "\u2159": 1 / 6, // 1/6
  "\u215A": 5 / 6, // 5/6
  "\u215B": 1 / 8, // 1/8
  "\u215C": 3 / 8, // 3/8
  "\u215D": 5 / 8, // 5/8
  "\u215E": 7 / 8, // 7/8
};

// ---------------------------------------------------------------------------
// Unit normalisation
// ---------------------------------------------------------------------------

const UNIT_MAP: Record<string, string> = {
  // Teaspoon
  tsp: "tsp",
  tsps: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",

  // Tablespoon
  tbsp: "tbsp",
  tbsps: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbs: "tbsp",
  tbl: "tbsp",

  // Cup
  cup: "cup",
  cups: "cup",

  // Fluid ounce
  "fl oz": "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  floz: "fl oz",

  // Ounce
  oz: "oz",
  ounce: "oz",
  ounces: "oz",

  // Pound
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",

  // Gram
  g: "g",
  gram: "g",
  grams: "g",
  gr: "g",

  // Kilogram
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  kilo: "kg",
  kilos: "kg",

  // Milliliter
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",

  // Liter
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",

  // Miscellaneous countable units
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  bunch: "bunch",
  bunches: "bunch",
  head: "head",
  heads: "head",
  piece: "piece",
  pieces: "piece",
  slice: "slice",
  slices: "slice",
  pinch: "pinch",
  pinches: "pinch",
  dash: "dash",
  dashes: "dash",
  sprig: "sprig",
  sprigs: "sprig",
  stalk: "stalk",
  stalks: "stalk",
  stick: "stick",
  sticks: "stick",
  package: "package",
  packages: "package",
  pkg: "package",
  pint: "pint",
  pints: "pint",
  pt: "pint",
  quart: "quart",
  quarts: "quart",
  qt: "quart",
  gallon: "gallon",
  gallons: "gallon",
  gal: "gallon",
  jar: "jar",
  jars: "jar",
  bag: "bag",
  bags: "bag",
  box: "box",
  boxes: "box",
  bottle: "bottle",
  bottles: "bottle",
  large: "large",
  medium: "medium",
  small: "small",
};

// Sorted longest-first so we match multi-word units before single-word ones
const UNIT_PATTERNS = Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length);

// ---------------------------------------------------------------------------
// Category classification
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: { category: IngredientCategory; keywords: string[] }[] = [
  {
    category: "meat",
    keywords: [
      "chicken",
      "beef",
      "pork",
      "lamb",
      "turkey",
      "bacon",
      "sausage",
      "ham",
      "steak",
      "ground meat",
      "ground beef",
      "ground turkey",
      "ground pork",
      "ground chicken",
      "veal",
      "duck",
      "bison",
      "venison",
      "prosciutto",
      "salami",
      "pepperoni",
      "chorizo",
      "shrimp",
      "salmon",
      "tuna",
      "cod",
      "tilapia",
      "halibut",
      "crab",
      "lobster",
      "scallop",
      "mussel",
      "clam",
      "anchovy",
      "anchovies",
      "sardine",
      "sardines",
      "fish",
      "seafood",
      "mahi",
      "trout",
      "swordfish",
      "catfish",
      "snapper",
      "octopus",
      "squid",
      "calamari",
    ],
  },
  {
    category: "dairy",
    keywords: [
      "milk",
      "cheese",
      "butter",
      "cream",
      "yogurt",
      "yoghurt",
      "sour cream",
      "cream cheese",
      "cottage cheese",
      "ricotta",
      "mozzarella",
      "parmesan",
      "cheddar",
      "feta",
      "gouda",
      "brie",
      "gruyere",
      "swiss cheese",
      "mascarpone",
      "whipping cream",
      "heavy cream",
      "half and half",
      "half-and-half",
      "egg",
      "eggs",
      "ghee",
      "paneer",
      "cottage cheese",
      "cream cheese",
      "whey",
      "curd",
      "dahi",
    ],
  },
  {
    category: "produce",
    keywords: [
      "onion",
      "garlic",
      "tomato",
      "potato",
      "carrot",
      "celery",
      "pepper",
      "bell pepper",
      "jalapeno",
      "jalape\u00F1o",
      "serrano",
      "habanero",
      "chili",
      "chile",
      "lettuce",
      "spinach",
      "kale",
      "arugula",
      "cabbage",
      "broccoli",
      "cauliflower",
      "zucchini",
      "squash",
      "eggplant",
      "mushroom",
      "cucumber",
      "avocado",
      "corn",
      "pea",
      "peas",
      "bean sprout",
      "green bean",
      "asparagus",
      "artichoke",
      "beet",
      "radish",
      "turnip",
      "parsnip",
      "sweet potato",
      "yam",
      "leek",
      "scallion",
      "shallot",
      "chive",
      "cilantro",
      "parsley",
      "basil",
      "mint",
      "dill",
      "rosemary",
      "thyme",
      "oregano",
      "sage",
      "tarragon",
      "ginger",
      "lemongrass",
      "lemon",
      "lime",
      "orange",
      "apple",
      "banana",
      "strawberry",
      "blueberry",
      "raspberry",
      "blackberry",
      "grape",
      "mango",
      "pineapple",
      "peach",
      "pear",
      "plum",
      "cherry",
      "watermelon",
      "cantaloupe",
      "honeydew",
      "kiwi",
      "papaya",
      "coconut",
      "pomegranate",
      "fig",
      "date",
      "cranberry",
      "cranberries",
      "bok choy",
      "watercress",
      "endive",
      "fennel",
      "okra",
      "plantain",
      "jicama",
      "tomatillo",
      "fresh herb",
      "capsicum",
      "green capsicum",
      "red capsicum",
      "methi",
      "fenugreek",
      "curry leaf",
      "curry leaves",
      "drumstick",
      "ridge gourd",
      "bottle gourd",
      "bitter gourd",
      "snake gourd",
      "ivy gourd",
      "pointed gourd",
      "ash gourd",
      "raw banana",
      "green chili",
      "green chilli",
      "red chili",
      "red chilli",
    ],
  },
  {
    category: "frozen",
    keywords: [
      "frozen",
      "ice cream",
      "ice",
      "popsicle",
      "frozen yogurt",
      "frozen vegetable",
      "frozen fruit",
      "frozen pizza",
      "frozen dinner",
      "frozen waffle",
      "frozen pie",
      "sorbet",
      "gelato",
    ],
  },
  {
    category: "bakery",
    keywords: [
      "bread",
      "baguette",
      "roll",
      "bun",
      "croissant",
      "muffin",
      "bagel",
      "pita",
      "tortilla",
      "naan",
      "flatbread",
      "sourdough",
      "ciabatta",
      "focaccia",
      "brioche",
      "cornbread",
    ],
  },
  {
    category: "beverages",
    keywords: [
      "juice",
      "soda",
      "water",
      "coffee",
      "tea",
      "wine",
      "beer",
      "spirit",
      "bourbon",
      "whiskey",
      "vodka",
      "rum",
      "gin",
      "tequila",
      "sake",
      "mirin",
      "sherry",
      "champagne",
      "sparkling water",
      "kombucha",
      "lemonade",
      "cider",
    ],
  },
  {
    category: "pantry",
    keywords: [
      "flour",
      "sugar",
      "salt",
      "pepper",
      "oil",
      "olive oil",
      "vegetable oil",
      "canola oil",
      "coconut oil",
      "sesame oil",
      "vinegar",
      "soy sauce",
      "fish sauce",
      "worcestershire",
      "hot sauce",
      "sriracha",
      "ketchup",
      "mustard",
      "mayonnaise",
      "mayo",
      "honey",
      "maple syrup",
      "molasses",
      "vanilla",
      "extract",
      "baking soda",
      "baking powder",
      "yeast",
      "cornstarch",
      "corn starch",
      "cocoa",
      "chocolate",
      "chocolate chip",
      "rice",
      "pasta",
      "noodle",
      "spaghetti",
      "penne",
      "macaroni",
      "fettuccine",
      "linguine",
      "orzo",
      "couscous",
      "quinoa",
      "oat",
      "oats",
      "oatmeal",
      "cereal",
      "granola",
      "nut",
      "nuts",
      "almond",
      "walnut",
      "pecan",
      "cashew",
      "peanut",
      "pistachio",
      "pine nut",
      "seed",
      "sesame",
      "sunflower",
      "flax",
      "chia",
      "pumpkin seed",
      "dried",
      "canned",
      "can of",
      "broth",
      "stock",
      "bouillon",
      "tomato paste",
      "tomato sauce",
      "marinara",
      "salsa",
      "bean",
      "beans",
      "lentil",
      "lentils",
      "chickpea",
      "chickpeas",
      "black bean",
      "kidney bean",
      "pinto bean",
      "navy bean",
      "white bean",
      "cinnamon",
      "cumin",
      "paprika",
      "turmeric",
      "chili powder",
      "cayenne",
      "nutmeg",
      "cloves",
      "allspice",
      "cardamom",
      "coriander",
      "curry",
      "garam masala",
      "bay leaf",
      "bay leaves",
      "red pepper flake",
      "italian seasoning",
      "taco seasoning",
      "seasoning",
      "spice",
      "raisin",
      "crouton",
      "breadcrumb",
      "panko",
      "gelatin",
      "jam",
      "jelly",
      "preserve",
      "peanut butter",
      "almond butter",
      "tahini",
      "miso",
      "hoisin",
      "teriyaki",
      "barbecue sauce",
      "bbq sauce",
      "ranch",
      "dressing",
      "marinade",
      "carom seed",
      "ajwain",
      "asafoetida",
      "hing",
      "mustard seed",
      "fenugreek seed",
      "kasuri methi",
      "amchur",
      "chaat masala",
      "kitchen king",
      "sambar powder",
      "rasam powder",
      "biryani masala",
      "tandoori masala",
      "panch phoran",
      "nigella seed",
      "kalonji",
      "poppy seed",
      "dhaniya",
      "coriander powder",
      "coriander seed",
      "cumin seed",
      "jeera",
      "red chili powder",
      "kashmiri chili",
      "deggi mirch",
      "black salt",
      "kala namak",
      "jaggery",
      "tamarind",
      "imli",
      "kokum",
      "besan",
      "gram flour",
      "chickpea flour",
      "rice flour",
      "semolina",
      "sooji",
      "rava",
      "poha",
      "flattened rice",
      "urad dal",
      "toor dal",
      "chana dal",
      "moong dal",
      "masoor dal",
      "dal",
      "papad",
      "capers",
      "olive",
      "olives",
      "pickle",
      "pickles",
      "relish",
      "anchovy paste",
      "coconut milk",
      "condensed milk",
      "evaporated milk",
      "powdered sugar",
      "brown sugar",
      "confectioner",
      "corn syrup",
      "agave",
      "stevia",
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replace unicode fraction characters with their decimal values.
 */
function replaceUnicodeFractions(text: string): string {
  let result = text;
  for (const [char, value] of Object.entries(UNICODE_FRACTIONS)) {
    if (result.includes(char)) {
      // Handle cases like "1½" (whole number followed by unicode fraction)
      result = result.replace(
        new RegExp(`(\\d+)\\s*${char}`, "g"),
        (_match, whole) => String(Number(whole) + value)
      );
      // Handle standalone unicode fraction
      result = result.replace(new RegExp(char, "g"), String(value));
    }
  }
  return result;
}

/**
 * Parse a numeric string that may include fractions like "1/2" or "1 1/2".
 * Returns the average for ranges like "2-3".
 */
function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Handle ranges: "2-3", "2 - 3", "2 to 3"
  const rangeMatch = trimmed.match(
    /^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?(?:\s*\/\s*\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?(?:\s*\/\s*\d+)?)$/i
  );
  if (rangeMatch) {
    const low = parseSingleQuantity(rangeMatch[1]);
    const high = parseSingleQuantity(rangeMatch[2]);
    if (low !== null && high !== null) {
      return Math.round(((low + high) / 2) * 1000) / 1000;
    }
  }

  return parseSingleQuantity(trimmed);
}

function parseSingleQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Mixed number: "1 1/2"
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    if (den === 0) return null;
    return whole + num / den;
  }

  // Simple fraction: "1/2"
  const fractionMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const num = Number(fractionMatch[1]);
    const den = Number(fractionMatch[2]);
    if (den === 0) return null;
    return num / den;
  }

  // Plain number (integer or decimal)
  const num = Number(trimmed);
  return isNaN(num) ? null : num;
}

/**
 * Categorise an ingredient name into a grocery aisle category.
 */
function categorize(name: string): IngredientCategory {
  const lower = name.toLowerCase();

  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    for (const keyword of keywords) {
      // Match as a whole word or at word boundaries
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?:^|\\b)${escaped}(?:s|es)?(?:\\b|$)`, "i");
      if (regex.test(lower)) {
        return category;
      }
    }
  }

  return "other";
}

/**
 * Strip content inside parentheses and common descriptor prefixes/suffixes
 * that are not part of the core ingredient name.
 */
function cleanName(raw: string): string {
  let name = raw
    // Remove all parenthetical content (including nested/multiple pairs)
    .replace(/\([^)]*\)/g, "")
    // Remove any remaining stray parentheses
    .replace(/[()]/g, "")
    // Remove leading punctuation like commas from prior processing
    .replace(/^[,;:\-.\s]+/, "")
    // Remove trailing punctuation
    .replace(/[,;:\-.\s]+$/, "")
    .trim();

  // Remove leading "of " when it follows unit extraction: "of chicken"
  name = name.replace(/^of\s+/i, "");

  return name.trim();
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw ingredient string like "2 lbs chicken breast, boneless" into
 * structured data.
 *
 * @param raw - The raw ingredient text from a recipe.
 * @returns A parsed ingredient with quantity, unit, name, and category.
 *
 * @example
 * ```ts
 * parseIngredient("1 1/2 cups all-purpose flour");
 * // { quantity: 1.5, unit: "cup", name: "all-purpose flour", category: "pantry" }
 *
 * parseIngredient("2-3 cloves garlic, minced");
 * // { quantity: 2.5, unit: "clove", name: "garlic", category: "produce" }
 *
 * parseIngredient("salt and pepper to taste");
 * // { quantity: null, unit: null, name: "salt and pepper to taste", category: "pantry" }
 * ```
 */
export function parseIngredient(raw: string): ParsedIngredient {
  let text = raw.trim();

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—");

  // Normalise unicode fractions early
  text = replaceUnicodeFractions(text);

  // Strip leading bullet / dash / list markers (including ▢, ●, ○, ■, □, etc.)
  text = text.replace(
    /^[\-\u2022\u2023\u25E6\u2043\u2219\u25A0\u25A1\u25AA\u25AB\u25CB\u25CF\u25FB\u25FC\u25FD\u25FE\u2610\u2611\u2612\u2713\u2714\u2717\u2718*▢☐]\s*/,
    ""
  );

  // -----------------------------------------------------------------------
  // 1. Extract quantity (leading number, fraction, or range)
  // -----------------------------------------------------------------------
  // Matches: "2", "1.5", "1/2", "1 1/2", "2-3", "2 to 3", "0.25"
  const qtyRegex =
    /^(\d+(?:\.\d+)?\s+\d+\/\d+|\d+(?:\.\d+)?\s*\/\s*\d+|\d+(?:\.\d+)?\s*(?:-|to)\s*\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+(?:\.\d+)?)\s*/i;

  let quantity: number | null = null;
  const qtyMatch = text.match(qtyRegex);

  if (qtyMatch) {
    quantity = parseQuantity(qtyMatch[1]);
    text = text.slice(qtyMatch[0].length);
  }

  // -----------------------------------------------------------------------
  // 2. Extract unit
  // -----------------------------------------------------------------------
  let unit: string | null = null;

  // Try to match known units at the start of the remaining text
  const lowerText = text.toLowerCase();
  for (const pattern of UNIT_PATTERNS) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // For single-character units (g, L), require a period or space/end after — not just a word boundary
    // This prevents "g" from matching inside words like "green" or "garlic"
    const boundary =
      pattern.length === 1 || pattern.length === 2
        ? `\\.?(?:\\s+|,\\s*|$)`
        : `\\.?\\s*`;
    const unitRegex = new RegExp(`^(${escaped})${boundary}`, "i");
    const unitMatch = lowerText.match(unitRegex);
    if (unitMatch) {
      unit = UNIT_MAP[pattern] ?? null;
      text = text.slice(unitMatch[0].length);
      break;
    }
  }

  // -----------------------------------------------------------------------
  // 3. Clean up the ingredient name
  // -----------------------------------------------------------------------
  const name = cleanName(text);

  // If we ended up with an empty name (e.g. "2 cups"), fall back to raw
  const finalName = name || raw.trim();

  // -----------------------------------------------------------------------
  // 4. Categorize
  // -----------------------------------------------------------------------
  const category = categorize(finalName);

  return {
    quantity,
    unit,
    name: finalName,
    category,
  };
}
