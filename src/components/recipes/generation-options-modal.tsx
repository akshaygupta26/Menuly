"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CUISINE_OPTIONS = [
  { value: "italian", label: "Italian" },
  { value: "mexican", label: "Mexican" },
  { value: "indian", label: "Indian" },
  { value: "chinese", label: "Chinese" },
  { value: "japanese", label: "Japanese" },
  { value: "thai", label: "Thai" },
  { value: "mediterranean", label: "Mediterranean" },
  { value: "american", label: "American" },
  { value: "french", label: "French" },
  { value: "korean", label: "Korean" },
  { value: "vietnamese", label: "Vietnamese" },
];

const DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten-free", label: "Gluten-Free" },
  { value: "dairy-free", label: "Dairy-Free" },
  { value: "keto", label: "Keto" },
  { value: "low-carb", label: "Low-Carb" },
];

interface GenerationOptionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt: string;
  onGenerate: (fullPrompt: string) => void;
}

/**
 * Inner form rendered inside the Dialog. Receives `initialPrompt` as initial
 * state. A fresh instance is mounted each time the dialog opens (via `key` on
 * the Dialog) so state resets without needing setState inside an effect.
 */
function GenerationOptionsForm({
  initialPrompt,
  onGenerate,
  onClose,
}: {
  initialPrompt: string;
  onGenerate: (fullPrompt: string) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [cuisine, setCuisine] = useState<string>("");
  const [dietary, setDietary] = useState<string>("");
  const [servings, setServings] = useState<string>("");

  function buildFullPrompt(): string {
    const parts: string[] = [];
    if (prompt.trim()) parts.push(prompt.trim());
    if (cuisine) parts.push(`${cuisine} cuisine`);
    if (dietary) parts.push(dietary);
    if (servings) parts.push(`${servings} servings`);
    return parts.join(", ");
  }

  function handleSubmit() {
    const fullPrompt = buildFullPrompt();
    if (fullPrompt.trim().length < 3) return;
    onGenerate(fullPrompt);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const canSubmit = buildFullPrompt().trim().length >= 3;

  return (
    <div className="flex flex-col gap-4 py-2" onKeyDown={handleKeyDown}>
      {/* Prompt */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gen-prompt">What would you like to make?</Label>
        <Input
          id="gen-prompt"
          autoFocus
          placeholder="e.g. chicken curry with coconut milk"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={500}
        />
      </div>

      {/* Cuisine */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gen-cuisine">Cuisine (optional)</Label>
        <Select value={cuisine} onValueChange={setCuisine}>
          <SelectTrigger id="gen-cuisine">
            <SelectValue placeholder="Any cuisine" />
          </SelectTrigger>
          <SelectContent>
            {CUISINE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dietary */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gen-dietary">Dietary (optional)</Label>
        <Select value={dietary} onValueChange={setDietary}>
          <SelectTrigger id="gen-dietary">
            <SelectValue placeholder="No restriction" />
          </SelectTrigger>
          <SelectContent>
            {DIETARY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Servings */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gen-servings">Servings (optional)</Label>
        <Input
          id="gen-servings"
          type="number"
          min={1}
          max={20}
          placeholder="e.g. 4"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
        />
      </div>

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
        Generate Recipe
      </Button>
    </div>
  );
}

export function GenerationOptionsModal({
  open,
  onOpenChange,
  initialPrompt,
  onGenerate,
}: GenerationOptionsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * `key={String(open)}` remounts GenerationOptionsForm each time the
       * dialog opens, so it picks up the latest `initialPrompt` without
       * needing setState inside an effect.
       */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Recipe</DialogTitle>
        </DialogHeader>
        <GenerationOptionsForm
          key={String(open)}
          initialPrompt={initialPrompt}
          onGenerate={onGenerate}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
