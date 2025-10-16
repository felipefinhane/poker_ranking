import { NextRequest, NextResponse } from "next/server";
import { PatchMatchPositionsSchema } from "@/lib/zod-schemas";
import { once } from "@/lib/idempotency";
import { supabaseClient } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string } },
) {
  const supa = supabaseClient();
  const { data, error } = await supa
    .from("match_participants")
    .select("*")
    .eq("match_id", params.id);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ rows: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json();
  const parsed = PatchMatchPositionsSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { request_id, participants } = parsed.data;
  if (!once(request_id))
    return NextResponse.json({ status: "duplicate" }, { status: 200 });

  const supa = supabaseAdmin();
  // Atualiza posições (trigger recalc points)
  for (const p of participants) {
    const patch: any = {};
    if (typeof p.position === "number") patch.position = p.position;
    if (typeof p.knockouts === "number") patch.knockouts = p.knockouts; // 👈 novo

    if (Object.keys(patch).length === 0) continue;

    const { error } = await supa
      .from("match_participants")
      .update(patch)
      .eq("match_id", params.id)
      .eq("player_id", p.player_id);
    if (error) return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
