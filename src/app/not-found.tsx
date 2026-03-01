import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <UtensilsCrossed className="mb-4 size-12 text-muted-foreground/50" />
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        404
      </h1>
      <p className="mt-2 text-lg text-muted-foreground">
        This page doesn&apos;t exist. Maybe the recipe was eaten?
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to Home</Link>
      </Button>
    </div>
  );
}
