"use client";

import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { Recipe } from "@/types/database";
import { getCuisineGradientStyle } from "@/lib/cuisine-colors";

interface RecipeCardCompactProps {
  recipe: Recipe;
  onToggleFavorite?: (id: string) => void;
}

export function RecipeCardCompact({ recipe, onToggleFavorite }: RecipeCardCompactProps) {
  const totalTime =
    (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0) || null;

  return (
    <Card className="flex items-center gap-3 p-3 transition-all duration-[var(--duration-fast)] hover:shadow-md"
      style={{ transitionTimingFunction: "var(--ease-out)" }}
    >
      {/* Thumbnail */}
      <Link href={`/recipes/${recipe.id}`} className="shrink-0">
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.name}
            className="h-[60px] w-[60px] rounded-md object-cover"
          />
        ) : (
          <div
            className="h-[60px] w-[60px] rounded-md"
            style={{ background: getCuisineGradientStyle(recipe.cuisine_type) }}
          />
        )}
      </Link>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <Link href={`/recipes/${recipe.id}`} className="block">
          <p className="truncate font-semibold text-sm">{recipe.name}</p>
        </Link>
        <p className="text-xs text-muted-foreground">
          {[recipe.cuisine_type, recipe.protein_type, totalTime ? `${totalTime}m` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-1 flex gap-1.5">
          {recipe.calories && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {Math.round(recipe.calories)} cal
            </Badge>
          )}
          {recipe.protein_g && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {Math.round(recipe.protein_g)}g protein
            </Badge>
          )}
        </div>
      </div>

      {/* Favorite */}
      {onToggleFavorite && (
        <button
          onClick={() => onToggleFavorite(recipe.id)}
          className="shrink-0 p-1 transition-transform duration-[var(--duration-fast)] active:scale-[0.9]"
        >
          <Star
            className={`h-4 w-4 ${recipe.is_favorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
          />
        </button>
      )}
    </Card>
  );
}
