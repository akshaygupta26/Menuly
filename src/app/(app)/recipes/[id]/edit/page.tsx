import { notFound } from "next/navigation";

import { getRecipe } from "@/actions/recipes";
import { Header } from "@/components/layout/header";
import { EditRecipeClient } from "./edit-client";

interface EditRecipePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditRecipePage({
  params,
}: EditRecipePageProps) {
  const { id } = await params;
  const { data, error } = await getRecipe(id);

  if (error || !data) {
    notFound();
  }

  const { recipe, ingredients } = data;

  // Convert recipe + ingredients into form default values
  const defaultValues = {
    name: recipe.name,
    cuisine_type: recipe.cuisine_type ?? "",
    protein_type: recipe.protein_type ?? "",
    meal_type: recipe.meal_type,
    prep_time: recipe.prep_time ?? ("" as const),
    cook_time: recipe.cook_time ?? ("" as const),
    servings: recipe.servings ?? ("" as const),
    instructions: recipe.instructions.join("\n"),
    tags: recipe.tags.join(", "),
    source_url: recipe.source_url ?? "",
    image_url: recipe.image_url ?? "",
    notes: recipe.notes ?? "",
    is_favorite: recipe.is_favorite,
    ingredients: ingredients.map((ing) => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
      notes: ing.notes,
      is_optional: ing.is_optional,
      raw_text: ing.raw_text,
      sort_order: ing.sort_order,
    })),
    calories: recipe.calories ?? ("" as const),
    protein_g: recipe.protein_g ?? ("" as const),
    carbs_g: recipe.carbs_g ?? ("" as const),
    fat_g: recipe.fat_g ?? ("" as const),
  };

  return (
    <>
      <Header title="Edit Recipe" subtitle={recipe.name} />
      <EditRecipeClient recipeId={recipe.id} defaultValues={defaultValues} />
    </>
  );
}
