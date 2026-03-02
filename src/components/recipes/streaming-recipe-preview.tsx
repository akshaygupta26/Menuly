"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";

import { formatPartialRecipeJson } from "@/lib/stream-recipe-formatter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StreamingRecipePreviewProps {
  text: string;
  isStreaming: boolean;
  error: string | null;
  onDismiss: () => void;
}

export function StreamingRecipePreview({
  text,
  isStreaming,
  error,
  onDismiss,
}: StreamingRecipePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (error) {
    return (
      <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-destructive">
            Generation failed
          </p>
          <Button variant="ghost" size="icon" className="size-6" onClick={onDismiss}>
            <X className="size-3.5" />
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  const recipe = formatPartialRecipeJson(text);

  // Summary line: show recipe name or a count of what's been generated so far
  const summaryParts: string[] = [];
  if (recipe.name) summaryParts.push(recipe.name);
  if (recipe.ingredients.length > 0)
    summaryParts.push(`${recipe.ingredients.length} ingredients`);
  if (recipe.instructions.length > 0)
    summaryParts.push(`${recipe.instructions.length} steps`);

  const summary = summaryParts.join(" · ");

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-primary/20 bg-card">
      {/* Compact bar — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        {/* Pulsing dot while streaming */}
        {isStreaming && (
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span className="inline-flex size-2 rounded-full bg-primary" />
          </span>
        )}

        <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
          {isStreaming
            ? summary
              ? `Generating: ${summary}`
              : "Generating recipe…"
            : summary || "Recipe preview"}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
          {!isStreaming && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </button>

      {/* Expandable detail panel */}
      {isExpanded && (
        <div className="max-h-72 overflow-auto border-t px-4 py-3">
          {recipe.name ||
          recipe.ingredients.length > 0 ||
          recipe.instructions.length > 0 ? (
            <div className="space-y-3">
              {recipe.name && (
                <h3 className="text-base font-semibold">{recipe.name}</h3>
              )}

              {(recipe.cuisine_type ||
                recipe.protein_type ||
                recipe.prep_time != null ||
                recipe.cook_time != null ||
                recipe.servings != null) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {recipe.cuisine_type && <span>{recipe.cuisine_type}</span>}
                  {recipe.protein_type && <span>{recipe.protein_type}</span>}
                  {recipe.prep_time != null && (
                    <span>Prep: {recipe.prep_time}m</span>
                  )}
                  {recipe.cook_time != null && (
                    <span>Cook: {recipe.cook_time}m</span>
                  )}
                  {recipe.servings != null && (
                    <span>Serves {recipe.servings}</span>
                  )}
                </div>
              )}

              {recipe.ingredients.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium">Ingredients</p>
                  <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i}>{ing}</li>
                    ))}
                  </ul>
                </div>
              )}

              {recipe.instructions.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium">Instructions</p>
                  <ol className="list-inside list-decimal space-y-0.5 text-sm text-muted-foreground">
                    {recipe.instructions.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {recipe.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {recipe.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {recipe.notes && (
                <p className="text-sm italic text-muted-foreground">
                  {recipe.notes}
                </p>
              )}

              {isStreaming && (
                <span className="inline-block h-4 w-1.5 animate-pulse bg-primary/60" />
              )}
            </div>
          ) : (
            /* Skeleton while waiting for first field */
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-48 rounded bg-muted" />
              <div className="h-3 w-32 rounded bg-muted" />
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-3 w-5/6 rounded bg-muted" />
                <div className="h-3 w-4/6 rounded bg-muted" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
