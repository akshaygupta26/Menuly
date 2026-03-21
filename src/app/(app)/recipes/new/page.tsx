"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { createRecipe } from "@/actions/recipes";
import { parseIngredient } from "@/lib/ingredient-parser";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  RecipeForm,
  type RecipeFormValues,
} from "@/components/recipes/recipe-form";
import type { IngredientCategory, MealType } from "@/types/database";

export default function NewRecipePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Read AI-generated recipe from sessionStorage (set by DraftRecipeCard)
  const aiDefaults = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("ai-generated-recipe");
      if (!raw) return undefined;
      sessionStorage.removeItem("ai-generated-recipe");
      return JSON.parse(raw) as Partial<RecipeFormValues>;
    } catch {
      return undefined;
    }
  }, []);

  async function handleSubmit(values: RecipeFormValues) {
    setIsLoading(true);

    try {
      // Parse ingredients from raw text
      const ingredients = values.ingredients
        .filter((ing) => ing.raw_text.trim())
        .map((ing, index) => {
          const parsed = parseIngredient(ing.raw_text);
          return {
            name: parsed.name,
            quantity: parsed.quantity,
            unit: parsed.unit,
            category: (ing.category !== "other"
              ? ing.category
              : parsed.category) as IngredientCategory,
            notes: ing.notes,
            is_optional: ing.is_optional,
            raw_text: ing.raw_text,
            sort_order: index,
          };
        });

      // Parse instructions from multiline text
      const instructions = values.instructions
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      // Parse tags from comma-separated string
      const tags = values.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const hasNutrition =
        values.calories || values.protein_g || values.carbs_g || values.fat_g;

      const { data, error } = await createRecipe({
        recipe: {
          name: values.name,
          description: values.description || null,
          cuisine_type: values.cuisine_type || null,
          protein_type: values.protein_type || null,
          meal_type: values.meal_type as MealType[],
          prep_time: values.prep_time ? Number(values.prep_time) : null,
          cook_time: values.cook_time ? Number(values.cook_time) : null,
          servings: values.servings ? Number(values.servings) : null,
          instructions,
          tags,
          is_favorite: values.is_favorite,
          source_url: values.source_url || null,
          image_url: values.image_url || null,
          notes: values.notes || null,
          calories: values.calories ? Number(values.calories) : null,
          protein_g: values.protein_g ? Number(values.protein_g) : null,
          carbs_g: values.carbs_g ? Number(values.carbs_g) : null,
          fat_g: values.fat_g ? Number(values.fat_g) : null,
          nutrition_source: hasNutrition
            ? (values.nutrition_source || "manual")
            : null,
        },
        ingredients,
      });

      if (error) {
        toast.error(error);
        return;
      }

      toast.success("Recipe created!");
      router.push(`/recipes/${data!.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create recipe. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Header title="Add Recipe">
        <Button asChild variant="ghost" size="sm">
          <Link href="/recipes">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
      </Header>

      <RecipeForm
        key={aiDefaults ? "ai" : "blank"}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        defaultValues={aiDefaults}
      />
    </>
  );
}
