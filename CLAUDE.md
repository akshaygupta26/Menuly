# Menuly

## Overview
Weekly meal planning & grocery list app. Users build a recipe library, auto-generate weekly menus with smart rotation, and sync grocery lists to Apple Reminders via iOS Shortcuts.

**Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Supabase (PostgreSQL + Auth + Realtime), shadcn/ui, pnpm.

## Commands
- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Typecheck: `pnpm tsc --noEmit`

After making changes, always verify with `pnpm tsc --noEmit` and `pnpm lint` before considering a task done.

## Architecture
- **Route groups:** `(auth)` for login/callback/onboarding, `(app)` for authenticated pages (recipes, plan, grocery, settings, dashboard)
- **Server/client split:** Server components fetch data via server actions, pass to `"use client"` wrapper components for interactivity
- **Server actions** (`src/actions/`): All return `{ data, error }` via `ActionResult<T>` type. Always call `getAuthenticatedUser()` first and `revalidatePath()` after mutations
- **Supabase clients:** `@/lib/supabase/client` (browser), `@/lib/supabase/server` (server). Never import the wrong one
- **Auth middleware** (`src/middleware.ts`): Redirects unauth users to `/login`, auth users away from `/login` to `/`. Handles `/onboarding` route: if `menuly_onboarding_completed` cookie is set, redirects to `/`
- **Onboarding redirect** (`src/app/(app)/layout.tsx`): Async layout checks `profile.onboarding_completed` via `getProfile()` — if `false`, redirects to `/onboarding`
- **API routes** are for external/fetch-based calls (recipe import, meal plan generation, grocery export). Internal mutations use server actions
- **Realtime:** Grocery items use Supabase Realtime subscriptions for live sync between users

## Database Schema

Full schema: `supabase/migrations/001_initial_schema.sql` — 8 tables, RLS on all, triggers for `updated_at`.

| Table | Purpose |
|---|---|
| `profiles` | Per-user settings (meal_slots, onboarding state, dietary preferences, allergies) |
| `recipes` | Core recipe data incl. nutrition fields and `nutrition_source` |
| `recipe_ingredients` | Structured ingredients linked to a recipe |
| `meal_plans` | Weekly plan with `draft` / `finalized` status |
| `meal_plan_items` | Individual meal slots (day_of_week + meal_slot + recipe) |
| `grocery_lists` | Generated from finalized meal plans |
| `grocery_items` | Consolidated, categorized ingredients |
| `recipe_history` | Log of when a recipe was made + optional rating |

**Key domain types** (source of truth: `src/types/database.ts`):
- `NutritionSource = "json_ld" | "usda" | "manual"`
- `MealType = "breakfast" | "lunch" | "dinner" | "snack"`
- `IngredientCategory = "produce" | "dairy" | "meat" | "pantry" | "frozen" | "bakery" | "beverages" | "other"`
- `MealPlanStatus = "draft" | "finalized"`

## Onboarding Feature
- **Two layers:** Initial 3-step welcome flow (`/onboarding` route) + per-page contextual guidance (banners + tooltip spotlights)
- **Initial flow:** Step 1 (overview), Step 2 (meal slots + dietary preferences + allergies), Step 3 (import first recipe). Each step skippable.
- **Per-page guidance:** `PageGuide` component renders a dismissible banner on first visit to each page + `SpotlightTour` highlighting key UI elements. Driven by `OnboardingProvider` context.
- **Help icon:** `PageGuideHelpIcon` (`?` button) in each page header re-triggers the page's guide anytime
- **Replay:** "Replay Onboarding" button in Settings resets `onboarding_completed` + `onboarding_page_visits` and navigates back to `/onboarding`
- **State:** `onboarding_completed` (boolean), `onboarding_page_visits` (JSONB), `dietary_preferences` (text[]), `allergies` (text[]) on `profiles` table. Cookie `menuly_onboarding_completed` for middleware fast-path.
- **Migration:** `supabase/migrations/010_onboarding.sql`
- **Types:** `src/types/onboarding.ts` — `OnboardingPage`, `DietaryPreference`, `Allergy`, `OnboardingPageConfig`
- **Config:** `src/lib/onboarding-config.ts` — per-page banner + spotlight definitions
- **Components:** `src/components/onboarding/` — onboarding-provider, page-guide, page-guide-banner, spotlight-tour, help-icon, step-overview, step-preferences, step-first-recipe
- **Actions:** `src/actions/onboarding.ts` — completeOnboarding, resetOnboarding, updateOnboardingPageVisit, getOnboardingState

