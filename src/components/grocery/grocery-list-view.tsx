"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  toggleGroceryItem,
  addManualItem,
  removeGroceryItem,
  clearCheckedItems,
} from "@/actions/grocery";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AddItemInput } from "@/components/grocery/add-item-input";
import type { GroceryList, GroceryItem, IngredientCategory } from "@/types/database";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: IngredientCategory[] = [
  "produce",
  "dairy",
  "meat",
  "pantry",
  "frozen",
  "bakery",
  "beverages",
  "other",
];

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

const CATEGORY_EMOJI: Record<IngredientCategory, string> = {
  produce: "🥬",
  dairy: "🧀",
  meat: "🥩",
  pantry: "🫙",
  frozen: "🧊",
  bakery: "🍞",
  beverages: "🥤",
  other: "📦",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GroceryListViewProps {
  initialList: GroceryList;
  initialItems: GroceryItem[];
}

type OptimisticAction =
  | { type: "toggle"; itemId: string }
  | { type: "add"; item: GroceryItem }
  | { type: "remove"; itemId: string }
  | { type: "clear_checked" }
  | { type: "sync"; items: GroceryItem[] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByCategory(items: GroceryItem[]): Map<IngredientCategory, GroceryItem[]> {
  const grouped = new Map<IngredientCategory, GroceryItem[]>();

  for (const item of items) {
    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }

  return grouped;
}

function formatQuantity(item: GroceryItem): string {
  if (item.quantity == null) return "";
  const qty =
    item.quantity === Math.floor(item.quantity)
      ? String(item.quantity)
      : item.quantity.toFixed(2).replace(/\.?0+$/, "");
  return item.unit ? `${qty} ${item.unit}` : qty;
}

function itemsReducer(items: GroceryItem[], action: OptimisticAction): GroceryItem[] {
  switch (action.type) {
    case "toggle":
      return items.map((item) =>
        item.id === action.itemId ? { ...item, is_checked: !item.is_checked } : item
      );
    case "add":
      return [...items, action.item];
    case "remove":
      return items.filter((item) => item.id !== action.itemId);
    case "clear_checked":
      return items.filter((item) => !item.is_checked);
    case "sync":
      return action.items;
    default:
      return items;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GroceryListView({ initialList, initialItems }: GroceryListViewProps) {
  const [items, dispatchOptimistic] = useOptimistic(initialItems, itemsReducer);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<IngredientCategory>>(
    new Set()
  );
  const [isPending, startTransition] = useTransition();

  // ---- Realtime subscription ----
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`grocery_items:${initialList.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "grocery_items",
          filter: `grocery_list_id=eq.${initialList.id}`,
        },
        () => {
          // Re-fetch all items when any change occurs
          supabase
            .from("grocery_items")
            .select("*")
            .eq("grocery_list_id", initialList.id)
            .order("category")
            .order("sort_order")
            .then(({ data }) => {
              if (data) {
                startTransition(() => {
                  dispatchOptimistic({ type: "sync", items: data as GroceryItem[] });
                });
              }
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialList.id, dispatchOptimistic]);

  // ---- Derived state ----
  const grouped = useMemo(() => groupByCategory(items), [items]);
  const totalCount = items.length;
  const checkedCount = items.filter((i) => i.is_checked).length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((checkedCount / totalCount) * 100);

  // ---- Handlers ----
  const toggleCategory = useCallback((category: IngredientCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleToggle = useCallback(
    (itemId: string) => {
      startTransition(async () => {
        dispatchOptimistic({ type: "toggle", itemId });
        const result = await toggleGroceryItem(itemId);
        if (result.error) {
          toast.error("Failed to update item");
        }
      });
    },
    [dispatchOptimistic]
  );

  const handleAdd = useCallback(
    (name: string, category?: IngredientCategory) => {
      startTransition(async () => {
        const result = await addManualItem(initialList.id, name, category);
        if (result.error) {
          toast.error("Failed to add item");
        }
      });
    },
    [initialList.id]
  );

  const handleRemove = useCallback(
    (itemId: string) => {
      startTransition(async () => {
        dispatchOptimistic({ type: "remove", itemId });
        const result = await removeGroceryItem(itemId);
        if (result.error) {
          toast.error("Failed to remove item");
        }
      });
    },
    [dispatchOptimistic]
  );

  const handleClearChecked = useCallback(() => {
    if (checkedCount === 0) return;

    startTransition(async () => {
      dispatchOptimistic({ type: "clear_checked" });
      const result = await clearCheckedItems(initialList.id);
      if (result.error) {
        toast.error("Failed to clear checked items");
      }
    });
  }, [initialList.id, checkedCount, dispatchOptimistic]);

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {checkedCount} of {totalCount} items checked
          </span>
          <span>{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} />
      </div>

      {/* Category groups */}
      <div className="space-y-4">
        {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((category) => {
          const categoryItems = grouped.get(category)!;
          const isCollapsed = collapsedCategories.has(category);
          const categoryChecked = categoryItems.filter((i) => i.is_checked).length;

          return (
            <div key={category} className="rounded-lg border">
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="mr-1">{CATEGORY_EMOJI[category]}</span>
                <span className="font-medium">{CATEGORY_LABELS[category]}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {categoryChecked}/{categoryItems.length}
                </span>
              </button>

              {/* Category items */}
              {!isCollapsed && (
                <div className="border-t px-4 py-2">
                  <ul className="divide-y">
                    {categoryItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 py-2.5 group"
                      >
                        <Checkbox
                          checked={item.is_checked}
                          onCheckedChange={() => handleToggle(item.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={
                              item.is_checked
                                ? "line-through text-muted-foreground"
                                : "text-foreground"
                            }
                          >
                            {item.name}
                          </span>
                          {formatQuantity(item) && (
                            <span className="ml-2 text-sm text-muted-foreground">
                              {formatQuantity(item)}
                            </span>
                          )}
                          {item.added_manually && (
                            <span className="ml-2 text-xs text-muted-foreground italic">
                              manual
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity size-8 p-0"
                          onClick={() => handleRemove(item.id)}
                        >
                          <Trash2 className="size-3.5 text-muted-foreground" />
                          <span className="sr-only">Remove</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add item */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Add Item</h3>
        <AddItemInput onAdd={handleAdd} />
      </div>

      {/* Clear checked */}
      {checkedCount > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearChecked}
            disabled={isPending}
          >
            <Trash2 className="size-4" />
            Clear {checkedCount} checked item{checkedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
