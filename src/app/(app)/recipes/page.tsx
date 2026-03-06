import { getRecipes } from "@/actions/recipes";
import { Header } from "@/components/layout/header";
import { RecipeListClient } from "./recipes-client";
import { RecipesHeaderActions } from "./recipes-header-actions";

export default async function RecipesPage() {
  const { data: recipes, error } = await getRecipes();

  return (
    <>
      <Header title="Recipes" subtitle="All your saved recipes">
        <RecipesHeaderActions />
      </Header>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <RecipeListClient recipes={recipes ?? []} />
      )}
    </>
  );
}
