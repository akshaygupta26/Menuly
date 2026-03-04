export type NutritionSource = "json_ld" | "usda" | "manual";
export type HouseholdRole = "owner" | "member";

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  joined_at: string;
}

export interface HouseholdMemberInfo {
  user_id: string;
  email: string | null;
  joined_at: string;
  role: HouseholdRole;
}

export interface HouseholdWithMembers extends Household {
  members: HouseholdMemberInfo[];
}

export interface NutritionInfo {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface IngredientNutritionDetail {
  name: string;
  per100g: NutritionInfo;
  scaled: NutritionInfo;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type MealPlanStatus = "draft" | "finalized";
export type IngredientCategory =
  | "produce"
  | "dairy"
  | "meat"
  | "pantry"
  | "frozen"
  | "bakery"
  | "beverages"
  | "other";

export interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  meal_slots: MealType[];
  ai_generation_count: number;
  ai_generation_reset_at: string;
  ai_unlimited: boolean;
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  cuisine_type: string | null;
  protein_type: string | null;
  meal_type: MealType[];
  prep_time: number | null;
  cook_time: number | null;
  servings: number | null;
  instructions: string[];
  tags: string[];
  is_favorite: boolean;
  last_made_date: string | null;
  times_made: number;
  source_url: string | null;
  image_url: string | null;
  notes: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  nutrition_source: NutritionSource | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: IngredientCategory;
  notes: string | null;
  is_optional: boolean;
  raw_text: string;
  sort_order: number;
}

export interface RecipeHistory {
  id: string;
  recipe_id: string;
  user_id: string;
  household_id: string | null;
  made_date: string;
  rating: number | null;
  notes: string | null;
  created_at: string;
}

export interface MealPlan {
  id: string;
  user_id: string;
  household_id: string | null;
  week_start: string;
  status: MealPlanStatus;
  created_at: string;
  updated_at: string;
}

export interface MealPlanItem {
  id: string;
  meal_plan_id: string;
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  meal_slot: MealType;
  recipe_id: string | null;
  custom_name: string | null;
  created_at: string;
}

export interface MealPlanItemWithRecipe extends MealPlanItem {
  recipe: Recipe | null;
}

export interface GroceryList {
  id: string;
  user_id: string;
  household_id: string | null;
  meal_plan_id: string | null;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroceryItem {
  id: string;
  grocery_list_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: IngredientCategory;
  is_checked: boolean;
  recipe_ids: string[];
  added_manually: boolean;
  sort_order: number;
  created_at: string;
}
