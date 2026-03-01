"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Search, UtensilsCrossed, Pen } from "lucide-react";

import type { MealType } from "@/types/database";
import { getRecipesForPicker } from "@/actions/meal-plans";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PickerRecipe {
  id: string;
  name: string;
  cuisine_type: string | null;
  protein_type: string | null;
  meal_type: MealType[];
}

interface RecipePickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (recipeId: string | null, recipeName: string) => void;
  mealSlot: MealType;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecipePickerDialog({
  open,
  onClose,
  onSelect,
  mealSlot,
}: RecipePickerDialogProps) {
  const [recipes, setRecipes] = useState<PickerRecipe[]>([]);
  const [search, setSearch] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [isPending, startTransition] = useTransition();

  // Fetch recipes when dialog opens
  const fetchRecipes = useCallback(() => {
    startTransition(async () => {
      const { data, error } = await getRecipesForPicker(mealSlot);
      if (!error && data) {
        setRecipes(data);
      }
    });
  }, [mealSlot]);

  useEffect(() => {
    if (open) {
      fetchRecipes();
      setSearch("");
      setIsCustom(false);
      setCustomName("");
    }
  }, [open, fetchRecipes]);

  // Filter recipes by search term
  const filtered = recipes.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  function handlePickRecipe(recipe: PickerRecipe) {
    onSelect(recipe.id, recipe.name);
  }

  function handlePickCustom() {
    const trimmed = customName.trim();
    if (!trimmed) return;
    onSelect(null, trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Pick a Recipe
          </DialogTitle>
          <DialogDescription>
            Choose a recipe for{" "}
            <span className="font-medium capitalize">{mealSlot}</span>, or enter
            a custom name.
          </DialogDescription>
        </DialogHeader>

        {isCustom ? (
          /* ---- Custom entry mode ---- */
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-meal-name">Custom Name</Label>
              <Input
                id="custom-meal-name"
                placeholder="e.g. Eating out, Leftovers, Skip..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handlePickCustom();
                  }
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCustom(false)}
              >
                Back to Recipes
              </Button>
              <Button
                size="sm"
                onClick={handlePickCustom}
                disabled={!customName.trim()}
              >
                Add Custom
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ---- Recipe picker mode ---- */
          <div className="space-y-3">
            {/* Search input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search recipes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {/* Recipe list */}
            <ScrollArea className="h-[300px]">
              {isPending ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  Loading recipes...
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <UtensilsCrossed className="size-8 opacity-40" />
                  <span>
                    {search
                      ? "No recipes match your search."
                      : "No recipes found."}
                  </span>
                </div>
              ) : (
                <div className="space-y-1 pr-3">
                  {filtered.map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => handlePickRecipe(recipe)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {recipe.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {recipe.cuisine_type && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {recipe.cuisine_type}
                            </Badge>
                          )}
                          {recipe.protein_type && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {recipe.protein_type}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-primary font-medium">
                        Pick
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Custom entry toggle */}
            <div className="border-t border-border pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                onClick={() => setIsCustom(true)}
              >
                <Pen className="size-3.5" />
                Enter a custom name instead...
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
