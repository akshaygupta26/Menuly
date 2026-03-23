"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getOnboardingState, updateOnboardingPageVisit } from "@/actions/onboarding";
import type { OnboardingPage } from "@/types/onboarding";

interface OnboardingContextValue {
  pageVisits: Partial<Record<OnboardingPage, boolean>>;
  markPageVisited: (page: OnboardingPage) => Promise<void>;
  showGuide: (page: OnboardingPage) => void;
  activeGuide: OnboardingPage | null;
  isPageVisited: (page: OnboardingPage) => boolean;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [pageVisits, setPageVisits] = useState<Partial<Record<OnboardingPage, boolean>>>({});
  const [activeGuide, setActiveGuide] = useState<OnboardingPage | null>(null);

  useEffect(() => {
    getOnboardingState().then((result) => {
      if (result.data) {
        setPageVisits(result.data.onboarding_page_visits);
      }
    });
  }, []);

  const markPageVisited = useCallback(async (page: OnboardingPage) => {
    setPageVisits((prev) => ({ ...prev, [page]: true }));
    await updateOnboardingPageVisit(page);
  }, []);

  const showGuide = useCallback((page: OnboardingPage) => {
    setActiveGuide(page);
  }, []);

  const isPageVisited = useCallback(
    (page: OnboardingPage) => !!pageVisits[page],
    [pageVisits]
  );

  return (
    <OnboardingContext.Provider
      value={{ pageVisits, markPageVisited, showGuide, activeGuide, isPageVisited }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}
