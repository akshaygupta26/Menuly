# Onboarding System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-layer onboarding system — a 3-step initial welcome flow + per-page contextual guidance with banners and tooltip spotlights.

**Architecture:** Dedicated `/onboarding` route for the initial flow (under `(auth)` route group, no app shell). Per-page guidance via an `OnboardingProvider` context + `PageGuide` client components rendered inside server component pages. Onboarding state stored on the `profiles` table with a cookie fast-path for redirect performance.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL), TypeScript, Tailwind CSS v4, shadcn/ui, sonner (toast), react-hook-form (recipe import step)

**Spec:** `docs/superpowers/specs/2026-03-22-onboarding-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/010_onboarding.sql` | DB migration: 4 new columns on profiles |
| `src/types/onboarding.ts` | Onboarding types, constants (OnboardingPage, DietaryPreference, Allergy) |
| `src/lib/onboarding-config.ts` | Per-page banner + spotlight definitions |
| `src/actions/onboarding.ts` | Server actions: complete, reset, updatePageVisit |
| `src/hooks/use-spotlight.ts` | Hook for spotlight positioning, step state, scroll-into-view |
| `src/components/onboarding/onboarding-provider.tsx` | Context provider for per-page guidance state |
| `src/components/onboarding/step-overview.tsx` | Step 1: "How Menuly Works" |
| `src/components/onboarding/step-preferences.tsx` | Step 2: Meal slots + dietary + allergies |
| `src/components/onboarding/step-first-recipe.tsx` | Step 3: Recipe import |
| `src/components/onboarding/page-guide-banner.tsx` | Dismissible per-page welcome banner |
| `src/components/onboarding/spotlight-tour.tsx` | Overlay + tooltip spotlight component |
| `src/components/onboarding/help-icon.tsx` | "?" button for page headers |
| `src/components/onboarding/page-guide.tsx` | Composite client component: banner + spotlight + help icon |
| `src/app/(auth)/onboarding/page.tsx` | Onboarding route page |
| `src/app/(auth)/onboarding/layout.tsx` | Minimal layout for onboarding (no app shell) |

### Modified Files
| File | Change |
|------|--------|
| `src/types/database.ts` | Add 4 fields to Profile type, import new types |
| `src/lib/supabase/middleware.ts` | Add `/onboarding` + cookie handling |
| `src/app/(app)/layout.tsx` | Make async, add onboarding redirect check, wrap with OnboardingProvider |
| `src/app/(app)/page.tsx` | Add `<PageGuide page="dashboard" />` + `data-onboarding` attributes |
| `src/app/(app)/recipes/page.tsx` | Add `<PageGuide page="recipes" />` + `data-onboarding` attributes |
| `src/app/(app)/plan/[weekStart]/page.tsx` | Add `<PageGuide page="plan" />` + `data-onboarding` attributes |
| `src/app/(app)/grocery/page.tsx` | Add `<PageGuide page="grocery" />` + `data-onboarding` attributes |
| `src/app/(app)/settings/page.tsx` | Add dietary/allergy section, replay button, `<PageGuide>`, `data-onboarding` attributes |
| `src/actions/settings.ts` | Add `updateDietaryPreferences`, `updateAllergies` actions |

---

## Task 1: Database Migration & Types

**Files:**
- Create: `supabase/migrations/010_onboarding.sql`
- Create: `src/types/onboarding.ts`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- 010_onboarding.sql
-- Add onboarding tracking and preference columns to profiles

ALTER TABLE profiles
  ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN onboarding_page_visits JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN dietary_preferences TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN allergies TEXT[] NOT NULL DEFAULT '{}';
