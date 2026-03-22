"use client";

import { useEffect, useState } from "react";
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
  const { isPageVisited, markPageVisited, activeGuide, showGuide } = useOnboarding();
  const config = ONBOARDING_CONFIG[page];
  const [showBanner, setShowBanner] = useState(false);
  const spotlight = useSpotlight(config.spotlights);
  const { start: startSpotlight } = spotlight;

  // Show banner on first visit
  useEffect(() => {
    if (!isPageVisited(page)) {
      setShowBanner(true);
    }
  }, [page, isPageVisited]);

  // Handle "Show me around" triggering from help icon
  useEffect(() => {
    if (activeGuide === page) {
      setShowBanner(true);
      startSpotlight();
    }
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

  const handleShowGuide = () => {
    showGuide(page);
    setShowBanner(true);
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
