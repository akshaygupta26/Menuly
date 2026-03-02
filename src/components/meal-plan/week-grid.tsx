"use client";

import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Plus, X, Sparkles, Lock, Unlock, ShoppingCart, CalendarDays, Trash2 } from "lucide-react";

import type { MealPlan, MealPlanItemWithRecipe, MealType } from "@/types/database";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MealPlanWithItems extends MealPlan {
  items: MealPlanItemWithRecipe[];
}

interface WeekGridProps {
  weekStart: string; // YYYY-MM-DD (Monday)
  mealPlan: MealPlanWithItems | null;
  mealSlots: MealType[];
  onAddItem: (dayOfWeek: number, mealSlot: MealType) => void;
  onRemoveItem: (itemId: string) => void;
  onClearAll: () => void;
  onFinalize: () => void;
  onUnfinalize: () => void;
  onAutoGenerate: () => void;
  onGenerateGroceryList: () => void;
  isPending?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLOT_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const SLOT_COLORS: Record<MealType, string> = {
  breakfast: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  lunch: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  dinner: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  snack: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

// Monday = 1, Sunday = 0 in JS Date — but our grid runs Mon(1)..Sun(0).
// MealPlanItem uses day_of_week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
// We'll build an ordered list: [1, 2, 3, 4, 5, 6, 0] so Mon first, Sun last.
const ORDERED_DAYS = [1, 2, 3, 4, 5, 6, 0];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDayDates(weekStart: string) {
  const monday = parseISO(weekStart);
  return ORDERED_DAYS.map((dow, index) => ({
    dayOfWeek: dow,
    date: addDays(monday, index),
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MealSlotCell({
  item,
  mealSlot,
  dayOfWeek,
  isFinalized,
  onAdd,
  onRemove,
}: {
  item: MealPlanItemWithRecipe | undefined;
  mealSlot: MealType;
  dayOfWeek: number;
  isFinalized: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  if (item) {
    const displayName = item.recipe?.name ?? item.custom_name ?? "Untitled";

    return (
      <div
        className={cn(
          "group relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          SLOT_COLORS[mealSlot]
        )}
        data-droppable={`${dayOfWeek}-${mealSlot}`}
      >
        <span className="min-w-0 truncate">{displayName}</span>
        {!isFinalized && (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="ml-auto shrink-0 rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
            aria-label={`Remove ${displayName}`}
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={isFinalized}
      className={cn(
        "flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors",
        !isFinalized && "hover:border-primary/50 hover:text-primary hover:bg-primary/5"
      )}
      data-droppable={`${dayOfWeek}-${mealSlot}`}
    >
      <Plus className="size-3" />
      <span className="sr-only sm:not-sr-only">Add</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WeekGrid({
  weekStart,
  mealPlan,
  mealSlots,
  onAddItem,
  onRemoveItem,
  onClearAll,
  onFinalize,
  onUnfinalize,
  onAutoGenerate,
  onGenerateGroceryList,
  isPending = false,
}: WeekGridProps) {
  const dayDates = useMemo(() => buildDayDates(weekStart), [weekStart]);
  const isFinalized = mealPlan?.status === "finalized";

  // Index items by "dayOfWeek-mealSlot" for O(1) lookup
  const itemsByKey = useMemo(() => {
    const map = new Map<string, MealPlanItemWithRecipe>();
    if (mealPlan?.items) {
      for (const item of mealPlan.items) {
        map.set(`${item.day_of_week}-${item.meal_slot}`, item);
      }
    }
    return map;
  }, [mealPlan]);

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onAutoGenerate}
          disabled={isPending || isFinalized}
        >
          <Sparkles className="size-3.5" />
          Auto-Generate
        </Button>

        {!isFinalized && mealPlan?.items && mealPlan.items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            disabled={isPending}
            className="text-destructive"
          >
            <Trash2 className="size-3.5" />
            Clear All
          </Button>
        )}

        {isFinalized ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onUnfinalize}
            disabled={isPending}
          >
            <Unlock className="size-3.5" />
            Unfinalize
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onFinalize}
            disabled={isPending}
          >
            <Lock className="size-3.5" />
            Finalize Week
          </Button>
        )}

        {isFinalized && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={onGenerateGroceryList}
              disabled={isPending}
            >
              <ShoppingCart className="size-3.5" />
              Generate Grocery List
            </Button>
            <Badge variant="secondary" className="ml-auto">
              <Lock className="size-3" />
              Finalized
            </Badge>
          </>
        )}
      </div>

      {/* Empty state guidance */}
      {!isFinalized && (!mealPlan?.items || mealPlan.items.length === 0) && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
          <CalendarDays className="mx-auto mb-3 size-10 text-muted-foreground/50" />
          <h3 className="mb-1 text-sm font-semibold">No meals planned yet</h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Tap the <strong>+</strong> button on any slot below to add a recipe, or use{" "}
            <strong>Auto-Generate</strong> to fill the whole week from your recipe library.
          </p>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Desktop grid (hidden on mobile) */}
      {/* ----------------------------------------------------------------- */}
      <div className="hidden md:block overflow-x-auto">
        <div
          className="grid min-w-[700px] gap-px rounded-lg border border-border bg-border"
          style={{ gridTemplateColumns: `repeat(7, 1fr)` }}
        >
          {/* Day headers */}
          {dayDates.map(({ dayOfWeek, date }) => (
            <div
              key={`header-${dayOfWeek}`}
              className="bg-muted/50 px-2 py-2 text-center"
            >
              <div className="text-xs font-medium text-muted-foreground">
                {format(date, "EEE")}
              </div>
              <div className="text-sm font-semibold">
                {format(date, "MMM d")}
              </div>
            </div>
          ))}

          {/* Meal slot rows */}
          {mealSlots.map((slot) =>
            dayDates.map(({ dayOfWeek }) => {
              const item = itemsByKey.get(`${dayOfWeek}-${slot}`);
              return (
                <div
                  key={`${dayOfWeek}-${slot}`}
                  className="flex flex-col gap-1 bg-background p-1.5"
                >
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {SLOT_LABELS[slot]}
                  </span>
                  <MealSlotCell
                    item={item}
                    mealSlot={slot}
                    dayOfWeek={dayOfWeek}
                    isFinalized={isFinalized}
                    onAdd={() => onAddItem(dayOfWeek, slot)}
                    onRemove={onRemoveItem}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Mobile vertical list (hidden on desktop) */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-3 md:hidden">
        {dayDates.map(({ dayOfWeek, date }) => (
          <div
            key={`mobile-${dayOfWeek}`}
            className="rounded-lg border border-border"
          >
            {/* Day header */}
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
              <span className="text-sm font-semibold">
                {format(date, "EEE")}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(date, "MMM d")}
              </span>
            </div>

            {/* Slots */}
            <div className="divide-y divide-border">
              {mealSlots.map((slot) => {
                const item = itemsByKey.get(`${dayOfWeek}-${slot}`);
                return (
                  <div
                    key={`${dayOfWeek}-${slot}`}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <span className="w-14 shrink-0 text-[11px] sm:text-xs font-medium text-muted-foreground">
                      {SLOT_LABELS[slot]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <MealSlotCell
                        item={item}
                        mealSlot={slot}
                        dayOfWeek={dayOfWeek}
                        isFinalized={isFinalized}
                        onAdd={() => onAddItem(dayOfWeek, slot)}
                        onRemove={onRemoveItem}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
