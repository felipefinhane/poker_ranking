import { NextRequest, NextResponse } from "next/server";
import { GetRankingSchema } from "@/lib/zod-schemas";
import { supabaseClient } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournament_id = searchParams.get("tournament_id");
  const parsed = GetRankingSchema.safeParse({ tournament_id });
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supa = supabaseClient();
  const { data, error } = await supa
    .from("ranking")
    .select("*")
    .eq("tournament_id", tournament_id)
    .order("total_points", { ascending: false });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ rows: data });
}
