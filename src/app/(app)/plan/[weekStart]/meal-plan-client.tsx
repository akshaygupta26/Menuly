"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type {
  MealPlan,
  MealPlanItemWithRecipe,
  MealType,
} from "@/types/database";
import {
  addMealPlanItem,
  updateMealPlanItem,
  removeMealPlanItem,
  moveMealPlanItem,
  clearAllMealPlanItems,
  clearMealPlanSlot,
  finalizeMealPlan,
  unfinalizeMealPlan,
} from "@/actions/meal-plans";
import { generateGroceryList } from "@/actions/grocery";
import { WeekGrid } from "@/components/meal-plan/week-grid";
import { RecipePickerDialog } from "@/components/meal-plan/recipe-picker-dialog";
import { SuggestionSheet } from "@/components/meal-plan/suggestion-sheet";
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
  replaceItemId?: string; // set when replacing an existing item
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

  // Realtime subscription for meal_plan_items — enables live sync for
  // household members editing the same plan.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!mealPlan) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`meal_plan_items:${mealPlan.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meal_plan_items",
          filter: `meal_plan_id=eq.${mealPlan.id}`,
        },
        () => {
          // Debounce rapid changes (e.g. auto-generate inserts many rows)
          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = setTimeout(() => {
            router.refresh();
          }, 300);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [mealPlan?.id, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  const [picker, setPicker] = useState<PickerState>({
    open: false,
    dayOfWeek: 1,
    mealSlot: "dinner",
  });

  const [suggestionState, setSuggestionState] = useState<PickerState>({
    open: false,
    dayOfWeek: 1,
    mealSlot: "dinner",
  });

  // ---- Handlers -----------------------------------------------------------

  function handleOpenPicker(dayOfWeek: number, mealSlot: MealType, replaceItemId?: string) {
    setPicker({ open: true, dayOfWeek, mealSlot, replaceItemId });
  }

  function handleClosePicker() {
    setPicker((prev) => ({ ...prev, open: false }));
  }

  function handleOpenSuggestion(dayOfWeek: number, mealSlot: MealType) {
    setSuggestionState({ open: true, dayOfWeek, mealSlot });
  }

  function handleCloseSuggestion() {
    setSuggestionState((prev) => ({ ...prev, open: false }));
  }

  function handleSuggestionAccepted() {
    router.refresh();
  }

  function handleSelectRecipe(recipeId: string | null, recipeName: string) {
    const replaceItemId = picker.replaceItemId;
    handleClosePicker();
    if (!mealPlan) return;

    startTransition(async () => {
      if (replaceItemId) {
        // Replacing an existing item
        const { error } = await updateMealPlanItem(
          replaceItemId,
          recipeId ?? undefined,
          recipeId ? undefined : recipeName
        );

        if (error) {
          toast.error(error);
          return;
        }

        toast.success(`Replaced with "${recipeName}".`);
      } else {
        // Adding a new item
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
      }

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

  function handleClearSlot(slot: MealType) {
    if (!mealPlan) return;
    startTransition(async () => {
      const { error } = await clearMealPlanSlot(mealPlan!.id, slot);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`Cleared all ${slot} meals.`);
      router.refresh();
    });
  }

  function handleMoveItem(
    itemId: string,
    toDayOfWeek: number,
    toMealSlot: MealType,
    swapWithItemId?: string
  ) {
    startTransition(async () => {
      const { error } = await moveMealPlanItem(
        itemId,
        toDayOfWeek,
        toMealSlot,
        swapWithItemId
      );

      if (error) {
        toast.error(error);
        return;
      }

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
      const { error } = await generateGroceryList(mealPlan!.id);

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
        onSuggestItem={mealPlan ? handleOpenSuggestion : undefined}
        onReplaceItem={(dayOfWeek, mealSlot, itemId) => handleOpenPicker(dayOfWeek, mealSlot, itemId)}
        onRemoveItem={handleRemoveItem}
        onMoveItem={handleMoveItem}
        onClearAll={handleClearAll}
        onClearSlot={handleClearSlot}
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

      {mealPlan && (
        <SuggestionSheet
          open={suggestionState.open}
          onClose={handleCloseSuggestion}
          mealSlot={suggestionState.mealSlot}
          dayOfWeek={suggestionState.dayOfWeek}
          mealPlanId={mealPlan.id}
          onAccepted={handleSuggestionAccepted}
        />
      )}

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
