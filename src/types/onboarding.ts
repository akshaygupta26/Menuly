// src/types/onboarding.ts

export const ONBOARDING_PAGES = [
  "dashboard",
  "recipes",
  "plan",
  "grocery",
  "settings",
] as const;

export type OnboardingPage = (typeof ONBOARDING_PAGES)[number];

export const DIETARY_PREFERENCES = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "keto",
  "paleo",
  "gluten-free",
  "dairy-free",
  "low-carb",
  "mediterranean",
  "halal",
  "kosher",
] as const;

export type DietaryPreference = (typeof DIETARY_PREFERENCES)[number];

export const ALLERGIES = [
  "peanuts",
  "tree-nuts",
  "dairy",
  "eggs",
  "shellfish",
  "soy",
  "wheat-gluten",
  "fish",
  "sesame",
] as const;

export type Allergy = (typeof ALLERGIES)[number];

export interface OnboardingPageConfig {
  banner: {
    icon: string;
    title: string;
    description: string;
  };
  spotlights: {
    target: string; // data-onboarding attribute value
    title: string;
    description: string;
  }[];
}
