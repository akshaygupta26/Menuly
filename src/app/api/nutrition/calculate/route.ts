import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { calculateNutritionWithBreakdown } from "@/lib/nutrition";

interface CalculateRequestBody {
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
  servings: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body: CalculateRequestBody = await request.json();

    if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
      return NextResponse.json(
        { error: "At least one ingredient is required." },
        { status: 400 }
      );
    }

    const servings =
      typeof body.servings === "number" && body.servings > 0
        ? body.servings
        : 1;

    const result = await calculateNutritionWithBreakdown(
      supabase,
      body.ingredients,
      servings
    );

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to calculate nutrition." },
      { status: 500 }
    );
  }
}
