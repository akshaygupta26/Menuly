# Menuly

**Weekly meal planning, smart recipe management, and automated grocery lists — for individuals and households.**

Live at [menuly-nine.vercel.app](https://menuly-nine.vercel.app)

---

## What It Does

Menuly takes the weekly "what's for dinner?" question and turns it into a solved problem. Build a recipe library (manually, from URLs, or with AI), auto-generate meal plans with a smart rotation algorithm, and produce a consolidated grocery list you can sync to Apple Reminders with one tap.

### Core Workflow

```
Recipes  →  Meal Plan  →  Grocery List  →  Apple Reminders
   ↑            ↑              ↑
  AI +       Smart          Auto-
  URL       Rotation      Consolidation
 Import    Algorithm
```

---

## Features

### Recipe Library
- **Manual entry** — Full-featured form with structured ingredients, instructions, nutrition, tags, and categorization
- **URL import** — Paste a recipe URL; Menuly scrapes JSON-LD structured data (name, ingredients, instructions, nutrition, image, times, servings) using cheerio
- **AI generation** — Describe what you want ("spicy Thai basil chicken") and get a complete recipe with ingredients, instructions, and USDA-calculated nutrition (3/day free tier)
- **Nutrition tracking** — Three data sources in priority order: JSON-LD from scraped sites, USDA FoodData Central API calculation, or manual entry
- **Smart categorization** — 625+ keyword dictionary auto-categorizes ingredients into Produce, Dairy, Meat, Pantry, Frozen, Bakery, Beverages, Other
- **Filtering** — Search, filter by cuisine type, protein type, meal type, favorites, and tags

### Meal Planning
- **Weekly grid** — 7-day view with configurable meal slots (Breakfast, Lunch, Dinner, Snack)
- **Smart rotation algorithm** — Scores recipes on a 100-point scale:
  - Recency (0-40 pts) — prioritizes recipes you haven't made recently (28-day cycle)
  - Cuisine diversity (0-25 pts) — penalizes repeating the same cuisine within a week
  - Protein diversity (0-25 pts) — same for protein types
  - Favorite bonus (0-5 pts) — slight boost for favorited recipes
  - Jitter (0-5 pts) — randomization to keep things interesting
- **Manual override** — Lock specific meals before auto-generating the rest
- **Custom meals** — Add non-recipe items ("Order pizza", "Leftovers")
- **Draft/Finalize flow** — Finalize a plan to generate the grocery list

### Grocery Lists
- **Auto-consolidation** — Merges identical ingredients across recipes, converts compatible units (cups + tablespoons → cups), handles pluralization
- **Category grouping** — Items organized by grocery aisle with emoji labels
- **Manual additions** — Add items not from recipes
- **Realtime sync** — Check off items on one device, see it update instantly on another
- **Apple Reminders export** — RESTful API endpoint + Bearer token auth for iOS Shortcuts integration

### Household Sharing
- **Invite system** — 6-character alphanumeric codes (excludes ambiguous chars: 0/O/1/I)
- **Shared library** — Both members see the same recipes, meal plans, and grocery lists
- **Realtime collaboration** — Supabase Realtime subscriptions for live multi-user editing
- **Clean separation** — When a member leaves, their recipes return to their personal library
- **Max 2 members** — Designed for couples/partners

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS v4, shadcn/ui, lucide-react |
| Database | Supabase (PostgreSQL, Auth, Realtime, RLS) |
| AI | OpenAI-compatible API (configurable endpoint) |
| Nutrition | USDA FoodData Central API |
| Scraping | cheerio (JSON-LD extraction) |
| Forms | react-hook-form + zod validation |
| Drag & Drop | @hello-pangea/dnd |
| Hosting | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Supabase project (free tier works)

### Setup

```bash
# Clone and install
git clone https://github.com/akshaygupta26/Menuly.git
cd Menuly
pnpm install

# Configure environment
cp .env.local.example .env.local
# Fill in your Supabase URL, anon key, USDA API key, and AI API credentials

# Run database migrations
# Execute each file in supabase/migrations/ in order via Supabase SQL Editor

# Start dev server
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `USDA_API_KEY` | No | USDA FoodData Central API key (nutrition calculation) |
| `AI_API_KEY` | No | OpenAI-compatible API key (recipe generation) |
| `AI_BASE_URL` | No | AI API base URL |
| `AI_MODEL` | No | AI model identifier |

### Commands

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm lint         # ESLint
pnpm tsc --noEmit # Type checking
```

---

## Architecture

```
src/
├── app/
│   ├── (auth)/          # Login, OAuth callback
│   ├── (app)/           # Authenticated pages
│   │   ├── page.tsx          # Dashboard
│   │   ├── recipes/          # Recipe CRUD, import, detail, edit
│   │   ├── plan/             # Weekly meal plan with [weekStart] routing
│   │   ├── grocery/          # Grocery list with [id] detail
│   │   └── settings/         # Preferences, household, Apple Reminders
│   └── api/
│       ├── recipes/generate/ # AI recipe generation (rate-limited)
│       ├── recipes/import/   # URL scraping endpoint
│       ├── meal-plan/generate/ # Smart rotation algorithm
│       ├── grocery/export/   # Apple Reminders API
│       └── nutrition/calculate/ # USDA nutrition lookup
├── actions/             # Server actions (recipes, meal-plans, grocery, household, settings, auth)
├── components/
│   ├── ui/              # shadcn/ui primitives
│   ├── recipes/         # Recipe card, form, filters
│   ├── meal-plan/       # Week grid, recipe picker, day column
│   ├── grocery/         # List view, add item input
│   ├── household/       # Household section (create/join/manage)
│   └── layout/          # App shell, header, sidebar, mobile nav
├── lib/
│   ├── supabase/        # Client + server Supabase instances
│   ├── rotation-algorithm.ts  # Meal plan scoring
│   ├── recipe-scraper.ts      # JSON-LD extraction
│   ├── ingredient-parser.ts   # "2 lbs chicken" → structured data
│   ├── grocery-consolidator.ts # Merge + convert ingredients
│   ├── nutrition.ts           # USDA FoodData Central client
│   ├── recipe-prompt-builder.ts # AI prompt with user preferences
│   └── household-context.ts   # Dual-mode ownership helper
└── types/
    └── database.ts      # All TypeScript types
```

### Key Patterns

- **Server actions** return `ActionResult<T>` (`{ data, error }`) — never throw
- **Dual-mode ownership** — Every query uses `applyOwnershipFilter()` to handle solo users (`.eq("user_id")`) vs. household members (`.eq("household_id")`)
- **Optimistic UI** — Grocery checkboxes and recipe favorites update instantly before server confirmation
- **Row Level Security** — All data access goes through Supabase RLS policies with a `SECURITY DEFINER` helper to avoid recursion

---

## Database

10 tables with RLS on all, managed through incremental migrations:

| Table | Purpose |
|---|---|
| `profiles` | Per-user settings (meal slots, AI generation limits) |
| `recipes` | Recipe data with nutrition fields |
| `recipe_ingredients` | Structured ingredients linked to recipes |
| `recipe_history` | Cooking log with optional ratings |
| `meal_plans` | Weekly plans (draft/finalized status) |
| `meal_plan_items` | Individual meal slots |
| `grocery_lists` | Generated from finalized meal plans |
| `grocery_items` | Consolidated, categorized ingredients |
| `households` | Shared household with invite code |
| `household_members` | Membership join table |

Migrations: `supabase/migrations/001_initial_schema.sql` through `006_fix_household_select_for_owner.sql`

---

## Design

Warm, food-inspired color palette using oklch color space:
- **Primary** — Terracotta (`oklch(0.58 0.14 40)`)
- **Secondary** — Sage green (`oklch(0.88 0.04 150)`)
- **Background** — Warm cream
- Full dark mode support

Responsive layout with sidebar navigation on desktop and bottom tab bar on mobile. PWA-ready with web app manifest for "Add to Home Screen".

---

## Apple Reminders Sync

Menuly can push your grocery list to Apple Reminders via an iOS Shortcut:

1. Go to **Settings > Apple Reminders Sync**
2. Copy the API endpoint and authorization header value
3. Create a Shortcut with "Get Contents of URL" → "Get Dictionary Value" → "Repeat with Each" → "Add New Reminder"
4. Run the shortcut to sync your list

The API returns a flat list of formatted strings (e.g., `"2 lbs Chicken Breast"`) designed for direct use in Reminders.

---

## Deployment

Deployed on Vercel with automatic builds. Supabase handles the database, auth, and realtime infrastructure.

```bash
vercel --prod --yes
```

Requires Supabase Dashboard configuration:
- Site URL and Redirect URLs must include the production domain
- Google OAuth credentials configured in Supabase Auth providers
- Realtime enabled for `grocery_items` and `meal_plan_items` tables

---

## License

Private project. All rights reserved.
