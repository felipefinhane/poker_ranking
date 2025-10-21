// app/api/matches/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anon) {
  // Fica super claro no log quando faltar algo
  console.error(
    "Faltam envs do Supabase. Verifique NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tournament_id = searchParams.get("tournament_id");
    if (!tournament_id) {
      return NextResponse.json(
        { error: "Missing tournament_id" },
        { status: 400 },
      );
    }

    const supabase = createClient(url, anon);

    const { data, error } = await supabase
      .from("matches")
      .select(
        `
        id,
        played_at,
        match_participants (
          position,
          player_id,
          players ( name )
        )
      `,
      )
      .eq("tournament_id", tournament_id)
      .order("played_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).map((m: any) => {
      const participants = m.match_participants?.length ?? 0;
      const winner = m.match_participants?.find((x: any) => x.position === 1);
      const winner_name = winner?.players?.name ?? null;

      return {
        id: m.id,
        played_at: m.played_at,
        participants,
        winner_name,
      };
    });

    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
