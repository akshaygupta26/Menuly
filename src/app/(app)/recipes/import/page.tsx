"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { createRecipe } from "@/actions/recipes";
import { parseIngredient } from "@/lib/ingredient-parser";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ImportUrlForm,
  type ImportedRecipeData,
} from "@/components/recipes/import-url-form";
import {
  RecipeForm,
  type RecipeFormValues,
  type IngredientFormValues,
} from "@/components/recipes/recipe-form";
import type { IngredientCategory, MealType } from "@/types/database";

export default function ImportRecipePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [importedDefaults, setImportedDefaults] =
    useState<Partial<RecipeFormValues> | null>(null);
  const [importedNutritionSource, setImportedNutritionSource] = useState<
    "json_ld" | "usda" | null
  >(null);

  function handleImport(data: ImportedRecipeData) {
    // Convert imported data into RecipeForm default values
    const ingredients: IngredientFormValues[] = data.ingredients.map(
      (ing, index) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: (ing.category || "other") as IngredientCategory,
        notes: null,
        is_optional: false,
        raw_text: ing.raw_text,
        sort_order: index,
      })
    );

    setImportedDefaults({
      name: data.name,
      instructions: data.instructions.join("\n"),
      prep_time: data.prepTime ?? "",
      cook_time: data.cookTime ?? "",
      servings: data.servings ?? "",
      source_url: data.url,
      image_url: data.image ?? "",
      ingredients:
        ingredients.length > 0
          ? ingredients
          : [
              {
                name: "",
                quantity: null,
                unit: null,
                category: "other",
                notes: null,
                is_optional: false,
                raw_text: "",
                sort_order: 0,
              },
            ],
      calories: data.nutrition?.calories ?? "",
      protein_g: data.nutrition?.protein_g ?? "",
      carbs_g: data.nutrition?.carbs_g ?? "",
      fat_g: data.nutrition?.fat_g ?? "",
      nutrition_source: data.nutrition_source ?? "",
    });

    setImportedNutritionSource(data.nutrition_source);
    toast.success("Recipe imported! Review and save below.");
  }

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
            ? (values.nutrition_source || importedNutritionSource || "manual")
            : null,
        },
        ingredients,
      });

      if (error) {
        toast.error(error);
        return;
      }

      toast.success("Recipe saved!");
      router.push(`/recipes/${data!.id}`);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Header title="Import Recipe" subtitle="Import a recipe from any URL">
        <Button asChild variant="ghost" size="sm">
          <Link href="/recipes">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
      </Header>

      <div className="space-y-6">
        <ImportUrlForm onImport={handleImport} />

        {importedDefaults && (
          <>
            <Separator />
            <div>
              <h2 className="mb-4 text-lg font-semibold">
                Review &amp; Save
              </h2>
              <RecipeForm
                key={importedDefaults.name}
                defaultValues={importedDefaults}
                onSubmit={handleSubmit}
                isLoading={isLoading}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
