import Link from "next/link";
import { Plus } from "lucide-react";

import { getRecipes } from "@/actions/recipes";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { RecipeListClient } from "./recipes-client";

export default async function RecipesPage() {
  const { data: recipes, error } = await getRecipes();

  return (
    <>
      <Header title="Recipes" subtitle="All your saved recipes">
        <Button asChild size="sm">
          <Link href="/recipes/new">
            <Plus className="size-4" />
            Add Recipe
          </Link>
        </Button>
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
