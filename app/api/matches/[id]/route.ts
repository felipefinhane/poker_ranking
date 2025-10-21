// app/api/matches/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient(url, anon);

    // 1) Dados da partida
    const { data: match, error: mErr } = await supabase
      .from("matches")
      .select("id, tournament_id, played_at")
      .eq("id", params.id)
      .single();

    if (mErr)
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!match)
      return NextResponse.json({ error: "Match not found" }, { status: 404 });

    // 2) Participantes (ordem por posição)
    // Se seu PostgREST exigir alias, troque players(name) por player:players(name) e use p.player?.name no map
    const { data: parts, error: pErr } = await supabase
      .from("match_participants")
      .select(
        `
        player_id,
        position,
        knockouts,
        points_awarded,
        players ( name )
      `,
      )
      .eq("match_id", params.id)
      .order("position", { ascending: true });

    if (pErr)
      return NextResponse.json({ error: pErr.message }, { status: 500 });

    const participants = (parts ?? []).map((p: any) => ({
      player_id: p.player_id,
      player_name: p.players?.name ?? "—",
      position: p.position,
      knockouts: p.knockouts,
      points_awarded: p.points_awarded,
    }));

    return NextResponse.json({
      match: {
        id: match.id,
        tournament_id: match.tournament_id,
        played_at: match.played_at,
        participants,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
