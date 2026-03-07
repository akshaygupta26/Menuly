"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Link as LinkIcon, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AiPromptInput } from "@/components/recipes/ai-prompt-input";
import type { RecipeFormValues } from "@/components/recipes/recipe-form";

const SESSION_KEY = "ai-generated-recipe";

export function RecipesHeaderActions() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleGenerated(data: Partial<RecipeFormValues>) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    setOpen(false);
    router.push("/recipes/new");
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href="/recipes/import">
          <LinkIcon className="size-4" />
          <span className="hidden sm:inline">Import URL</span>
        </Link>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Sparkles className="size-4" />
            <span className="hidden sm:inline">Create with AI</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Generate with AI</SheetTitle>
            <SheetDescription>
              Describe a recipe idea or list ingredients, and AI will generate a
              full recipe for you to review.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <AiPromptInput onGenerated={handleGenerated} />
          </div>
        </SheetContent>
      </Sheet>
      <Button asChild size="sm">
        <Link href="/recipes/new">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Add Recipe</span>
        </Link>
      </Button>
    </div>
  );
}
