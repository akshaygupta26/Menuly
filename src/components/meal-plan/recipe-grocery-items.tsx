"use client";

import { Check } from "lucide-react";
import type { RecipeIngredient } from "@/types/database";
import { cn } from "@/lib/utils";

interface RecipeGroceryItemsProps {
  ingredients: RecipeIngredient[];
  alreadyHaveItems: string[]; // lowercased grocery names
  onToggleAlreadyHave: (groceryName: string) => void;
  isFinalized: boolean; // only show checkboxes when finalized
}

export function RecipeGroceryItems({
  ingredients,
  alreadyHaveItems,
  onToggleAlreadyHave,
  isFinalized,
}: RecipeGroceryItemsProps) {
  if (ingredients.length === 0) return null;

  return (
    <div className="pl-4 pt-1 pb-2">
      {ingredients.map((ingredient, index) => {
        const displayName = ingredient.grocery_name ?? ingredient.name;
        const groceryKey = displayName.toLowerCase();
        const isChecked = alreadyHaveItems.includes(groceryKey);
        const qty = ingredient.grocery_quantity ?? ingredient.quantity;
        const unit = ingredient.grocery_unit ?? ingredient.unit;

        return (
          <div
            key={ingredient.id}
            className="flex items-center gap-2 py-0.5"
            {...(index === 0 ? { "data-onboarding": "already-have" } : {})}
          >
            {isFinalized && (
              <button
                type="button"
                onClick={() => onToggleAlreadyHave(groceryKey)}
                className={cn(
                  "size-4 rounded shrink-0 flex items-center justify-center",
                  isChecked
                    ? "bg-primary/80 text-white"
                    : "border border-muted-foreground/30"
                )}
                aria-label={isChecked ? `Unmark ${displayName}` : `Mark ${displayName} as already have`}
              >
                {isChecked && <Check size={10} />}
              </button>
            )}

            <span
              className={cn(
                "text-xs text-muted-foreground",
                isChecked && "line-through opacity-50"
              )}
            >
              {displayName}
              {qty != null && (
                <span className="text-muted-foreground/70">
                  {" — "}
                  {qty}
                  {unit ? ` ${unit}` : ""}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