```

Write to `supabase/migrations/010_onboarding.sql`.

- [ ] **Step 2: Create onboarding types file**

```ts
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
```

Write to `src/types/onboarding.ts`.

- [ ] **Step 3: Update Profile type in database.ts**

In `src/types/database.ts`, add to the `Profile` interface (after the existing `ai_unlimited` field):

```ts
onboarding_completed: boolean;
onboarding_page_visits: Partial<Record<OnboardingPage, boolean>>;
dietary_preferences: DietaryPreference[];
allergies: Allergy[];
```

Add the import at the top:
```ts
import type { OnboardingPage, DietaryPreference, Allergy } from "./onboarding";
```

- [ ] **Step 4: Run the migration against Supabase**

Run: `npx supabase db push` or apply the migration via the Supabase dashboard.

- [ ] **Step 5: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/010_onboarding.sql src/types/onboarding.ts src/types/database.ts
git commit -m "feat: add onboarding DB migration and types"
```

---

## Task 2: Server Actions

**Files:**
- Create: `src/actions/onboarding.ts`
- Modify: `src/actions/settings.ts`

- [ ] **Step 1: Create onboarding server actions**

```ts
// src/actions/onboarding.ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getAuthenticatedUser } from "./auth";
import type { ActionResult } from "@/types/database";
import type { OnboardingPage, DietaryPreference, Allergy } from "@/types/onboarding";

const ONBOARDING_COOKIE = "menuly_onboarding_completed";
const COOKIE_MAX_AGE = 31536000; // 1 year

export async function completeOnboarding(preferences?: {
  meal_slots?: string[];
  dietary_preferences?: DietaryPreference[];
  allergies?: Allergy[];
}): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "Not authenticated" };

  const updates: Record<string, unknown> = {
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };

  if (preferences?.meal_slots?.length) {
    updates.meal_slots = preferences.meal_slots;
  }
  if (preferences?.dietary_preferences) {
    updates.dietary_preferences = preferences.dietary_preferences;
  }
  if (preferences?.allergies) {
    updates.allergies = preferences.allergies;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };

  // Set cookie for middleware fast-path
  const cookieStore = await cookies();
  cookieStore.set(ONBOARDING_COOKIE, "true", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  revalidatePath("/");
  return { data: null, error: null };
}

export async function updateOnboardingPageVisit(
  page: OnboardingPage
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "Not authenticated" };

  // Fetch current page visits
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_page_visits")
    .eq("user_id", user.id)
    .single();

  const currentVisits = (profile?.onboarding_page_visits as Record<string, boolean>) ?? {};
  const updatedVisits = { ...currentVisits, [page]: true };

  const { error } = await supabase
    .from("profiles")
    .update({
      onboarding_page_visits: updatedVisits,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

export async function resetOnboarding(): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({
      onboarding_completed: false,
      onboarding_page_visits: {},
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };

  // Clear cookie
  const cookieStore = await cookies();
  cookieStore.delete(ONBOARDING_COOKIE);

  revalidatePath("/");
  revalidatePath("/settings");
  return { data: null, error: null };
}

export async function getOnboardingState(): Promise<
  ActionResult<{
    onboarding_completed: boolean;
    onboarding_page_visits: Partial<Record<OnboardingPage, boolean>>;
  }>
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "Not authenticated" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("onboarding_completed, onboarding_page_visits")
    .eq("user_id", user.id)
    .single();

  if (error) return { data: null, error: error.message };

  return {
    data: {
      onboarding_completed: profile.onboarding_completed,
      onboarding_page_visits: profile.onboarding_page_visits as Partial<Record<OnboardingPage, boolean>>,
    },
    error: null,
  };
}
```

Write to `src/actions/onboarding.ts`.

- [ ] **Step 2: Add dietary/allergy actions to settings.ts**

Add to the end of `src/actions/settings.ts`:

```ts
export async function updateDietaryPreferences(
  preferences: string[]
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({
      dietary_preferences: preferences,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/settings");
  return { data: null, error: null };
}

export async function updateAllergies(
  allergies: string[]
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({
      allergies: allergies,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/settings");
  return { data: null, error: null };
}
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/actions/onboarding.ts src/actions/settings.ts
git commit -m "feat: add onboarding and dietary preference server actions"
```

---

## Task 3: Middleware & Layout Redirect

