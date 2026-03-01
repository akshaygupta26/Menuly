"use client";

import Link from "next/link";
import { Star, Clock, Users, CalendarDays, Flame } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import type { Recipe } from "@/types/database";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavorite?: (id: string) => void;
}

export function RecipeCard({ recipe, onToggleFavorite }: RecipeCardProps) {
  const totalTime =
    (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0) || null;

  return (
    <Card className="group relative gap-4 py-4 transition-shadow hover:shadow-md">
      <CardHeader className="gap-1.5">
        <CardTitle className="line-clamp-1">
          <Link
            href={`/recipes/${recipe.id}`}
            className="after:absolute after:inset-0"
          >
            {recipe.name}
          </Link>
        </CardTitle>

        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative z-10"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite?.(recipe.id);
            }}
            aria-label={
              recipe.is_favorite
                ? "Remove from favorites"
                : "Add to favorites"
            }
          >
            <Star
              className={cn(
                "size-4 transition-colors",
                recipe.is_favorite
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground"
              )}
            />
          </Button>
        </CardAction>

        <div className="flex flex-wrap gap-1.5">
          {recipe.cuisine_type && (
            <Badge variant="secondary">{recipe.cuisine_type}</Badge>
          )}
          {recipe.protein_type && (
            <Badge variant="outline">{recipe.protein_type}</Badge>
          )}
          {recipe.meal_type.map((meal) => (
            <Badge key={meal} variant="ghost" className="capitalize">
              {meal}
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardFooter className="flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
        {totalTime !== null && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            {totalTime} min
          </span>
        )}

        {recipe.servings !== null && (
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {recipe.servings} servings
          </span>
        )}

        {recipe.calories !== null && (
          <span className="inline-flex items-center gap-1">
            <Flame className="size-3.5" />
            {recipe.calories} kcal
          </span>
        )}

        {recipe.protein_g !== null && (
          <span className="inline-flex items-center gap-1 font-medium">
            P {recipe.protein_g}g
          </span>
        )}

        {recipe.last_made_date && (
          <span className="ml-auto inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDistanceToNow(new Date(recipe.last_made_date), {
              addSuffix: true,
            })}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
