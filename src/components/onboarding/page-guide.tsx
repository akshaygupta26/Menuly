"use client";

import { useEffect, useRef, useState } from "react";
import { useOnboarding } from "./onboarding-provider";
import { PageGuideBanner } from "./page-guide-banner";
import { SpotlightTour } from "./spotlight-tour";
import { HelpIcon } from "./help-icon";
import { useSpotlight } from "@/hooks/use-spotlight";
import { ONBOARDING_CONFIG } from "@/lib/onboarding-config";
import type { OnboardingPage } from "@/types/onboarding";

interface PageGuideProps {
  page: OnboardingPage;
}

export function PageGuide({ page }: PageGuideProps) {
  const { isPageVisited, markPageVisited, activeGuide } = useOnboarding();
  const config = ONBOARDING_CONFIG[page];
  // Initialize banner visibility based on whether page was already visited
  const [showBanner, setShowBanner] = useState(() => !isPageVisited(page));
  const spotlight = useSpotlight(config.spotlights);
  const { start: startSpotlight } = spotlight;
  const prevActiveGuide = useRef(activeGuide);

  // Handle "Show me around" triggering from help icon — only react to changes
  useEffect(() => {
    if (activeGuide === page && prevActiveGuide.current !== page) {
      // Use a microtask to avoid synchronous setState in effect
      queueMicrotask(() => {
        setShowBanner(true);
        startSpotlight();
      });
    }
    prevActiveGuide.current = activeGuide;
  }, [activeGuide, page, startSpotlight]);

  const handleDismissBanner = () => {
    // Capture first-visit state before marking as visited
    const wasFirstVisit = !isPageVisited(page);
    setShowBanner(false);
    markPageVisited(page);
    // Start spotlights after banner dismissal (first visit only)
    if (wasFirstVisit) {
      setTimeout(() => startSpotlight(), 300);
    }
  };

  return (
    <>
      {/* Banner */}
      {showBanner && (
        <PageGuideBanner
          icon={config.banner.icon}
          title={config.banner.title}
          description={config.banner.description}
          onDismiss={handleDismissBanner}
        />
      )}

      {/* Spotlight tour */}
      <SpotlightTour
        visible={spotlight.visible}
        targetRect={spotlight.targetRect}
        step={spotlight.activeStep}
        stepNumber={spotlight.stepNumber}
        totalSteps={spotlight.totalSteps}
        onNext={spotlight.next}
        onSkip={spotlight.skip}
      />
    </>
  );
}

/**
 * Separate component for the help icon — pages render this inside their <Header> children.
 * Must be used inside a component that is a descendant of OnboardingProvider.
 */
export function PageGuideHelpIcon({ page }: { page: OnboardingPage }) {
  const { showGuide } = useOnboarding();
  return <HelpIcon onClick={() => showGuide(page)} />;
}
