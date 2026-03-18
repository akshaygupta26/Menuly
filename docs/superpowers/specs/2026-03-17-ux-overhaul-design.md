# Menuly UX Overhaul — Design Spec

**Date:** 2026-03-17
**Status:** Approved
**Goal:** Transform Menuly from a functional prototype into a polished, cohesive product with NYT Cooking-level UX quality.

## Design Philosophy

- **Non-blocking everywhere** — no action should make the user wait or block the UI. Long operations happen in the background with toast notifications.
- **NYT Cooking polish** — content-first, satisfying animations, editorial feel.
- **Linear-style responsiveness** — actions feel instant; the UI never stalls.

## Reference

- **Inspiration:** NYT Cooking (slick, satisfying animations), Linear (non-blocking, instant-feeling)
- **Component libraries:** shadcn/ui (existing), 21st-dev MCP, ui-ux-pro-max for animations/components
- **Toast system:** sonner (existing)
- **Drag & drop:** @hello-pangea/dnd (existing, meal plan only — not in scope)

---

## 1. Recipe Creation Flow

### Current Problems
- "Create with AI" opens a **side sheet** that blocks the UI
- User must wait for streaming to complete before doing anything
- On completion, user is **redirected** to `/recipes/new` — jarring context switch
- URL import has the same blocking pattern

### Design: Hybrid Quick Bar + Modal with Background Processing

**Quick Bar (default path):**
- Persistent prompt bar at the top of the `/recipes` page
- Styled to match the app theme (terracotta accent, subtle border)
- Input with placeholder: `"Describe a recipe... 'chicken curry with coconut milk'"`
- "Generate" button on the right
- Enter key triggers generation
- On submit: bar shows brief "Sent" feedback, then resets. Background processing begins.

**Options Modal (detailed path):**
- An expand/options button on the quick bar opens a compact centered modal (not a sheet)
- Modal contains: prompt input + optional fields (cuisine preference, dietary restrictions, servings)
- Command-palette feel — opens fast, dismisses fast
- On submit: modal closes immediately. Background processing begins.

**Background Processing:**
- A placeholder draft card appears in the recipe grid with:
  - Dashed terracotta border
  - Subtle shimmer/pulse animation
  - "Generating..." label with sparkle icon
- User can navigate anywhere in the app while generation happens
- SSE streaming continues in the background (managed by a context provider or global state)
- On completion: toast notification — `"Paneer Tikka Masala is ready — tap to review"` (with action to navigate to recipe)
- Draft card updates to show recipe name + "Draft" badge + "Tap to review & save"
- Clicking the draft card opens the recipe review/edit form (existing `RecipeForm` component)

**URL Import (same pattern):**
- Enter URL in the quick bar or a dedicated import input
- Dismiss immediately, background scraping begins
- Draft card placeholder appears in the grid
- Toast notification when scraping + parsing is complete
- Draft card updates with imported recipe data

**Draft Card States:**
1. `generating` — dashed border, shimmer animation, "Generating..." text
2. `ready` — dashed border, "Draft" badge, recipe name visible, "Tap to review & save"
3. `error` — dashed border, red accent, error message, "Retry" button

**Technical Notes:**
- Background processing managed by a React context (`RecipeGenerationProvider`) mounted in the **root app layout** (`src/app/(app)/layout.tsx`), not in individual page components — this ensures the SSE connection survives page navigation
- Active generations stored in context state, persisted to `sessionStorage` for page navigation resilience
- SSE connection managed with `AbortController` for cleanup
- **Draft storage: client-only.** Draft recipes are held in the `RecipeGenerationProvider` context state and mirrored to `sessionStorage`. They are NOT saved to Supabase until the user explicitly reviews and saves. This avoids DB schema changes and keeps drafts ephemeral. Trade-off: drafts are lost if the user clears browser storage or switches devices — this is acceptable for generated recipes.
- **Tab close behavior:** If the user closes the browser tab mid-generation, the SSE connection is lost and the generation is abandoned. The `sessionStorage` entry is cleaned up on next visit (stale entries detected by timestamp). This is acceptable — the user can simply re-generate.
- **Options modal fields** (cuisine, dietary restrictions, servings): These are appended to the prompt string sent to the existing `/api/recipes/generate` endpoint (e.g., `"chicken curry, Indian cuisine, vegetarian, 4 servings"`). No API schema changes needed.
- Rate limiting (3/day) remains unchanged

---

## 2. Recipe Browsing & Cards

### Current Problems
- All cards are the same size — no visual hierarchy
- Flat, utilitarian feel — no depth or polish
- Filter bar is functional but not delightful

### Design: Mixed Layout with Editorial Grid Default

