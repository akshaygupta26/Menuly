"use client";

import { useCallback, useState, useTransition } from "react";
import {
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import type { SuggestedRecipe } from "@/types/database";
import { acceptSuggestion } from "@/actions/recommendations";
import { Button } from "@/components/ui/button";
import { SuggestionCard } from "@/components/meal-plan/suggestion-card";

export function DiscoverSection() {
  const [suggestions, setSuggestions] = useState<SuggestedRecipe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFetching, startFetchTransition] = useTransition();
  const [isAccepting, startAcceptTransition] = useTransition();
  const [hasFetched, setHasFetched] = useState(false);
  const [acceptedNames, setAcceptedNames] = useState<Set<string>>(new Set());

  const fetchSuggestions = useCallback(() => {
    setError(null);
    setAcceptedNames(new Set());
    startFetchTransition(async () => {
      try {
        const res = await fetch("/api/recipes/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealSlot: "dinner", count: 3 }),
        });

        const data = await res.json();

        if (data.error) {
          setError(data.error);
          setSuggestions([]);
        } else {
          setSuggestions(data.suggestions ?? []);
        }
        setHasFetched(true);
      } catch {
        setError("Failed to fetch suggestions.");
        setSuggestions([]);
        setHasFetched(true);
      }
    });
  }, []);

  function handleAddToRecipes(suggestion: SuggestedRecipe) {
    startAcceptTransition(async () => {
      const { error } = await acceptSuggestion(suggestion);
      if (error) {
        toast.error(error);
      } else {
        toast.success(`Added "${suggestion.name}" to your recipes`);
        setAcceptedNames((prev) => new Set(prev).add(suggestion.name));
      }
    });
  }

  // Don't render anything until user clicks "Discover" or if AI is not configured
  // (error from first fetch will indicate this)
  if (hasFetched && error === "AI suggestions are not configured.") {
    return null;
  }

  return (
    <div className="rounded-lg border border-border">
      {/* Header */}
      <button
        type="button"
        onClick={() => {
          setIsExpanded((v) => !v);
          if (!hasFetched && !isExpanded) {
            fetchSuggestions();
          }
        }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold flex-1">
          Discover new recipes
        </span>
        {isExpanded ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-4">
          {!hasFetched && !isFetching && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Sparkles className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Get AI-powered recipe suggestions based on your cooking style.
              </p>
              <Button size="sm" onClick={fetchSuggestions}>
                <Sparkles className="size-3.5" />
                Get Suggestions
              </Button>
            </div>
          )}

          {/* Loading */}
          {isFetching && (
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border p-4 space-y-3"
                >
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="flex gap-1.5">
                    <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="h-8 w-full animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {!isFetching && error && (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
              <AlertCircle className="size-8 text-destructive opacity-60" />
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={fetchSuggestions}>
                Try Again
              </Button>
            </div>
          )}

          {/* Suggestions */}
          {!isFetching && !error && suggestions.length > 0 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {suggestions.map((suggestion, i) =>
                  acceptedNames.has(suggestion.name) ? (
                    <div
                      key={`${suggestion.name}-${i}`}
                      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
                    >
                      <Check className="size-5 text-primary" />
                      <span className="font-medium">Added!</span>
                    </div>
                  ) : (
                    <SuggestionCard
                      key={`${suggestion.name}-${i}`}
                      suggestion={suggestion}
                      onAddToPlan={() => {}}
                      onAddToRecipes={() => handleAddToRecipes(suggestion)}
                      isAccepting={isAccepting}
                      showAddToPlan={false}
                    />
                  )
                )}
              </div>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchSuggestions}
                  disabled={isFetching}
                >
                  <RefreshCw className="size-3.5" />
                  Refresh Suggestions
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
