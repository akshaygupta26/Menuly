// src/components/onboarding/step-overview.tsx
"use client";

import { UtensilsCrossed, CalendarDays, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StepOverviewProps {
  onNext: () => void;
  onSkip: () => void;
}

export function StepOverview({ onNext, onSkip }: StepOverviewProps) {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-foreground">
        Welcome to Menuly
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Here&apos;s how meal planning becomes effortless
      </p>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <UtensilsCrossed className="mx-auto h-8 w-8 text-primary" />
          <h3 className="mt-2 font-semibold text-sm">Build Recipes</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Import from URLs or create your own
          </p>
        </div>

        <div className="hidden sm:flex items-center pt-8 text-muted-foreground/30">→</div>

        <div className="flex-1 rounded-xl border border-secondary/30 bg-secondary/5 p-4">
          <CalendarDays className="mx-auto h-8 w-8 text-secondary-foreground/70" />
          <h3 className="mt-2 font-semibold text-sm">Plan Your Week</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Auto-generate with smart rotation
          </p>
        </div>

        <div className="hidden sm:flex items-center pt-8 text-muted-foreground/30">→</div>

        <div className="flex-1 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <ShoppingCart className="mx-auto h-8 w-8 text-blue-500" />
          <h3 className="mt-2 font-semibold text-sm">Shop Smart</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Consolidated list, syncs to Apple Reminders
          </p>
        </div>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <Button onClick={onNext}>Get Started</Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