## Nutrition Feature
- **Schema:** `recipes` table has nullable columns: `calories`, `protein_g`, `carbs_g`, `fat_g` (all `NUMERIC`), `nutrition_source` (`TEXT CHECK IN ('json_ld', 'usda', 'manual')`)
- **Migration:** `supabase/migrations/002_nutrition_columns.sql`
- **Three data sources (priority order):**
  1. **JSON-LD** — extracted automatically from recipe URLs during import (`scrapeRecipe()` parses `schema.org/NutritionInformation`)
  2. **USDA FoodData Central API** — fallback calculation via `/api/nutrition/calculate` endpoint. Looks up each ingredient, scales by quantity/unit, sums, divides by servings. Triggered automatically when JSON-LD nutrition is absent on import.
  3. **Manual entry** — users can always type values directly in the recipe form
- **USDA client** (`src/lib/nutrition.ts`): uses `POST /fdc/v1/foods/search` with `SR Legacy` dataset. Nutrient IDs: 208/957/958 (energy), 203 (protein), 205 (carbs), 204 (fat). Batched to 5 concurrent requests for rate limiting
- **Unit conversion:** `convertToGrams()` maps cooking units (cup=240g, tbsp=15g, tsp=5g, oz=28.35g, lb=453.6g, etc.) to grams for USDA scaling
- **Real-time scaling:** per-100g USDA values are stored in local state after first calculation; quantity changes recompute client-side with no additional API calls
- **Env var:** `USDA_API_KEY` (server-only, no `NEXT_PUBLIC_` prefix) — without this, all USDA lookups silently return null

## Authentication
- **Google OAuth** via Supabase `signInWithOAuth({ provider: "google" })`
- **Email/password** with login and signup modes
- **Magic link** (passwordless) via `signInWithOtp`
- **Password reset** via `resetPasswordForEmail`
- **Callback route:** `src/app/(auth)/callback/route.ts` exchanges auth code for session
- **Supabase Dashboard config required:** Site URL and Redirect URLs must include the production domain (e.g. `https://menuly-nine.vercel.app/callback`)

## Deployment
- **GitHub:** https://github.com/akshaygupta26/Menuly.git
- **Vercel:** https://menuly-nine.vercel.app — deploy with `vercel --prod --yes`
- **Env vars in Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `USDA_API_KEY`

## Important Files / Paths
- `src/actions/` — server actions (recipes.ts, meal-plans.ts, grocery.ts, settings.ts, auth.ts, onboarding.ts)
- `src/lib/rotation-algorithm.ts` — smart meal rotation scoring (recency + cuisine/protein diversity)
- `src/lib/recipe-scraper.ts` — JSON-LD + nutrition extraction from recipe URLs
- `src/lib/nutrition.ts` — USDA API client and nutrition calculator
- `src/lib/ingredient-parser.ts` — parses "2 lbs chicken breast" into structured data
- `src/lib/grocery-consolidator.ts` — merges ingredients across recipes, converts units
- `src/lib/supabase/` — client.ts, server.ts, middleware.ts
- `src/app/api/nutrition/calculate/route.ts` — POST endpoint for USDA-based nutrition calculation
- `supabase/migrations/001_initial_schema.sql` — full DB schema (8 tables, RLS, triggers)
- `supabase/migrations/002_nutrition_columns.sql` — nutrition columns on recipes table
- `supabase/migrations/010_onboarding.sql` — onboarding + dietary/allergy columns on profiles
- `src/components/onboarding/` — all onboarding UI components
- `src/hooks/use-spotlight.ts` — spotlight positioning hook for per-page tours
- `src/lib/onboarding-config.ts` — per-page banner and spotlight config
- `src/app/globals.css` — theme variables (terracotta primary, sage secondary, oklch color space)

## Do Nots
- Don't create `.env.local` or commit secrets — use `.env.local.example` as reference
- Don't modify `src/components/ui/` files directly — they're managed by shadcn CLI; add components with `pnpm dlx shadcn@latest add <component>`
- Don't use `redirect()` in server actions that are called from client components — return errors and let the client handle navigation
- Don't bypass RLS — all Supabase queries go through the authenticated client, never use the service role key in client code
- Don't add `react-hot-toast` or other toast libraries — the project uses `sonner` exclusively
- Don't save nutrition data without setting `nutrition_source` — use `"json_ld"` for scraped, `"usda"` for USDA-calculated, `"manual"` for user-entered