**Grid/List Toggle:**
- Small toggle in the filter bar: grid icon (default active) / list icon
- Toggle state persisted in `localStorage`
- Animated transition between views (cross-fade, 200ms)

**Grid Mode (Editorial Cards — NYT-inspired):**
- Large hero images with rounded corners (10px radius)
- Card shadow: `0 2px 12px rgba(0,0,0,0.08)`, deepens on hover
- Hover: `translateY(-2px)` lift + shadow deepen (200ms ease-out)
- Image section:
  - 16:9 aspect ratio (existing)
  - Favorite heart button (top-right, circular white bg): click triggers fill animation + scale bounce (1.0 → 1.2 → 1.0, 300ms)
  - "Last made X ago" pill badge (bottom-left of image, semi-transparent dark bg) — only if data exists
- Content section (top to bottom):
  1. Recipe name — slightly larger, semi-bold font
  2. Subtitle — one-line from `notes` field (first sentence, truncated), italic, muted color. Hidden when `notes` is empty (card height shrinks gracefully).
  3. Metadata row — separated by thin top border: `30 min · 4 servings · 450 cal`
  - No more badge soup — cuisine/protein shown only in list mode or on hover
- No-image fallback: Gradient background using recipe cuisine color mapping:

  | Cuisine | Gradient |
  |---------|----------|
  | Indian | warm terracotta (`#d4a574` → `#c4956a`) |
  | Italian | sage green (`#8faa84` → `#7a9570`) |
  | Mexican | warm amber (`#e8c9a8` → `#d4b08c`) |
  | Thai | golden yellow (`#e8d48a` → `#d4c070`) |
  | Chinese | deep red (`#c47070` → `#b05a5a`) |
  | Japanese | soft indigo (`#8a8aad` → `#7070a0`) |
  | Mediterranean | ocean blue (`#7aa0b0` → `#6090a0`) |
  | American | slate blue (`#8a9aad` → `#7080a0`) |
  | **Fallback (unmapped)** | neutral warm grey (`#b0a898` → `#a09888`) |

**List Mode (Compact Cards):**
- Horizontal layout: small thumbnail (60x60, rounded) + text
- Recipe name, cuisine · protein · time on one line
- Calorie/protein pills
- 2-column grid on desktop, single column on mobile
- Dense but readable

**Filter Bar Enhancements:**
- Active filters shown as pills with spring-animated entrance
- Each pill has an "✕" with hover scale
- "Clear all" pill with scale-down fade animation on click
- Filter dropdowns animate open with height + opacity transition
- Search input: subtle focus ring animation (border color transition)

**Draft Cards (from Section 1):**
- **Pinned to the top of the grid** (before regular cards, regardless of sort order)
- Dashed terracotta border, no shadow
- "Draft" badge (terracotta pill, top of card)
- Generating state: shimmer animation on the entire card
- Ready state: recipe name visible, "Tap to review & save" subtitle

---

## 3. Grocery List

### Current Problems
- Checking items feels utilitarian — no feedback beyond the checkbox
- No sense of progress
- Category sections are static
- **Behavior change note:** The current UI uses a remove-on-check model (`removeGroceryItem`) — checking an item deletes it from the list entirely. This design changes to a **toggle model** using the existing `is_checked` column and `toggleGroceryItem` server action (both already exist in the DB/actions but are unused by the UI). Checked items remain visible with strikethrough styling instead of being removed.

### Design: Optimistic Tap + Category Animations + Progress Bar

**Progress Bar:**
- Fixed at top of grocery list, below header
- Shows `X / Y items` with animated fill bar
- Fill uses terracotta gradient, animates width on each check (500ms smooth ease)
- Counter number rolls up/down on change

**Item Interactions:**
- Tap/click to check — **optimistic update** (immediate UI change, no server wait)
- Checked item animation sequence (200ms):
  1. Checkbox fills with green + checkmark appears
  2. Text gets strikethrough with color fade to muted
  3. Item slides down to bottom of category (or stays in place with muted styling)
- Dark undo toast appears at bottom: `"✓ Tomatoes checked off · Undo"` (3 second auto-dismiss)
- Undo reverses the animation
- Silent retry on Supabase realtime sync failure (existing realtime subscription handles conflict resolution)

**Category Behavior:**
- Category headers show: emoji + name + `X / Y` progress count
- When all items in a category are checked:
  - Header transitions to green "All done" state with spring animation (300ms)
  - Items collapse (height animation, 500ms smooth ease)
  - Collapsed header shows: emoji + name + "✓ All done" badge
  - Tap collapsed header to expand and see checked items
- Categories with unchecked items stay expanded
- Empty categories are hidden

