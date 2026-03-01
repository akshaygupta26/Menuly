import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { getActiveGroceryList } from "@/actions/grocery";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { GroceryListView } from "@/components/grocery/grocery-list-view";

export default async function GroceryPage() {
  const { data, error } = await getActiveGroceryList();

  if (error) {
    return (
      <>
        <Header title="Grocery List" />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header title="Grocery List" />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <ShoppingCart className="size-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-semibold">No active grocery list</h2>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            Generate one from a finalized meal plan.
          </p>
          <Button asChild>
            <Link href="/plan">Go to Meal Plan</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Grocery List"
        subtitle={`${data.items.length} item${data.items.length !== 1 ? "s" : ""}`}
      />
      <GroceryListView initialList={data.list} initialItems={data.items} />
    </>
  );
}
