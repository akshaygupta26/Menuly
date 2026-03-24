"use client";

import { ChevronRight } from "lucide-react";
import { format } from "date-fns";

import type { MealPlanItemWithRecipe, MealType } from "@/types/database";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DayAccordionProps {
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  date: Date;
  items: MealPlanItemWithRecipe[];
  mealSlots: MealType[];
  isFinalized: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isFirst?: boolean;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DayAccordion({
  date,
  items,
  isExpanded,
  onToggleExpand,
  isFirst = false,
  children,
}: DayAccordionProps) {
  const mealCount = items.filter(
    (item) => item.recipe !== null || item.custom_name !== null
  ).length;

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 rounded-lg transition-colors"
        aria-expanded={isExpanded}
        {...(isFirst ? { "data-onboarding": "day-accordion" } : {})}
      >
        {/* Left: chevron + day name + date */}
        <div className="flex items-center gap-2">
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
          />
          <span className="font-semibold text-sm">{format(date, "EEEE")}</span>
          <span className="text-sm text-muted-foreground ml-1">
            {format(date, "MMM d")}
          </span>
        </div>

        {/* Right: meal count summary when collapsed */}
        {!isExpanded && (
          <span className="text-xs text-muted-foreground">
            {mealCount === 1 ? "1 meal" : `${mealCount} meals`}
          </span>
        )}
      </button>

      {/* Body — CSS grid animation for smooth collapse/expand */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          transition: "grid-template-rows 500ms cubic-bezier(0.0, 0, 0.2, 1)",
        }}
      >
        <div style={{ overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
}