**Technical Notes:**
- Optimistic updates: update local state immediately, fire Supabase mutation async
- On mutation failure: revert local state + show error toast
- Undo: keep a short undo stack (last 3 actions), clear on timeout
- Realtime subscription (existing) handles cross-device sync — other user's changes animate in smoothly
- `prefers-reduced-motion`: skip item slide animations, use instant state changes

---

## 4. Navigation & Layout

### Current Problems
- Page changes are abrupt — no transition, content just appears
- Loading states are basic pulse skeletons — generic feel
- No consistent motion language tying the app together

### Design: Shared Element Transitions + Shimmer Skeletons + Motion System

**Page Transitions:**

*Recipe Card → Detail (Shared Element):*
- Uses View Transitions API (`document.startViewTransition()`) where supported
- Recipe card image + title morph into the detail page hero header
- Card lifts from grid, expands to full-width hero image, title repositions
- Back navigation reverses: hero shrinks back into the card position in the grid
- Duration: 300ms with spring easing
- **Browser support reality:** View Transitions API is Chrome/Edge only as of early 2026. Firefox and Safari (including iOS Safari — the primary PWA target) do not support it. The **fallback is the default experience** for most users and must be designed with equal care.
- **Fallback (primary path for Safari/Firefox):** Fade out card grid (100ms) → fade in detail page with upward slide (200ms). This is the same quality as the general page transition but feels intentional, not degraded. Feature-detect with `document.startViewTransition` existence check.

*All Other Page Transitions:*
- Content area fades in with slight upward slide (8-12px translateY, 200ms ease-out)
- Navigation bar stays fixed — only the content region transitions
- Navigating "deeper" (e.g., recipes → recipe detail): content slides in from right
- Navigating "back": content slides in from left
- Duration: 200ms ease-out

**Shimmer Skeletons:**
- Content-shaped skeleton placeholders matching the layout of what's loading:
  - Recipe grid: card-shaped skeletons (image block + text lines)
  - Grocery list: row-shaped skeletons within category groups
  - Meal plan: cell-shaped skeletons in the week grid
- Left-to-right shimmer sweep animation using CSS gradient
- No layout shift when real content replaces skeletons (same dimensions)
- Shimmer color: `#f0f0f0` → `#e8e8e8` → `#f0f0f0`

**Motion Language (Global):**

| Token | Duration | Usage |
|-------|----------|-------|
| `--duration-instant` | 100ms | Button states, toggles, checkbox fills |
| `--duration-fast` | 200ms | Fade in/out, slide transitions, hover effects |
| `--duration-normal` | 300ms | Page transitions, modal open/close, shared element |
| `--duration-smooth` | 500ms | Height collapse, progress bar fill, category fold |

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-spring` | `cubic-bezier(0.16, 1, 0.3, 1)` | Spring-like bounce for entrances, filter pills |
| `--ease-out` | `cubic-bezier(0.0, 0, 0.2, 1)` | Standard ease-out for fades, slides |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Symmetric transitions, shared elements |

**Micro-interactions:**
- **Button press:** scale to 0.97 on `:active` (100ms)
- **Heart favorite:** fill color + scale bounce 1.0 → 1.2 → 1.0 (300ms spring)
- **Toast entrance:** slide up 20px + fade in from bottom (200ms)
- **Card hover:** translateY(-2px) + shadow deepen (200ms ease-out)
- **Tab/filter switch:** underline slides to active tab with spring ease (300ms)
- **Counter changes:** number rolls up/down with overflow hidden clip (200ms)
- **Draft card shimmer:** gradient sweep left-to-right, 2s loop

**Accessibility:**
- All animations gated behind `prefers-reduced-motion: no-preference`
- When `prefers-reduced-motion: reduce`: instant state changes, no motion, opacity transitions only
- Focus indicators: visible focus rings on all interactive elements
- Toast notifications include ARIA live region announcements

---

## Out of Scope

- Meal plan weekly view (already feels good)
- Authentication flow
- Settings page
- Dashboard page
- Backend/API changes beyond what's needed for draft recipe state
- Mobile-specific gestures (swipe) — tap works universally

---

## Implementation Tools

- **shadcn/ui** — base components (existing)
- **21st-dev MCP** — component inspiration and generation for polished UI elements
- **ui-ux-pro-max** — animation patterns, design system guidance
- **View Transitions API** — shared element transitions (with fallback)
- **CSS custom properties** — motion tokens
- **CSS-only animations** — category collapse uses `grid-template-rows: 0fr/1fr` transition, counter roll uses `overflow: hidden` + `transform: translateY`. No Framer Motion needed — keeps bundle lean.
- **sonner** — toast notifications (existing)
