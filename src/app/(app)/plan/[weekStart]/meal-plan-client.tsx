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
  clearAllMealPlanItems,
  finalizeMealPlan,
  unfinalizeMealPlan,
} from "@/actions/meal-plans";
import { generateGroceryList } from "@/actions/grocery";
import { WeekGrid } from "@/components/meal-plan/week-grid";
import { RecipePickerDialog } from "@/components/meal-plan/recipe-picker-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

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
    setShowFinalizeConfirm(true);
  }

  function confirmFinalize() {
    if (!mealPlan) return;
    setShowFinalizeConfirm(false);
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

  function handleClearAll() {
    setShowClearAllConfirm(true);
  }

  function confirmClearAll() {
    if (!mealPlan) return;
    setShowClearAllConfirm(false);
    startTransition(async () => {
      const { error } = await clearAllMealPlanItems(mealPlan!.id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("All meals cleared.");
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
        onClearAll={handleClearAll}
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

      <Dialog open={showFinalizeConfirm} onOpenChange={setShowFinalizeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize this week?</DialogTitle>
            <DialogDescription>
              Finalizing locks the meal plan so you can generate a grocery list.
              You can unfinalize later if you need to make changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFinalizeConfirm(false)}
            >
              Cancel
            </Button>
            <Button onClick={confirmFinalize}>Finalize</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClearAllConfirm} onOpenChange={setShowClearAllConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all meals?</DialogTitle>
            <DialogDescription>
              This will remove all {mealPlan?.items?.length ?? 0} meals from this
              week&apos;s plan. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowClearAllConfirm(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmClearAll}>
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
