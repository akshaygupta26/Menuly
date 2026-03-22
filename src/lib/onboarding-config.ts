// src/lib/onboarding-config.ts
import type { OnboardingPage, OnboardingPageConfig } from "@/types/onboarding";

export const ONBOARDING_CONFIG: Record<OnboardingPage, OnboardingPageConfig> = {
  dashboard: {
    banner: {
      icon: "📋",
      title: "Here's your hub",
      description:
        "See your week at a glance — track your meal plan, recipe collection, and grocery list all in one place.",
    },
    spotlights: [
      {
        target: "quick-actions",
        title: "Quick Actions",
        description:
          "Jump straight to adding recipes, planning your week, or viewing your grocery list.",
      },
      {
        target: "plan-card",
        title: "This Week's Plan",
        description:
          "See how many meals you've planned and whether your plan is still a draft or finalized.",
      },
      {
        target: "recipe-card",
        title: "Recipe Collection",
        description:
          "Track how many recipes you have and how many are favorited.",
      },
    ],
  },
  recipes: {
    banner: {
      icon: "🍳",
      title: "Build your recipe library",
      description:
        "Import recipes from any URL, generate new ones with AI, or create them manually. The more recipes you add, the better your meal plans will be!",
    },
    spotlights: [
      {
        target: "add-recipe",
        title: "Add Recipe",
        description:
          "Import from a URL, generate with AI, or create a recipe from scratch.",
      },
      {
        target: "search-filter",
        title: "Search & Filter",
        description:
          "Find recipes by name, cuisine, protein type, or meal type.",
      },
      {
        target: "favorite-toggle",
        title: "Save Favorites",
        description:
          "Heart your go-to recipes so they're easy to find later.",
      },
    ],
  },
  plan: {
    banner: {
      icon: "📅",
      title: "Plan your week with smart rotation",
      description:
        "Auto-generate a balanced meal plan that avoids repeating recent meals and mixes up cuisines and proteins.",
    },
    spotlights: [
      {
        target: "auto-generate",
        title: "Smart Auto-Generate",
        description:
          "Fills your week using smart rotation — it avoids repeating recent meals and mixes cuisines & proteins.",
      },
      {
        target: "meal-slot",
        title: "Drag to Rearrange",
        description:
          "Swap meals between slots by dragging, or click a slot to pick a different recipe.",
      },
      {
        target: "finalize-plan",
        title: "Finalize Your Plan",
        description:
          "Lock in your plan for the week. This generates your grocery list automatically.",
      },
    ],
  },
  grocery: {
    banner: {
      icon: "🛒",
      title: "Your consolidated shopping list",
      description:
        "Generated from your finalized meal plan — ingredients are grouped by category and quantities are combined across recipes.",
    },
    spotlights: [
      {
        target: "grocery-item",
        title: "Check Off Items",
        description:
          "Tap items as you shop. Checked items move to the bottom.",
      },
      {
        target: "grocery-category",
        title: "Organized by Category",
        description:
          "Items are grouped into produce, dairy, meat, pantry, and more.",
      },
      {
        target: "apple-sync",
        title: "Apple Reminders Sync",
        description:
          "Send your list to Apple Reminders via iOS Shortcuts for offline access while shopping.",
      },
    ],
  },
  settings: {
    banner: {
      icon: "⚙️",
      title: "Customize your experience",
      description:
        "Set your meal preferences, manage your household, and configure Apple Reminders sync.",
    },
    spotlights: [
      {
        target: "meal-preferences",
        title: "Meal Slot Preferences",
        description:
          "Choose which meals you plan for — breakfast, lunch, dinner, or snacks.",
      },
      {
        target: "household-section",
        title: "Household Sharing",
        description:
          "Create or join a household to share recipes, meal plans, and grocery lists with a partner.",
      },
      {
        target: "replay-onboarding",
        title: "Replay Onboarding",
        description:
          "Re-run the welcome tour and page guides anytime you want a refresher.",
      },
    ],
  },
};
