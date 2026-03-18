# UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Menuly from a functional prototype into a polished, cohesive product with non-blocking interactions, editorial recipe cards, animated grocery list, and a consistent motion system.

**Architecture:** Keep existing page routes and data layer. Add a React context provider (`RecipeGenerationProvider`) at the root layout for background SSE processing. Replace blocking side sheets with an inline quick bar + options modal. Restyle recipe cards with editorial design (grid/list toggle). Refactor grocery list to toggle-with-visual-state model with optimistic updates. Add CSS motion tokens and page transitions throughout.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Supabase, shadcn/ui, sonner, CSS custom properties for motion tokens, View Transitions API (with fallback). No Framer Motion.

**Spec:** `docs/superpowers/specs/2026-03-17-ux-overhaul-design.md`

**Verification:** After every task, run `pnpm tsc --noEmit && pnpm lint`. After each chunk, run `pnpm build`.

---

## Chunk 1: Foundation — Motion Tokens, Shimmer Skeleton, Description Field

This chunk establishes the shared infrastructure everything else depends on: CSS motion tokens, a reusable shimmer skeleton component, and the `description` column on recipes.

### Task 1: Add motion tokens to globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add motion token CSS custom properties**

Add these tokens inside the existing `:root` / `@theme` block in `src/app/globals.css`, after the existing color variables:

```css
/* Motion tokens */
--duration-instant: 100ms;
--duration-fast: 200ms;
--duration-normal: 300ms;
--duration-smooth: 500ms;
--ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
--ease-out: cubic-bezier(0.0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

Also add a reduced-motion media query at the end of the file:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-instant: 0ms;
    --duration-fast: 0ms;
    --duration-normal: 0ms;
    --duration-smooth: 0ms;
  }
}
```

- [ ] **Step 2: Add shimmer keyframe animation**

Add to `src/app/globals.css`:

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "Add motion tokens and shimmer keyframe to globals.css"
```

---

### Task 2: Create shimmer skeleton component

**Files:**
- Create: `src/components/shared/shimmer-skeleton.tsx` (**NOT** in `src/components/ui/` — that directory is managed by shadcn CLI per CLAUDE.md)

- [ ] **Step 1: Create the shimmer skeleton component**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface ShimmerSkeletonProps {
  className?: string;
}

export function ShimmerSkeleton({ className }: ShimmerSkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite]",
        "bg-gradient-to-r from-[#f0f0f0] via-[#e8e8e8] to-[#f0f0f0]",
        className
      )}
    />
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/shimmer-skeleton.tsx
git commit -m "Add shimmer skeleton component"
```

**Note:** All imports of `ShimmerSkeleton` throughout this plan use `@/components/shared/shimmer-skeleton`.

---

### Task 3: Add description column to recipes table

**Files:**
- Create: `supabase/migrations/009_recipe_description.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create the migration**

```sql
-- Add description column to recipes for editorial subtitle
ALTER TABLE recipes ADD COLUMN description TEXT;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run the SQL via the Supabase dashboard or CLI. If using Supabase MCP:

```
mcp__plugin_supabase_supabase__apply_migration
```

- [ ] **Step 3: Add `description` to the Recipe type**

In `src/types/database.ts`, add `description: string | null;` to the `Recipe` interface, after the `name` field.

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/009_recipe_description.sql src/types/database.ts
git commit -m "Add description column to recipes table for editorial subtitle"
```

---

### Task 4: Add description to AI prompt schema and transform

**Files:**
- Modify: `src/lib/recipe-prompt-builder.ts` (lines 67-93 — JSON schema in system prompt)
- Modify: `src/app/api/recipes/generate/route.ts` (lines 58-101 — `transformToFormValues`)
- Modify: `src/components/recipes/recipe-form.tsx` (add to `RecipeFormValues` interface and form UI)

- [ ] **Step 1: Add description to the AI prompt JSON schema**

In `src/lib/recipe-prompt-builder.ts`, in the JSON schema block inside `systemPrompt`, add after the `"name"` field:

```
  "description": "string — a short, evocative one-line tagline for the recipe (e.g., 'Creamy, aromatic comfort food with a rich tomato base'). Max 120 chars. This appears as the editorial subtitle on recipe cards.",
```

- [ ] **Step 2: Add description to RecipeFormValues**

In `src/components/recipes/recipe-form.tsx`, add `description: string;` to the `RecipeFormValues` interface (after `name`). Add a default value of `""` in the form's `defaultValues` object. The form uses react-hook-form without Zod — add inline validation via `maxLength: 120` on the input's `register` call.

- [ ] **Step 3: Add description input to the recipe form**

In `src/components/recipes/recipe-form.tsx`, add a text input field for "Description" after the recipe name field. Single line, maxLength 120, placeholder "A short tagline — e.g., 'Creamy, aromatic comfort food'".

- [ ] **Step 4: Map description in transformToFormValues**

In `src/app/api/recipes/generate/route.ts`, inside `transformToFormValues()`, add after the `name` mapping:

```typescript
description: typeof recipe.description === "string" ? recipe.description : "",
```

- [ ] **Step 5: Save description in createRecipe and updateRecipe server actions**

In `src/actions/recipes.ts`, add `description` to the insert/update objects in both `createRecipe` and `updateRecipe` functions.

- [ ] **Step 6: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 7: Commit**

```bash
git add src/lib/recipe-prompt-builder.ts src/app/api/recipes/generate/route.ts src/components/recipes/recipe-form.tsx src/actions/recipes.ts
git commit -m "Add description field to AI prompt, form, and server actions"
```

---

### Task 5: Extract description from URL imports

**Files:**
- Modify: `src/lib/recipe-scraper.ts` (add description extraction)
- Modify: `src/components/recipes/import-url-form.tsx` (add description to ImportedRecipeData)
- Modify: `src/app/api/recipes/import/route.ts` (pass description through)

- [ ] **Step 1: Add description to ScrapedRecipe interface**

In `src/lib/recipe-scraper.ts`, add `description: string | null;` to the `ScrapedRecipe` interface.

- [ ] **Step 2: Extract description from JSON-LD**

In the `scrapeRecipe` function in `src/lib/recipe-scraper.ts`, after extracting the recipe name, add:

```typescript
const description = typeof recipe.description === "string"
  ? recipe.description.slice(0, 120)
  : null;
