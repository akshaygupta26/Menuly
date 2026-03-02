"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { RecipeFormValues } from "@/components/recipes/recipe-form";

interface AiPromptInputProps {
  onGenerated: (data: Partial<RecipeFormValues>) => void;
}

export function AiPromptInput({ onGenerated }: AiPromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (trimmed.length < 3) {
      toast.error("Please enter at least 3 characters");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          toast.error("Daily limit reached. You can generate 3 recipes per day.");
        } else {
          toast.error(json.error || "Failed to generate recipe");
        }
        return;
      }

      onGenerated(json.data);
      const remaining = json.remaining as number | null;
      if (remaining !== null && remaining !== undefined) {
        toast.success(`Recipe generated! ${remaining} generation${remaining === 1 ? "" : "s"} remaining today.`);
      } else {
        toast.success("Recipe generated! Review and edit below.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <Label htmlFor="ai-prompt" className="mb-2 flex items-center gap-1.5">
        <Sparkles className="size-4" />
        Generate with AI
      </Label>
      <p className="mb-3 text-sm text-muted-foreground">
        Describe a recipe idea or list ingredients you have, and AI will
        generate a full recipe for you to review.
      </p>
      <div className="flex gap-2">
        <Input
          id="ai-prompt"
          placeholder='e.g. "100g paneer and spinach"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) handleGenerate();
          }}
          disabled={isLoading}
          maxLength={500}
        />
        <Button onClick={handleGenerate} disabled={isLoading || prompt.trim().length < 3}>
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Generate
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
