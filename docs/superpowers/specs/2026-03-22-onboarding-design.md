# Onboarding System Design

## Overview

Menuly currently has no onboarding. After signup/login, users land directly on the dashboard with empty state messages. This design introduces a two-layer onboarding system:

1. **Initial Welcome Flow** — A 3-step guided setup on first login (`/onboarding` route)
2. **Per-Page Contextual Guidance** — Banner + tooltip spotlights on first visit to each page, re-triggerable via a help icon

Both layers are replayable: a "Replay Onboarding" button in Settings resets everything, and a per-page "Show me around" icon re-triggers individual page guidance.

## Goals

- Orient new users on the core loop (Recipes → Meal Plan → Grocery List)
- Collect preferences upfront (meal slots, dietary preferences, allergies)
- Guide users to their first meaningful action (importing a recipe)
- Provide contextual page-level guidance that doesn't overwhelm
- Allow re-onboarding at any time

## Non-Goals

- Onboarding for the household/sharing feature (handled separately in Settings)
- Interactive tutorials or video walkthroughs
- A/B testing different onboarding flows

---

## Layer 1: Initial Welcome Flow

### Route

`/onboarding` — placed under the `(auth)` route group. No app shell (no sidebar or bottom nav). Minimal centered layout with max-width container.

### Steps

**Step 1: How Menuly Works**
- Visual overview of the core loop: Recipes → Meal Plan → Grocery List
- Three cards with icons showing each stage and a brief description
- Buttons: "Get Started" (primary) + "Skip" (secondary)

**Step 2: Your Preferences**
- **Meal slots:** Toggle chips for breakfast, lunch, dinner, snack. Defaults pre-selected (breakfast, lunch, dinner) matching the existing profile default.
- **Dietary preferences (optional):** Multi-select pill chips — Vegetarian, Vegan, Pescatarian, Keto, Paleo, Gluten-Free, Dairy-Free, Low-Carb, Mediterranean, Halal, Kosher
- **Allergies (optional):** Multi-select pill chips — Peanuts, Tree Nuts, Dairy, Eggs, Shellfish, Soy, Wheat/Gluten, Fish, Sesame. Red-tinted when selected for visual distinction.
- Subtitle: "You can always change these in Settings"
- Buttons: "Continue" (primary) + "Skip" (secondary)

**Step 3: Import Your First Recipe**
- URL input field with "Import" button (primary action)
- "or" divider
- Alternative actions: "Generate with AI" button (navigates to `/recipes/new` and triggers the AI generation modal via `RecipeGenerationProvider`), "Create Manually" button (navigates to `/recipes/new`)
- Soft skip link: "I'll do this later →"
- On successful import: show brief success state, then proceed

### Navigation

- Progress dots at top (3 dots, active dot highlighted)
- Each step is independently skippable
- Back navigation not needed (steps are independent enough)
- After completing or skipping all steps → set `onboarding_completed = true` → redirect to `/`

---

## Layer 2: Per-Page Contextual Guidance

### Components

**1. Welcome Banner**
- Dismissible card at top of page content, below the page header
- Gradient-tinted background (terracotta/sage) matching app theme
- Icon + headline + 1-2 sentence description + close (✕) button
- Shown on first visit to each page
- Dismissing marks the page as visited in `onboarding_page_visits`

**2. Tooltip Spotlights**
- Triggered after the banner is shown (or when "Show me around" is tapped)
- Dimmed overlay with a cutout around the highlighted element, 150ms fade-in transition
- Tooltip with: title, description, step counter ("1 of 3"), Next/Skip buttons
- Smooth 150ms crossfade transition between spotlight steps
- 2-3 spotlights per page, stepping through sequentially
- If a target element doesn't exist on the page, that step is silently skipped

**3. "Show Me Around" Help Icon**
- Small `?` circle in each page header, right-aligned near action buttons
- Subtle by default (low opacity), shows "Show me around" tooltip on hover/tap
- Tapping re-triggers that page's banner + spotlight tour without resetting DB flags
- Present on all 5 main pages

### Per-Page Configuration

**Dashboard (`/`)**
- Banner: "Here's your hub — see your week at a glance"
- Spotlights: ① Quick Actions bar ② This Week's Plan card ③ Recipe Collection card

**Recipes (`/recipes`)**
- Banner: "Build your recipe library — import from URLs, generate with AI, or create manually"
- Spotlights: ① Add Recipe button ② Search & filter bar ③ Favorite toggle on a recipe card

**Meal Plan (`/plan`)**
- Banner: "Plan your week with smart rotation — it avoids repeating recent meals"
- Spotlights: ① Auto-Generate button ② Drag-to-rearrange slots ③ Finalize button