```

Include `description` in the returned `ScrapedRecipe` object.

- [ ] **Step 3: Add description to ImportedRecipeData**

In `src/components/recipes/import-url-form.tsx`, add `description?: string;` to the `ImportedRecipeData` interface.

- [ ] **Step 4: Pass description through the import API**

In `src/app/api/recipes/import/route.ts`, add `description: scraped.description ?? undefined` to the response object.

- [ ] **Step 5: Wire description into form defaults when importing**

In the component that consumes `ImportedRecipeData` and populates the `RecipeForm` (the new recipe page or import flow), ensure `description` from the imported data is passed into the form's `defaultValues`. Check how imported data flows from `ImportUrlForm` → `RecipeForm` and add `description` to that pipeline.

- [ ] **Step 6: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 7: Commit**

```bash
git add src/lib/recipe-scraper.ts src/components/recipes/import-url-form.tsx src/app/api/recipes/import/route.ts
git commit -m "Extract description from JSON-LD during URL import"
```

---

### Task 6: Create cuisine color mapping utility

**Files:**
- Create: `src/lib/cuisine-colors.ts`

- [ ] **Step 1: Create the utility**

```typescript
const CUISINE_GRADIENTS: Record<string, [string, string]> = {
  indian: ["#d4a574", "#c4956a"],
  italian: ["#8faa84", "#7a9570"],
  mexican: ["#e8c9a8", "#d4b08c"],
  thai: ["#e8d48a", "#d4c070"],
  chinese: ["#c47070", "#b05a5a"],
  japanese: ["#8a8aad", "#7070a0"],
  mediterranean: ["#7aa0b0", "#6090a0"],
  american: ["#8a9aad", "#7080a0"],
};

const FALLBACK_GRADIENT: [string, string] = ["#b0a898", "#a09888"];

export function getCuisineGradient(cuisineType: string | null): [string, string] {
  if (!cuisineType) return FALLBACK_GRADIENT;
  return CUISINE_GRADIENTS[cuisineType.toLowerCase()] ?? FALLBACK_GRADIENT;
}

export function getCuisineGradientStyle(cuisineType: string | null): string {
  const [from, to] = getCuisineGradient(cuisineType);
  return `linear-gradient(135deg, ${from}, ${to})`;
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/lib/cuisine-colors.ts
git commit -m "Add cuisine-to-gradient color mapping utility"
```

---

## Chunk 2: Recipe Creation Flow — Background Processing

This chunk replaces the blocking side sheet with a quick bar + options modal and adds the `RecipeGenerationProvider` context for background SSE processing.

### Task 7: Create RecipeGenerationProvider context

**Files:**
- Create: `src/lib/recipe-generation-context.tsx`

- [ ] **Step 1: Create the context provider**

This is the core of the background processing system. It manages SSE connections, draft state, and sessionStorage persistence.

```tsx
"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
// Import RecipeFormValues from the form file. If this creates a circular dependency
// later (when recipe-form imports from this context), extract RecipeFormValues
// into a shared types file at src/types/recipe-form.ts.
import type { RecipeFormValues } from "@/components/recipes/recipe-form";

export type DraftStatus = "generating" | "ready" | "error";

export interface DraftRecipe {
  id: string;
  status: DraftStatus;
  prompt: string;
  data: Partial<RecipeFormValues> | null;
  error: string | null;
  timestamp: number;
}

interface RecipeGenerationContextValue {
  drafts: DraftRecipe[];
  generate: (prompt: string) => void;
  removeDraft: (id: string) => void;
  retryDraft: (id: string) => void;
}

const RecipeGenerationContext = createContext<RecipeGenerationContextValue | null>(null);

export function useRecipeGeneration() {
  const ctx = useContext(RecipeGenerationContext);
  if (!ctx) throw new Error("useRecipeGeneration must be used within RecipeGenerationProvider");
  return ctx;
}

const STORAGE_KEY = "menuly-drafts";
const STALE_MS = 60 * 60 * 1000; // 1 hour

function loadDrafts(): DraftRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const drafts: DraftRecipe[] = JSON.parse(raw);
    const now = Date.now();
    // Clean stale entries
    return drafts.filter((d) => now - d.timestamp < STALE_MS && d.status !== "generating");
  } catch {
    return [];
  }
}

