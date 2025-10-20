// app/api/ranking/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tournament_id = url.searchParams.get("tournament_id");
  if (!tournament_id) {
    return NextResponse.json(
      { error: "tournament_id is required" },
      { status: 400 },
    );
  }

  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("ranking_positions")
    .select("position, player_name, total_knockouts, total_points")
    .eq("tournament_id", tournament_id)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
