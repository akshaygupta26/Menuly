# Menuly

## Overview
Weekly meal planning & grocery list app. Users build a recipe library, auto-generate weekly menus with smart rotation, and sync grocery lists to Apple Reminders via iOS Shortcuts.

**Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Supabase (PostgreSQL + Auth + Realtime), shadcn/ui, pnpm.

## Commands
- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`

## Architecture
- **Route groups:** `(auth)` for login/callback, `(app)` for authenticated pages (recipes, plan, grocery, settings, dashboard)
- **Server/client split:** Server components fetch data via server actions, pass to `"use client"` wrapper components for interactivity
- **Server actions** (`src/actions/`): All return `{ data, error }` via `ActionResult<T>` type. Always call `getAuthenticatedUser()` first and `revalidatePath()` after mutations
- **Supabase clients:** `@/lib/supabase/client` (browser), `@/lib/supabase/server` (server). Never import the wrong one
- **Auth middleware** (`src/middleware.ts`): Redirects unauth users to `/login`, auth users away from `/login` to `/`
- **API routes** are for external/fetch-based calls (recipe import, meal plan generation, grocery export). Internal mutations use server actions
- **Realtime:** Grocery items use Supabase Realtime subscriptions for live sync between users

## Code Style
- shadcn/ui components in `src/components/ui/` — don't modify these directly, use `pnpm dlx shadcn@latest add <component>`
- Feature components in `src/components/{feature}/` — use `"use client"` only when needed
- Use `cn()` from `@/lib/utils` for conditional class merging
- Use `lucide-react` for icons
- Use `sonner` for toast notifications (not the deprecated toast component)
- Use `date-fns` for date manipulation (not native Date methods)
- Types live in `src/types/database.ts` — keep this as the single source of truth

## Important Files / Paths
- `src/actions/` — server actions (recipes.ts, meal-plans.ts, grocery.ts, settings.ts, auth.ts)
- `src/lib/rotation-algorithm.ts` — smart meal rotation scoring (recency + cuisine/protein diversity)
- `src/lib/recipe-scraper.ts` — JSON-LD extraction from recipe URLs
- `src/lib/ingredient-parser.ts` — parses "2 lbs chicken breast" into structured data
- `src/lib/grocery-consolidator.ts` — merges ingredients across recipes, converts units
- `src/lib/supabase/` — client.ts, server.ts, middleware.ts
- `supabase/migrations/001_initial_schema.sql` — full DB schema (8 tables, RLS, triggers)
- `src/app/globals.css` — theme variables (terracotta primary, sage secondary, oklch color space)

## Do Nots
- Don't create `.env.local` or commit secrets — use `.env.local.example` as reference
- Don't modify `src/components/ui/` files directly — they're managed by shadcn CLI
- Don't use `redirect()` in server actions that are called from client components — return errors and let the client handle navigation
- Don't bypass RLS — all Supabase queries go through the authenticated client, never use the service role key in client code
- Don't add `react-hot-toast` or other toast libraries — the project uses `sonner` exclusively