function saveDrafts(drafts: DraftRecipe[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function RecipeGenerationProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<DraftRecipe[]>([]);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  // Load drafts from sessionStorage on mount
  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);

  // Persist drafts to sessionStorage on change
  useEffect(() => {
    saveDrafts(drafts);
  }, [drafts]);

  const runGeneration = useCallback(async (draft: DraftRecipe) => {
    const controller = new AbortController();
    abortControllers.current.set(draft.id, controller);

    try {
      const res = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: draft.prompt }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Generation failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = JSON.parse(line.slice(6));

          if (json.error) {
            throw new Error(json.error);
          }

          if (json.done && json.data) {
            setDrafts((prev) =>
              prev.map((d) =>
                d.id === draft.id
                  ? { ...d, status: "ready" as const, data: json.data }
                  : d
              )
            );
            const recipeName = json.data.name ?? "Your recipe";
            toast.success(`${recipeName} is ready — tap to review`, {
              action: {
                label: "View",
                onClick: () => {
                  // Navigate to recipes page where the draft card is pinned to the top
                  window.location.href = "/recipes";
                },
              },
            });
            // Note: the toast navigates to /recipes (listing) where the draft card
            // is pinned at the top. Clicking the draft card then opens /recipes/new
            // with the data pre-populated.
            if (json.remaining !== null && json.remaining !== undefined) {
              toast.info(`${json.remaining} generation${json.remaining === 1 ? "" : "s"} remaining today`);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message = (err as Error).message ?? "Generation failed";
      setDrafts((prev) =>
        prev.map((d) =>
          d.id === draft.id ? { ...d, status: "error" as const, error: message } : d
        )
      );
      toast.error(message);
    } finally {
      abortControllers.current.delete(draft.id);
    }
  }, []);

  const generate = useCallback(
    (prompt: string) => {
      const draft: DraftRecipe = {
        id: crypto.randomUUID(),
        status: "generating",
        prompt,
        data: null,
        error: null,
        timestamp: Date.now(),
      };
      setDrafts((prev) => [draft, ...prev]);
      runGeneration(draft);
    },
    [runGeneration]
  );

  const removeDraft = useCallback((id: string) => {
    const controller = abortControllers.current.get(id);
    if (controller) controller.abort();
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const retryDraft = useCallback(
    (id: string) => {
      setDrafts((prev) => {
        const draft = prev.find((d) => d.id === id);
        if (!draft) return prev;
        const retried = { ...draft, status: "generating" as const, error: null, timestamp: Date.now() };
        runGeneration(retried);
        return prev.map((d) => (d.id === id ? retried : d));
      });
    },
    [runGeneration]
  );

  return (
    <RecipeGenerationContext.Provider value={{ drafts, generate, removeDraft, retryDraft }}>
      {children}
    </RecipeGenerationContext.Provider>
  );
}
```

- [ ] **Step 2: Mount provider in app layout**

In `src/app/(app)/layout.tsx`, wrap the children with `<RecipeGenerationProvider>`:

```tsx
import { RecipeGenerationProvider } from "@/lib/recipe-generation-context";

// Inside the layout component, wrap children:
<RecipeGenerationProvider>
  {/* existing AppShell + children */}
</RecipeGenerationProvider>
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 4: Commit**

```bash
git add src/lib/recipe-generation-context.tsx src/app/(app)/layout.tsx
git commit -m "Add RecipeGenerationProvider for background AI recipe generation"
```

---

### Task 8: Create the Quick Bar and Generation Options Modal

**Files:**
- Create: `src/components/recipes/quick-bar.tsx`
- Create: `src/components/recipes/generation-options-modal.tsx`

These two components are created together since the Quick Bar imports the Modal, and both must exist for type checking to pass.

- [ ] **Step 1: Create the Generation Options Modal first**

Create `src/components/recipes/generation-options-modal.tsx` with the compact centered dialog containing: prompt input + optional fields (cuisine, dietary, servings). See the full code for `GenerationOptionsModal` below in Step 2's companion file.

- [ ] **Step 2: Create the quick bar**

The quick bar is a persistent prompt input at the top of the recipes page. It has a text input, a generate button, and an expand button that opens the options modal.

```tsx
"use client";

import { useState, useRef } from "react";
import { Sparkles, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRecipeGeneration } from "@/lib/recipe-generation-context";
import { GenerationOptionsModal } from "./generation-options-modal";

export function QuickBar() {
  const [prompt, setPrompt] = useState("");
  const [showSent, setShowSent] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { generate } = useRecipeGeneration();

  const handleGenerate = () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3) return;
    generate(trimmed);
    setPrompt("");
    setShowSent(true);
    setTimeout(() => setShowSent(false), 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <>
      <div
        className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 transition-colors duration-[var(--duration-fast)]"
        style={{ transitionTimingFunction: "var(--ease-out)" }}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <Input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a recipe… 'chicken curry with coconut milk'"
          maxLength={500}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
        />
        {showSent && (
          <span className="shrink-0 text-xs text-primary animate-in fade-in">
            Sent!
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-8 w-8"
          onClick={() => setOptionsOpen(true)}
          title="More options"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={prompt.trim().length < 3}
          className="shrink-0"
        >
          Generate
        </Button>
      </div>

      <GenerationOptionsModal
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        initialPrompt={prompt}
        onGenerate={(fullPrompt) => {
          generate(fullPrompt);
          setPrompt("");
          setShowSent(true);
          setTimeout(() => setShowSent(false), 1500);
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Verify both files together**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 4: Commit both**

```bash
git add src/components/recipes/quick-bar.tsx src/components/recipes/generation-options-modal.tsx
git commit -m "Add Quick Bar and Generation Options Modal for AI recipe creation"
```

---

### Task 9: (Merged into Task 8)

The Generation Options Modal is now created as part of Task 8 Step 1. The full code for the modal:

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

interface GenerationOptionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt: string;
  onGenerate: (fullPrompt: string) => void;
}

const CUISINE_OPTIONS = [
  "italian", "mexican", "indian", "chinese", "japanese", "thai",
  "mediterranean", "american", "french", "korean", "vietnamese",
];

const DIETARY_OPTIONS = [
  "vegetarian", "vegan", "gluten-free", "dairy-free", "keto", "low-carb",
];

export function GenerationOptionsModal({
  open,
  onOpenChange,
  initialPrompt,
  onGenerate,
}: GenerationOptionsModalProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [cuisine, setCuisine] = useState("");
  const [dietary, setDietary] = useState("");
  const [servings, setServings] = useState("");

  // Sync initial prompt when modal opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) setPrompt(initialPrompt);
    onOpenChange(isOpen);
  };

  const handleSubmit = () => {
    const parts = [prompt.trim()];
    if (cuisine) parts.push(`${cuisine} cuisine`);
    if (dietary) parts.push(dietary);
    if (servings) parts.push(`${servings} servings`);
    const fullPrompt = parts.join(", ");
    if (fullPrompt.length < 3) return;
    onGenerate(fullPrompt);
    onOpenChange(false);
    // Reset optional fields
    setCuisine("");
    setDietary("");
    setServings("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create with AI</DialogTitle>
          <DialogDescription>
            Describe what you want to cook, optionally refine with preferences.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="gen-prompt">Recipe idea</Label>
            <Input
              id="gen-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., 'chicken curry with coconut milk'"
              maxLength={500}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="gen-cuisine">Cuisine</Label>
              <Select value={cuisine} onValueChange={setCuisine}>
                <SelectTrigger id="gen-cuisine">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {CUISINE_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="gen-dietary">Dietary</Label>
              <Select value={dietary} onValueChange={setDietary}>
                <SelectTrigger id="gen-dietary">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {DIETARY_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="gen-servings">Servings</Label>
              <Input
                id="gen-servings"
                type="number"
                min={1}
                max={20}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="4"
              />
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={prompt.trim().length < 3} className="w-full">
            Generate Recipe
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

*(No separate verify/commit — handled in Task 8 Step 3-4)*

---

### Task 10: Create Draft Recipe Card component

**Files:**
- Create: `src/components/recipes/draft-recipe-card.tsx`

- [ ] **Step 1: Create the draft card**

Three visual states: generating, ready, error. Uses shimmer skeleton and motion tokens.

```tsx
"use client";

import { Sparkles, AlertCircle, X, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import type { DraftRecipe } from "@/lib/recipe-generation-context";
import { useRecipeGeneration } from "@/lib/recipe-generation-context";

interface DraftRecipeCardProps {
  draft: DraftRecipe;
}

export function DraftRecipeCard({ draft }: DraftRecipeCardProps) {
  const router = useRouter();
  const { removeDraft, retryDraft } = useRecipeGeneration();

  const handleClick = () => {
    if (draft.status === "ready" && draft.data) {
      // Store draft data for the recipe form to pick up
      sessionStorage.setItem("ai-generated-recipe", JSON.stringify(draft.data));
      removeDraft(draft.id);
      router.push("/recipes/new");
    }
  };

  return (
    <Card
      className={`relative overflow-hidden border-2 border-dashed transition-all duration-[var(--duration-fast)] ${
        draft.status === "error"
          ? "border-destructive/50 bg-destructive/5"
          : "border-primary/40 bg-primary/5"
      } ${draft.status === "ready" ? "cursor-pointer hover:-translate-y-0.5" : ""}`}
      onClick={handleClick}
    >
      {/* Shimmer overlay for generating state */}
      {draft.status === "generating" && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite]" />
      )}

      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 z-10 h-6 w-6"
        onClick={(e) => {
          e.stopPropagation();
          removeDraft(draft.id);
        }}
      >
        <X className="h-3 w-3" />
      </Button>

      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        {draft.status === "generating" && (
          <>
            <Sparkles className="mb-2 h-6 w-6 text-primary animate-pulse" />
            <Badge variant="secondary" className="mb-2 bg-primary/10 text-primary">
              Generating...
            </Badge>
            <p className="text-xs text-muted-foreground">
              {draft.prompt.length > 50 ? draft.prompt.slice(0, 50) + "…" : draft.prompt}
            </p>
          </>
        )}

        {draft.status === "ready" && draft.data && (
          <>
            <Badge className="mb-2 bg-primary text-primary-foreground">
              <Sparkles className="mr-1 h-3 w-3" />
              Draft
            </Badge>
            <p className="font-semibold">{draft.data.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">Tap to review & save</p>
          </>
        )}

        {draft.status === "error" && (
          <>
            <AlertCircle className="mb-2 h-6 w-6 text-destructive" />
            <p className="text-sm text-destructive">{draft.error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={(e) => {
                e.stopPropagation();
                retryDraft(draft.id);
              }}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Retry
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/recipes/draft-recipe-card.tsx
git commit -m "Add DraftRecipeCard with generating/ready/error states"
```

---

### Task 11: Wire Quick Bar and Draft Cards into the recipes page

**Files:**
- Modify: `src/app/(app)/recipes/page.tsx`
- Modify: `src/app/(app)/recipes/recipes-client.tsx`
- Modify: `src/app/(app)/recipes/recipes-header-actions.tsx`

- [ ] **Step 1: Add QuickBar to the recipes page**

In `src/app/(app)/recipes/page.tsx`, add `<QuickBar />` between the header and the recipe list. Import from `@/components/recipes/quick-bar`.

- [ ] **Step 2: Render draft cards pinned to top of recipe grid**

In `src/app/(app)/recipes/recipes-client.tsx`:
- Import `useRecipeGeneration` and `DraftRecipeCard`
- Before the regular recipe cards in the grid, map over `drafts` and render `<DraftRecipeCard>` for each

- [ ] **Step 3: Remove the AI sheet from header actions**

In `src/app/(app)/recipes/recipes-header-actions.tsx`:
- Remove the Sheet component and `AiPromptInput` import
- Remove the "Create with AI" button (functionality now in QuickBar)
- Keep "Import URL" and "Add Recipe" buttons

- [ ] **Step 3b: Delete dead code files**

The following files are now dead code (replaced by Quick Bar + RecipeGenerationProvider):
- Delete: `src/components/recipes/ai-prompt-input.tsx`
- Delete: `src/components/recipes/streaming-recipe-preview.tsx`

Also remove the `AiPromptInput` usage from `src/app/(app)/recipes/new/page.tsx` if it renders the AI input inline. The new recipe page should only render the `RecipeForm` — AI generation is handled by the Quick Bar on the recipes listing page.

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/recipes/page.tsx src/app/(app)/recipes/recipes-client.tsx src/app/(app)/recipes/recipes-header-actions.tsx
git commit -m "Wire Quick Bar and draft cards into recipes page, remove AI sheet"
```

---

## Chunk 3: Recipe Browsing — Editorial Cards, Compact List, Filters

This chunk redesigns the recipe cards and adds the grid/list toggle with filter bar animations.

### Task 12: Redesign RecipeCard as editorial grid card

**Files:**
- Modify: `src/components/recipes/recipe-card.tsx`

- [ ] **Step 1: Redesign the recipe card**

Rewrite `src/components/recipes/recipe-card.tsx` with the editorial design. The JSX structure should be:

```tsx
<Card className="interactive-lift overflow-hidden rounded-[10px] ...">
  {/* Image section */}
  <Link href={`/recipes/${recipe.id}`}>
    {recipe.image_url ? (
      <div className="relative aspect-[16/9]">
        <img ... className="object-cover w-full h-full" />
        {/* Favorite button — top right, circular white bg */}
        <button className="absolute top-2 right-2 ... rounded-full bg-white/90">
          <Star className={recipe.is_favorite ? "fill-yellow-400 text-yellow-400" : "..."} />
        </button>
        {/* "Last made X ago" pill — bottom left, only if data exists */}
        {recipe.last_made_date && (
          <span className="absolute bottom-2 left-2 rounded-full bg-black/50 text-white text-xs px-2 py-0.5">
            {formatDistanceToNow(recipe.last_made_date)} ago
          </span>
        )}
      </div>
    ) : (
      <div className="relative aspect-[16/9]" style={{ background: getCuisineGradientStyle(recipe.cuisine_type) }}>
        {/* Same favorite button + no "last made" on gradient */}
      </div>
    )}
  </Link>

  {/* Content section */}
  <div className="p-4">
    <h3 className="font-semibold text-base">{recipe.name}</h3>
    {recipe.description && (
      <p className="text-sm italic text-muted-foreground mt-1 line-clamp-1">{recipe.description}</p>
    )}
    <div className="flex gap-1.5 text-xs text-muted-foreground mt-3 pt-3 border-t">
      {totalTime && <span>{totalTime} min</span>}
      {recipe.servings && <><span>·</span><span>{recipe.servings} servings</span></>}
      {recipe.calories && <><span>·</span><span>{Math.round(recipe.calories)} cal</span></>}
    </div>
  </div>
</Card>
```

Key changes from current card:
- **Keep `Star` icon** for favorites (matches existing codebase — not changing to Heart)
- Add `animate-heart-bounce` class on Star click via state toggle
- Remove badge soup (cuisine/protein badges) — metadata row only
- Add `description` display (italic, muted, hidden if null with `line-clamp-1`)
- Add `interactive-lift` class for hover lift animation
- Add cuisine gradient fallback for no-image via `getCuisineGradientStyle()`
- Import `getCuisineGradientStyle` from `@/lib/cuisine-colors`
- Import `formatDistanceToNow` from `date-fns` for "last made" pill

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/recipes/recipe-card.tsx
git commit -m "Redesign RecipeCard with editorial NYT-inspired style"
```

---

### Task 13: Create compact list card component

**Files:**
- Create: `src/components/recipes/recipe-card-compact.tsx`

- [ ] **Step 1: Create the compact card**

Horizontal layout: 60x60 thumbnail + text content. Used in list mode.

```tsx
"use client";

import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { Recipe } from "@/types/database";
import { getCuisineGradientStyle } from "@/lib/cuisine-colors";

interface RecipeCardCompactProps {
  recipe: Recipe;
  onToggleFavorite?: (id: string) => void;
}

export function RecipeCardCompact({ recipe, onToggleFavorite }: RecipeCardCompactProps) {
  const totalTime =
    (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0) || null;

  return (
    <Card className="flex items-center gap-3 p-3 transition-all duration-[var(--duration-fast)] hover:shadow-md"
      style={{ transitionTimingFunction: "var(--ease-out)" }}
    >
      {/* Thumbnail */}
      <Link href={`/recipes/${recipe.id}`} className="shrink-0">
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.name}
            className="h-[60px] w-[60px] rounded-md object-cover"
          />
        ) : (
          <div
            className="h-[60px] w-[60px] rounded-md"
            style={{ background: getCuisineGradientStyle(recipe.cuisine_type) }}
          />
        )}
      </Link>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <Link href={`/recipes/${recipe.id}`} className="block">
          <p className="truncate font-semibold text-sm">{recipe.name}</p>
        </Link>
        <p className="text-xs text-muted-foreground">
          {[recipe.cuisine_type, recipe.protein_type, totalTime ? `${totalTime}m` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-1 flex gap-1.5">
          {recipe.calories && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {Math.round(recipe.calories)} cal
            </Badge>
          )}
          {recipe.protein_g && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {Math.round(recipe.protein_g)}g protein
            </Badge>
          )}
        </div>
      </div>

      {/* Favorite */}
      {onToggleFavorite && (
        <button
          onClick={() => onToggleFavorite(recipe.id)}
          className="shrink-0 p-1 transition-transform duration-[var(--duration-fast)] active:scale-[0.9]"
        >
          <Star
            className={`h-4 w-4 ${recipe.is_favorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
          />
        </button>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/recipes/recipe-card-compact.tsx
git commit -m "Add RecipeCardCompact for list view mode"
```

---

### Task 14: Add grid/list toggle and filter animations to recipe list

**Files:**
- Modify: `src/app/(app)/recipes/recipes-client.tsx`
- Modify: `src/components/recipes/recipe-filters.tsx`

- [ ] **Step 1: Add grid/list toggle to the recipe list**

In `src/app/(app)/recipes/recipes-client.tsx`:
- Add a `viewMode` state (`"grid" | "list"`) persisted to `localStorage`
- Import `RecipeCardCompact`
- Conditionally render editorial cards (grid) or compact cards (list) based on `viewMode`
- Grid layout: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (existing)
- List layout: `grid-cols-1 sm:grid-cols-2`
- Add cross-fade transition between modes using opacity

- [ ] **Step 2: Add view toggle UI to the filter bar**

In `src/components/recipes/recipe-filters.tsx`:
- Add a grid/list toggle button group (using `LayoutGrid` and `List` icons from lucide-react) at the right end of the filter bar
- Active mode gets primary color fill, inactive gets muted
- Pass `viewMode` and `onViewModeChange` as new props

- [ ] **Step 3: Animate active filter pills**

In `src/components/recipes/recipe-filters.tsx`:
- Add `animate-in fade-in slide-in-from-bottom-1 duration-200` classes to active filter badges
- Add `hover:scale-105` to the "✕" button on each pill
- Add `transition-all duration-[var(--duration-fast)]` to "Clear all" button

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/recipes/recipes-client.tsx src/components/recipes/recipe-filters.tsx
git commit -m "Add grid/list toggle with animated filter pills"
```

---

### Task 15: Replace pulse skeleton with shimmer skeleton for recipe grid

**Files:**
- Modify: `src/app/(app)/recipes/loading.tsx` (file already exists — replace pulse skeletons with shimmer)

- [ ] **Step 1: Replace recipe grid skeleton loading page**

```tsx
import { ShimmerSkeleton } from "@/components/shared/shimmer-skeleton";

export default function RecipesLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Quick bar skeleton */}
      <ShimmerSkeleton className="h-11 w-full rounded-lg" />

      {/* Filter bar skeleton */}
      <div className="flex gap-3">
        <ShimmerSkeleton className="h-9 w-48 rounded-md" />
        <ShimmerSkeleton className="h-9 w-28 rounded-md" />
        <ShimmerSkeleton className="h-9 w-28 rounded-md" />
        <ShimmerSkeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-[10px]">
            <ShimmerSkeleton className="aspect-[16/9] w-full" />
            <div className="space-y-2 p-4">
              <ShimmerSkeleton className="h-5 w-3/4" />
              <ShimmerSkeleton className="h-3 w-1/2" />
              <ShimmerSkeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/recipes/loading.tsx
git commit -m "Add shimmer skeleton loading state for recipes page"
```

---

## Chunk 4: Grocery List — Toggle Model, Optimistic Updates, Animations

This chunk refactors the grocery list from remove-on-check to toggle-with-visual-state, adds optimistic updates with undo toasts, category collapse animations, and a progress bar.

### Task 16: Create GroceryProgressBar component

**Files:**
- Create: `src/components/grocery/grocery-progress-bar.tsx`

- [ ] **Step 1: Create the progress bar**

```tsx
"use client";

interface GroceryProgressBarProps {
  checked: number;
  total: number;
}

export function GroceryProgressBar({ checked, total }: GroceryProgressBarProps) {
  const percent = total > 0 ? (checked / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-sm text-muted-foreground">Shopping Progress</span>
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80"
          style={{
            width: `${percent}%`,
            transition: `width var(--duration-smooth) var(--ease-out)`,
          }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums text-primary">
        {checked} / {total}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/grocery/grocery-progress-bar.tsx
git commit -m "Add GroceryProgressBar component"
```

---

### Task 17: Refactor GroceryListView to toggle model with optimistic updates

**Files:**
- Modify: `src/components/grocery/grocery-list-view.tsx`

This is the largest single task. The grocery list needs to change from remove-on-check to toggle-with-visual-state.

- [ ] **Step 1: Change checkbox behavior from remove to toggle**

In `src/components/grocery/grocery-list-view.tsx`:
- The current code uses `removeGroceryItem` on checkbox click and the optimistic reducer removes items from the array
- Replace with `toggleGroceryItem` server action (already exists in `src/actions/grocery.ts`)
- Update the optimistic reducer action type: instead of `{ type: "remove", id }`, use `{ type: "toggle", id }` which toggles `is_checked` on the matching item
- The component currently has NO concept of `is_checked` in its rendering — add conditional styling based on `item.is_checked`

```typescript
// New reducer case:
case "toggle":
  return prev.map((item) =>
    item.id === action.id ? { ...item, is_checked: !item.is_checked } : item
  );
```

- [ ] **Step 2: Add optimistic toggle with undo toast**

- On checkbox click: dispatch `{ type: "toggle", id: item.id }` to optimistic state immediately
- Call `toggleGroceryItem(item.id)` server action async (don't await for UI)
- Show undo toast:
```typescript
toast(`✓ ${item.name} checked off`, {
  action: {
    label: "Undo",
    onClick: () => {
      // Dispatch another toggle to revert
      dispatch({ type: "toggle", id: item.id });
      toggleGroceryItem(item.id); // Toggle back on server
    },
  },
  duration: 3000,
});
```
- On server action failure (catch): dispatch `{ type: "toggle", id }` again to revert + `toast.error("Failed to update")`

- [ ] **Step 3: Add GroceryProgressBar**

Import and render `<GroceryProgressBar>` at the top of the list, below the header. Calculate `checked` (items where `is_checked === true`) and `total` (all items).

```typescript
const checkedCount = optimisticItems.filter((i) => i.is_checked).length;
// Render: <GroceryProgressBar checked={checkedCount} total={optimisticItems.length} />
```

- [ ] **Step 4: Add category collapse animation**

For each category group:
- Show category header with emoji + name + `checked/total` count
- When all items in a category are checked, auto-add to `collapsedCategories` state Set
- Header gets green styling when all done: `bg-green-50 text-green-700` + "All done" badge
- Tap header toggles collapse

Category collapse DOM structure (required for `grid-template-rows` animation):
```tsx
<div
  className="grid transition-all"
  style={{
    gridTemplateRows: isCollapsed ? "0fr" : "1fr",
    transitionDuration: "var(--duration-smooth)",
    transitionTimingFunction: "var(--ease-out)",
  }}
>
  <div className="overflow-hidden">
    {/* Item rows go here */}
  </div>
</div>
```

- [ ] **Step 5: Style checked items**

Checked items should have (stay in place, no reordering — simpler than spec's "slide to bottom"):
- Green filled checkbox: `bg-green-500 text-white rounded` with checkmark icon
- Text with `line-through text-muted-foreground/50`
- Transition: `opacity` and `color` with `var(--duration-fast)`
- All transitions use motion token CSS variables so `prefers-reduced-motion` is respected automatically

- [ ] **Step 6: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 7: Commit**

```bash
git add src/components/grocery/grocery-list-view.tsx
git commit -m "Refactor grocery list to toggle model with optimistic updates and animations"
```

---

### Task 18: Replace skeleton loading state for grocery list

**Files:**
- Modify: `src/app/(app)/grocery/loading.tsx` (if exists, replace; if not, create)

- [ ] **Step 1: Create/replace grocery list skeleton**

```tsx
import { ShimmerSkeleton } from "@/components/shared/shimmer-skeleton";

export default function GroceryLoading() {
  return (
    <div className="space-y-4 p-6">
      {/* Progress bar skeleton */}
      <ShimmerSkeleton className="h-6 w-full rounded-md" />

      {/* Category groups */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <ShimmerSkeleton className="h-8 w-40 rounded-md" />
          {Array.from({ length: 3 }).map((_, j) => (
            <ShimmerSkeleton key={j} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/grocery/loading.tsx
git commit -m "Add shimmer skeleton loading state for grocery page"
```

---

## Chunk 5: Navigation & Layout — Page Transitions, Micro-interactions

This chunk adds page transitions (including View Transitions API for recipe cards), and global micro-interactions.

### Task 19: Add global micro-interaction styles

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add micro-interaction utility classes**

Add to `src/app/globals.css`:

```css
/* Micro-interactions */
.interactive-press {
  transition: transform var(--duration-instant) var(--ease-out);
}
.interactive-press:active {
  transform: scale(0.97);
}

.interactive-lift {
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}
.interactive-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

/* Heart favorite bounce */
@keyframes heart-bounce {
  0% { transform: scale(1); }
  30% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
.animate-heart-bounce {
  animation: heart-bounce var(--duration-normal) var(--ease-spring);
}

/* Page transition: fade + slide up */
@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-page-enter {
  animation: page-enter var(--duration-fast) var(--ease-out);
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "Add global micro-interaction and page transition CSS classes"
```

---

### Task 20: Add page enter animation to page components

**Files:**
- Modify: `src/app/(app)/recipes/page.tsx`
- Modify: `src/app/(app)/grocery/page.tsx`
- Modify: `src/app/(app)/plan/page.tsx` (or its `[weekStart]/page.tsx`)
- Modify: `src/app/(app)/settings/page.tsx`

**Note:** Adding `animate-page-enter` to the layout wrapper does NOT work — Next.js App Router layouts don't re-mount on client navigation, so the animation only fires once on initial load. Instead, add the class to each **page** component's root wrapper.

- [ ] **Step 1: Add animate-page-enter to each page's root div**

In each page listed above, wrap the returned JSX in a `<div className="animate-page-enter">`. Since these are server components, the CSS animation triggers on mount. For client navigations, the page component re-renders when the route changes, triggering the animation.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/layout.tsx
git commit -m "Add page enter animation to app layout"
```

---

### Task 21: Add View Transitions API for recipe card → detail navigation

**Files:**
- Modify: `src/components/recipes/recipe-card.tsx` (add view-transition-name)
- Create: `src/lib/view-transitions.ts` (helper utility)

- [ ] **Step 1: Create View Transitions helper**

```typescript
export function navigateWithTransition(
  url: string,
  router: { push: (url: string) => void }
) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => {
      router.push(url);
    });
  } else {
    router.push(url);
  }
}
```

- [ ] **Step 2: Add view-transition-name to recipe card image**

In `src/components/recipes/recipe-card.tsx`, add `style={{ viewTransitionName: \`recipe-image-\${recipe.id}\` }}` to the image/gradient container, and `style={{ viewTransitionName: \`recipe-title-\${recipe.id}\` }}` to the recipe name element.

- [ ] **Step 3: Add matching view-transition-name to recipe detail page**

In the recipe detail page (find via `src/app/(app)/recipes/[id]/page.tsx`), add matching `viewTransitionName` styles to the hero image and title.

- [ ] **Step 4: Use navigateWithTransition in recipe card links**

Keep the `<Link>` component for SEO and cmd-click/right-click support, but intercept the click:

```tsx
<Link
  href={`/recipes/${recipe.id}`}
  onClick={(e) => {
    if ("startViewTransition" in document) {
      e.preventDefault();
      navigateWithTransition(`/recipes/${recipe.id}`, router);
    }
    // Otherwise let default Link behavior handle it (fallback fade+slide via CSS)
  }}
>
```

This preserves prefetching, `<a>` semantics, and "Open in new tab" while adding View Transitions when supported.

- [ ] **Step 5: Add View Transition CSS**

In `src/app/globals.css`:

```css
/* View Transitions API — scope to recipe transitions, not wildcard */
::view-transition-old(recipe-image),
::view-transition-new(recipe-image),
::view-transition-old(recipe-title),
::view-transition-new(recipe-title) {
  animation-duration: var(--duration-normal);
  animation-timing-function: var(--ease-in-out);
}
```

Note: Use named transitions (`recipe-image`, `recipe-title`) instead of the `*` wildcard to avoid affecting browser default cross-fade behavior. The `view-transition-name` values set in Steps 2-3 must match these CSS selectors (use `recipe-image` not `recipe-image-${id}` in the CSS, and set unique `viewTransitionName` per card in the JSX).

- [ ] **Step 6: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 7: Commit**

```bash
git add src/lib/view-transitions.ts src/components/recipes/recipe-card.tsx src/app/globals.css
git commit -m "Add View Transitions API for recipe card to detail navigation"
```

---

### Task 22: Apply micro-interactions across components

**Files:**
- Modify: `src/components/recipes/recipe-card.tsx` (add `interactive-lift` class)
- Modify: `src/components/recipes/recipe-card-compact.tsx` (add `interactive-press`)
- Modify: `src/components/recipes/recipe-card.tsx`
- Modify: `src/components/recipes/recipe-card-compact.tsx`
- Modify: `src/components/recipes/quick-bar.tsx`
- Modify: `src/components/recipes/recipe-form.tsx`
- Modify: `src/components/grocery/grocery-list-view.tsx`
- Modify: `src/components/recipes/recipe-filters.tsx`

- [ ] **Step 1: Add interactive-lift to recipe grid cards**

In `src/components/recipes/recipe-card.tsx`, add the `interactive-lift` class to the card wrapper. (May already be done from Task 12 — verify.)

- [ ] **Step 2: Add interactive-press to buttons**

Add `interactive-press` class to primary action buttons in the files listed above:
- `quick-bar.tsx`: "Generate" button
- `recipe-form.tsx`: "Save Recipe" button
- `grocery-list-view.tsx`: "Add" button in the add-item section
- `recipe-filters.tsx`: filter dropdown buttons
- `recipe-card-compact.tsx`: favorite star button

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/recipes/recipe-card.tsx src/components/recipes/recipe-card-compact.tsx src/components/recipes/quick-bar.tsx src/components/recipes/recipe-form.tsx src/components/grocery/grocery-list-view.tsx src/components/recipes/recipe-filters.tsx
git commit -m "Apply micro-interaction classes across components"
```

---

### Task 23: Final build verification

- [ ] **Step 1: Full type check**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Full lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: successful build with no errors

- [ ] **Step 4: Manual visual smoke test**

Run: `pnpm dev` and verify:
1. Quick bar appears on recipes page
2. AI generation runs in background, draft card appears
3. Draft card updates when generation completes
4. Toast notification appears with recipe name
5. Recipe cards have editorial styling with hover lift
6. Grid/list toggle works with animation
7. Grocery list checkbox toggles (not removes)
8. Grocery progress bar updates
9. Category collapse animation works
10. Page transitions are smooth

- [ ] **Step 5: Final commit if any cleanup needed**

Stage only specific changed files (do not use `git add -A`) and commit.

**Known spec items deferred to a follow-up iteration:**
- URL import via Quick Bar (background scraping)
- Directional page transitions (slide left/right based on navigation depth)
- Tab/filter underline slide animation
- Filter dropdown open/close height animation
- Search input focus ring animation
- Counter roll animation on progress bar
- Meal plan shimmer skeleton

These are polish items that can be added incrementally after the core UX overhaul lands.
