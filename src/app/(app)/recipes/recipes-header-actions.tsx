"use client";

import Link from "next/link";
import { Plus, Link as LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RecipesHeaderActions() {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href="/recipes/import">
          <LinkIcon className="size-4" />
          <span className="hidden sm:inline">Import URL</span>
        </Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/recipes/new">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Add Recipe</span>
        </Link>
      </Button>
    </div>
  );
}
