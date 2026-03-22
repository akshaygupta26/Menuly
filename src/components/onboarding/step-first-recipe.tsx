// src/components/onboarding/step-first-recipe.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { completeOnboarding } from "@/actions/onboarding";
import type { DietaryPreference, Allergy } from "@/types/onboarding";

interface StepFirstRecipeProps {
  preferences?: {
    meal_slots?: string[];
    dietary_preferences?: DietaryPreference[];
    allergies?: Allergy[];
  };
  onSkip: () => void;
}

export function StepFirstRecipe({
  preferences,
  onSkip,
}: StepFirstRecipeProps) {
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [imported, setImported] = useState(false);
  const router = useRouter();

  const handleImport = () => {
    if (!url.trim()) return;

    startTransition(async () => {
      try {
        const response = await fetch("/api/recipes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });

        if (!response.ok) {
          const data = await response.json();
          toast.error(data.error || "Failed to import recipe");
          return;
        }

        const data = await response.json();
        // Store imported data in sessionStorage for the new recipe page
        sessionStorage.setItem("importedRecipe", JSON.stringify(data));

        setImported(true);
        toast.success("Recipe imported!");

        // Complete onboarding, then navigate to create the recipe
        await completeOnboarding(preferences);
        setTimeout(() => router.push("/recipes/new"), 1000);
      } catch {
        toast.error("Failed to import recipe");
      }
    });
  };

  const handleCreateManually = async () => {
    await completeOnboarding(preferences);
    router.push("/recipes/new");
  };

  return (
    <div>
      <h2 className="text-center text-xl font-bold">
        Add Your First Recipe
      </h2>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Paste a URL from your favorite recipe site
      </p>

      {imported ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-sm font-medium">Recipe imported!</p>
          <p className="text-xs text-muted-foreground">Redirecting...</p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex gap-2">
            <Input
              type="url"
              placeholder="https://allrecipes.com/recipe/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isPending}
              onKeyDown={(e) => e.key === "Enter" && handleImport()}
            />
            <Button onClick={handleImport} disabled={isPending || !url.trim()}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Import"
              )}
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="mt-4 flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={handleCreateManually}>
              ✏️ Create Manually
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={onSkip}
              className="text-sm text-muted-foreground/60 underline hover:text-muted-foreground transition-colors"
            >
              I&apos;ll do this later →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
