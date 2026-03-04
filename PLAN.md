# Menuly — Product Plan

## Vision

Menuly is the AI-powered meal planning assistant that eliminates the cognitive load of deciding what to eat, what to buy, and how to cook it. The free tier provides essential planning tools. The paid tier unlocks unlimited AI capabilities that make the entire food workflow feel effortless.

---

## Current State (v0.1 — Free Tier)

### What's Built

| Feature | Status | Details |
|---|---|---|
| Recipe Library | Done | Manual entry, URL import (JSON-LD scraping), AI generation |
| AI Recipe Generation | Done | 3 recipes/day, learns from user preferences, USDA nutrition |
| Smart Meal Planning | Done | 100-point scoring algorithm (recency, diversity, favorites) |
| Grocery Consolidation | Done | Auto-merges ingredients, unit conversion, category grouping |
| Apple Reminders Sync | Done | REST API + Bearer token for iOS Shortcuts |
| Household Sharing | Done | 2-person households, invite codes, realtime sync |
| Nutrition Tracking | Done | JSON-LD, USDA FoodData Central, manual entry |
| Realtime Collaboration | Done | Grocery items + meal plan items sync live |
| Authentication | Done | Google OAuth, email/password, magic link, password reset |
| PWA Support | Done | Web app manifest, mobile-optimized |

### Free Tier Limits

| Resource | Limit |
|---|---|
| AI recipe generation | 3 per day (21 per week) |
| Recipe library size | Unlimited |
| Meal plan generation | Unlimited |
| Grocery lists | Unlimited |
| URL recipe imports | Unlimited |
| Household members | 2 max |

---

## Paid Tier — "Menuly Pro" (Planned)

### Pricing Model (TBD)

Options to evaluate:
- **Monthly subscription** ($4.99-7.99/mo)
- **Annual subscription** ($39.99-59.99/yr, ~2 months free)
- **Lifetime** ($99-149 one-time)

The price should reflect that this replaces multiple apps (recipe manager + meal planner + grocery list + nutrition tracker) and saves real money through reduced food waste and fewer impulse purchases.

---

### Pro Feature: Unlimited AI Recipe Generation

**Current:** 3 recipes/day, tracked via `profiles.ai_generation_count` with 24-hour rolling window.

**Pro:** Remove the limit entirely. The `profiles.ai_unlimited` boolean flag already exists in the database — just needs a payment gate.

**Why it matters:** Power users who meal prep or cook for variety want to generate 10-20 recipes in a session when building out their library. The 3/day limit forces them to spread this over a week.

---

### Pro Feature: AI-Powered Grocery List Management

Transform the grocery list from a static checklist into an intelligent shopping assistant.

#### Smart Substitutions
When an ingredient is unavailable or expensive:
- "No fresh basil? Substitute 1 tsp dried basil — adjust step 3 to add it earlier in cooking."
- "Salmon too pricey this week? Try cod — same prep, reduce cook time by 2 min."
- User taps "Substitute" and the grocery list + recipe instructions update automatically.

#### Intelligent Quantity Optimization
AI analyzes the full grocery list in context:
- "You're buying 3 lbs chicken for 3 recipes. A 5 lb family pack is cheaper — here's an extra recipe to use the remaining 2 lbs."
- "You need 1 cup heavy cream for Recipe A and 2 tbsp for Recipe B. One 8 oz carton covers both with ½ cup leftover — here's a sauce recipe to use it up."
- Reduces food waste by suggesting recipes that use leftover ingredients.

#### Pantry Awareness
Users mark items they always have at home (salt, oil, basic spices):
- These are auto-excluded from grocery lists
- AI learns from check-off patterns ("you never buy garlic powder — adding to pantry staples")
- "Running low?" reminders based on usage frequency

#### Budget Estimation
- AI estimates total grocery cost based on regional pricing data
- "This week's plan: ~$85 for 2 people"
- Budget-conscious mode: "Generate a meal plan under $60"
- Highlight which recipes are driving cost up

#### Store Aisle Ordering
- AI reorders the list by typical grocery store layout (produce → deli → dairy → frozen → checkout)
- Customizable per user's preferred store
- Reduces backtracking through the store

#### Meal Prep Instructions
When generating the grocery list:
- "Prep Sunday: Dice all onions (3 cups needed across 4 recipes). Marinate chicken for Monday's dinner."
- Batch prep suggestions to save time during the week

---

### Pro Feature: AI-Generated Recipe Images

**Current:** Recipes imported from URLs show scraped images. AI-generated and manual recipes have no image.

**Pro:** Auto-generate a photorealistic food image for every recipe using Google Gemini 2.0 Flash (free tier: 500 images/day) or Imagen 4 Fast ($0.02/image).

**Implementation:**
- Generate image during recipe creation (AI-generated recipes)
- "Generate image" button on recipes without one
- Upload to Supabase Storage, store URL in `recipes.image_url`
- Prompt: food photography style, overhead angle, natural lighting, styled on a clean surface

---

### Pro Feature: Advanced Meal Plan Intelligence

#### Nutritional Balance Optimization
- "Your plan averages 2,400 cal/day but your goal is 1,800. Swap Wednesday's pasta for this grilled chicken salad."
- Weekly nutrition summary: total calories, macro split, micronutrient highlights
- Set daily calorie/macro targets and AI optimizes around them

#### Dietary Restrictions & Goals
- Define restrictions: vegetarian, vegan, gluten-free, dairy-free, keto, paleo, halal, kosher
- AI filters recipes and generates only compliant meals
- "Meatless Monday" auto-rules
- Seasonal ingredient awareness ("It's October — featuring butternut squash, apples, root vegetables")

