import { NextRequest, NextResponse } from "next/server";
import { CreateMatchSchema } from "@/lib/zod-schemas";
import { once } from "@/lib/idempotency";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateMatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { request_id, tournament_id, played_at } = parsed.data;
  if (!once(request_id))
    return NextResponse.json({ status: "duplicate" }, { status: 200 });

  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("matches")
    .insert({ tournament_id, played_at })
    .select()
    .single();
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ match: data });
}

export async function GET() {
  const supa = supabaseAdmin(); // pode ser anon se quiser, mas admin tb funciona
  const { data, error } = await supa
    .from("matches")
    .select("*")
    .order("played_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ rows: data });
}
