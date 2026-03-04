import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HouseholdContext {
  userId: string;
  householdId: string | null;
}

// ---------------------------------------------------------------------------
// getHouseholdContext
// ---------------------------------------------------------------------------

/**
 * Look up the user's household membership. Returns `householdId: null` when the
 * user is solo (not in any household).
 *
 * Wrapped with `React.cache()` so multiple calls within the same server render
 * only execute a single DB query.
 */
export const getHouseholdContext = cache(
  async (
    supabase: SupabaseClient,
    userId: string
  ): Promise<HouseholdContext> => {
    const { data } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      userId,
      householdId: data?.household_id ?? null,
    };
  }
);

// ---------------------------------------------------------------------------
// applyOwnershipFilter
// ---------------------------------------------------------------------------

/**
 * Applies the correct ownership filter to a Supabase query builder.
 *
 * - Solo mode (`householdId === null`): `.eq("user_id", userId)`
 * - Household mode: `.eq("household_id", householdId)`
 *
 * Supabase's deeply-nested query builder types cause TS2589 "excessively deep"
 * errors with bounded generics, so this uses a minimal type constraint.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOwnershipFilter(query: any, ctx: HouseholdContext): any {
  if (ctx.householdId) {
    return query.eq("household_id", ctx.householdId);
  }
  return query.eq("user_id", ctx.userId);
}
