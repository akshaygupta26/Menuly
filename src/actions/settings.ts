"use server";

import { createClient } from "@/lib/supabase/server";
import type { MealType, Profile } from "@/types/database";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionResult<T = null> =
  | { data: T; error: null }
  | { data: null; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null };
  }

  return { supabase, user };
}

const VALID_MEAL_TYPES: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

// ---------------------------------------------------------------------------
// 1. getProfile
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<ActionResult<Profile>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { data: null, error: profileError.message };
  }

  if (!profile) {
    // Create a default profile if one doesn't exist yet
    const { data: newProfile, error: createError } = await supabase
      .from("profiles")
      .insert({
        user_id: user.id,
        meal_slots: ["breakfast", "lunch", "dinner"] as MealType[],
      })
      .select("*")
      .single();

    if (createError) {
      return { data: null, error: createError.message };
    }

    return { data: newProfile as Profile, error: null };
  }

  return { data: profile as Profile, error: null };
}

// ---------------------------------------------------------------------------
// 2. updateMealSlots
// ---------------------------------------------------------------------------

export async function updateMealSlots(
  slots: MealType[]
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Validate that all provided slots are valid MealType values
  const invalid = slots.filter((s) => !VALID_MEAL_TYPES.includes(s));
  if (invalid.length > 0) {
    return {
      data: null,
      error: `Invalid meal slot(s): ${invalid.join(", ")}`,
    };
  }

  // Deduplicate while preserving order
  const uniqueSlots = [...new Set(slots)];

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ meal_slots: uniqueSlots, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  revalidatePath("/settings");
  revalidatePath("/plan");

  return { data: null, error: null };
}

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
