import Link from "next/link";
import { addDays, format, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { getMealPlan } from "@/actions/meal-plans";
import { getProfile } from "@/actions/settings";
import { Header } from "@/components/layout/header";
import { PageGuide, PageGuideHelpIcon } from "@/components/onboarding/page-guide";
import { Button } from "@/components/ui/button";
import { MealPlanClient } from "./meal-plan-client";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface MealPlanPageProps {
  params: Promise<{ weekStart: string }>;
}

export default async function MealPlanPage({ params }: MealPlanPageProps) {
  const { weekStart } = await params;
  const monday = parseISO(weekStart);
  const sunday = addDays(monday, 6);

  // Navigation dates
  const prevWeek = format(subDays(monday, 7), "yyyy-MM-dd");
  const nextWeek = format(addDays(monday, 7), "yyyy-MM-dd");

  // Fetch data
  const [{ data: mealPlan, error }, { data: profile }] = await Promise.all([
    getMealPlan(weekStart),
    getProfile(),
  ]);

  // Date range title
  const dateRangeTitle = `${format(monday, "MMM d")} - ${format(sunday, "MMM d, yyyy")}`;

  return (
    <div className="animate-page-enter">
      <Header title="Meal Plan" subtitle={dateRangeTitle}>
        <PageGuideHelpIcon page="plan" />
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`/plan/${prevWeek}`} aria-label="Previous week">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`/plan/${nextWeek}`} aria-label="Next week">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Header>
      <PageGuide page="plan" />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <MealPlanClient
          weekStart={weekStart}
          initialMealPlan={mealPlan ?? null}
          mealSlots={[...(profile?.meal_slots ?? ["breakfast", "lunch", "dinner"])]}
        />
      )}
    </div>
  );
}
