"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Calculator, Loader2 } from "lucide-react";

import type {
  MealType,
  IngredientCategory,
  NutritionInfo,
} from "@/types/database";
import { parseIngredient } from "@/lib/ingredient-parser";
import { convertToGrams } from "@/lib/unit-conversion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IngredientInput } from "@/components/recipes/ingredient-input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngredientFormValues {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: IngredientCategory;
  notes: string | null;
  is_optional: boolean;
  raw_text: string;
  sort_order: number;
}

export interface RecipeFormValues {
  name: string;
  description: string;
  cuisine_type: string;
  protein_type: string;
  meal_type: MealType[];
  prep_time: number | string;
  cook_time: number | string;
  servings: number | string;
  instructions: string;
  tags: string;
  source_url: string;
  image_url: string;
  notes: string;
  is_favorite: boolean;
  ingredients: IngredientFormValues[];
  calories: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
  nutrition_source: "json_ld" | "usda" | "manual" | "";
}

interface RecipeFormProps {
  defaultValues?: Partial<RecipeFormValues>;
  onSubmit: (values: RecipeFormValues) => void;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
];

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
];

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

const EMPTY_INGREDIENT: IngredientFormValues = {
  name: "",
  quantity: null,
  unit: null,
  category: "other",
  notes: null,
  is_optional: false,
  raw_text: "",
  sort_order: 0,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecipeForm({
  defaultValues,
  onSubmit,
  isLoading = false,
}: RecipeFormProps) {
  const [isCalculating, setIsCalculating] = useState(false);

  // Per-ingredient nutrition cache (keyed by lowercase ingredient name)
  const [nutritionCache, setNutritionCache] = useState<
    Map<string, NutritionInfo>
  >(() => new Map());
  const [hasCalculated, setHasCalculated] = useState(false);
  const [needsRecalculate, setNeedsRecalculate] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { register, handleSubmit, control, watch, setValue } =
    useForm<RecipeFormValues>({
      defaultValues: {
        name: "",
        description: "",
        cuisine_type: "",
        protein_type: "",
        meal_type: [],
        prep_time: "",
        cook_time: "",
        servings: "",
        instructions: "",
        tags: "",
        source_url: "",
        image_url: "",
        notes: "",
        is_favorite: false,
        ingredients: [{ ...EMPTY_INGREDIENT, sort_order: 0 }],
        calories: "",
        protein_g: "",
        carbs_g: "",
        fat_g: "",
        nutrition_source: "",
        ...defaultValues,
      },
    });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "ingredients",
  });

  const mealTypeValues = watch("meal_type");
  const watchedIngredients = watch("ingredients");
  const watchedServings = watch("servings");

  function toggleMealType(type: MealType) {
    const current = mealTypeValues ?? [];
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setValue("meal_type", next);
  }

  // ---------------------------------------------------------------------------
  // Client-side recalculation from cache
  // ---------------------------------------------------------------------------

  const recalculateFromCache = useCallback(
    (
      ingredients: IngredientFormValues[],
      servings: number,
      cache: Map<string, NutritionInfo>
    ) => {
      const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
      let hasAny = false;
      let hasMissing = false;

      for (const ing of ingredients) {
        const text = ing.raw_text.trim();
        if (!text) continue;

        const parsed = parseIngredient(text);
        const key = parsed.name.toLowerCase().trim();
        const per100g = cache.get(key);

        if (!per100g) {
          hasMissing = true;
          continue;
        }

        hasAny = true;
        const grams = convertToGrams(parsed.quantity, parsed.unit);
        const scale = grams / 100;

        totals.calories += (per100g.calories ?? 0) * scale;
        totals.protein_g += (per100g.protein_g ?? 0) * scale;
        totals.carbs_g += (per100g.carbs_g ?? 0) * scale;
        totals.fat_g += (per100g.fat_g ?? 0) * scale;
      }

      setNeedsRecalculate(hasMissing);

      if (hasAny) {
        const divisor = Math.max(servings, 1);
        setValue("calories", Math.round(totals.calories / divisor));
        setValue("protein_g", Math.round(totals.protein_g / divisor));
        setValue("carbs_g", Math.round(totals.carbs_g / divisor));
        setValue("fat_g", Math.round(totals.fat_g / divisor));
      }
    },
    [setValue]
  );

  // Auto-recalculate when ingredients or servings change (after first Calculate)
  useEffect(() => {
    if (!hasCalculated || nutritionCache.size === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const servings = Number(watchedServings) || 1;
      recalculateFromCache(watchedIngredients, servings, nutritionCache);
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    watchedIngredients,
    watchedServings,
    hasCalculated,
    nutritionCache,
    recalculateFromCache,
  ]);

  // ---------------------------------------------------------------------------
  // Calculate button handler
  // ---------------------------------------------------------------------------

  async function handleCalculate() {
    const currentIngredients = watch("ingredients");
    const filtered = currentIngredients.filter(
      (ing) => ing.name.trim() || ing.raw_text.trim()
    );
    if (filtered.length === 0) return;

    setIsCalculating(true);
    try {
      const servings = Number(watch("servings")) || 1;

      // Parse each ingredient to get structured data for the API
      const parsedForApi = filtered.map((ing) => {
        const parsed = parseIngredient(ing.raw_text || ing.name);
        return {
          name: parsed.name,
          quantity: parsed.quantity,
          unit: parsed.unit,
        };
      });

      const response = await fetch("/api/nutrition/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: parsedForApi, servings }),
      });

      if (response.ok) {
        const data = await response.json();

        // Update form with totals
        if (data.totals.calories != null)
          setValue("calories", data.totals.calories);
        if (data.totals.protein_g != null)
          setValue("protein_g", data.totals.protein_g);
        if (data.totals.carbs_g != null)
          setValue("carbs_g", data.totals.carbs_g);
        if (data.totals.fat_g != null) setValue("fat_g", data.totals.fat_g);

        // Populate per-ingredient cache from breakdown
        const newCache = new Map(nutritionCache);
        for (const detail of data.ingredients) {
          newCache.set(detail.name.toLowerCase().trim(), detail.per100g);
        }
        setNutritionCache(newCache);
        setHasCalculated(true);
        setNeedsRecalculate(false);
        setValue("nutrition_source", "usda");
      }
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Recipe name */}
      <div className="space-y-2">
        <Label htmlFor="name">Recipe Name *</Label>
        <Input
          id="name"
          placeholder="e.g. Chicken Parmesan"
          {...register("name", { required: true })}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          placeholder="A short tagline — e.g., 'Creamy, aromatic comfort food'"
          {...register("description", { maxLength: 120 })}
        />
      </div>

      {/* Two columns: Cuisine + Protein */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Cuisine Type</Label>
          <Select
            value={watch("cuisine_type") || undefined}
            onValueChange={(v) =>
              setValue("cuisine_type", v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select cuisine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {CUISINE_TYPES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Protein Type</Label>
          <Select
            value={watch("protein_type") || undefined}
            onValueChange={(v) =>
              setValue("protein_type", v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select protein" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {PROTEIN_TYPES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Meal type checkboxes */}
      <div className="space-y-2">
        <Label>Meal Type</Label>
        <div className="flex flex-wrap gap-3">
          {MEAL_TYPES.map((mt) => (
            <label key={mt.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={mealTypeValues?.includes(mt.value) ?? false}
                onCheckedChange={() => toggleMealType(mt.value)}
              />
              {mt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Three columns: Prep, Cook, Servings */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="prep_time">Prep (min)</Label>
          <Input
            id="prep_time"
            type="number"
            min={0}
            placeholder="15"
            {...register("prep_time")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cook_time">Cook (min)</Label>
          <Input
            id="cook_time"
            type="number"
            min={0}
            placeholder="30"
            {...register("cook_time")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="servings">Servings</Label>
          <Input
            id="servings"
            type="number"
            min={1}
            placeholder="4"
            {...register("servings")}
          />
        </div>
      </div>

      {/* Nutrition (per serving) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Nutrition (per serving)</Label>
            {needsRecalculate && hasCalculated && (
              <p className="text-xs text-amber-600">
                New ingredients detected — click Calculate to update
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isCalculating || isLoading}
            onClick={handleCalculate}
          >
            {isCalculating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Calculating...
              </>
            ) : (
              <>
                <Calculator className="size-3.5" />
                Calculate Nutrition
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="calories">Calories</Label>
            <Input
              id="calories"
              type="number"
              min={0}
              placeholder="240"
              {...register("calories")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="protein_g">Protein (g)</Label>
            <Input
              id="protein_g"
              type="number"
              min={0}
              placeholder="20"
              {...register("protein_g")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="carbs_g">Carbs (g)</Label>
            <Input
              id="carbs_g"
              type="number"
              min={0}
              placeholder="30"
              {...register("carbs_g")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fat_g">Fat (g)</Label>
            <Input
              id="fat_g"
              type="number"
              min={0}
              placeholder="10"
              {...register("fat_g")}
            />
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Ingredients</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              append({
                ...EMPTY_INGREDIENT,
                sort_order: fields.length,
              })
            }
          >
            <Plus className="size-3.5" />
            Add ingredient
          </Button>
        </div>

        <div className="space-y-2">
          {fields.map((field, index) => (
            <IngredientInput
              key={field.id}
              index={index}
              register={register}
              remove={remove}
              setValue={setValue}
              categoryValue={watch(`ingredients.${index}.category`)}
              isOptionalValue={watch(`ingredients.${index}.is_optional`)}
            />
          ))}
        </div>

        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No ingredients added yet. Click &quot;Add ingredient&quot; above.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Ingredients with empty names will be removed on save.
        </p>
      </div>

      {/* Instructions */}
      <div className="space-y-2">
        <Label htmlFor="instructions">Instructions</Label>
        <Textarea
          id="instructions"
          placeholder="Enter each step on a new line..."
          rows={6}
          {...register("instructions")}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            One step per line. They will be displayed as numbered steps.
          </p>
          <p className="text-xs text-muted-foreground">
            {(watch("instructions") || "").split("\n").filter((l: string) => l.trim()).length} step{(watch("instructions") || "").split("\n").filter((l: string) => l.trim()).length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          placeholder="quick, weeknight, comfort food"
          {...register("tags")}
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated tags.
        </p>
      </div>

      {/* Source URL + Image URL */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="source_url">Source URL</Label>
          <Input
            id="source_url"
            type="url"
            placeholder="https://..."
            {...register("source_url")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="image_url">Image URL</Label>
          <Input
            id="image_url"
            type="url"
            placeholder="https://..."
            {...register("image_url")}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Any additional notes..."
          rows={3}
          {...register("notes")}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Recipe"}
        </Button>
      </div>
    </form>
  );
}