#### Leftover-Aware Planning
- Monday's roast chicken → Tuesday's chicken tacos → Wednesday's chicken soup
- AI chains recipes to minimize waste and maximize variety from the same protein purchase
- "Cook once, eat thrice" meal prep strategies

#### Family/Guest Scaling
- "Hosting 6 people Saturday" — AI adjusts that day's recipes and grocery quantities
- Kid-friendly meal suggestions for families
- Separate guest meal plans that merge with the weekly grocery list

---

### Pro Feature: AI Chat Assistant

A conversational interface for food-related questions:
- "What can I make with what's in my fridge?" (photo input → recipe suggestions)
- "Convert this recipe to be gluten-free"
- "I have 30 minutes, what's the fastest dinner from my library?"
- "Scale this recipe from 4 to 8 servings" (updates ingredients automatically)
- "What wine pairs with this lamb dish?"

Accessible from any page via a floating chat button.

---

### Pro Feature: Import & Cookbook Enhancements

#### Batch Import
- Import entire Pinterest boards, Instagram saved posts, or bookmarked URLs
- PDF cookbook scanning — photograph a cookbook page, AI extracts the recipe
- Copy-paste raw text and AI structures it into a full recipe

#### Cookbook Organization
- Organize recipes into custom cookbooks/collections ("Weeknight Quick", "Holiday Baking", "Date Night")
- Share collections publicly or via link
- Follow other users' public collections

---

### Pro Feature: Analytics & Insights

#### Cooking Analytics
- "You've cooked 47 unique recipes this year"
- Most-cooked cuisines and proteins over time
- Cooking frequency trends (weeks you planned vs. didn't)
- Nutrition trends across weeks/months

#### Cost Tracking
- Track actual grocery spending vs. estimates
- "Your average weekly grocery cost: $78"
- Cost per serving breakdowns
- Month-over-month spending trends

---

## Technical Roadmap

### Phase 1: Foundation Polish (Current)
- [x] Household sharing with invite codes
- [x] Recipe image display
- [x] Accessibility improvements (ARIA labels, touch targets)
- [x] Ingredient fraction display (1/2, 3/4 instead of 0.5, 0.75)
- [ ] AI-generated recipe images (Gemini integration)
- [ ] Dark mode toggle in settings
- [ ] Recipe drag-and-drop reordering on meal plan grid
- [ ] Undo for grocery item check-off (swipe to undo)

### Phase 2: Pro Infrastructure
- [ ] Payment integration (Stripe)
- [ ] Pro feature gating (`profiles.is_pro` flag)
- [ ] Usage tracking and analytics
- [ ] Upgrade prompts at limit boundaries
- [ ] Pro badge in UI

### Phase 3: AI Grocery Intelligence
- [ ] Pantry staples management (always-have-at-home items)
- [ ] Smart substitution suggestions
- [ ] Quantity optimization ("buy the family pack")
- [ ] Budget estimation
- [ ] Batch meal prep instructions

### Phase 4: Advanced Meal Planning
- [ ] Dietary restriction profiles
- [ ] Nutritional target setting + optimization
- [ ] Leftover chaining (cook once, eat thrice)
- [ ] Seasonal ingredient suggestions
- [ ] Guest/scaling adjustments

### Phase 5: AI Chat & Imports
- [ ] Conversational AI assistant
- [ ] Photo-based ingredient recognition
- [ ] Batch URL import
- [ ] PDF/photo cookbook scanning
- [ ] Recipe text extraction from copy-paste

### Phase 6: Social & Analytics
- [ ] Custom cookbook collections
- [ ] Shareable recipe links
- [ ] Cooking analytics dashboard
- [ ] Cost tracking
- [ ] Public recipe feed (optional)

---

## Competitive Landscape

| App | Strengths | Menuly Differentiators |
|---|---|---|
| Paprika | Excellent recipe scraping, cross-platform | AI generation, smart rotation, household sharing |
| Mealime | Beautiful UX, dietary filters | AI-powered everything, Apple Reminders sync |
| Plan to Eat | Great drag-drop planning | AI recipe creation, USDA nutrition, realtime household |
| Whisk | Recipe scaling, big library | AI grocery intelligence, rotation algorithm |
| Eat This Much | Auto calorie-based plans | Full recipe library + AI generation + Apple integration |

**Menuly's moat:** The combination of AI recipe generation, preference-learning rotation algorithm, and household realtime collaboration in a single app doesn't exist elsewhere. The grocery intelligence features (substitutions, quantity optimization, waste reduction) further differentiate.

---

## Design Principles

1. **AI should feel like a suggestion, not a takeover** — Users always have manual control. AI enhances, never forces.
2. **The happy path should be 3 taps** — Import recipe → Generate plan → Get grocery list.
3. **Shared by default (in households)** — When two people use the app, everything is collaborative. No "syncing" or "sharing" friction.
4. **Respect the pantry** — Don't make people buy salt every week. Learn what they already have.
5. **Mobile-first, desktop-capable** — The grocery list is used in a store on a phone. The meal plan is built on a laptop. Both should feel native.

---

## Open Questions

- **Pricing sensitivity:** Is $4.99/mo the right price point, or should Pro be positioned as premium ($9.99/mo) with more features?
- **AI provider:** Lock into one provider (Gemini for images, OpenAI for text) or keep the current configurable endpoint approach?
- **Social features:** Is recipe sharing/following valuable enough to build, or does it dilute focus?
- **Offline support:** Should the grocery list work offline (service worker + local storage) for stores with bad reception?
- **Multi-store support:** Do users shop at multiple stores? Should lists be splittable?
- **Meal plan templates:** "Repeat last week's plan" or "Use my Mediterranean template" — how much demand exists?
- **Integration depth:** Beyond Apple Reminders, is there demand for Google Keep, Todoist, AnyList, or Alexa integrations?
