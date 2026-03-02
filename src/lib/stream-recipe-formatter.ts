// ---------------------------------------------------------------------------
// Partial JSON → structured recipe preview
// ---------------------------------------------------------------------------
// Extracts completed fields from an accumulating JSON string using targeted
// regex. This is intentionally NOT using JSON.parse since the input is
// usually incomplete / truncated mid-stream.
// ---------------------------------------------------------------------------

export interface FormattedRecipe {
  name: string | null;
  cuisine_type: string | null;
  protein_type: string | null;
  prep_time: number | null;
  cook_time: number | null;
  servings: number | null;
  ingredients: string[];
  instructions: string[];
  tags: string[];
  notes: string | null;
}

/** Extract a completed JSON string value for a given key. */
function extractString(json: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "s");
  const m = json.match(re);
  return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : null;
}

/** Extract a completed JSON number value for a given key. */
function extractNumber(json: string, key: string): number | null {
  const re = new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`);
  const m = json.match(re);
  return m ? Number(m[1]) : null;
}

/** Extract all complete quoted strings from a JSON array value. */
function extractStringArray(json: string, key: string): string[] {
  // Find the opening bracket for this key
  const keyIdx = json.indexOf(`"${key}"`);
  if (keyIdx === -1) return [];

  const bracketIdx = json.indexOf("[", keyIdx);
  if (bracketIdx === -1) return [];

  // Grab everything from the bracket onward
  const rest = json.slice(bracketIdx);

  const results: string[] = [];
  // Match complete quoted strings (handles escaped quotes)
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rest)) !== null) {
    results.push(match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'));
  }

  return results;
}

/** Extract raw_text from each complete ingredient object. */
function extractIngredients(json: string): string[] {
  const keyIdx = json.indexOf('"ingredients"');
  if (keyIdx === -1) return [];

  const bracketIdx = json.indexOf("[", keyIdx);
  if (bracketIdx === -1) return [];

  const rest = json.slice(bracketIdx);

  const results: string[] = [];
  // Match complete {...} objects
  const re = /\{[^}]*\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rest)) !== null) {
    // Pull raw_text from the object
    const rawMatch = match[0].match(/"raw_text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (rawMatch) {
      results.push(rawMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'));
    }
  }

  return results;
}

/**
 * Parse an accumulating JSON string from the AI stream into a structured
 * recipe object for preview display. Stateless and idempotent — re-parses
 * from scratch each call.
 */
export function formatPartialRecipeJson(partial: string): FormattedRecipe {
  return {
    name: extractString(partial, "name"),
    cuisine_type: extractString(partial, "cuisine_type"),
    protein_type: extractString(partial, "protein_type"),
    prep_time: extractNumber(partial, "prep_time"),
    cook_time: extractNumber(partial, "cook_time"),
    servings: extractNumber(partial, "servings"),
    ingredients: extractIngredients(partial),
    instructions: extractStringArray(partial, "instructions"),
    tags: extractStringArray(partial, "tags"),
    notes: extractString(partial, "notes"),
  };
}
