"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { OnboardingPage, DietaryPreference, Allergy } from "@/types/onboarding";

type ActionResult<T = null> =
  | { data: T; error: null }
  | { data: null; error: string };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

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