**Files:**
- Modify: `src/lib/supabase/middleware.ts`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Update middleware for onboarding route handling**

In `src/lib/supabase/middleware.ts`, within the `updateSession` function, find the section that handles authenticated users on `/login` (redirects them to `/`). Modify it to:

1. NOT redirect authenticated users on `/onboarding` to `/` (they need to be there)
2. Add: if authenticated user is on `/onboarding` AND the `menuly_onboarding_completed` cookie is present → redirect to `/`

The specific changes depend on the exact structure found, but the logic is:

```ts
// After the existing auth check and before the existing "/login" redirect:
const path = request.nextUrl.pathname;

// If authenticated user is on /onboarding with completed cookie, redirect to home
if (path === "/onboarding") {
  const onboardingCookie = request.cookies.get("menuly_onboarding_completed");
  if (onboardingCookie?.value === "true") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  // Otherwise, let them stay on /onboarding
  return supabaseResponse;
}

// Existing: redirect authenticated users from /login to /
if (path === "/login") {
  return NextResponse.redirect(new URL("/", request.url));
}
```

Integrate this into the existing flow — the exact line numbers and structure will need to match the existing code. Key point: `/onboarding` must be handled BEFORE the `/login` redirect to avoid the generic "redirect auth users away from auth pages" logic catching it.

- [ ] **Step 2: Update app layout to be async with onboarding check**

In `src/app/(app)/layout.tsx`:

1. Make the function `async`
2. Import `redirect` from `next/navigation` and `getProfile` from `@/actions/settings`
3. Add the onboarding check before the JSX return
4. Import and wrap children with `OnboardingProvider` (will be created in Task 5)

```tsx
import { redirect } from "next/navigation";
import { getProfile } from "@/actions/settings";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check onboarding status
  const { data: profile } = await getProfile();
  if (profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <RecipeGenerationProvider>
      <OnboardingProvider>
        <AppShell>
          {children}
          <Toaster />
        </AppShell>
      </OnboardingProvider>
    </RecipeGenerationProvider>
  );
}
```

Note: The `OnboardingProvider` import will cause a type error until Task 5 creates it. To keep the build passing between tasks, you can either:
- Comment out the `OnboardingProvider` wrapper and uncomment in Task 5
- Or create a placeholder file in this step

For now, create a minimal placeholder:

```tsx
// src/components/onboarding/onboarding-provider.tsx
"use client";

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Verify types compile and lint passes**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts src/app/(app)/layout.tsx src/components/onboarding/onboarding-provider.tsx
git commit -m "feat: add onboarding redirect in layout and middleware"
```

---

## Task 4: Onboarding Config

**Files:**
- Create: `src/lib/onboarding-config.ts`

- [ ] **Step 1: Create the centralized onboarding config**

```ts
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
```

Write to `src/lib/onboarding-config.ts`.

