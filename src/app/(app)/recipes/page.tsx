import { getRecipes } from "@/actions/recipes";
import { Header } from "@/components/layout/header";
import { PageGuide, PageGuideHelpIcon } from "@/components/onboarding/page-guide";
import { RecipeListClient } from "./recipes-client";
import { RecipesHeaderActions } from "./recipes-header-actions";
import { DiscoverSection } from "@/components/recipes/discover-section";
import { QuickBar } from "@/components/recipes/quick-bar";

export default async function RecipesPage() {
  const { data: recipes, error } = await getRecipes();

  return (
    <div className="animate-page-enter">
      <Header title="Recipes" subtitle="All your saved recipes">
        <PageGuideHelpIcon page="recipes" />
        <RecipesHeaderActions />
      </Header>
      <PageGuide page="recipes" />

      <QuickBar />

      <DiscoverSection />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <RecipeListClient recipes={recipes ?? []} />
      )}
    </div>
  );
}
