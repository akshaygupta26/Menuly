const CUISINE_GRADIENTS: Record<string, [string, string]> = {
  indian: ["#d4a574", "#c4956a"],
  italian: ["#8faa84", "#7a9570"],
  mexican: ["#e8c9a8", "#d4b08c"],
  thai: ["#e8d48a", "#d4c070"],
  chinese: ["#c47070", "#b05a5a"],
  japanese: ["#8a8aad", "#7070a0"],
  mediterranean: ["#7aa0b0", "#6090a0"],
  american: ["#8a9aad", "#7080a0"],
};

const FALLBACK_GRADIENT: [string, string] = ["#b0a898", "#a09888"];

export function getCuisineGradient(cuisineType: string | null): [string, string] {
  if (!cuisineType) return FALLBACK_GRADIENT;
  return CUISINE_GRADIENTS[cuisineType.toLowerCase()] ?? FALLBACK_GRADIENT;
}

export function getCuisineGradientStyle(cuisineType: string | null): string {
  const [from, to] = getCuisineGradient(cuisineType);
  return `linear-gradient(135deg, ${from}, ${to})`;
}
