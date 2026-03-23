"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface SpotlightStep {
  target: string;
  title: string;
  description: string;
}

interface SpotlightPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function useSpotlight(steps: SpotlightStep[]) {
  const [currentStep, setCurrentStep] = useState(-1); // -1 = inactive
  const [targetRect, setTargetRect] = useState<SpotlightPosition | null>(null);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  });

  const isActive = currentStep >= 0;
  const activeStepData = isActive ? steps[currentStep] : null;

  // Skip missing targets — uses requestAnimationFrame to avoid synchronous setState in effect
  useEffect(() => {
    if (currentStep < 0) return;
    const step = stepsRef.current[currentStep];
    if (!step) {
      requestAnimationFrame(() => setCurrentStep(-1));
      return;
    }
    const el = document.querySelector(`[data-onboarding="${step.target}"]`);
    if (!el) {
      const next = currentStep + 1;
      requestAnimationFrame(() =>
        setCurrentStep(next < stepsRef.current.length ? next : -1)
      );
    }
  }, [currentStep]);

  const updatePosition = useCallback(() => {
    const step = stepsRef.current[stepsRef.current.length > 0 ? Math.max(0, currentStep) : 0];
    if (!step || currentStep < 0) return;
    const el = document.querySelector(`[data-onboarding="${step.target}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTargetRect({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    });

    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentStep]);

  useEffect(() => {
    if (!isActive) {
      // Use rAF to avoid synchronous setState in effect cleanup
      requestAnimationFrame(() => {
        setVisible(false);
        setTargetRect(null);
      });
      return;
    }
    const timer = setTimeout(() => setVisible(true), 50);
    updatePosition();

    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, currentStep, updatePosition]);

  const start = useCallback(() => setCurrentStep(0), []);

  const next = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setCurrentStep((prev) => {
        const nextStep = prev + 1;
        return nextStep < stepsRef.current.length ? nextStep : -1;
      });
    }, 150);
  }, []);

  const skip = useCallback(() => {
    setVisible(false);
    setTimeout(() => setCurrentStep(-1), 150);
  }, []);

  const totalSteps = steps.length;
  const stepNumber = currentStep + 1;

  return useMemo(
    () => ({
      isActive,
      visible,
      targetRect,
      activeStep: activeStepData,
      stepNumber,
      totalSteps,
      start,
      next,
      skip,
    }),
    [isActive, visible, targetRect, activeStepData, stepNumber, totalSteps, start, next, skip]
  );
}