- [ ] **Step 2: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/onboarding-config.ts
git commit -m "feat: add centralized onboarding page config"
```

---

## Task 5: OnboardingProvider, useSpotlight Hook & Core UI Components

**Files:**
- Modify: `src/components/onboarding/onboarding-provider.tsx` (replace placeholder)
- Create: `src/hooks/use-spotlight.ts`
- Create: `src/components/onboarding/page-guide-banner.tsx`
- Create: `src/components/onboarding/spotlight-tour.tsx`
- Create: `src/components/onboarding/help-icon.tsx`
- Create: `src/components/onboarding/page-guide.tsx`

- [ ] **Step 1: Implement OnboardingProvider**

Replace the placeholder in `src/components/onboarding/onboarding-provider.tsx`:

```tsx
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getOnboardingState().then((result) => {
      if (result.data) {
        setPageVisits(result.data.onboarding_page_visits);
      }
      setLoaded(true);
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

  if (!loaded) return <>{children}</>;

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
```

- [ ] **Step 2: Implement useSpotlight hook**

```tsx
// src/hooks/use-spotlight.ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  const rafRef = useRef<number>();

  const isActive = currentStep >= 0;
  const activeStepData = isActive ? steps[currentStep] : null;

  const updatePosition = useCallback(() => {
    if (!activeStepData) return;
    const el = document.querySelector(`[data-onboarding="${activeStepData.target}"]`);
    if (!el) {
      // Skip to next step if target doesn't exist
      setCurrentStep((prev) => {
        const next = prev + 1;
        return next < steps.length ? next : -1;
      });
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    });

    // Scroll into view if needed
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeStepData, steps.length]);

  useEffect(() => {
    if (!isActive) {
      setVisible(false);
      setTargetRect(null);
      return;
    }
    // Short delay for fade-in
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
        return nextStep < steps.length ? nextStep : -1;
      });
    }, 150);
  }, [steps.length]);

  const skip = useCallback(() => {
    setVisible(false);
    setTimeout(() => setCurrentStep(-1), 150);
  }, []);

  const totalSteps = steps.length;
  const stepNumber = currentStep + 1;

  return {
    isActive,
    visible,
    targetRect,
    activeStep: activeStepData,
    stepNumber,
    totalSteps,
    start,
    next,
    skip,
  };
}
```

Write to `src/hooks/use-spotlight.ts`.

- [ ] **Step 3: Implement PageGuideBanner**

```tsx
// src/components/onboarding/page-guide-banner.tsx
"use client";

import { X } from "lucide-react";

interface PageGuideBannerProps {
  icon: string;
  title: string;
  description: string;
  onDismiss: () => void;
}

export function PageGuideBanner({
  icon,
  title,
  description,
  onDismiss,
}: PageGuideBannerProps) {
  return (
    <div className="animate-page-enter mb-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-secondary/5 p-4">
      <span className="mt-0.5 text-xl">{icon}</span>
      <div className="flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={onDismiss}
        className="rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        aria-label="Dismiss guide"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

Write to `src/components/onboarding/page-guide-banner.tsx`.

- [ ] **Step 4: Implement SpotlightTour**

```tsx
// src/components/onboarding/spotlight-tour.tsx
"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
```

Write to `src/components/onboarding/spotlight-tour.tsx`.

- [ ] **Step 5: Implement HelpIcon**

```tsx
// src/components/onboarding/help-icon.tsx
"use client";

import { useState } from "react";

interface HelpIconProps {
  onClick: () => void;
}

export function HelpIcon({ onClick }: HelpIconProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground/40 transition-colors hover:border-primary/30 hover:text-primary"
        aria-label="Show me around"
      >
        ?
      </button>
      {showTooltip && (
        <div className="absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-muted-foreground shadow-md">
          Show me around
        </div>
      )}
    </div>
  );
}
```

Write to `src/components/onboarding/help-icon.tsx`.

- [ ] **Step 6: Implement PageGuide composite component**

```tsx
// src/components/onboarding/page-guide.tsx
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
      spotlight.start();
    }
  }, [activeGuide, page, spotlight]);

  const handleDismissBanner = () => {
    setShowBanner(false);
    markPageVisited(page);
    // Start spotlights after banner dismissal (first visit only)
    if (!isPageVisited(page)) {
      setTimeout(() => spotlight.start(), 300);
    }
  };

  const handleShowGuide = () => {
    showGuide(page);
    setShowBanner(true);
  };

  return (
    <>
      {/* Help icon — rendered by the page in its header via children or a portal */}
      <div className="page-guide-help-icon">
        <HelpIcon onClick={handleShowGuide} />
      </div>

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
```

Write to `src/components/onboarding/page-guide.tsx`.

- [ ] **Step 7: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/onboarding/ src/hooks/use-spotlight.ts
git commit -m "feat: add onboarding provider, spotlight hook, and page guide components"
```

---

## Task 6: Initial Welcome Flow (Steps 1-3)

**Files:**
- Create: `src/app/(auth)/onboarding/layout.tsx`
- Create: `src/app/(auth)/onboarding/page.tsx`
- Create: `src/components/onboarding/step-overview.tsx`
- Create: `src/components/onboarding/step-preferences.tsx`
- Create: `src/components/onboarding/step-first-recipe.tsx`

- [ ] **Step 1: Create onboarding layout**

```tsx
// src/app/(auth)/onboarding/layout.tsx
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 p-4">
      <div className="w-full max-w-lg">
        {children}
      </div>
    </div>
  );
}
```

Write to `src/app/(auth)/onboarding/layout.tsx`.

- [ ] **Step 2: Create Step 1 — Overview**

```tsx
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
```

Write to `src/components/onboarding/step-overview.tsx`.

- [ ] **Step 3: Create Step 2 — Preferences**

```tsx
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
```

Write to `src/components/onboarding/step-preferences.tsx`.

- [ ] **Step 4: Create Step 3 — First Recipe**

```tsx
// src/components/onboarding/step-first-recipe.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { completeOnboarding } from "@/actions/onboarding";

