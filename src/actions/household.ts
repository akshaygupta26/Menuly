"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { HouseholdWithMembers, HouseholdMemberInfo } from "@/types/database";

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

const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return code;
}

// ---------------------------------------------------------------------------
// 1. getHousehold
// ---------------------------------------------------------------------------

interface HouseholdResponse {
  household: HouseholdWithMembers | null;
  currentUserId: string;
}

export async function getHousehold(): Promise<ActionResult<HouseholdResponse>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Find user's membership
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { data: { household: null, currentUserId: user.id }, error: null };
  }

  // Fetch household
  const { data: household, error: householdError } = await supabase
    .from("households")
    .select("*")
    .eq("id", membership.household_id)
    .single();

  if (householdError || !household) {
    return { data: null, error: "Household not found" };
  }

  // Fetch members with joined_at
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("user_id, joined_at")
    .eq("household_id", household.id);

  if (membersError) {
    return { data: null, error: membersError.message };
  }

  // Get emails via SECURITY DEFINER RPC (falls back to auth.users if profiles.email is NULL)
  const { data: emailRows } = await supabase.rpc(
    "get_household_member_emails",
    { p_household_id: household.id }
  );

  const emailMap = new Map(
    ((emailRows as { user_id: string; email: string | null }[]) ?? []).map(
      (r) => [r.user_id, r.email]
    )
  );

  const memberInfos: HouseholdMemberInfo[] = (members ?? []).map((m) => ({
    user_id: m.user_id,
    email: emailMap.get(m.user_id) ?? null,
    joined_at: m.joined_at,
    role: m.user_id === household.owner_id ? "owner" : "member",
  }));

  return {
    data: {
      household: {
        ...household,
        members: memberInfos,
      } as HouseholdWithMembers,
      currentUserId: user.id,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 2. createHousehold
// ---------------------------------------------------------------------------

export async function createHousehold(
  name: string
): Promise<ActionResult<HouseholdWithMembers>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  if (!name.trim()) {
    return { data: null, error: "Household name is required" };
  }

  // Check user isn't already in a household
  const { data: existingMembership } = await supabase
    .from("household_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    return { data: null, error: "You are already in a household" };
  }

  // Generate unique invite code with collision retry
  // Uses RPC to bypass RLS (can't see other users' households)
  let inviteCode = generateInviteCode();
  let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await supabase
      .rpc("lookup_household_by_invite_code", { code: inviteCode });

    if (!existing || (Array.isArray(existing) && existing.length === 0)) break;
    inviteCode = generateInviteCode();
    attempts++;
  }

  // Create household
  const { data: household, error: createError } = await supabase
    .from("households")
    .insert({
      name: name.trim(),
      invite_code: inviteCode,
      owner_id: user.id,
    })
    .select("*")
    .single();

  if (createError) {
    return { data: null, error: createError.message };
  }

  // Add owner as member
  const { error: memberError } = await supabase
    .from("household_members")
    .insert({
      household_id: household.id,
      user_id: user.id,
    });

  if (memberError) {
    // Clean up
    await supabase.from("households").delete().eq("id", household.id);
    return { data: null, error: memberError.message };
  }

  // Migrate user's existing recipes to the household
  await supabase
    .from("recipes")
    .update({ household_id: household.id })
    .eq("user_id", user.id)
    .is("household_id", null);

  // Get user email for member info
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", user.id)
    .single();

  revalidatePath("/settings");
  revalidatePath("/recipes");

  return {
    data: {
      ...household,
      members: [
        {
          user_id: user.id,
          email: profile?.email ?? null,
          joined_at: new Date().toISOString(),
          role: "owner" as const,
        },
      ],
    } as HouseholdWithMembers,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 3. joinHousehold
// ---------------------------------------------------------------------------

export async function joinHousehold(
  inviteCode: string
): Promise<ActionResult<HouseholdWithMembers>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  const code = inviteCode.trim().toUpperCase();
  if (code.length !== 6) {
    return { data: null, error: "Invite code must be 6 characters" };
  }

  // Check user isn't already in a household
  const { data: existingMembership } = await supabase
    .from("household_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    return { data: null, error: "You are already in a household. Leave it first to join another." };
  }

  // Find household by code (uses SECURITY DEFINER function to bypass RLS,
  // since the joining user isn't a member yet and can't see the household)
  const { data: households, error: findError } = await supabase
    .rpc("lookup_household_by_invite_code", { code });

  const household = Array.isArray(households) ? households[0] : null;

  if (findError || !household) {
    return { data: null, error: "Invalid invite code" };
  }

  // Check household isn't full (max 2 members)
  const { count } = await supabase
    .from("household_members")
    .select("id", { count: "exact", head: true })
    .eq("household_id", household.id);

  if ((count ?? 0) >= 2) {
    return { data: null, error: "This household is full (max 2 members)" };
  }

  // Add user as member
  const { error: joinError } = await supabase
    .from("household_members")
    .insert({
      household_id: household.id,
      user_id: user.id,
    });

  if (joinError) {
    return { data: null, error: joinError.message };
  }

  // Migrate user's existing recipes to the household
  await supabase
    .from("recipes")
    .update({ household_id: household.id })
    .eq("user_id", user.id)
    .is("household_id", null);

  // Deactivate user's active grocery list (they'll use the household's)
  await supabase
    .from("grocery_lists")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);

  // Fetch full household data for response
  const result = await getHousehold();

  revalidatePath("/settings");
  revalidatePath("/recipes");
  revalidatePath("/plan");
  revalidatePath("/grocery");

  if (result.error || !result.data?.household) {
    return { data: null, error: result.error ?? "Failed to fetch household" };
  }

  return { data: result.data.household, error: null };
}

