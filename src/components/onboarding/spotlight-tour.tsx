"use client";

import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";

// SSR-safe mount check without useEffect + setState
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

function useIsMounted() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface SpotlightTourProps {
  visible: boolean;
  targetRect: { top: number; left: number; width: number; height: number } | null;
  step: { title: string; description: string } | null;
  stepNumber: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}

export function SpotlightTour({
  visible,
  targetRect,
  step,
  stepNumber,
  totalSteps,
  onNext,
  onSkip,
}: SpotlightTourProps) {
  const mounted = useIsMounted();

  if (!mounted || !targetRect || !step) return null;

  const padding = 8;
  const isLastStep = stepNumber === totalSteps;

  // Calculate tooltip position (prefer below, fall back to above)
  const tooltipTop = targetRect.top + targetRect.height + padding + 12;
  const tooltipLeft = Math.max(16, targetRect.left);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {/* Overlay with cutout */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.6)`,
          top: targetRect.top - padding,
          left: targetRect.left - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
          borderRadius: 8,
          pointerEvents: "none",
        }}
      />

      {/* Click-blocker for the overlay area */}
      <div className="absolute inset-0" onClick={onSkip} />

      {/* Tooltip */}
      <div
        className="absolute z-[101] w-72 rounded-xl border border-border bg-popover p-4 shadow-xl transition-all duration-150"
        style={{
          top: tooltipTop,
          left: tooltipLeft,
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-4px)",
        }}
      >
        <h4 className="text-sm font-semibold">{step.title}</h4>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {step.description}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground/50">
            {stepNumber} of {totalSteps}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Skip
            </button>
            <button
              onClick={onNext}
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {isLastStep ? "Done" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
