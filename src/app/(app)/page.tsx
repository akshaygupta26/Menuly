import Link from "next/link";
import { startOfWeek, format, endOfWeek } from "date-fns";
import {
  CalendarDays,
  UtensilsCrossed,
  ShoppingCart,
  Plus,
  Heart,
  ArrowRight,
  CheckCircle2,
  Circle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/header";
import { PageGuide, PageGuideHelpIcon } from "@/components/onboarding/page-guide";
import { getRecipes } from "@/actions/recipes";
import { getMealPlan } from "@/actions/meal-plans";
import { getActiveGroceryList } from "@/actions/grocery";

export default async function DashboardPage() {
  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const sunday = endOfWeek(today, { weekStartsOn: 1 });
  const weekStart = format(monday, "yyyy-MM-dd");
  const weekLabel = `${format(monday, "MMM d")} - ${format(sunday, "MMM d")}`;

  // Fetch all data in parallel
  const [recipesResult, mealPlanResult, groceryResult] = await Promise.all([
    getRecipes(),
    getMealPlan(weekStart),
    getActiveGroceryList(),
  ]);

  const recipes = recipesResult.data ?? [];
  const mealPlan = mealPlanResult.data;
  const groceryData = groceryResult.data;

  // Compute stats
  const totalRecipes = recipes.length;
  const favoriteCount = recipes.filter((r) => r.is_favorite).length;

  const filledSlots = mealPlan?.items.length ?? 0;
  const totalSlots = 7 * 3; // 7 days x 3 meals (breakfast, lunch, dinner)
  const planStatus = mealPlan?.status ?? "draft";

  const groceryItems = groceryData?.items ?? [];
  const groceryTotal = groceryItems.length;
  const groceryChecked = groceryItems.filter((i) => i.is_checked).length;
  const hasActiveGroceryList = groceryData != null && groceryTotal > 0;

  return (
    <>
      <Header
        title="Welcome to Menuly"
        subtitle="Your weekly meal planning hub"
      >
        <PageGuideHelpIcon page="dashboard" />
      </Header>
      <PageGuide page="dashboard" />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* This Week's Plan */}
        <Card data-onboarding="plan-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-primary" />
              <CardTitle>This Week&apos;s Plan</CardTitle>
            </div>
            <CardDescription>{weekLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge
                variant={planStatus === "finalized" ? "default" : "secondary"}
              >
                {planStatus === "finalized" ? "Finalized" : "Draft"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Meals filled</span>
              <span className="text-sm font-medium">
                {filledSlots} / {totalSlots}
              </span>
            </div>
            {/* Simple progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${totalSlots > 0 ? (filledSlots / totalSlots) * 100 : 0}%`,
                }}
              />
            </div>
            <Button variant="outline" size="sm" asChild className="w-full">
              <Link href="/plan">
                View Meal Plan
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recipe Collection */}
        <Card data-onboarding="recipe-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="size-5 text-primary" />
              <CardTitle>Recipe Collection</CardTitle>
            </div>
            <CardDescription>Your saved recipes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total recipes</span>
              <span className="text-sm font-medium">{totalRecipes}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Heart className="size-3.5" />
                Favorites
              </div>
              <span className="text-sm font-medium">{favoriteCount}</span>
            </div>
            <Button variant="outline" size="sm" asChild className="w-full">
              <Link href="/recipes">
                Browse Recipes
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Grocery Progress */}
        <Card className="sm:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-5 text-primary" />
              <CardTitle>Grocery List</CardTitle>
            </div>
            <CardDescription>
              {hasActiveGroceryList
                ? groceryData.list.name
                : "No active grocery list"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasActiveGroceryList ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-3.5 text-primary" />
                    Checked off
                  </div>
                  <span className="text-sm font-medium">
                    {groceryChecked} / {groceryTotal}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${groceryTotal > 0 ? (groceryChecked / groceryTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link href={`/grocery/${groceryData.list.id}`}>
                    Continue Shopping
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Circle className="size-3.5" />
                <span>
                  Finalize a meal plan to generate your grocery list.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mt-6" data-onboarding="quick-actions">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/recipes/new">
              <Plus className="size-4" />
              Add Recipe
            </Link>
          </Button>
          <Button variant="outline" asChild size="sm">
            <Link href="/plan">
              <CalendarDays className="size-4" />
              Plan This Week
            </Link>
          </Button>
          <Button variant="outline" asChild size="sm">
            <Link href="/grocery">
              <ShoppingCart className="size-4" />
              View Grocery List
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
