// app/api/telegram/route.ts
import { NextRequest } from "next/server";
import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!; // <- service role, backend only

if (!BOT_TOKEN || !SUPA_URL || !SUPA_SVC) {
  console.error(
    "Faltam envs: TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

const supa = createClient(SUPA_URL, SUPA_SVC, {
  auth: { persistSession: false },
});
const bot = new Telegraf(BOT_TOKEN);

/** Helpers */
async function getOrCreateChat(chat_id: number) {
  const { data } = await supa
    .from("telegram_chats")
    .select("*")
    .eq("chat_id", chat_id)
    .maybeSingle();
  if (data) return data;
  // default: pega 1º torneio como padrão se existir
  const { data: t } = await supa.from("tournaments").select("id").limit(1);
  const tid = t?.[0]?.id ?? null;
  const { data: ins } = await supa
    .from("telegram_chats")
    .insert({
      chat_id,
      tournament_id: tid,
    })
    .select()
    .single();
  return ins!;
}

async function setSession(chat_id: number, user_id: number, patch: any) {
  const { data: row } = await supa
    .from("telegram_sessions")
    .select("*")
    .eq("chat_id", chat_id)
    .eq("user_id", user_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    chat_id,
    user_id,
    updated_at: new Date().toISOString(),
    ...patch,
  };

  if (!row) {
    const { data: created } = await supa
      .from("telegram_sessions")
      .insert(payload)
      .select()
      .single();
    return created!;
  } else {
    const { data: upd } = await supa
      .from("telegram_sessions")
      .update(payload)
      .eq("session_id", row.session_id)
      .select()
      .single();
    return upd!;
  }
}

async function clearSession(chat_id: number, user_id: number) {
  await supa
    .from("telegram_sessions")
    .delete()
    .eq("chat_id", chat_id)
    .eq("user_id", user_id);
}

/** Comandos */
bot.start(async (ctx) => {
  const chat = await getOrCreateChat(ctx.chat.id);
  await ctx.reply(
    `👋 Olá! Pronto para registrar partidas.\nTorneio atual: ${chat.tournament_id ?? "—"}\n\nComandos:\n/nova_partida – iniciar wizard\n/set_torneio <UUID>\n/ranking – link do ranking\n/partidas – link das partidas`,
  );
});

bot.command("set_torneio", async (ctx) => {
  const parts = (ctx.message as any).text.split(/\s+/);
  const tid = parts[1];
  if (!tid) return ctx.reply("Uso: /set_torneio <UUID-do-torneio>");
  await supa.from("telegram_chats").upsert({
    chat_id: ctx.chat.id,
    tournament_id: tid,
    updated_at: new Date().toISOString(),
  });
  ctx.reply(`✅ Torneio definido: ${tid}`);
});

bot.command("ranking", (ctx) => {
  const base =
    process.env.PUBLIC_FRONTEND_URL ||
    "https://poker-ranking-finhane.vercel.app";
  ctx.reply(`🏆 Ranking: ${base}/`);
});
bot.command("partidas", (ctx) => {
  const base =
    process.env.PUBLIC_FRONTEND_URL ||
    "https://poker-ranking-finhane.vercel.app";
  ctx.reply(`🎲 Partidas: ${base}/matches`);
});

bot.command("nova_partida", async (ctx) => {
  const chat = await getOrCreateChat(ctx.chat.id);
  if (!chat.tournament_id) {
    return ctx.reply("Defina o torneio com /set_torneio <UUID> antes.");
  }

  // Carrega jogadores (alfabético)
  const { data: players, error } = await supa
    .from("players")
    .select("id,name")
    .order("name", { ascending: true });

  if (error) return ctx.reply("Erro ao carregar jogadores.");
  if (!players?.length) return ctx.reply("Nenhum jogador cadastrado.");

  // inicia sessão
  await setSession(ctx.chat.id, ctx.from.id, {
    state: "selecting_players",
    tournament_id: chat.tournament_id,
    selected_ids: [],
    positions_json: {},
    kos_json: {},
    played_at: new Date().toISOString(),
  });

  // teclado com todos os jogadores (toggle)
  const rows = players.map((p) => [
    Markup.button.callback(`⬜ ${p.name}`, `toggle_${p.id}`),
  ]);
  rows.push([Markup.button.callback("✅ Concluir seleção", "done_select")]);
  await ctx.reply(
    "Selecione os participantes (toque para alternar). Depois clique em ✅ Concluir seleção.",
    Markup.inlineKeyboard(rows),
  );
});

bot.on("callback_query", async (ctx) => {
  const data = (ctx.callbackQuery as any).data as string;
  const chat_id = ctx.chat!.id;
  const user_id = ctx.from!.id;

  // carrega sessão
  const { data: sess } = await supa
    .from("telegram_sessions")
    .select("*")
    .eq("chat_id", chat_id)
    .eq("user_id", user_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sess) {
    await ctx.answerCbQuery();
    return ctx.reply("Sessão não encontrada. Use /nova_partida para iniciar.");
  }

  // Seleção de participantes
  if (sess.state === "selecting_players") {
    if (data === "done_select") {
      const selected: string[] = sess.selected_ids ?? [];
      if (!selected.length) {
        await ctx.answerCbQuery("Selecione ao menos 2 participantes");
        return;
      }
      // Próximo estado: ordenar colocações
      await setSession(chat_id, user_id, { state: "ordering_positions" });
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await askNextPosition(ctx, sess.tournament_id, selected, {}, 1);
      return;
    }

    if (data.startsWith("toggle_")) {
      const pid = data.replace("toggle_", "");
      let selected: string[] = Array.isArray(sess.selected_ids)
        ? [...sess.selected_ids]
        : [];
      if (selected.includes(pid)) {
        selected = selected.filter((x) => x !== pid);
      } else {
        selected.push(pid);
      }
      await setSession(chat_id, user_id, { selected_ids: selected });
      await ctx.answerCbQuery(`Selecionados: ${selected.length}`);
      return;
    }
  }

  // Ordenação de posições
  if (sess.state === "ordering_positions") {
    if (data.startsWith("pickpos_")) {
      const [_, posStr, pickedId] = data.split("_");
      const pos = parseInt(posStr, 10);
      const positions = { ...(sess.positions_json || {}) };
      positions[pos] = pickedId;

      // próxima posição
      const selected: string[] = sess.selected_ids ?? [];
      const nextPos = pos + 1;

      await setSession(chat_id, user_id, { positions_json: positions });

      if (nextPos > selected.length) {
        // terminou ordenação → inicia KOs default 0 e vai para confirmar
        const kos: Record<string, number> = {};
        selected.forEach((id) => (kos[id] = 0));
        await setSession(chat_id, user_id, {
          state: "setting_knockouts",
          kos_json: kos,
        });
        await askKnockouts(ctx, positions, kos);
      } else {
        await askNextPosition(
          ctx,
          sess.tournament_id,
          selected,
          positions,
          nextPos,
        );
      }
      return;
    }
  }

  // Ajuste de “almas”
  if (sess.state === "setting_knockouts") {
    if (data.startsWith("ko_")) {
      const [_, pid, op] = data.split("_"); // ko_<playerId>_plus|minus
      const kos = { ...(sess.kos_json || {}) };
      const current = Number(kos[pid] ?? 0);
      kos[pid] = Math.max(0, current + (op === "plus" ? 1 : -1));
      await setSession(chat_id, user_id, { kos_json: kos });
      await ctx.answerCbQuery(`Almas: ${kos[pid]}`);
      return;
    }
    if (data === "done_kos") {
      await setSession(chat_id, user_id, { state: "confirming" });
      await confirmSummary(ctx);
      return;
    }
  }

  // Confirmação final
  if (sess.state === "confirming") {
    if (data === "confirm_save") {
      const request_id = cryptoRandomUUID();
      // monta payload
      const selected: string[] = sess.selected_ids ?? [];
      const positions: Record<string, string> = sess.positions_json ?? {};
      const kos: Record<string, number> = sess.kos_json ?? {};
      const played_at: string = sess.played_at;

      // array ordenado por posição
      const rows = Object.keys(positions)
        .map((k) => ({
          position: Number(k),
          player_id: positions[k],
          knockouts: Number(kos[positions[k]] ?? 0),
        }))
        .sort((a, b) => a.position - b.position);

      // salva via RPC
      const { data: chat } = await supa
        .from("telegram_chats")
        .select("*")
        .eq("chat_id", chat_id)
        .single();
      const { data, error } = await supa.rpc("create_match_with_participants", {
        p_tournament_id: chat!.tournament_id,
        p_played_at: played_at,
        p_request_id: request_id,
        p_rows: rows as any,
      });

      if (error) {
        await ctx.answerCbQuery();
        return ctx.reply(`❌ Erro ao salvar: ${error.message}`);
      }

      const matchId = data as string;
      const base =
        process.env.PUBLIC_FRONTEND_URL ||
        "https://poker-ranking-finhane.vercel.app";
      await clearSession(chat_id, user_id);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply(`✅ Partida registrada!\n🔗 ${base}/matches/${matchId}`);
      return;
    }
    if (data === "cancel_save") {
      await clearSession(chat_id, user_id);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply("Operação cancelada.");
      return;
    }
  }

  await ctx.answerCbQuery(); // fallback
});

/** Helpers de UI do wizard */
async function askNextPosition(
  ctx: any,
  tournament_id: string,
  selected: string[],
  positions: Record<string, string>,
  pos: number,
) {
  // lista de ainda não escolhidos
  const remaining = selected.filter(
    (id) => !Object.values(positions).includes(id),
  );
  if (!remaining.length) return;

  // carrega nomes
  const { data: players } = await supa
    .from("players")
    .select("id,name")
    .in("id", remaining);
  const rows = (players ?? []).map((p) => [
    Markup.button.callback(`${p.name}`, `pickpos_${pos}_${p.id}`),
  ]);
  await ctx.reply(`Quem ficou em **${pos}º**?`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

async function askKnockouts(
  ctx: any,
  positions: Record<string, string>,
  kos: Record<string, number>,
) {
  const playerIds = Object.values(positions);
  const { data: players } = await supa
    .from("players")
    .select("id,name")
    .in("id", playerIds)
    .order("name");
  const rows = (players ?? []).map((p) => [
    Markup.button.callback(`−`, `ko_${p.id}_minus`),
    Markup.button.callback(`${p.name}: ${kos[p.id] ?? 0}`, `noop`),
    Markup.button.callback(`+`, `ko_${p.id}_plus`),
  ]);
  rows.push([Markup.button.callback("✅ Concluir", "done_kos")]);
  await ctx.reply("Ajuste as *almas* (KOs):", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

async function confirmSummary(ctx: any) {
  const chat_id = ctx.chat.id,
    user_id = ctx.from.id;
  const { data: sess } = await supa
    .from("telegram_sessions")
    .select("*")
    .eq("chat_id", chat_id)
    .eq("user_id", user_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sess) return;

  const positions: Record<string, string> = sess.positions_json ?? {};
  const kos: Record<string, number> = sess.kos_json ?? {};
  const order = Object.keys(positions)
    .map(Number)
    .sort((a, b) => a - b);

  // carrega nomes
  const pids = order.map((pos) => positions[String(pos)]);
  const { data: players } = await supa
    .from("players")
    .select("id,name")
    .in("id", pids);
  const nameOf = (id: string) => players?.find((p) => p.id === id)?.name ?? "—";

  const lines = order
    .map((pos) => {
      const id = positions[String(pos)];
      return `${pos}º  ${nameOf(id)}  (almas: ${kos[id] ?? 0})`;
    })
    .join("\n");

  await ctx.reply(
    `Confira a partida:\nData: ${new Date(sess.played_at).toLocaleDateString("pt-BR")}\n\n${lines}\n\nSalvar?`,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Confirmar", "confirm_save")],
      [Markup.button.callback("❌ Cancelar", "cancel_save")],
    ]),
  );
}

/** Webhook handler (Next.js) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await bot.handleUpdate(body);
    return new Response("ok");
  } catch (e: any) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
}

// Opcional: sanity check
export async function GET() {
  return new Response("Telegram webhook ok");
}