interface StepFirstRecipeProps {
  preferences?: {
    meal_slots?: string[];
    dietary_preferences?: string[];
    allergies?: string[];
  };
  onComplete: () => void;
  onSkip: () => void;
}

export function StepFirstRecipe({
  preferences,
  onComplete,
  onSkip,
}: StepFirstRecipeProps) {
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [imported, setImported] = useState(false);
  const router = useRouter();

  const handleImport = () => {
    if (!url.trim()) return;

    startTransition(async () => {
      try {
        const response = await fetch("/api/recipes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });

        if (!response.ok) {
          const data = await response.json();
          toast.error(data.error || "Failed to import recipe");
          return;
        }

        const data = await response.json();
        // Store imported data in sessionStorage for the new recipe page
        sessionStorage.setItem("importedRecipe", JSON.stringify(data));

        setImported(true);
        toast.success("Recipe imported!");

        // Complete onboarding, then navigate to create the recipe
        await completeOnboarding(preferences);
        setTimeout(() => router.push("/recipes/new"), 1000);
      } catch {
        toast.error("Failed to import recipe");
      }
    });
  };

  const handleCreateManually = async () => {
    await completeOnboarding(preferences);
    router.push("/recipes/new");
  };

  return (
    <div>
      <h2 className="text-center text-xl font-bold">
        Add Your First Recipe
      </h2>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Paste a URL from your favorite recipe site
      </p>

      {imported ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-sm font-medium">Recipe imported!</p>
          <p className="text-xs text-muted-foreground">Redirecting...</p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex gap-2">
            <Input
              type="url"
              placeholder="https://allrecipes.com/recipe/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isPending}
              onKeyDown={(e) => e.key === "Enter" && handleImport()}
            />
            <Button onClick={handleImport} disabled={isPending || !url.trim()}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Import"
              )}
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="mt-4 flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={handleCreateManually}>
              ✏️ Create Manually
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={onSkip}
              className="text-sm text-muted-foreground/60 underline hover:text-muted-foreground transition-colors"
            >
              I&apos;ll do this later →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

Write to `src/components/onboarding/step-first-recipe.tsx`.

- [ ] **Step 5: Create the onboarding page**

```tsx
// src/app/(auth)/onboarding/page.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { StepOverview } from "@/components/onboarding/step-overview";
import { StepPreferences } from "@/components/onboarding/step-preferences";
import { StepFirstRecipe } from "@/components/onboarding/step-first-recipe";
import { completeOnboarding } from "@/actions/onboarding";
import type { MealType } from "@/types/database";
import type { DietaryPreference, Allergy } from "@/types/onboarding";

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const router = useRouter();

  // Store preferences from step 2 for passing to completeOnboarding
  const preferencesRef = useRef<{
    meal_slots?: string[];
    dietary_preferences?: DietaryPreference[];
    allergies?: Allergy[];
  }>({});

  const finishOnboarding = async () => {
    await completeOnboarding(preferencesRef.current);
    router.push("/");
  };

  const handleStep2Next = (data: {
    mealSlots: MealType[];
    dietaryPreferences: DietaryPreference[];
    allergies: Allergy[];
  }) => {
    preferencesRef.current = {
      meal_slots: data.mealSlots,
      dietary_preferences: data.dietaryPreferences,
      allergies: data.allergies,
    };
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
          preferences={preferencesRef.current}
          onComplete={finishOnboarding}
          onSkip={finishOnboarding}
        />
      )}
    </div>
  );
}
```

Write to `src/app/(auth)/onboarding/page.tsx`.

- [ ] **Step 6: Verify types compile and lint passes**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/(auth)/onboarding/ src/components/onboarding/step-overview.tsx src/components/onboarding/step-preferences.tsx src/components/onboarding/step-first-recipe.tsx
git commit -m "feat: add 3-step onboarding welcome flow"
```

---

## Task 7: Add PageGuide to Each App Page + data-onboarding Attributes

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/recipes/page.tsx`
- Modify: `src/app/(app)/plan/[weekStart]/page.tsx` (or wherever the plan page renders its content)
- Modify: `src/app/(app)/grocery/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

For each page, two changes are needed:
1. Import and render `<PageGuide page="pagename" />` near the top of the JSX
2. Add `data-onboarding="target-name"` attributes to key elements matching the config

- [ ] **Step 1: Add PageGuide to Dashboard**

In `src/app/(app)/page.tsx`:
- Import `PageGuide` from `@/components/onboarding/page-guide`
- Add `<PageGuide page="dashboard" />` as the first child in the returned JSX
- Add `data-onboarding="quick-actions"` to the Quick Actions container div
- Add `data-onboarding="plan-card"` to the This Week's Plan card
- Add `data-onboarding="recipe-card"` to the Recipe Collection card

The exact element selectors depend on the JSX structure found. Look for the wrapping `<div>` or `<Card>` components for each section.

- [ ] **Step 2: Add PageGuide to Recipes**

In `src/app/(app)/recipes/page.tsx`:
- Import and add `<PageGuide page="recipes" />`
- Add `data-onboarding="add-recipe"` to the Add Recipe button
- Add `data-onboarding="search-filter"` to the search/filter bar
- Add `data-onboarding="favorite-toggle"` to the first recipe card's favorite button (if recipe cards exist — the spotlight will skip if no cards)

- [ ] **Step 3: Add PageGuide to Meal Plan**

Find the meal plan page that renders the actual week grid (likely `src/app/(app)/plan/[weekStart]/page.tsx` or a client wrapper component):
- Import and add `<PageGuide page="plan" />`
- Add `data-onboarding="auto-generate"` to the Auto-Generate button
- Add `data-onboarding="meal-slot"` to the first meal slot element
- Add `data-onboarding="finalize-plan"` to the Finalize button

- [ ] **Step 4: Add PageGuide to Grocery**

In `src/app/(app)/grocery/page.tsx` or the grocery list detail page:
- Import and add `<PageGuide page="grocery" />`
- Add `data-onboarding="grocery-item"` to the first grocery item checkbox
- Add `data-onboarding="grocery-category"` to the first category heading
- Add `data-onboarding="apple-sync"` to the Apple Reminders sync section (if visible — may only be in Settings)

- [ ] **Step 5: Add PageGuide to Settings**

In `src/app/(app)/settings/page.tsx`:
- Import and add `<PageGuide page="settings" />`
- Add `data-onboarding="meal-preferences"` to the Meal Preferences card
- Add `data-onboarding="household-section"` to the Household section
- Add `data-onboarding="replay-onboarding"` to the new Replay Onboarding button (added in Task 8)

- [ ] **Step 6: Verify types compile and lint passes**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/(app)/
git commit -m "feat: add per-page onboarding guides and data-onboarding attributes"
```

---

## Task 8: Settings Page — Dietary Preferences, Allergies & Replay

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add Dietary Preferences & Allergies section**

In `src/app/(app)/settings/page.tsx`, add a new section between the existing Meal Preferences card and the Household section. This uses the same chip-based UI as the onboarding step:

- Import `DIETARY_PREFERENCES`, `ALLERGIES` from `@/types/onboarding`
- Import `updateDietaryPreferences`, `updateAllergies` from `@/actions/settings`
- Add state for `dietaryPreferences` and `allergies` arrays (loaded from `getProfile()` on mount alongside existing meal slots)
- Add a Card with two sub-sections: Dietary Preferences (pill chips, toggle on click, save via `useTransition`) and Allergies (same pattern, red-tinted when selected)
- Auto-save on toggle (same pattern as meal slots — optimistic update, revert on error)

- [ ] **Step 2: Add Replay Onboarding section**

Below the Apple Reminders Sync card, before the Account card, add a new Card:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Onboarding</CardTitle>
    <CardDescription>
      Re-run the welcome tour and page guides
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Button
      variant="outline"
      data-onboarding="replay-onboarding"
      onClick={handleReplayOnboarding}
      disabled={isResetting}
    >
      {isResetting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : null}
      Replay Onboarding
    </Button>
  </CardContent>
</Card>
```

Import `resetOnboarding` from `@/actions/onboarding` and implement `handleReplayOnboarding`:

```ts
const handleReplayOnboarding = () => {
  startResetTransition(async () => {
    const result = await resetOnboarding();
    if (result.error) {
      toast.error(result.error);
      return;
    }
    router.push("/onboarding");
  });
};
```

- [ ] **Step 3: Update the existing useEffect to load dietary/allergy data**

In the existing `useEffect` that calls `getProfile()`, also extract `dietary_preferences` and `allergies` from the profile and set their respective state.

- [ ] **Step 4: Verify types compile and lint passes**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/settings/page.tsx
git commit -m "feat: add dietary preferences, allergies, and replay onboarding to settings"
```

---

## Task 9: Manual Testing & Polish

- [ ] **Step 1: Test initial onboarding flow**

1. In Supabase, set `onboarding_completed = false` on your profile (or create a new account)
2. Visit the app — should redirect to `/onboarding`
3. Walk through all 3 steps:
   - Step 1: Overview → "Get Started"
   - Step 2: Toggle meal slots, select dietary preferences, select allergies → "Continue"
   - Step 3: Paste a recipe URL → "Import" (or skip)
4. Should redirect to dashboard
5. Verify profile has updated: `onboarding_completed = true`, preferences saved
6. Verify `menuly_onboarding_completed` cookie is set

- [ ] **Step 2: Test per-page guidance**

1. Visit Dashboard — should see banner + spotlights
2. Dismiss banner → spotlights should start
3. Click through spotlights
4. Visit Recipes, Plan, Grocery, Settings — each should show its banner
5. Revisit Dashboard — banner should NOT show again (page marked as visited)

- [ ] **Step 3: Test replay**

1. Go to Settings → click "Replay Onboarding"
2. Should redirect to `/onboarding`
3. After completing, all per-page banners should show again

- [ ] **Step 4: Test help icon**

1. On any page, click the "?" icon
2. Banner + spotlights should re-appear
3. Subsequent page loads should NOT show the banner again (DB flag unchanged)

- [ ] **Step 5: Test skip behavior**

1. Reset onboarding
2. Skip all 3 steps → should still complete onboarding and redirect to dashboard
3. Verify preferences NOT overwritten (defaults remain)

- [ ] **Step 6: Fix any visual polish issues**

- Check mobile layout (bottom nav clearance for spotlights)
- Check dark mode if applicable
- Ensure transitions are smooth (150ms fades)
- Check banner doesn't overlap with existing page content

- [ ] **Step 7: Final verification**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm build`
Expected: All pass.

- [ ] **Step 8: Commit any polish fixes**

```bash
git add -A
git commit -m "fix: onboarding visual polish and edge case fixes"
```
