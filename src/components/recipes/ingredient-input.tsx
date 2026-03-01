"use client";

import type { UseFormRegister } from "react-hook-form";
import { Trash2 } from "lucide-react";

import type { IngredientCategory } from "@/types/database";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const INGREDIENT_CATEGORIES: { value: IngredientCategory; label: string }[] = [
  { value: "produce", label: "Produce" },
  { value: "dairy", label: "Dairy" },
  { value: "meat", label: "Meat" },
  { value: "pantry", label: "Pantry" },
  { value: "frozen", label: "Frozen" },
  { value: "bakery", label: "Bakery" },
  { value: "beverages", label: "Beverages" },
  { value: "other", label: "Other" },
];

interface IngredientInputProps {
  index: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  remove: (index: number) => void;
  categories?: { value: string; label: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue?: (name: any, value: any) => void;
  categoryValue?: string;
  isOptionalValue?: boolean;
}

export function IngredientInput({
  index,
  register,
  remove,
  categories = INGREDIENT_CATEGORIES,
  setValue,
  categoryValue,
  isOptionalValue,
}: IngredientInputProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Raw text input - takes most of the space */}
      <Input
        placeholder="e.g. 2 cups flour"
        {...register(`ingredients.${index}.raw_text`)}
        className="flex-1 min-w-0"
      />

      {/* Category select */}
      <Select
        value={categoryValue ?? "other"}
        onValueChange={(value) =>
          setValue?.(`ingredients.${index}.category`, value)
        }
      >
        <SelectTrigger size="sm" className="w-[130px] sm:w-[140px] shrink-0">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((cat) => (
            <SelectItem key={cat.value} value={cat.value}>
              {cat.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Optional checkbox */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Checkbox
          id={`ingredient-optional-${index}`}
          checked={isOptionalValue ?? false}
          onCheckedChange={(checked) =>
            setValue?.(`ingredients.${index}.is_optional`, !!checked)
          }
        />
        <Label
          htmlFor={`ingredient-optional-${index}`}
          className="text-xs text-muted-foreground whitespace-nowrap"
        >
          Optional
        </Label>
      </div>

      {/* Delete button */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => remove(index)}
        aria-label="Remove ingredient"
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
