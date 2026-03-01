import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getGroceryList } from "@/actions/grocery";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { GroceryListView } from "@/components/grocery/grocery-list-view";

interface GroceryListDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function GroceryListDetailPage({
  params,
}: GroceryListDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getGroceryList(id);

  if (error || !data) {
    notFound();
  }

  return (
    <>
      <Header
        title={data.list.name}
        subtitle={`${data.items.length} item${data.items.length !== 1 ? "s" : ""}`}
      >
        <Button asChild variant="ghost" size="sm">
          <Link href="/grocery">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
      </Header>
      <GroceryListView initialList={data.list} initialItems={data.items} />
    </>
  );
}
