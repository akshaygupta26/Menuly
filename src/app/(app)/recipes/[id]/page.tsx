import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Users,
  ExternalLink,
  ChefHat,
  CalendarDays,
  Flame,
} from "lucide-react";
import { format } from "date-fns";

import { getRecipe } from "@/actions/recipes";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { RecipeIngredient, IngredientCategory } from "@/types/database";
import { RecipeDetailClient } from "./recipe-detail-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  produce: "Produce",
  dairy: "Dairy",
  meat: "Meat & Seafood",
  pantry: "Pantry",
  frozen: "Frozen",
  bakery: "Bakery",
  beverages: "Beverages",
  other: "Other",
};

function groupIngredientsByCategory(ingredients: RecipeIngredient[]) {
  const grouped: Partial<Record<IngredientCategory, RecipeIngredient[]>> = {};

  for (const ing of ingredients) {
    const cat = ing.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat]!.push(ing);
  }

  return grouped;
}

function formatIngredient(ing: RecipeIngredient): string {
  const parts: string[] = [];

  if (ing.quantity != null) {
    // Display fractions nicely
    const qty = ing.quantity;
    if (qty === Math.floor(qty)) {
      parts.push(String(qty));
    } else {
      parts.push(qty.toFixed(2).replace(/\.?0+$/, ""));
    }
  }

  if (ing.unit) parts.push(ing.unit);
  parts.push(ing.name);

  let text = parts.join(" ");
  if (ing.notes) text += ` (${ing.notes})`;

  return text;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface RecipeDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({
  params,
}: RecipeDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getRecipe(id);

  if (error || !data) {
    notFound();
  }

  const { recipe, ingredients } = data;
  const totalTime =
    (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0) || null;
  const groupedIngredients = groupIngredientsByCategory(ingredients);

  return (
    <>
      <Header title={recipe.name}>
        <Button asChild variant="ghost" size="sm">
          <Link href="/recipes">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
      </Header>

      <div className="space-y-8">
        {/* Metadata badges */}
        <div className="flex flex-wrap items-center gap-2">
          {recipe.cuisine_type && (
            <Badge variant="secondary">{recipe.cuisine_type}</Badge>
          )}
          {recipe.protein_type && (
            <Badge variant="outline">{recipe.protein_type}</Badge>
          )}
          {recipe.meal_type.map((type) => (
            <Badge key={type} variant="ghost" className="capitalize">
              {type}
            </Badge>
          ))}
          {recipe.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Quick info row */}
        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
          {recipe.prep_time != null && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" />
              Prep: {recipe.prep_time} min
            </span>
          )}
          {recipe.cook_time != null && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" />
              Cook: {recipe.cook_time} min
            </span>
          )}
          {totalTime != null && (
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Clock className="size-4" />
              Total: {totalTime} min
            </span>
          )}
          {recipe.servings != null && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" />
              {recipe.servings} servings
            </span>
          )}
        </div>

        {/* Nutrition badges */}
        {recipe.calories != null && (
          <div className="flex flex-wrap items-center gap-3" role="list" aria-label="Nutrition per serving">
            <span role="listitem" aria-label={`${recipe.calories} calories per serving`} className="inline-flex items-center gap-1.5 rounded-md bg-orange-50 px-2.5 py-1 text-sm font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
              <Flame className="size-3.5" aria-hidden="true" />
              {recipe.calories} kcal
            </span>
            {recipe.protein_g != null && (
              <span role="listitem" aria-label={`${recipe.protein_g} grams protein per serving`} className="rounded-md bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {recipe.protein_g}g protein
              </span>
            )}
            {recipe.carbs_g != null && (
              <span role="listitem" aria-label={`${recipe.carbs_g} grams carbs per serving`} className="rounded-md bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                {recipe.carbs_g}g carbs
              </span>
            )}
            {recipe.fat_g != null && (
              <span role="listitem" aria-label={`${recipe.fat_g} grams fat per serving`} className="rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {recipe.fat_g}g fat
              </span>
            )}
          </div>
        )}

        {/* Times made / last made */}
        {(recipe.times_made > 0 || recipe.last_made_date) && (
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            {recipe.times_made > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <ChefHat className="size-4" />
                Made {recipe.times_made} time
                {recipe.times_made !== 1 ? "s" : ""}
              </span>
            )}
            {recipe.last_made_date && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                Last made{" "}
                {format(new Date(recipe.last_made_date), "MMM d, yyyy")}
              </span>
            )}
          </div>
        )}

        {/* Action buttons (client component) */}
        <RecipeDetailClient recipe={recipe} />

        <Separator />

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Ingredients</h2>
            <div className="space-y-4">
              {Object.entries(groupedIngredients).map(
                ([category, items]) => (
                  <div key={category}>
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                      {CATEGORY_LABELS[category as IngredientCategory]}
                    </h3>
                    <ul className="space-y-1.5">
                      {items!.map((ing) => (
                        <li
                          key={ing.id}
                          className="flex items-start gap-2 text-sm"
                        >
                          <span className="mt-1.5 block size-1.5 shrink-0 rounded-full bg-primary/60" />
                          <span
                            className={
                              ing.is_optional ? "text-muted-foreground" : ""
                            }
                          >
                            {formatIngredient(ing)}
                            {ing.is_optional && (
                              <span className="ml-1.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground align-middle">
                                optional
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* Instructions */}
        {recipe.instructions.length > 0 && (
          <>
            <Separator />
            <section>
              <h2 className="mb-4 text-lg font-semibold">Instructions</h2>
              <ol className="space-y-4">
                {recipe.instructions.map((step, index) => (
                  <li key={index} className="flex gap-3 text-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {index + 1}
                    </span>
                    <p className="pt-0.5 leading-relaxed">{step}</p>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}

        {/* Notes */}
        {recipe.notes && (
          <>
            <Separator />
            <section>
              <h2 className="mb-2 text-lg font-semibold">Notes</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {recipe.notes}
              </p>
            </section>
          </>
        )}

        {/* Source URL */}
        {recipe.source_url && (
          <>
            <Separator />
            <section>
              <h2 className="mb-2 text-lg font-semibold">Source</h2>
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" />
                {new URL(recipe.source_url).hostname}
              </a>
            </section>
          </>
        )}
      </div>
    </>
  );
}
