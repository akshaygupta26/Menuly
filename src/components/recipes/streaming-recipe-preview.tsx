"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { formatPartialRecipeJson } from "@/lib/stream-recipe-formatter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as content appears
  useEffect(() => {
    if (isStreaming) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [text, isStreaming]);

  if (error) {
    return (
      <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
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
  const hasAnyField =
    recipe.name ||
    recipe.ingredients.length > 0 ||
    recipe.instructions.length > 0;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-dashed border-primary/30 bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        {isStreaming ? (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
            Generating recipe…
          </div>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">
            Recipe preview
          </p>
        )}
        {!isStreaming && (
          <Button variant="ghost" size="icon" className="size-6" onClick={onDismiss}>
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {hasAnyField ? (
          <div className="space-y-3">
            {/* Name */}
            {recipe.name && (
              <h3 className="text-lg font-semibold">{recipe.name}</h3>
            )}

            {/* Metadata line */}
            {(recipe.cuisine_type ||
              recipe.protein_type ||
              recipe.prep_time ||
              recipe.cook_time ||
              recipe.servings) && (
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

            {/* Ingredients */}
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

            {/* Instructions */}
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

            {/* Tags */}
            {recipe.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recipe.tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Notes */}
            {recipe.notes && (
              <p className="text-sm italic text-muted-foreground">
                {recipe.notes}
              </p>
            )}

            {/* Blinking cursor */}
            {isStreaming && (
              <span className="inline-block h-4 w-1.5 animate-pulse bg-primary/60" />
            )}
          </div>
        ) : (
          /* Fallback: raw text when no fields parsed yet */
          <div className="space-y-2">
            <pre className="break-all whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {text}
            </pre>
            {isStreaming && (
              <span className="inline-block h-4 w-1.5 animate-pulse bg-primary/60" />
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
