"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Square } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StreamingRecipePreview } from "@/components/recipes/streaming-recipe-preview";
import type { RecipeFormValues } from "@/components/recipes/recipe-form";

interface AiPromptInputProps {
  onGenerated: (data: Partial<RecipeFormValues>) => void;
}

export function AiPromptInput({ onGenerated }: AiPromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup: abort on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleDismiss = useCallback(() => {
    setStreamedText("");
    setStreamError(null);
  }, []);

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (trimmed.length < 3) {
      toast.error("Please enter at least 3 characters");
      return;
    }

    // Reset state
    setIsStreaming(true);
    setStreamedText("");
    setStreamError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
        signal: abortController.signal,
      });

      // Handle non-streaming error responses (auth, rate limit, validation)
      if (!res.ok) {
        const json = await res.json();
        if (res.status === 429) {
          toast.error(
            "Daily limit reached. You can generate 3 recipes per day."
          );
        } else {
          toast.error(json.error || "Failed to generate recipe");
        }
        setIsStreaming(false);
        return;
      }

      // Consume SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        toast.error("Streaming not supported");
        setIsStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split("\n");
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data: ")) continue;

          const jsonStr = trimmedLine.slice(6);
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.token) {
            setStreamedText((prev) => prev + (event.token as string));
          } else if (event.done) {
            onGenerated(event.data as Partial<RecipeFormValues>);
            // Auto-dismiss preview so user focuses on the populated form
            setStreamedText("");
            const remaining = event.remaining as number | null;
            if (remaining !== null && remaining !== undefined) {
              toast.success(
                `Recipe generated! ${remaining} generation${remaining === 1 ? "" : "s"} remaining today.`
              );
            } else {
              toast.success("Recipe generated! Review and edit below.");
            }
          } else if (event.error) {
            setStreamError(event.error as string);
            toast.error(event.error as string);
          }
        }
      }
    } catch (err) {
      // Abort is not an error
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      toast.error("Something went wrong. Please try again.");
      setStreamError("Connection failed. Please try again.");
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  const showPreview = isStreaming || streamedText.length > 0 || streamError;

  return (
    <div className="overflow-hidden rounded-lg border bg-card p-4">
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
          className="min-w-0"
          placeholder='e.g. "100g paneer and spinach"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isStreaming) handleGenerate();
          }}
          disabled={isStreaming}
          maxLength={500}
        />
        {isStreaming ? (
          <Button onClick={handleStop} variant="destructive" className="shrink-0">
            <Square className="size-4" />
            Stop
          </Button>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={prompt.trim().length < 3}
            className="shrink-0"
          >
            <Sparkles className="size-4" />
            Generate
          </Button>
        )}
      </div>

      {showPreview && (
        <StreamingRecipePreview
          text={streamedText}
          isStreaming={isStreaming}
          error={streamError}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
}