**Grocery (`/grocery`)**
- Banner: "Your consolidated shopping list — generated from your finalized meal plan"
- Spotlights: ① Check off items ② Category sections ③ Apple Reminders sync

**Settings (`/settings`)**
- Banner: "Customize your Menuly experience"
- Spotlights: ① Meal slot preferences ② Household sharing ③ Replay Onboarding button

---

## Replay & Re-Onboarding

**Full reset (Settings page):**
- "Replay Onboarding" button in a new section on the Settings page
- Resets `onboarding_completed = false` and `onboarding_page_visits = {}`
- Clears the `onboarding_completed` cookie
- Navigates to `/onboarding`

**Per-page replay (Help icon):**
- The `?` icon in each page header re-triggers that page's banner + spotlight tour
- Does NOT reset the DB flag — purely a temporary re-show
- Available at all times, not just after onboarding

---

## Data Model

### Database Changes

New columns on the `profiles` table (new migration `010_onboarding.sql`):

```sql
ALTER TABLE profiles
  ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN onboarding_page_visits JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN dietary_preferences TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN allergies TEXT[] NOT NULL DEFAULT '{}';
```

Note: The profile auto-creation in `getProfile()` (`src/actions/settings.ts`) does not need modification since all new columns have database-level `NOT NULL DEFAULT` values.

### Types Update (`src/types/database.ts`)

```ts
// Add to Profile type
onboarding_completed: boolean;
onboarding_page_visits: Record<OnboardingPage, boolean>;
dietary_preferences: DietaryPreference[];
allergies: Allergy[];

// New types and constants
type OnboardingPage = "dashboard" | "recipes" | "plan" | "grocery" | "settings";

const ONBOARDING_PAGES: OnboardingPage[] = [
  "dashboard", "recipes", "plan", "grocery", "settings"
];

const DIETARY_PREFERENCES = [
  "vegetarian", "vegan", "pescatarian", "keto", "paleo",
  "gluten-free", "dairy-free", "low-carb", "mediterranean", "halal", "kosher"
] as const;

const ALLERGIES = [
  "peanuts", "tree-nuts", "dairy", "eggs", "shellfish",
  "soy", "wheat-gluten", "fish", "sesame"
] as const;

type DietaryPreference = typeof DIETARY_PREFERENCES[number];
type Allergy = typeof ALLERGIES[number];
```

---

## Routing & Middleware

### Onboarding Redirect Strategy

**Primary check:** The `(app)/layout.tsx` server component checks `onboarding_completed` via the existing `getProfile()` server action. If `false`, it calls `redirect("/onboarding")`. This reuses existing Supabase client patterns and avoids adding DB queries to middleware.

**Cookie fast-path in middleware:** To avoid the layout-level check on every page load, a `menuly_onboarding_completed=true` cookie acts as a fast-path. When present, middleware skips the check entirely. When absent, the layout check runs and sets the cookie on completion.

Middleware flow:

1. Not authenticated → redirect `/login` (unchanged)
2. Authenticated + on `/login` → redirect `/` (unchanged)
3. Authenticated + on `/onboarding` + `menuly_onboarding_completed` cookie present → redirect `/`
4. All other authenticated requests → pass through (layout handles onboarding redirect if needed)

**Cookie details:**
- Set when `completeOnboarding` server action runs, and when layout confirms `onboarding_completed === true`
- Cleared when "Replay Onboarding" resets the flag
- HttpOnly, SameSite=Lax, path=/, maxAge=31536000 (1 year)

**Note on auth callback:** After signup, the callback route redirects to `/`. The layout then detects `onboarding_completed === false` and redirects to `/onboarding`. This results in a brief double-redirect on first signup only — acceptable since the cookie prevents it from recurring.

### Route Setup

```
src/app/(auth)/onboarding/
  page.tsx          — OnboardingFlow client component
  layout.tsx        — Minimal layout (no app shell)
```

The `/onboarding` route is in the `(auth)` route group for layout purposes (no app shell sidebar/nav). In middleware, `/onboarding` is treated as a special case: it requires authentication (like all app routes) but is NOT redirected away like `/login`. The middleware must explicitly handle `/onboarding` — the existing "auth user on /login → redirect /" logic must not apply to it. Add `/onboarding` to the middleware's path handling alongside `/login` and `/callback`.

---

## Component Architecture

### New Components

