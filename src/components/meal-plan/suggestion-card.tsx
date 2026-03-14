"use client";

import { Clock, Plus, BookmarkPlus } from "lucide-react";
import type { SuggestedRecipe } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SuggestionCardProps {
  suggestion: SuggestedRecipe;
  onAddToPlan: () => void;
  onAddToRecipes: () => void;
  isAccepting?: boolean;
  showAddToPlan?: boolean;
}

export function SuggestionCard({
  suggestion,
  onAddToPlan,
  onAddToRecipes,
  isAccepting = false,
  showAddToPlan = true,
}: SuggestionCardProps) {
  const totalTime =
    suggestion.estimated_prep_minutes + suggestion.estimated_cook_minutes;
  const { calories, protein_g, carbs_g, fat_g } =
    suggestion.estimated_nutrition;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div>
        <h4 className="font-semibold text-sm leading-tight">
          {suggestion.name}
        </h4>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {suggestion.cuisine_type && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {suggestion.cuisine_type}
            </Badge>
          )}
          {suggestion.protein_type && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {suggestion.protein_type}
            </Badge>
          )}
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Clock className="size-3" />
            {totalTime} min
          </span>
        </div>
      </div>

      {/* Why */}
      {suggestion.why && (
        <p className="text-xs text-muted-foreground italic leading-relaxed">
          {suggestion.why}
        </p>
      )}

      {/* Nutrition */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-medium">
        <span className="text-orange-600 dark:text-orange-400">
          {calories} kcal
        </span>
        <span className="text-blue-600 dark:text-blue-400">
          P {protein_g}g
        </span>
        <span className="text-amber-600 dark:text-amber-400">
          C {carbs_g}g
        </span>
        <span className="text-emerald-600 dark:text-emerald-400">
          F {fat_g}g
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {showAddToPlan && (
          <Button
            size="sm"
            className="flex-1 text-xs"
            onClick={onAddToPlan}
            disabled={isAccepting}
          >
            <Plus className="size-3.5" />
            Add to Plan
          </Button>
        )}
        <Button
          size="sm"
          variant={showAddToPlan ? "outline" : "default"}
          className="flex-1 text-xs"
          onClick={onAddToRecipes}
          disabled={isAccepting}
        >
          <BookmarkPlus className="size-3.5" />
          Add to Recipes
        </Button>
      </div>
    </div>
  );
}
