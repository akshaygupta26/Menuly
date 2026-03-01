"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type {
  MealPlan,
  MealPlanItemWithRecipe,
  MealType,
} from "@/types/database";
import {
  addMealPlanItem,
  removeMealPlanItem,
  finalizeMealPlan,
  unfinalizeMealPlan,
} from "@/actions/meal-plans";
import { generateGroceryList } from "@/actions/grocery";
import { WeekGrid } from "@/components/meal-plan/week-grid";
import { RecipePickerDialog } from "@/components/meal-plan/recipe-picker-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MealPlanWithItems extends MealPlan {
  items: MealPlanItemWithRecipe[];
}

interface MealPlanClientProps {
  weekStart: string;
  initialMealPlan: MealPlanWithItems | null;
  mealSlots: MealType[];
}

interface PickerState {
  open: boolean;
  dayOfWeek: number;
  mealSlot: MealType;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MealPlanClient({
  weekStart,
  initialMealPlan,
  mealSlots,
}: MealPlanClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mealPlan, setMealPlan] = useState<MealPlanWithItems | null>(
    initialMealPlan
  );

  // Sync server-refreshed data into local state.
  // router.refresh() re-runs the server component, which passes new
  // initialMealPlan — this effect picks up the change.
  useEffect(() => {
    setMealPlan(initialMealPlan);
  }, [initialMealPlan]);

  const [picker, setPicker] = useState<PickerState>({
    open: false,
    dayOfWeek: 1,
    mealSlot: "dinner",
  });

  // ---- Handlers -----------------------------------------------------------

  function handleOpenPicker(dayOfWeek: number, mealSlot: MealType) {
    setPicker({ open: true, dayOfWeek, mealSlot });
  }

  function handleClosePicker() {
    setPicker((prev) => ({ ...prev, open: false }));
  }

  function handleSelectRecipe(recipeId: string | null, recipeName: string) {
    handleClosePicker();
    if (!mealPlan) return;

    startTransition(async () => {
      const { error } = await addMealPlanItem(
        mealPlan!.id,
        picker.dayOfWeek,
        picker.mealSlot,
        recipeId ?? undefined,
        recipeId ? undefined : recipeName
      );

      if (error) {
        toast.error(error);
        return;
      }

      toast.success(`Added "${recipeName}" to the plan.`);
      router.refresh();
    });
  }

  function handleRemoveItem(itemId: string) {
    startTransition(async () => {
      const { error } = await removeMealPlanItem(itemId);

      if (error) {
        toast.error(error);
        return;
      }

      toast.success("Removed from plan.");
      router.refresh();
    });
  }

  function handleFinalize() {
    if (!mealPlan) return;
    startTransition(async () => {
      const { error } = await finalizeMealPlan(mealPlan!.id);

      if (error) {
        toast.error(error);
        return;
      }

      toast.success("Week finalized! You can now generate a grocery list.");
      router.refresh();
    });
  }

  function handleUnfinalize() {
    if (!mealPlan) return;
    startTransition(async () => {
      const { error } = await unfinalizeMealPlan(mealPlan!.id);

      if (error) {
        toast.error(error);
        return;
      }

      toast.success("Week unfinalized. You can make changes again.");
      router.refresh();
    });
  }

  function handleAutoGenerate() {
    if (!mealPlan) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/meal-plan/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealPlanId: mealPlan!.id, weekStart }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to generate meal plan.");
        }

        toast.success("Meal plan generated!");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to generate meal plan."
        );
      }
    });
  }

  function handleGenerateGroceryList() {
    if (!mealPlan) return;
    startTransition(async () => {
      const { data, error } = await generateGroceryList(mealPlan!.id);

      if (error) {
        toast.error(error);
        return;
      }

      toast.success("Grocery list generated!");
      router.push("/grocery");
    });
  }

  // ---- Render -------------------------------------------------------------

  return (
    <>
      <WeekGrid
        weekStart={weekStart}
        mealPlan={mealPlan}
        mealSlots={mealSlots}
        onAddItem={handleOpenPicker}
        onRemoveItem={handleRemoveItem}
        onFinalize={handleFinalize}
        onUnfinalize={handleUnfinalize}
        onAutoGenerate={handleAutoGenerate}
        onGenerateGroceryList={handleGenerateGroceryList}
        isPending={isPending}
      />

      <RecipePickerDialog
        open={picker.open}
        onClose={handleClosePicker}
        onSelect={handleSelectRecipe}
        mealSlot={picker.mealSlot}
      />
    </>
  );
}
