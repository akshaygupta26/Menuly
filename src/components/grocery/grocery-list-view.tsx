"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, ChevronRight, ListX, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  addManualItem,
  clearGroceryList,
  removeGroceryItem,
  toggleGroceryItem,
} from "@/actions/grocery";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddItemInput } from "@/components/grocery/add-item-input";
import { GroceryProgressBar } from "@/components/grocery/grocery-progress-bar";
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
  | { type: "add"; item: GroceryItem }
  | { type: "remove"; itemId: string }
  | { type: "toggle"; id: string }
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
    case "add":
      return [...items, action.item];
    case "remove":
      return items.filter((item) => item.id !== action.itemId);
    case "toggle":
      return items.map((item) =>
        item.id === action.id ? { ...item, is_checked: !item.is_checked } : item
      );
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
  const [optimisticItems, dispatchOptimistic] = useOptimistic(initialItems, itemsReducer);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<IngredientCategory>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(`grocery-collapsed-${initialList.id}`);
      return saved ? new Set(JSON.parse(saved) as IngredientCategory[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [isPending, startTransition] = useTransition();
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
  const grouped = useMemo(() => groupByCategory(optimisticItems), [optimisticItems]);
  const totalCount = optimisticItems.length;
  const checkedCount = optimisticItems.filter((i) => i.is_checked).length;

  // Auto-collapse categories where all items are checked (merged with user-collapsed set)
  const effectiveCollapsed = useMemo(() => {
    const next = new Set(collapsedCategories);
    for (const [category, items] of grouped.entries()) {
      if (items.length > 0 && items.every((i) => i.is_checked)) {
        next.add(category);
      }
    }
    return next;
  }, [collapsedCategories, grouped]);

  // Clean up timers on unmount
  useEffect(() => {
    const timers = dismissTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  // ---- Handlers ----
  const toggleCategory = useCallback((category: IngredientCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      try {
        localStorage.setItem(
          `grocery-collapsed-${initialList.id}`,
          JSON.stringify([...next])
        );
      } catch { /* ignore storage errors */ }
      return next;
    });
  }, [initialList.id]);

  const handleCheck = useCallback(
    (item: GroceryItem) => {
      // Optimistic update immediately
      startTransition(() => {
        dispatchOptimistic({ type: "toggle", id: item.id });
      });

      // Show undo toast
      toast(`✓ ${item.name} ${item.is_checked ? "unchecked" : "checked off"}`, {
        action: {
          label: "Undo",
          onClick: () => {
            startTransition(() => {
              dispatchOptimistic({ type: "toggle", id: item.id });
            });
            toggleGroceryItem(item.id); // Toggle back on server
          },
        },
        duration: 3000,
      });

      // Call server action async (don't await for UI)
      toggleGroceryItem(item.id).then((result) => {
        if (result.error) {
          startTransition(() => {
            dispatchOptimistic({ type: "toggle", id: item.id }); // revert
          });
          toast.error("Failed to update");
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

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Item count + clear button */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {totalCount} item{totalCount !== 1 ? "s" : ""} total
        </div>
        {totalCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setShowClearAllConfirm(true)}
          >
            <ListX className="mr-1.5 size-4" />
            Clear List
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <GroceryProgressBar checked={checkedCount} total={totalCount} />
      )}

      {/* Category groups */}
      <div className="space-y-4">
        {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((category, categoryIndex) => {
          const categoryItems = grouped.get(category)!;
          const isCollapsed = effectiveCollapsed.has(category);
          const categoryChecked = categoryItems.filter((i) => i.is_checked).length;
          const allDone = categoryChecked === categoryItems.length && categoryItems.length > 0;
          const isFirstCategory = categoryIndex === 0;

          return (
            <div key={category} className="rounded-lg border overflow-hidden">
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${CATEGORY_LABELS[category]}`}
                className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors ${
                  allDone
                    ? "bg-green-50 text-green-700 hover:bg-green-100"
                    : "hover:bg-muted/50"
                }`}
                {...(isFirstCategory ? { "data-onboarding": "grocery-category" } : {})}
              >
                {isCollapsed ? (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="mr-1">{CATEGORY_EMOJI[category]}</span>
                <span className="font-medium">{CATEGORY_LABELS[category]}</span>
                {allDone && (
                  <span className="ml-2 rounded-full bg-green-200 px-2 py-0.5 text-xs font-medium text-green-800">
                    All done
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {categoryChecked}/{categoryItems.length}
                </span>
              </button>

              {/* Category items — collapse animation via CSS grid */}
              <div
                className="grid transition-all"
                style={{
                  gridTemplateRows: isCollapsed ? "0fr" : "1fr",
                  transitionDuration: "var(--duration-smooth)",
                  transitionTimingFunction: "var(--ease-out)",
                }}
              >
                <div className="overflow-hidden">
                  <div className="border-t px-4 py-2">
                    <ul className="divide-y">
                      {categoryItems.map((item, itemIndex) => (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 py-2.5 group"
                          {...(isFirstCategory && itemIndex === 0 ? { "data-onboarding": "grocery-item" } : {})}
                        >
                          {/* Custom checkbox */}
                          <button
                            type="button"
                            onClick={() => handleCheck(item)}
                            aria-label={`Mark ${item.name} as ${item.is_checked ? "unchecked" : "done"}`}
                            className="shrink-0 transition-colors"
                            style={{ transitionDuration: "var(--duration-fast)" }}
                          >
                            {item.is_checked ? (
                              <div className="flex size-5 items-center justify-center rounded bg-green-500 text-white">
                                <Check className="size-3.5" strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="size-5 rounded border-2 border-muted-foreground/30" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <span
                              className="transition-colors"
                              style={{
                                transitionDuration: "var(--duration-fast)",
                                ...(item.is_checked
                                  ? { textDecoration: "line-through", color: "hsl(var(--muted-foreground) / 0.5)" }
                                  : {}),
                              }}
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
                            <span className="sr-only">Remove {item.name}</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add item */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Add Item</h3>
        <AddItemInput onAdd={handleAdd} />
      </div>

      {/* Clear list confirmation dialog */}
      <Dialog open={showClearAllConfirm} onOpenChange={setShowClearAllConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear grocery list?</DialogTitle>
            <DialogDescription>
              This will remove all {totalCount} item{totalCount !== 1 ? "s" : ""} from your grocery list. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearAllConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                setShowClearAllConfirm(false);
                startTransition(async () => {
                  dispatchOptimistic({ type: "sync", items: [] });
                  const result = await clearGroceryList(initialList.id);
                  if (result.error) {
                    toast.error("Failed to clear list");
                  } else {
                    toast.success("Grocery list cleared");
                  }
                });
              }}
            >
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
