"use client";

import { useState, useCallback } from "react";
import { Sparkles, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRecipeGeneration } from "@/lib/recipe-generation-context";
import { GenerationOptionsModal } from "./generation-options-modal";

export function QuickBar() {
  const { generate } = useRecipeGeneration();
  const [prompt, setPrompt] = useState("");
  const [sent, setSent] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const handleGenerate = useCallback(
    (fullPrompt: string) => {
      const trimmed = fullPrompt.trim();
      if (trimmed.length < 3) return;
      generate(trimmed);
      setPrompt("");
      setSent(true);
      setTimeout(() => setSent(false), 1500);
    },
    [generate]
  );

  function handleSubmit() {
    handleGenerate(prompt);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const canSubmit = prompt.trim().length >= 3;

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
        {/* Left: Sparkles icon */}
        <Sparkles className="size-4 shrink-0 text-primary" />

        {/* Center: Prompt input */}
        <Input
          className="min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
          placeholder="Describe a recipe… 'chicken curry with coconut milk'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
        />

        {/* Right: Settings + Generate */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={() => setModalOpen(true)}
            aria-label="More generation options"
          >
            <Settings2 className="size-4" />
          </Button>

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="shrink-0"
          >
            {sent ? "Sent!" : "Generate"}
          </Button>
        </div>
      </div>

      <GenerationOptionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialPrompt={prompt}
        onGenerate={handleGenerate}
      />
    </>
  );
}
