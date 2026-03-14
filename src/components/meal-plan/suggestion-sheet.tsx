"use client";

import { useCallback, useState, useTransition } from "react";
import { RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { MealType, SuggestedRecipe } from "@/types/database";
import { acceptSuggestion } from "@/actions/recommendations";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SuggestionCard } from "./suggestion-card";

interface SuggestionSheetProps {
  open: boolean;
  onClose: () => void;
  mealSlot: MealType;
  dayOfWeek: number;
  mealPlanId: string;
  onAccepted: () => void;
}

const SLOT_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export function SuggestionSheet({
  open,
  onClose,
  mealSlot,
  dayOfWeek,
  mealPlanId,
  onAccepted,
}: SuggestionSheetProps) {
  const [suggestions, setSuggestions] = useState<SuggestedRecipe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, startFetchTransition] = useTransition();
  const [isAccepting, startAcceptTransition] = useTransition();

  const fetchSuggestions = useCallback(() => {
    setError(null);
    startFetchTransition(async () => {
      try {
        const res = await fetch("/api/recipes/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealSlot, mealPlanId, count: 3 }),
        });

        const data = await res.json();

        if (data.error) {
          setError(data.error);
          setSuggestions([]);
        } else {
          setSuggestions(data.suggestions ?? []);
        }
      } catch {
        setError("Failed to fetch suggestions. Please try again.");
        setSuggestions([]);
      }
    });
  }, [mealSlot, mealPlanId]);

  // Fetch when sheet opens
  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setSuggestions([]);
    setError(null);
    queueMicrotask(() => fetchSuggestions());
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  function handleAddToPlan(suggestion: SuggestedRecipe) {
    startAcceptTransition(async () => {
      const { error } = await acceptSuggestion(
        suggestion,
        mealPlanId,
        dayOfWeek,
        mealSlot
      );
      if (error) {
        toast.error(error);
      } else {
        toast.success(`Added "${suggestion.name}" to your plan`);
        onAccepted();
        onClose();
      }
    });
  }

  function handleAddToRecipes(suggestion: SuggestedRecipe) {
    startAcceptTransition(async () => {
      const { error } = await acceptSuggestion(suggestion);
      if (error) {
        toast.error(error);
      } else {
        toast.success(`Added "${suggestion.name}" to your recipes`);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            AI Suggestions
          </SheetTitle>
          <SheetDescription>
            Recipe ideas for{" "}
            <span className="font-medium">{SLOT_LABELS[mealSlot]}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Loading state */}
          {isFetching && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border p-4 space-y-3"
                >
                  <div className="space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="flex gap-1.5">
                      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="flex gap-3">
                    <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <div className="h-8 flex-1 animate-pulse rounded bg-muted" />
                    <div className="h-8 flex-1 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!isFetching && error && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
              <AlertCircle className="size-8 text-destructive opacity-60" />
              <span className="text-center">{error}</span>
              <Button variant="outline" size="sm" onClick={fetchSuggestions}>
                Try Again
              </Button>
            </div>
          )}

          {/* Suggestions */}
          {!isFetching && !error && suggestions.length > 0 && (
            <>
              {suggestions.map((suggestion, i) => (
                <SuggestionCard
                  key={`${suggestion.name}-${i}`}
                  suggestion={suggestion}
                  onAddToPlan={() => handleAddToPlan(suggestion)}
                  onAddToRecipes={() => handleAddToRecipes(suggestion)}
                  isAccepting={isAccepting}
                />
              ))}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={fetchSuggestions}
                disabled={isFetching}
              >
                <RefreshCw className="size-3.5" />
                Regenerate
              </Button>
            </>
          )}

          {/* Empty state (no error, no suggestions, not loading) */}
          {!isFetching && !error && suggestions.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Sparkles className="size-8 opacity-40" />
              <span>No suggestions available.</span>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
