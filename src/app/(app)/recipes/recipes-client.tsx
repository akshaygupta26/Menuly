"use client";

import { useMemo, useState, useTransition } from "react";
import { UtensilsCrossed } from "lucide-react";
import Link from "next/link";

import type { Recipe, MealType } from "@/types/database";
import { toggleFavorite } from "@/actions/recipes";
import { matchesSearch } from "@/lib/search";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { RecipeCardCompact } from "@/components/recipes/recipe-card-compact";
import { DraftRecipeCard } from "@/components/recipes/draft-recipe-card";
import { useRecipeGeneration } from "@/lib/recipe-generation-context";
import {
  RecipeFiltersBar,
  type RecipeFilters,
} from "@/components/recipes/recipe-filters";
import { Button } from "@/components/ui/button";

interface RecipeListClientProps {
  recipes: Recipe[];
}

const DEFAULT_FILTERS: RecipeFilters = {
  search: "",
  cuisineType: "",
  proteinType: "",
  mealType: "",
  favoritesOnly: false,
};

export function RecipeListClient({ recipes: initial }: RecipeListClientProps) {
  const [recipes, setRecipes] = useState(initial);
  const [filters, setFilters] = useState<RecipeFilters>(DEFAULT_FILTERS);
  const [isPending, startTransition] = useTransition();
  const { drafts } = useRecipeGeneration();
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    const saved = localStorage.getItem("menuly-view-mode");
    return saved === "list" ? "list" : "grid";
  });

  function handleViewModeChange(mode: "grid" | "list") {
    setViewMode(mode);
    localStorage.setItem("menuly-view-mode", mode);
  }

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = recipes;

    if (filters.search) {
      result = result.filter(
        (r) =>
          matchesSearch(r.name, filters.search) ||
          r.tags.some((t) => matchesSearch(t, filters.search))
      );
    }

    if (filters.cuisineType) {
      const ct = filters.cuisineType.toLowerCase();
      result = result.filter(
        (r) => r.cuisine_type?.toLowerCase() === ct
      );
    }

    if (filters.proteinType) {
      const pt = filters.proteinType.toLowerCase();
      result = result.filter(
        (r) => r.protein_type?.toLowerCase() === pt
      );
    }

    if (filters.mealType) {
      result = result.filter((r) =>
        r.meal_type.includes(filters.mealType as MealType)
      );
    }

    if (filters.favoritesOnly) {
      result = result.filter((r) => r.is_favorite);
    }

    return result;
  }, [recipes, filters]);

  function handleToggleFavorite(id: string) {
    // Optimistic update
    setRecipes((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, is_favorite: !r.is_favorite } : r
      )
    );

    startTransition(async () => {
      const { error } = await toggleFavorite(id);
      if (error) {
        // Revert on error
        setRecipes((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, is_favorite: !r.is_favorite } : r
          )
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <RecipeFiltersBar
        filters={filters}
        onChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />

      {/* Result count when filters are active */}
      {(filters.search || filters.cuisineType || filters.proteinType || filters.mealType || filters.favoritesOnly) && filtered.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} of {recipes.length} recipe{recipes.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Draft cards pinned to top of grid */}
      {drafts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drafts.map((draft) => (
            <DraftRecipeCard key={draft.id} draft={draft} />
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <UtensilsCrossed className="size-12 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-foreground">No recipes found</p>
            <p className="text-sm text-muted-foreground">
              {recipes.length === 0
                ? "Add your first recipe to get started."
                : "Try adjusting your filters."}
            </p>
          </div>
          {recipes.length === 0 && (
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link href="/recipes/new">Add Recipe</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/recipes/import">Import from URL</Link>
              </Button>
            </div>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div
          className="grid gap-3 sm:grid-cols-2"
          aria-busy={isPending}
        >
          {filtered.map((recipe) => (
            <RecipeCardCompact
              key={recipe.id}
              recipe={recipe}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </div>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy={isPending}
        >
          {filtered.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
