"use client";

import { useRouter } from "next/navigation";
import { Sparkles, AlertCircle, X, RotateCcw } from "lucide-react";

import type { DraftRecipe } from "@/lib/recipe-generation-context";
import { useRecipeGeneration } from "@/lib/recipe-generation-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DraftRecipeCardProps {
  draft: DraftRecipe;
}

export function DraftRecipeCard({ draft }: DraftRecipeCardProps) {
  const router = useRouter();
  const { removeDraft, retryDraft } = useRecipeGeneration();

  const isError = draft.status === "error";
  const isReady = draft.status === "ready";
  const isGenerating = draft.status === "generating";

  function handleReadyClick() {
    if (!isReady || !draft.data) return;
    try {
      sessionStorage.setItem("ai-generated-recipe", JSON.stringify(draft.data));
    } catch {
      // sessionStorage unavailable — proceed anyway
    }
    removeDraft(draft.id);
    router.push("/recipes/new");
  }

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-2 border-dashed transition-transform",
        isError
          ? "border-destructive/50 bg-destructive/5"
          : "border-primary/40 bg-primary/5",
        isReady && "cursor-pointer hover:-translate-y-0.5"
      )}
      onClick={isReady ? handleReadyClick : undefined}
    >
      {/* Shimmer overlay for generating state */}
      {isGenerating && (
        <div
          className="pointer-events-none absolute inset-0 bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_ease-in-out_infinite]"
          aria-hidden="true"
        />
      )}

      {/* Dismiss button */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute right-2 top-2 z-10 size-7 min-h-[28px] min-w-[28px] text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          removeDraft(draft.id);
        }}
        aria-label="Dismiss draft"
      >
        <X className="size-3.5" />
      </Button>

      <CardContent className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
        {/* Generating state */}
        {isGenerating && (
          <>
            <Sparkles className="size-6 animate-pulse text-primary" />
            <Badge variant="secondary">Generating...</Badge>
            <p className="max-w-[160px] truncate text-xs text-muted-foreground">
              {draft.prompt.length > 50
                ? `${draft.prompt.slice(0, 50)}…`
                : draft.prompt}
            </p>
          </>
        )}

        {/* Ready state */}
        {isReady && (
          <>
            <Badge variant="default" className="gap-1">
              <Sparkles className="size-3" />
              Draft
            </Badge>
            <p className="line-clamp-2 font-medium text-sm leading-tight">
              {draft.data?.name ?? "Untitled Recipe"}
            </p>
            <p className="text-xs text-muted-foreground">Tap to review &amp; save</p>
          </>
        )}

        {/* Error state */}
        {isError && (
          <>
            <AlertCircle className="size-6 text-destructive" />
            <p className="max-w-[160px] text-xs text-destructive">
              {draft.error ?? "Generation failed"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                retryDraft(draft.id);
              }}
            >
              <RotateCcw className="size-3.5" />
              Retry
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
