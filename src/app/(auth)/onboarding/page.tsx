// src/app/(auth)/onboarding/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StepOverview } from "@/components/onboarding/step-overview";
import { StepPreferences } from "@/components/onboarding/step-preferences";
import { StepFirstRecipe } from "@/components/onboarding/step-first-recipe";
import { completeOnboarding } from "@/actions/onboarding";
import type { MealType } from "@/types/database";
import type { DietaryPreference, Allergy } from "@/types/onboarding";

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState<{
    meal_slots?: string[];
    dietary_preferences?: DietaryPreference[];
    allergies?: Allergy[];
  }>({});
  const router = useRouter();

  const finishOnboarding = async () => {
    await completeOnboarding(preferences);
    router.push("/");
  };

  const handleStep2Next = (data: {
    mealSlots: MealType[];
    dietaryPreferences: DietaryPreference[];
    allergies: Allergy[];
  }) => {
    setPreferences({
      meal_slots: data.mealSlots,
      dietary_preferences: data.dietaryPreferences,
      allergies: data.allergies,
    });
    setStep(2);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      {/* Progress dots */}
      <div className="mb-6 flex justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              i === step
                ? "bg-primary"
                : i < step
                  ? "bg-primary/40"
                  : "bg-muted"
            }`}
          />
        ))}
      </div>

      {step === 0 && (
        <StepOverview onNext={() => setStep(1)} onSkip={finishOnboarding} />
      )}
      {step === 1 && (
        <StepPreferences
          onNext={handleStep2Next}
          onSkip={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <StepFirstRecipe
          preferences={preferences}
          onSkip={finishOnboarding}
        />
      )}
    </div>
  );
}
