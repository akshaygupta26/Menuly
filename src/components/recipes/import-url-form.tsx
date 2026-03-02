"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ImportUrlFormProps {
  onImport: (data: ImportedRecipeData) => void;
}

export interface ImportedRecipeData {
  name: string;
  ingredients: {
    raw_text: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    category: string;
  }[];
  instructions: string[];
  prepTime: number | null;
  cookTime: number | null;
  servings: number | null;
  image: string | null;
  url: string;
  nutrition: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  } | null;
  nutrition_source: "json_ld" | "usda" | null;
}

export function ImportUrlForm({ onImport }: ImportUrlFormProps) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError("Please enter a URL.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/recipes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error ?? `Import failed (${response.status})`
        );
      }

      const data: ImportedRecipeData = await response.json();
      onImport(data);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // Map technical errors to user-friendly messages
      let friendly: string;
      if (raw.includes("Could not reach")) {
        friendly =
          "Couldn't reach that website. Check the URL and try again.";
      } else if (raw.includes("No recipe data found")) {
        friendly =
          "No recipe found on that page. Try pasting the direct link to a recipe (not a search or category page).";
      } else if (raw.includes("Failed to fetch") || raw.includes("422")) {
        friendly =
          "This page doesn't have recipe data we can read. Try a different recipe URL.";
      } else if (raw.includes("Invalid URL")) {
        friendly = "That doesn't look like a valid URL. Please check and try again.";
      } else {
        friendly = raw || "Something went wrong importing this recipe. Please try again.";
      }
      setError(friendly);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Label htmlFor="import-url">Recipe URL</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="import-url"
            type="url"
            placeholder="https://www.example.com/recipe/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="pl-9"
            disabled={isLoading}
          />
        </div>
        <Button type="submit" disabled={isLoading || !url.trim()}>
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Importing...
            </>
          ) : (
            "Import"
          )}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </form>
  );
}
