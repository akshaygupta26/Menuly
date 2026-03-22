// src/components/onboarding/step-preferences.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DIETARY_PREFERENCES, ALLERGIES } from "@/types/onboarding";
import type { MealType } from "@/types/database";
import type { DietaryPreference, Allergy } from "@/types/onboarding";

const MEAL_SLOT_OPTIONS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

interface StepPreferencesProps {
  onNext: (data: {
    mealSlots: MealType[];
    dietaryPreferences: DietaryPreference[];
    allergies: Allergy[];
  }) => void;
  onSkip: () => void;
}

export function StepPreferences({ onNext, onSkip }: StepPreferencesProps) {
  const [mealSlots, setMealSlots] = useState<MealType[]>([
    "breakfast",
    "lunch",
    "dinner",
  ]);
  const [selectedDietary, setSelectedDietary] = useState<DietaryPreference[]>([]);
  const [selectedAllergies, setSelectedAllergies] = useState<Allergy[]>([]);

  const toggleMealSlot = (slot: MealType) => {
    setMealSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    );
  };

  const toggleDietary = (pref: DietaryPreference) => {
    setSelectedDietary((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
  };

  const toggleAllergy = (allergy: Allergy) => {
    setSelectedAllergies((prev) =>
      prev.includes(allergy)
        ? prev.filter((a) => a !== allergy)
        : [...prev, allergy]
    );
  };

  return (
    <div>
      <h2 className="text-center text-xl font-bold">
        Personalize Your Experience
      </h2>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        You can always change these in Settings
      </p>

      {/* Meal Slots */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold">Which meals do you plan?</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {MEAL_SLOT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => toggleMealSlot(option.value)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                mealSlots.includes(option.value)
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {mealSlots.includes(option.value) && "✓ "}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dietary Preferences */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold">
          Dietary preferences{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIETARY_PREFERENCES.map((pref) => (
            <button
              key={pref}
              onClick={() => toggleDietary(pref)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                selectedDietary.includes(pref)
                  ? "border-secondary/50 bg-secondary/15 text-secondary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {selectedDietary.includes(pref) && "✓ "}
              {pref.charAt(0).toUpperCase() + pref.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Allergies */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold">
          Allergies{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ALLERGIES.map((allergy) => (
            <button
              key={allergy}
              onClick={() => toggleAllergy(allergy)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                selectedAllergies.includes(allergy)
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {selectedAllergies.includes(allergy) && "✓ "}
              {allergy
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <Button
          onClick={() =>
            onNext({
              mealSlots,
              dietaryPreferences: selectedDietary,
              allergies: selectedAllergies,
            })
          }
          disabled={mealSlots.length === 0}
        >
          Continue
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
