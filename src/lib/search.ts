/**
 * Create a case-insensitive regex from user input.
 * Falls back to escaped literal matching if the input is not valid regex.
 */
export function createSearchRegex(query: string): RegExp {
  try {
    return new RegExp(query, "i");
  } catch {
    // Escape special regex characters and match literally
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "i");
  }
}

/**
 * Test if a string matches the search query using regex.
 */
export function matchesSearch(text: string | null | undefined, query: string): boolean {
  if (!text) return false;
  return createSearchRegex(query).test(text);
}
