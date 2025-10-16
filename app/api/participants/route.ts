import { NextRequest, NextResponse } from "next/server";
import { AddParticipantsSchema } from "@/lib/zod-schemas";
import { once } from "@/lib/idempotency";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = AddParticipantsSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { request_id, match_id, participants } = parsed.data;
  if (!once(request_id))
    return NextResponse.json({ status: "duplicate" }, { status: 200 });

  const supa = supabaseAdmin();
  const rows = participants.map((p) => ({
    match_id,
    player_id: p.player_id,
    position: p.position,
  }));
  const { error } = await supa.from("match_participants").insert(rows);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