// ---------------------------------------------------------------------------
// 4. leaveHousehold
// ---------------------------------------------------------------------------

export async function leaveHousehold(): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Find user's membership
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { data: null, error: "You are not in a household" };
  }

  // Get household to check if user is owner
  const { data: household } = await supabase
    .from("households")
    .select("id, owner_id")
    .eq("id", membership.household_id)
    .single();

  if (!household) {
    return { data: null, error: "Household not found" };
  }

  const isOwner = household.owner_id === user.id;

  if (isOwner) {
    // Owner dissolves the household:
    // 1. Clear household_id from ALL members' recipes
    await supabase
      .from("recipes")
      .update({ household_id: null })
      .eq("household_id", household.id);

    // 2. Clear household_id from meal plans
    await supabase
      .from("meal_plans")
      .update({ household_id: null })
      .eq("household_id", household.id);

    // 3. Clear household_id from grocery lists
    await supabase
      .from("grocery_lists")
      .update({ household_id: null })
      .eq("household_id", household.id);

    // 4. Clear household_id from recipe history
    await supabase
      .from("recipe_history")
      .update({ household_id: null })
      .eq("household_id", household.id);

    // 5. Delete household (CASCADE deletes household_members)
    const { error: deleteError } = await supabase
      .from("households")
      .delete()
      .eq("id", household.id);

    if (deleteError) {
      return { data: null, error: deleteError.message };
    }
  } else {
    // Member leaves:
    // 1. Clear household_id from their recipes (back to personal)
    await supabase
      .from("recipes")
      .update({ household_id: null })
      .eq("user_id", user.id)
      .eq("household_id", household.id);

    // 2. Delete their membership
    const { error: deleteError } = await supabase
      .from("household_members")
      .delete()
      .eq("household_id", household.id)
      .eq("user_id", user.id);

    if (deleteError) {
      return { data: null, error: deleteError.message };
    }
  }

  revalidatePath("/settings");
  revalidatePath("/recipes");
  revalidatePath("/plan");
  revalidatePath("/grocery");

  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 5. regenerateInviteCode
// ---------------------------------------------------------------------------

export async function regenerateInviteCode(): Promise<ActionResult<{ invite_code: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Find household where user is owner
  const { data: household } = await supabase
    .from("households")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!household) {
    return { data: null, error: "You are not the household owner" };
  }

  // Generate unique code (uses RPC to bypass RLS)
  let inviteCode = generateInviteCode();
  let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await supabase
      .rpc("lookup_household_by_invite_code", { code: inviteCode });

    if (!existing || (Array.isArray(existing) && existing.length === 0)) break;
    inviteCode = generateInviteCode();
    attempts++;
  }

  const { error: updateError } = await supabase
    .from("households")
    .update({ invite_code: inviteCode })
    .eq("id", household.id);

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  revalidatePath("/settings");

  return { data: { invite_code: inviteCode }, error: null };
}

// ---------------------------------------------------------------------------
// 6. removeMember
// ---------------------------------------------------------------------------

export async function removeMember(
  targetUserId: string
): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) {
    return { data: null, error: "Not authenticated" };
  }

  // Find household where user is owner
  const { data: household } = await supabase
    .from("households")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!household) {
    return { data: null, error: "You are not the household owner" };
  }

  if (targetUserId === user.id) {
    return { data: null, error: "Cannot remove yourself. Use leave/dissolve instead." };
  }

  // Clear household_id from the member's recipes
  await supabase
    .from("recipes")
    .update({ household_id: null })
    .eq("user_id", targetUserId)
    .eq("household_id", household.id);

  // Delete their membership
  const { error: deleteError } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", household.id)
    .eq("user_id", targetUserId);

  if (deleteError) {
    return { data: null, error: deleteError.message };
  }

  revalidatePath("/settings");

  return { data: null, error: null };
}
