"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IngredientCategory } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddItemInputProps {
  onAdd: (name: string, category?: IngredientCategory) => void;
}

const CATEGORY_OPTIONS: { value: IngredientCategory; label: string }[] = [
  { value: "produce", label: "Produce" },
  { value: "dairy", label: "Dairy" },
  { value: "meat", label: "Meat & Seafood" },
  { value: "pantry", label: "Pantry" },
  { value: "frozen", label: "Frozen" },
  { value: "bakery", label: "Bakery" },
  { value: "beverages", label: "Beverages" },
  { value: "other", label: "Other" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddItemInput({ onAdd }: AddItemInputProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<IngredientCategory>("other");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) return;

    onAdd(trimmed, category);
    setName("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <label htmlFor="grocery-item-name" className="sr-only">Item name</label>
      <Input
        id="grocery-item-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an item..."
        className="flex-1"
        maxLength={100}
      />
      <label htmlFor="grocery-item-category" className="sr-only">Category</label>
      <Select
        value={category}
        onValueChange={(val) => setCategory(val as IngredientCategory)}
      >
        <SelectTrigger id="grocery-item-category" className="w-[140px]" size="default">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CATEGORY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={!name.trim()}>
        <Plus className="size-4" />
        Add
      </Button>
    </form>
  );
}
