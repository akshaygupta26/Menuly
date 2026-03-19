"use client";

import { LayoutGrid, List, Search, Star, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CUISINE_TYPES = [
  "Italian",
  "Mexican",
  "Indian",
  "Chinese",
  "Japanese",
  "Thai",
  "Mediterranean",
  "American",
  "Korean",
  "French",
  "Middle Eastern",
  "Other",
] as const;

const PROTEIN_TYPES = [
  "Chicken",
  "Beef",
  "Pork",
  "Fish",
  "Shrimp",
  "Tofu",
  "Paneer",
  "Chickpeas",
  "Lentils",
  "Beans",
  "Eggs",
  "Turkey",
  "Lamb",
  "None/Vegetarian",
] as const;

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

export interface RecipeFilters {
  search: string;
  cuisineType: string;
  proteinType: string;
  mealType: string;
  favoritesOnly: boolean;
}

interface RecipeFiltersProps {
  filters: RecipeFilters;
  onChange: (filters: RecipeFilters) => void;
  viewMode?: "grid" | "list";
  onViewModeChange?: (mode: "grid" | "list") => void;
}

export function RecipeFiltersBar({ filters, onChange, viewMode, onViewModeChange }: RecipeFiltersProps) {
  const hasActiveFilters =
    filters.search ||
    filters.cuisineType ||
    filters.proteinType ||
    filters.mealType ||
    filters.favoritesOnly;

  function updateFilter<K extends keyof RecipeFilters>(
    key: K,
    value: RecipeFilters[K]
  ) {
    onChange({ ...filters, [key]: value });
  }

  function clearFilters() {
    onChange({
      search: "",
      cuisineType: "",
      proteinType: "",
      mealType: "",
      favoritesOnly: false,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search + Favorites toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search recipes..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="pl-9"
          />
        </div>

        <Button
          variant={filters.favoritesOnly ? "default" : "outline"}
          size="sm"
          onClick={() =>
            updateFilter("favoritesOnly", !filters.favoritesOnly)
          }
          aria-label="Toggle favorites only"
        >
          <Star
            className={
              filters.favoritesOnly
                ? "size-4 fill-current"
                : "size-4"
            }
          />
          Favorites
        </Button>

        {onViewModeChange && (
          <div className="flex overflow-hidden rounded-md bg-muted">
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              aria-label="Grid view"
              className={cn(
                "flex items-center justify-center px-2 py-1.5 transition-colors",
                viewMode === "grid"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className={cn("size-4", viewMode === "grid" && "fill-primary/20")} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              aria-label="List view"
              className={cn(
                "flex items-center justify-center px-2 py-1.5 transition-colors",
                viewMode === "list"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className={cn("size-4", viewMode === "list" && "fill-primary/20")} />
            </button>
          </div>
        )}
      </div>

      {/* Selects row */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.cuisineType}
          onValueChange={(v) =>
            updateFilter("cuisineType", v === "__all__" ? "" : v)
          }
        >
          <SelectTrigger size="sm" className={cn("w-[150px]", filters.cuisineType && "border-primary/50 bg-primary/5")}>
            <SelectValue placeholder="Cuisine" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Cuisines</SelectItem>
            {CUISINE_TYPES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.proteinType}
          onValueChange={(v) =>
            updateFilter("proteinType", v === "__all__" ? "" : v)
          }
        >
          <SelectTrigger size="sm" className={cn("w-[150px]", filters.proteinType && "border-primary/50 bg-primary/5")}>
            <SelectValue placeholder="Protein" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Proteins</SelectItem>
            {PROTEIN_TYPES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.mealType}
          onValueChange={(v) =>
            updateFilter("mealType", v === "__all__" ? "" : v)
          }
        >
          <SelectTrigger size="sm" className={cn("w-[140px]", filters.mealType && "border-primary/50 bg-primary/5")}>
            <SelectValue placeholder="Meal type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Meals</SelectItem>
            {MEAL_TYPES.map((m) => (
              <SelectItem key={m} value={m} className="capitalize">
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground transition-all duration-[var(--duration-fast)]"
          >
            <X className="size-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5">
          {filters.cuisineType && (
            <Badge
              variant="secondary"
              className="animate-in fade-in slide-in-from-bottom-1 duration-200 cursor-pointer"
              onClick={() => updateFilter("cuisineType", "")}
            >
              {filters.cuisineType}
              <X className="ml-1 size-3 hover:scale-105 transition-transform" />
            </Badge>
          )}
          {filters.proteinType && (
            <Badge
              variant="secondary"
              className="animate-in fade-in slide-in-from-bottom-1 duration-200 cursor-pointer"
              onClick={() => updateFilter("proteinType", "")}
            >
              {filters.proteinType}
              <X className="ml-1 size-3 hover:scale-105 transition-transform" />
            </Badge>
          )}
          {filters.mealType && (
            <Badge
              variant="secondary"
              className="animate-in fade-in slide-in-from-bottom-1 duration-200 cursor-pointer capitalize"
              onClick={() => updateFilter("mealType", "")}
            >
              {filters.mealType}
              <X className="ml-1 size-3 hover:scale-105 transition-transform" />
            </Badge>
          )}
          {filters.favoritesOnly && (
            <Badge
              variant="secondary"
              className="animate-in fade-in slide-in-from-bottom-1 duration-200 cursor-pointer"
              onClick={() => updateFilter("favoritesOnly", false)}
            >
              Favorites only
              <X className="ml-1 size-3 hover:scale-105 transition-transform" />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