| Component | Path | Purpose |
|-----------|------|---------|
| `OnboardingFlow` | `src/app/(auth)/onboarding/page.tsx` | 3-step initial flow, client component |
| `OnboardingStep1` | `src/components/onboarding/step-overview.tsx` | "How Menuly Works" visual |
| `OnboardingStep2` | `src/components/onboarding/step-preferences.tsx` | Meal slots + dietary + allergies |
| `OnboardingStep3` | `src/components/onboarding/step-first-recipe.tsx` | Recipe import/create |
| `OnboardingProvider` | `src/components/onboarding/onboarding-provider.tsx` | Context wrapper, fetches/caches onboarding state |
| `PageGuideBanner` | `src/components/onboarding/page-guide-banner.tsx` | Dismissible banner for each page |
| `SpotlightTour` | `src/components/onboarding/spotlight-tour.tsx` | Overlay + positioned tooltips |
| `HelpIcon` | `src/components/onboarding/help-icon.tsx` | `?` button for page headers |
| `useSpotlight` | `src/hooks/use-spotlight.ts` | Hook for spotlight positioning, step management, scroll-into-view |

### Configuration

| File | Purpose |
|------|---------|
| `src/lib/onboarding-config.ts` | Centralized config for all page banners and spotlight definitions |

### Spotlight Targeting

Existing components receive `data-onboarding` attributes to serve as spotlight targets:

```tsx
// Example: on the Add Recipe button
<Button data-onboarding="add-recipe" onClick={...}>+ Add Recipe</Button>
```

The `useSpotlight` hook:
1. Queries DOM for `[data-onboarding='target-name']`
2. Gets `getBoundingClientRect()` for positioning
3. Renders overlay with CSS `box-shadow` cutout (large spread shadow with transparent center)
4. Positions tooltip relative to target (auto-detects best placement)
5. Scrolls target into view if off-screen
6. Manages step state (current, next, skip, complete)
7. Silently skips steps whose target elements don't exist

### Server Actions

| Action | File | Purpose |
|--------|------|---------|
| `completeOnboarding` | `src/actions/onboarding.ts` | Sets `onboarding_completed = true`, saves preferences |
| `updateOnboardingPageVisit` | `src/actions/onboarding.ts` | Marks a page as visited in `onboarding_page_visits` |
| `resetOnboarding` | `src/actions/onboarding.ts` | Resets both flags for replay |
| `updateDietaryPreferences` | `src/actions/settings.ts` | Update dietary preferences (also editable from Settings) |
| `updateAllergies` | `src/actions/settings.ts` | Update allergies (also editable from Settings) |

### OnboardingProvider

Wraps the app layout (inside `src/app/(app)/layout.tsx`). On mount:
1. Fetches profile's `onboarding_page_visits` via server action
2. Provides context: `{ pageVisits, markPageVisited, showGuide, isGuideActive }`
3. Each page checks context to decide whether to show banner + spotlights
4. State cached in context — no repeated DB calls per page navigation

### Server/Client Component Integration

The Dashboard and other pages are async server components, which cannot use React context. Each page renders a `<PageGuide page="dashboard" />` client component within its JSX. `PageGuide` is a `"use client"` component that:
1. Consumes the `OnboardingProvider` context
2. Looks up the banner and spotlight config for the given page
3. Renders the `PageGuideBanner` and `SpotlightTour` components
4. Handles the "Show me around" help icon

Pattern:
```tsx
// In a server component page (e.g., src/app/(app)/page.tsx)
export default async function DashboardPage() {
  // ...server data fetching...
  return (
    <>
      <PageGuide page="dashboard" />
      {/* ...rest of page content... */}
    </>
  );
}
```

---

## Settings Page Changes

Add two new sections to the Settings page:

**Dietary Preferences & Allergies section** (between Meal Preferences and Household):
- Same chip-based UI as the onboarding step
- Editable at any time
- Server actions for saving

**Replay Onboarding section** (at the bottom, before Account):
- "Replay Onboarding" button with description: "Re-run the welcome tour and page guides"
- Calls `resetOnboarding()` server action → clears cookie → navigates to `/onboarding`

---

## Edge Cases

- **User signs up but closes browser during onboarding:** `onboarding_completed` stays `false`, they'll be redirected back to `/onboarding` on next login. Any preferences saved in step 2 are already persisted.
- **Recipe import fails in step 3:** Show error inline, user can retry or skip. Don't block onboarding completion.
- **Spotlight target doesn't exist:** Silently skip that spotlight step. If all targets missing, skip the tour entirely (banner still shows).
- **Household member joins:** Onboarding is per-user, not per-household. Each member gets their own onboarding flow.
- **Page visited via deep link:** Contextual guidance still triggers — it's based on `onboarding_page_visits`, not navigation order.
- **Cookie cleared/expired:** Falls back to DB check in middleware, re-sets cookie.
