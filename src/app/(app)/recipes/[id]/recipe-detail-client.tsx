"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Star, ChefHat } from "lucide-react";
import { toast } from "sonner";

import type { Recipe } from "@/types/database";
import { deleteRecipe, toggleFavorite, markAsMade } from "@/actions/recipes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface RecipeDetailClientProps {
  recipe: Recipe;
}

export function RecipeDetailClient({ recipe }: RecipeDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isFavorite, setIsFavorite] = useState(recipe.is_favorite);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [madeOpen, setMadeOpen] = useState(false);
  const [rating, setRating] = useState("");
  const [madeNotes, setMadeNotes] = useState("");

  function handleToggleFavorite() {
    setIsFavorite((prev) => !prev);
    startTransition(async () => {
      const { error } = await toggleFavorite(recipe.id);
      if (error) {
        setIsFavorite((prev) => !prev);
        toast.error(error);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const { error } = await deleteRecipe(recipe.id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Recipe deleted.");
      router.push("/recipes");
    });
  }

  function handleMarkAsMade() {
    startTransition(async () => {
      const ratingNum = rating ? Number(rating) : undefined;
      const notes = madeNotes.trim() || undefined;
      const { error } = await markAsMade(recipe.id, ratingNum, notes);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Marked as made!");
      setRating("");
      setMadeNotes("");
      setMadeOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Edit */}
      <Button asChild variant="outline" size="sm">
        <Link href={`/recipes/${recipe.id}/edit`}>
          <Pencil className="size-3.5" />
          Edit
        </Link>
      </Button>

      {/* Toggle favorite */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggleFavorite}
        disabled={isPending}
      >
        <Star
          className={cn(
            "size-3.5 transition-colors",
            isFavorite
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground"
          )}
        />
        {isFavorite ? "Favorited" : "Favorite"}
      </Button>

      {/* Mark as made */}
      <Dialog open={madeOpen} onOpenChange={setMadeOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <ChefHat className="size-3.5" />
            Mark as Made
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Made</DialogTitle>
            <DialogDescription>
              Record that you made this recipe. Optionally add a rating and
              notes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mark-rating">Rating (1-5)</Label>
              <Input
                id="mark-rating"
                type="number"
                min={1}
                max={5}
                placeholder="Optional"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mark-notes">Notes</Label>
              <Textarea
                id="mark-notes"
                placeholder="How did it turn out?"
                rows={3}
                value={madeNotes}
                onChange={(e) => setMadeNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMadeOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleMarkAsMade} disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="text-destructive">
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recipe</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{recipe.name}</strong>? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
