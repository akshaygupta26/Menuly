import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { GroceryList, GroceryItem } from "@/types/database";

// ---------------------------------------------------------------------------
// GET /api/grocery/export
//
// Returns the active grocery list as JSON. Authenticated via Bearer token
// (the user's Supabase access token) in the Authorization header.
//
// Query params:
//   format=reminders  – simplified format for iOS Shortcuts
//                        (array of "quantity unit name" strings)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // ---- Auth ----------------------------------------------------------------
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or malformed Authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.replace("Bearer ", "");

  // Create a Supabase client that doesn't rely on cookies – we authenticate
  // purely via the provided access token.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op – API route doesn't need to set cookies
        },
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  // ---- Fetch active grocery list -------------------------------------------
  const { data: list, error: listError } = await supabase
    .from("grocery_lists")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (listError) {
    return NextResponse.json(
      { error: listError.message },
      { status: 500 }
    );
  }

  if (!list) {
    return NextResponse.json(
      { error: "No active grocery list found" },
      { status: 404 }
    );
  }

  const groceryList = list as GroceryList;

  // ---- Fetch items ---------------------------------------------------------
  const { data: items, error: itemsError } = await supabase
    .from("grocery_items")
    .select("*")
    .eq("grocery_list_id", groceryList.id)
    .order("category")
    .order("sort_order");

  if (itemsError) {
    return NextResponse.json(
      { error: itemsError.message },
      { status: 500 }
    );
  }

  const groceryItems = (items ?? []) as GroceryItem[];

  // ---- Format --------------------------------------------------------------
  const format = request.nextUrl.searchParams.get("format");

  if (format === "reminders") {
    // Simplified format optimised for iOS Shortcuts / Apple Reminders.
    // Each item is a single string like "2 lbs Chicken Breast".
    // Checked items are excluded so only outstanding items are synced.
    const reminderItems = groceryItems
      .filter((item) => !item.is_checked)
      .map((item) => {
        const parts: string[] = [];
        if (item.quantity != null) parts.push(String(item.quantity));
        if (item.unit) parts.push(item.unit);
        parts.push(item.name);
        return parts.join(" ");
      });

    return NextResponse.json({
      list_name: groceryList.name,
      items: reminderItems,
    });
  }

  // Default – full structured format
  return NextResponse.json({
    list_name: groceryList.name,
    items: groceryItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      is_checked: item.is_checked,
    })),
  });
}
