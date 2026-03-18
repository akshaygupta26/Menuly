"use client";

import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Plus, X, Sparkles, Lock, Unlock, ShoppingCart, CalendarDays, Trash2, Flame } from "lucide-react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

import type { MealPlan, MealPlanItemWithRecipe, MealType } from "@/types/database";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  onSuggestItem?: (dayOfWeek: number, mealSlot: MealType) => void;
  onRemoveItem: (itemId: string) => void;
  onMoveItem?: (itemId: string, toDayOfWeek: number, toMealSlot: MealType, swapWithItemId?: string) => void;
  onClearAll: () => void;
  onClearSlot: (slot: MealType) => void;
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
// Nutrition helpers
// ---------------------------------------------------------------------------

interface DayNutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function hasNutrition(item: MealPlanItemWithRecipe): boolean {
  return item.recipe?.calories != null;
}

function computeDayTotals(
  items: MealPlanItemWithRecipe[],
  dayOfWeek: number
): DayNutritionTotals | null {
  const dayItems = items.filter(
    (i) => i.day_of_week === dayOfWeek && hasNutrition(i)
  );
  if (dayItems.length === 0) return null;

  return dayItems.reduce<DayNutritionTotals>(
    (acc, item) => ({
      calories: acc.calories + (item.recipe!.calories ?? 0),
      protein: acc.protein + (item.recipe!.protein_g ?? 0),
      carbs: acc.carbs + (item.recipe!.carbs_g ?? 0),
      fat: acc.fat + (item.recipe!.fat_g ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DayNutritionSummary({
  totals,
  compact = false,
}: {
  totals: DayNutritionTotals;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center text-[10px] font-medium",
        compact ? "gap-x-2 gap-y-0.5" : "gap-x-3 gap-y-1"
      )}
    >
      <span className="flex items-center gap-0.5 text-orange-600 dark:text-orange-400">
        <Flame className="size-3" />
        {Math.round(totals.calories)}
      </span>
      <span className="text-blue-600 dark:text-blue-400">
        P {Math.round(totals.protein)}g
      </span>
      <span className="text-amber-600 dark:text-amber-400">
        C {Math.round(totals.carbs)}g
      </span>
      <span className="text-emerald-600 dark:text-emerald-400">
        F {Math.round(totals.fat)}g
      </span>
      <span className="text-muted-foreground/60 italic">/ serving</span>
    </div>
  );
}

function MealSlotCell({
  item,
  mealSlot,
  dayOfWeek,
  isFinalized,
  onAdd,
  onSuggest,
  onRemove,
}: {
  item: MealPlanItemWithRecipe | undefined;
  mealSlot: MealType;
  dayOfWeek: number;
  isFinalized: boolean;
  onAdd: () => void;
  onSuggest?: () => void;
  onRemove: (id: string) => void;
}) {
  if (item) {
    const displayName = item.recipe?.name ?? item.custom_name ?? "Untitled";
    const showNutrition = hasNutrition(item);

    return (
      <div
        className={cn(
          "group relative overflow-hidden rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
          SLOT_COLORS[mealSlot]
        )}
      >
        <div className="flex items-center gap-1">
          <span className="min-w-0 truncate flex-1">{displayName}</span>
          {!isFinalized && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="shrink-0 rounded-sm p-0.5 opacity-40 transition-opacity hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
              aria-label={`Remove ${displayName}`}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        {showNutrition && (
          <div className="mt-0.5 truncate text-[10px] font-normal opacity-60">
            {Math.round(item.recipe!.calories!)} kcal · P {Math.round(item.recipe!.protein_g ?? 0)}g · C {Math.round(item.recipe!.carbs_g ?? 0)}g · F {Math.round(item.recipe!.fat_g ?? 0)}g
            <span className="ml-1 italic">/ serving</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex w-full gap-1"
      data-droppable={`${dayOfWeek}-${mealSlot}`}
    >
      <button
        type="button"
        onClick={onAdd}
        disabled={isFinalized}
        className={cn(
          "flex flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors",
          !isFinalized && "hover:border-primary/50 hover:text-primary hover:bg-primary/5"
        )}
      >
        <Plus className="size-3" />
        <span className="sr-only sm:not-sr-only">Add</span>
      </button>
      {onSuggest && !isFinalized && (
        <button
          type="button"
          onClick={onSuggest}
          className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary hover:bg-primary/5"
          title="AI Suggest"
        >
          <Sparkles className="size-3" />
        </button>
      )}
    </div>
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
  onSuggestItem,
  onRemoveItem,
  onMoveItem,
  onClearAll,
  onClearSlot,
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

  // Precompute day nutrition totals
  const dayTotals = useMemo(() => {
    const totals = new Map<number, DayNutritionTotals | null>();
    if (mealPlan?.items) {
      for (const dow of ORDERED_DAYS) {
        totals.set(dow, computeDayTotals(mealPlan.items, dow));
      }
    }
    return totals;
  }, [mealPlan]);

  // DnD handler: droppableId format is "dayOfWeek-mealSlot" (e.g. "1-dinner")
  // draggableId is the meal_plan_item.id
  function handleDragEnd(result: DropResult) {
    if (!result.destination || !onMoveItem) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    const [toDow, toSlot] = destination.droppableId.split("-");
    const toDayOfWeek = parseInt(toDow, 10);
    const toMealSlot = toSlot as MealType;

    // Check if destination slot is occupied
    const destItem = itemsByKey.get(destination.droppableId);
    onMoveItem(draggableId, toDayOfWeek, toMealSlot, destItem?.id);
  }

  // Helper to render a slot cell wrapped in Droppable + Draggable
  function renderDndSlot(
    dayOfWeek: number,
    slot: MealType,
    item: MealPlanItemWithRecipe | undefined
  ) {
    const droppableId = `${dayOfWeek}-${slot}`;
    const canDrag = !isFinalized && !!onMoveItem;

    return (
      <Droppable droppableId={droppableId} isDropDisabled={isFinalized || !onMoveItem}>
        {(dropProvided, dropSnapshot) => (
          <div
            ref={dropProvided.innerRef}
            {...dropProvided.droppableProps}
            className={cn(
              "min-h-[36px] rounded-md transition-colors",
              dropSnapshot.isDraggingOver && !item && "bg-primary/10 ring-1 ring-primary/30",
              dropSnapshot.isDraggingOver && item && "ring-1 ring-primary/30"
            )}
          >
            {item && canDrag ? (
              <Draggable draggableId={item.id} index={0}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={cn(
                      dragSnapshot.isDragging && "opacity-90 shadow-lg rounded-md z-50"
                    )}
                  >
                    <MealSlotCell
                      item={item}
                      mealSlot={slot}
                      dayOfWeek={dayOfWeek}
                      isFinalized={isFinalized}
                      onAdd={() => onAddItem(dayOfWeek, slot)}
                      onSuggest={onSuggestItem ? () => onSuggestItem(dayOfWeek, slot) : undefined}
                      onRemove={onRemoveItem}
                    />
                  </div>
                )}
              </Draggable>
            ) : (
              <MealSlotCell
                item={item}
                mealSlot={slot}
                dayOfWeek={dayOfWeek}
                isFinalized={isFinalized}
                onAdd={() => onAddItem(dayOfWeek, slot)}
                onSuggest={onSuggestItem ? () => onSuggestItem(dayOfWeek, slot) : undefined}
                onRemove={onRemoveItem}
              />
            )}
            {dropProvided.placeholder}
          </div>
        )}
      </Droppable>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className="text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Clear
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {mealSlots.map((slot) => {
                  const count = mealPlan.items.filter((i) => i.meal_slot === slot).length;
                  if (count === 0) return null;
                  return (
                    <DropdownMenuItem
                      key={slot}
                      onClick={() => onClearSlot(slot)}
                    >
                      All {SLOT_LABELS[slot]}
                      <span className="ml-auto text-xs text-muted-foreground">{count}</span>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuItem
                  onClick={onClearAll}
                  className="text-destructive focus:text-destructive"
                >
                  Clear Entire Week
                  <span className="ml-auto text-xs text-muted-foreground">{mealPlan.items.length}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))` }}
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
                    className="flex min-w-0 flex-col gap-1 bg-background p-1.5"
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      {SLOT_LABELS[slot]}
                    </span>
                    {renderDndSlot(dayOfWeek, slot, item)}
                  </div>
                );
              })
            )}

            {/* Day nutrition totals row */}
            {dayDates.map(({ dayOfWeek }) => {
              const totals = dayTotals.get(dayOfWeek);
              return (
                <div
                  key={`totals-${dayOfWeek}`}
                  className="flex items-center justify-center bg-muted/30 p-1.5"
                >
                  {totals ? (
                    <DayNutritionSummary totals={totals} compact />
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40">--</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Mobile vertical list (hidden on desktop) */}
        {/* ----------------------------------------------------------------- */}
        <div className="space-y-3 overflow-x-hidden md:hidden">
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
                        {renderDndSlot(dayOfWeek, slot, item)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Day nutrition totals footer */}
              {(() => {
                const totals = dayTotals.get(dayOfWeek);
                if (!totals) return null;
                return (
                  <div className="border-t bg-muted/30 px-3 py-2">
                    <DayNutritionSummary totals={totals} />
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </div>
    </DragDropContext>
  );
}
