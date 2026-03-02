import Link from "next/link";
import { Plus, Link as LinkIcon } from "lucide-react";

import { getRecipes } from "@/actions/recipes";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { RecipeListClient } from "./recipes-client";

export default async function RecipesPage() {
  const { data: recipes, error } = await getRecipes();

  return (
    <>
      <Header title="Recipes" subtitle="All your saved recipes">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/recipes/import">
              <LinkIcon className="size-4" />
              Import URL
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/recipes/new">
              <Plus className="size-4" />
              Add Recipe
            </Link>
          </Button>
        </div>
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
