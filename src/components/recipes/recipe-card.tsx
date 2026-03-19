"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import type { Recipe } from "@/types/database";
import { cn } from "@/lib/utils";
import { getCuisineGradientStyle } from "@/lib/cuisine-colors";
import { navigateWithTransition } from "@/lib/view-transitions";

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavorite?: (id: string) => void;
}

export function RecipeCard({ recipe, onToggleFavorite }: RecipeCardProps) {
  const [animating, setAnimating] = useState(false);
  const router = useRouter();

  const totalTime =
    (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0) || null;

  const metadataItems: string[] = [];
  if (totalTime !== null) metadataItems.push(`${totalTime} min`);
  if (recipe.servings !== null) metadataItems.push(`${recipe.servings} servings`);
  if (recipe.calories !== null) metadataItems.push(`${recipe.calories} kcal`);

  function handleFavoriteClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.(recipe.id);
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);
  }

  return (
    <div className="interactive-lift overflow-hidden rounded-[10px] bg-card text-card-foreground shadow-sm">
      <Link
        href={`/recipes/${recipe.id}`}
        className="block"
        onClick={(e) => {
          if (typeof document !== "undefined" && "startViewTransition" in document) {
            e.preventDefault();
            navigateWithTransition(`/recipes/${recipe.id}`, router);
          }
        }}
      >
        {/* Image section */}
        <div className="relative aspect-[16/9]" style={{ viewTransitionName: "recipe-image" }}>
          {recipe.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.image_url}
              alt={recipe.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{ background: getCuisineGradientStyle(recipe.cuisine_type ?? null) }}
            />
          )}

          {/* Favorite button */}
          <button
            type="button"
            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors hover:bg-white"
            onClick={handleFavoriteClick}
            aria-label={recipe.is_favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star
              className={cn(
                "size-4 transition-colors",
                recipe.is_favorite
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground",
                animating && "animate-heart-bounce"
              )}
            />
          </button>

          {/* Last made pill */}
          {recipe.last_made_date && (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
              {formatDistanceToNow(new Date(recipe.last_made_date), {
                addSuffix: true,
              })}
            </span>
          )}
        </div>

        {/* Content section */}
        <div className="p-4">
          <p className="font-semibold text-base leading-tight" style={{ viewTransitionName: "recipe-title" }}>{recipe.name}</p>

          {recipe.description && (
            <p className="mt-1 line-clamp-1 text-sm italic text-muted-foreground">
              {recipe.description}
            </p>
          )}

          {metadataItems.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3 text-xs text-muted-foreground">
              {metadataItems.map((item, i) => (
                <span key={item} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground/50">·</span>}
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
