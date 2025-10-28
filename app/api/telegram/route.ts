// app/api/telegram/route.ts
import { NextRequest } from "next/server";
import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

/* =========================================================================
 * ENV & CLIENTS
 * ========================================================================= */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role (server only)

if (!BOT_TOKEN || !SUPA_URL || !SUPA_SVC) {
  console.error(
    "Faltam envs: TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

const supa = createClient(SUPA_URL, SUPA_SVC, {
  auth: { persistSession: false },
});
const bot = new Telegraf(BOT_TOKEN);

// true = perguntar posições do último para o primeiro
const ORDER_DESC = true;

/* =========================================================================
 * TYPES
 * ========================================================================= */
type RankRow = {
  posicao: number;
  player_name: string;
  total_knockouts: number;
  total_points: number;
};

/* =========================================================================
 * UI HELPERS (REPLY KEYBOARD / INLINE)
 * ========================================================================= */
function mainReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "➕ Nova Partida" }],
      [{ text: "🏆 Ranking" }, { text: "🎲 Partidas" }],
      [{ text: "⚙️ Trocar Torneio" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: false,
  } as const;
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "➕ Nova Partida", callback_data: "menu_newmatch" }],
      [
        { text: "🏆 Ranking", callback_data: "menu_ranking" },
        { text: "🎲 Partidas", callback_data: "menu_partidas" },
      ],
      [{ text: "⚙️ Trocar Torneio", callback_data: "menu_set_tournament" }],
    ],
  } as const;
}

async function showMainMenu(ctx: any) {
  await ctx.reply("📋 *Menu principal*", {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
}

async function showPersistentMenu(ctx: any) {
  try {
    // Teclado fixo
    await ctx.reply("📋 Menu principal:", {
      reply_markup: mainReplyKeyboard(),
    });

    // Atalhos inline + tentativa de fixar mensagem (em grupos)
    const base =
      process.env.PUBLIC_FRONTEND_URL ||
      "https://poker-ranking-finhane.vercel.app";

    const msg = await ctx.reply(
      "Atalhos rápidos:",
      Markup.inlineKeyboard([
        [Markup.button.callback("➕ Nova Partida", "menu_newmatch")],
        [
          Markup.button.callback("🏆 Ranking", "menu_ranking"),
          Markup.button.url("🎲 Partidas", `${base}/matches`),
        ],
        [Markup.button.callback("⚙️ Trocar Torneio", "menu_set_tournament")],
      ]),
    );

    try {
      await ctx.pinChatMessage(msg.message_id);
    } catch {
      // ignorar se não puder fixar
    }
  } catch (e) {
    console.error("showPersistentMenu error", e);
  }
}

/* =========================================================================
 * GENERAL HELPERS
 * ========================================================================= */
function medal(pos: number) {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return `${pos}º`;
}
function padRight(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padLeft(s: string, n: number) {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}
function asMonospaceTable(rows: RankRow[]) {
  const nameWidth = Math.max(6, ...rows.map((r) => r.player_name.length));
  const header = `POS  ${padRight("NOME", nameWidth)}  ALMA  PTS`;
  const line = "─".repeat(header.length);
  const body = rows
    .map((r) => {
      const pos = padRight(medal(r.posicao), 3);
      const name = padRight(r.player_name, nameWidth);
      const alma = padLeft(String(r.total_knockouts), 4);
      const pts = padLeft(String(r.total_points), 3);
      return `${pos}  ${name}  ${alma}  ${pts}`;
    })
    .join("\n");
  return "```\n" + header + "\n" + line + "\n" + body + "\n```";
}

async function ensureCommands() {
  try {
    await bot.telegram.setMyCommands([
      { command: "start", description: "Ajuda / status" },
      { command: "menu", description: "Abrir menu principal" },
      { command: "set_torneio", description: "Definir torneio padrão (UUID)" },
      {
        command: "nova_partida",
        description: "Registrar nova partida (wizard)",
      },
      { command: "partidas", description: "Últimas partidas" },
      { command: "ranking", description: "Ver ranking do torneio" },
    ]);
  } catch (e) {
    console.error("setMyCommands error", e);
  }
}

function sumKos(kos: Record<string, number>): number {
  return Object.values(kos || {}).reduce((a, b) => a + Number(b || 0), 0);
}

async function currentOrderFromPositions(positions: Record<string, string>) {
  return Object.keys(positions)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((k) => positions[String(k)]);
}

function getSafeIds(ctx: any) {
  const chatId =
    ctx.chat?.id ??
    (ctx.callbackQuery && (ctx.callbackQuery as any).message?.chat?.id);
  const userId = ctx.from?.id;
  if (!chatId || !userId) {
    throw new Error("Não foi possível identificar chatId/userId do contexto.");
  }
  return { chatId, userId };
}

/* =========================================================================
 * PERMISSIONS HELPERS
 * ========================================================================= */
async function isGroupAdmin(ctx: any): Promise<boolean> {
  const chat = ctx.chat;
  if (!chat || chat.type === "private") return false;
  try {
    const member = await ctx.telegram.getChatMember(chat.id, ctx.from.id);
    const s = member.status;
    return s === "creator" || s === "administrator";
  } catch {
    return false;
  }
}
async function isDMWhitelisted(ctx: any): Promise<boolean> {
  if (!ctx.from?.id) return false;
  const { data } = await supa
    .from("telegram_admins")
    .select("user_id")
    .eq("user_id", ctx.from.id)
    .maybeSingle();
  return !!data;
}
async function isTournamentAdmin(
  tournament_id: string,
  userId: number,
): Promise<boolean> {
  const { data } = await supa
    .from("tournament_admins")
    .select("user_id")
    .eq("tournament_id", tournament_id)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}
async function canCreateMatch(
  ctx: any,
  tournament_id?: string,
): Promise<boolean> {
  // grupo: admin do grupo
  if (ctx.chat?.type && ctx.chat.type !== "private") {
    return await isGroupAdmin(ctx);
  }
  // privado: precisa estar whitelisted (e opcionalmente admin do torneio)
  const dmOk = await isDMWhitelisted(ctx);
  if (!dmOk) return false;
  if (tournament_id) {
    const tidOk = await isTournamentAdmin(tournament_id, ctx.from.id);
    return tidOk || dmOk;
  }
  return dmOk;
}

/* =========================================================================
 * DB HELPERS
 * ========================================================================= */
async function getOrCreateChat(chat_id: number) {
  const { data } = await supa
    .from("telegram_chats")
    .select("*")
    .eq("chat_id", chat_id)
    .maybeSingle();
  if (data) return data;

  // default: seta primeiro torneio, se existir
  const { data: t } = await supa.from("tournaments").select("id").limit(1);
  const tid = t?.[0]?.id ?? null;
  const { data: ins } = await supa
    .from("telegram_chats")
    .insert({ chat_id, tournament_id: tid })
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

/* =========================================================================
 * WIZARD HELPERS (FLOW)
 * ========================================================================= */
async function renderSelectKeyboard(ctx: any, selectedIds: string[]) {
  const { data: players } = await supa
    .from("players")
    .select("id,name")
    .order("name", { ascending: true });

  const rows = (players ?? []).map((p) => {
    const checked = selectedIds.includes(p.id);
    const label = `${checked ? "✅" : "⬜"} ${p.name}`;
    return [Markup.button.callback(label, `toggle_${p.id}`)];
  });

  rows.push([Markup.button.callback("✅ Concluir seleção", "done_select")]);
  await ctx.editMessageReplyMarkup({ inline_keyboard: rows });
}

async function askNextPosition(
  ctx: any,
  _tournament_id: string,
  selected: string[],
  positions: Record<string, string>,
  currentPos: number,
) {
  const already = new Set(Object.values(positions));
  const remaining = selected.filter((id) => !already.has(id));
  if (!remaining.length) return;

  const { data: players } = await supa
    .from("players")
    .select("id,name")
    .in("id", remaining)
    .order("name");

  const rows = (players ?? []).map((p) => [
    Markup.button.callback(`${p.name}`, `pickpos_${currentPos}_${p.id}`),
  ]);

  await ctx.reply(`Quem ficou em *${currentPos}º*?`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

async function askKnockoutsSmart(ctx: any) {
  const chat_id = ctx.chat.id;
  const user_id = ctx.from.id;

  const { data: sess } = await supa
    .from("telegram_sessions")
    .select("*")
    .eq("chat_id", chat_id)
    .eq("user_id", user_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sess) return;

  const selected: string[] = sess.selected_ids ?? [];
  const positions: Record<string, string> = sess.positions_json ?? {};
  const kos: Record<string, number> = sess.kos_json ?? {};

  const N = selected.length;
  const used = sumKos(kos);
  const pool = Math.max(0, N - 1 - used);

  const order = await currentOrderFromPositions(positions);
  const { data: players } = await supa
    .from("players")
    .select("id,name")
    .in("id", order);

  const nameOf = (id: string) => players?.find((p) => p.id === id)?.name ?? "—";

  const rows: any[] = order.map((pid) => {
    const k = Number(kos[pid] ?? 0);
    return [
      Markup.button.callback("−", `ko_${pid}_minus`),
      Markup.button.callback(`${nameOf(pid)}: ${k}`, "noop"),
      Markup.button.callback(pool > 0 ? "+" : " ", `ko_${pid}_plus`),
    ];
  });

  rows.push([
    Markup.button.callback(`✅ Concluir (restam ${pool})`, "done_kos"),
  ]);

  await ctx.reply(
    `Ajuste as *almas* (KOs). Saldo total disponível: *${N - 1 - used}*`,
    { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) },
  );
}

async function confirmSummary(ctx: any) {
  const chat_id = ctx.chat.id;
  const user_id = ctx.from.id;

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

/* =========================================================================
 * COMMANDS
 * ========================================================================= */
bot.start(async (ctx) => {
  // Teclado fixo + atalhos (e tenta fixar)
  await showPersistentMenu(ctx);
});

bot.command("menu", async (ctx) => {
  await showMainMenu(ctx);
});

bot.command("set_torneio", async (ctx) => {
  const parts = (ctx.message as any).text.split(/\s+/);
  const tid = parts[1];
  if (!tid) return ctx.reply("Uso: /set_torneio <UUID-do-torneio>");

  await supa
    .from("telegram_chats")
    .upsert({
      chat_id: ctx.chat.id,
      tournament_id: tid,
      updated_at: new Date().toISOString(),
    });
  await ctx.reply(`✅ Torneio definido: ${tid}`, {
    reply_markup: mainReplyKeyboard(),
  });
});

bot.command("ranking", async (ctx) => {
  try {
    const { data: chat, error: chatErr } = await supa
      .from("telegram_chats")
      .select("tournament_id")
      .eq("chat_id", ctx.chat.id)
      .maybeSingle();

    if (chatErr) {
      console.error(chatErr);
      return ctx.reply("❌ Erro ao determinar o torneio do chat.");
    }

    const tid = chat?.tournament_id as string | undefined;
    if (!tid) {
      return ctx.reply(
        "⚠️ Antes de visualizar o ranking, defina o torneio com:\n\n`/set_torneio <UUID>`",
        { parse_mode: "Markdown" },
      );
    }

    const { data, error } = await supa.rpc("get_ranking", {
      p_tournament_id: tid,
      p_limit: 15,
    });
    if (error) {
      console.error(error);
      return ctx.reply("❌ Erro ao carregar o ranking do torneio.");
    }

    const rows: RankRow[] = (data ?? []) as RankRow[];
    if (!rows.length) return ctx.reply("🏁 Nenhuma partida registrada ainda.");

    const table = asMonospaceTable(rows);
    const base =
      process.env.PUBLIC_FRONTEND_URL ||
      "https://poker-ranking-finhane.vercel.app";

    await ctx.replyWithMarkdown(table, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌐 Ver Ranking Completo", url: `${base}/` }],
        ],
      },
    });

    const top3 = rows
      .slice(0, 3)
      .map(
        (r) => `${medal(r.posicao)} ${r.player_name} — ${r.total_points} pts`,
      )
      .join("\n");

    await ctx.reply(`🏆 *Top 3*\n${top3}`, { parse_mode: "Markdown" });
  } catch (e) {
    console.error(e);
    await ctx.reply("⚠️ Falha ao obter ranking, tente novamente.");
  }
});

bot.command("partidas", (ctx) => {
  const base =
    process.env.PUBLIC_FRONTEND_URL ||
    "https://poker-ranking-finhane.vercel.app";
  ctx.reply(`🎲 Partidas: ${base}/matches`, {
    reply_markup: mainReplyKeyboard(),
  });
});

bot.command("nova_partida", async (ctx) => {
  const { data: chat } = await supa
    .from("telegram_chats")
    .select("tournament_id")
    .eq("chat_id", ctx.chat.id)
    .maybeSingle();

  const tid = chat?.tournament_id as string | undefined;
  if (!tid) return ctx.reply("Defina o torneio com /set_torneio <UUID>.");
  if (!(await canCreateMatch(ctx, tid))) {
    return ctx.reply(
      "🚫 Você não tem permissão para criar partidas neste chat.",
    );
  }

  const { data: players, error } = await supa
    .from("players")
    .select("id,name")
    .order("name", { ascending: true });
  if (error) return ctx.reply("Erro ao carregar jogadores.");
  if (!players?.length) return ctx.reply("Nenhum jogador cadastrado.");

  await setSession(ctx.chat.id, ctx.from.id, {
    state: "selecting_players",
    tournament_id: tid,
    selected_ids: [],
    positions_json: {},
    kos_json: {},
    played_at: new Date().toISOString(),
  });

  const rows = players.map((p) => [
    Markup.button.callback(`⬜ ${p.name}`, `toggle_${p.id}`),
  ]);
  rows.push([Markup.button.callback("✅ Concluir seleção", "done_select")]);

  await ctx.reply(
    "Selecione os participantes (toque para alternar). Depois clique em ✅ Concluir seleção.",
    Markup.inlineKeyboard(rows),
  );
});

/* =========================================================================
 * HEARS (REPLY KEYBOARD BUTTONS)
 * ========================================================================= */
async function openNewMatchWizard(ctx: any) {
  const { data: chat } = await supa
    .from("telegram_chats")
    .select("tournament_id")
    .eq("chat_id", ctx.chat.id)
    .maybeSingle();

  const tid = chat?.tournament_id as string | undefined;
  if (!tid) return ctx.reply("Defina o torneio com /set_torneio <UUID> antes.");
  if (!(await canCreateMatch(ctx, tid))) {
    return ctx.reply(
      "🚫 Você não tem permissão para criar partidas neste chat.",
    );
  }

  const { data: players, error } = await supa
    .from("players")
    .select("id,name")
    .order("name", { ascending: true });
  if (error) return ctx.reply("Erro ao carregar jogadores.");
  if (!players?.length) return ctx.reply("Nenhum jogador cadastrado.");

  await setSession(ctx.chat.id, ctx.from.id, {
    state: "selecting_players",
    tournament_id: tid,
    selected_ids: [],
    positions_json: {},
    kos_json: {},
    played_at: new Date().toISOString(),
  });

  await ctx.reply(
    "Selecione os participantes (toque para alternar). Depois clique em ✅ Concluir seleção.",
    { reply_markup: { inline_keyboard: [] } },
  );
  await renderSelectKeyboard(ctx, []);
}

bot.hears("➕ Nova Partida", async (ctx) => {
  try {
    await openNewMatchWizard(ctx);
  } catch (e) {
    console.error("hears newmatch", e);
    await ctx.reply("Falha ao iniciar o registro de partida.");
  }
});

bot.hears("🏆 Ranking", async (ctx) => {
  try {
    await sendRankingMessage(ctx);
  } catch (e) {
    console.error("hears ranking", e);
    await ctx.reply("Falha ao carregar ranking.");
  }
});

bot.hears("🎲 Partidas", async (ctx) => {
  const base =
    process.env.PUBLIC_FRONTEND_URL ||
    "https://poker-ranking-finhane.vercel.app";
  await ctx.reply("🎲 Últimas partidas:", {
    reply_markup: {
      inline_keyboard: [[{ text: "📄 Abrir página", url: `${base}/matches` }]],
    },
  });
});

bot.hears("⚙️ Trocar Torneio", async (ctx) => {
  await ctx.reply("Envie: `/set_torneio <UUID>`", { parse_mode: "Markdown" });
});

/* =========================================================================
 * CALLBACKS (INLINE KEYBOARD)
 * ========================================================================= */
bot.on("callback_query", async (ctx) => {
  const data = (ctx.callbackQuery as any).data as string;
  const chat_id = ctx.chat!.id;
  const user_id = ctx.from!.id;

  // atalhos do /menu
  if (data === "menu_newmatch") {
    const { chatId, userId } = getSafeIds(ctx);
    const chat = await getOrCreateChat(chatId);

    if (!chat.tournament_id) {
      await ctx.answerCbQuery();
      return ctx.reply("Defina o torneio com /set_torneio <UUID> antes.");
    }
    const { data: players, error } = await supa
      .from("players")
      .select("id,name")
      .order("name", { ascending: true });
    if (error) {
      await ctx.answerCbQuery();
      return ctx.reply("Erro ao carregar jogadores.");
    }
    if (!players?.length) {
      await ctx.answerCbQuery();
      return ctx.reply("Nenhum jogador cadastrado.");
    }

    await setSession(chatId, userId, {
      state: "selecting_players",
      tournament_id: chat.tournament_id,
      selected_ids: [],
      positions_json: {},
      kos_json: {},
      played_at: new Date().toISOString(),
    });

    await ctx.answerCbQuery();
    await ctx.reply(
      "Selecione os participantes (toque para alternar). Depois clique em ✅ Concluir seleção.",
      { reply_markup: { inline_keyboard: [] } },
    );
    await renderSelectKeyboard(ctx, []);
    return;
  }

  if (data === "menu_ranking") {
    await ctx.answerCbQuery();
    await sendRankingMessage(ctx);
    return;
  }

  if (data === "menu_partidas") {
    await ctx.answerCbQuery();
    const base =
      process.env.PUBLIC_FRONTEND_URL ||
      "https://poker-ranking-finhane.vercel.app";
    await ctx.reply("🎲 Últimas partidas:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📄 Abrir página", url: `${base}/matches` }],
        ],
      },
    });
    return;
  }

  if (data === "menu_set_tournament") {
    await ctx.answerCbQuery();
    await ctx.reply(
      "⚙️ Para trocar o torneio padrão deste chat, envie:\n\n`/set_torneio <UUID>`",
      { parse_mode: "Markdown" },
    );
    return;
  }

  // fluxo do wizard
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

  // seleção de participantes
  if (sess.state === "selecting_players") {
    if (data === "done_select") {
      const selected: string[] = sess.selected_ids ?? [];
      if (!selected.length) {
        await ctx.answerCbQuery("Selecione ao menos 2 participantes");
        return;
      }
      await setSession(chat_id, user_id, { state: "ordering_positions" });
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

      const startPos = ORDER_DESC ? selected.length : 1;
      await askNextPosition(ctx, sess.tournament_id, selected, {}, startPos);
      return;
    }

    if (data.startsWith("toggle_")) {
      const pid = data.replace("toggle_", "");
      let selected: string[] = Array.isArray(sess.selected_ids)
        ? [...sess.selected_ids]
        : [];
      if (selected.includes(pid)) selected = selected.filter((x) => x !== pid);
      else selected.push(pid);

      await setSession(chat_id, user_id, { selected_ids: selected });
      await ctx.answerCbQuery(`Selecionados: ${selected.length}`);
      await renderSelectKeyboard(ctx, selected);
      return;
    }
  }

  // ordenação de posições
  if (sess.state === "ordering_positions") {
    if (data.startsWith("pickpos_")) {
      const [_, posStr, pickedId] = data.split("_");
      const pos = parseInt(posStr, 10);
      const positions = { ...(sess.positions_json || {}) };
      positions[pos] = pickedId;

      const selected: string[] = sess.selected_ids ?? [];
      await setSession(chat_id, user_id, { positions_json: positions });

      const nextPos = ORDER_DESC ? pos - 1 : pos + 1;
      const finished = ORDER_DESC ? nextPos < 1 : nextPos > selected.length;

      if (finished) {
        const kos: Record<string, number> = {};
        selected.forEach((id) => (kos[id] = 0));
        await setSession(chat_id, user_id, {
          state: "setting_knockouts",
          kos_json: kos,
        });
        await askKnockoutsSmart(ctx);
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

  // ajuste de almas (KOs)
  if (sess.state === "setting_knockouts") {
    if (data.startsWith("ko_")) {
      const [_, pid, op] = data.split("_"); // ko_<playerId>_plus|minus
      const kos = { ...(sess.kos_json || {}) };
      const selected: string[] = sess.selected_ids ?? [];
      const N = selected.length;
      const used = sumKos(kos);
      const remaining = Math.max(0, N - 1 - used);

      const current = Number(kos[pid] ?? 0);
      let next = current;

      if (op === "plus") {
        if (remaining > 0) next = current + 1;
        else await ctx.answerCbQuery("Sem saldo de almas restante");
      } else if (op === "minus") {
        if (current > 0) next = current - 1;
        else await ctx.answerCbQuery("Não pode ficar negativo");
      }

      kos[pid] = next;
      await setSession(chat_id, user_id, { kos_json: kos });
      await askKnockoutsSmart(ctx);
      return;
    }

    if (data === "done_kos") {
      await setSession(chat_id, user_id, { state: "confirming" });
      await confirmSummary(ctx);
      return;
    }
  }

  // confirmação final
  if (sess.state === "confirming") {
    if (data === "confirm_save") {
      const request_id = randomUUID();

      const selected: string[] = sess.selected_ids ?? [];
      const positions: Record<string, string> = sess.positions_json ?? {};
      const kos: Record<string, number> = sess.kos_json ?? {};
      const played_at: string = sess.played_at;

      const rows = Object.keys(positions)
        .map((k) => ({
          position: Number(k),
          player_id: positions[k],
          knockouts: Number(kos[positions[k]] ?? 0),
        }))
        .sort((a, b) => a.position - b.position);

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
      await showPersistentMenu(ctx); // reexibe menu
      return;
    }

    if (data === "cancel_save") {
      await clearSession(chat_id, user_id);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply("Operação cancelada.");
      await showPersistentMenu(ctx); // reexibe menu
      return;
    }
  }

  await ctx.answerCbQuery(); // fallback
});

/* =========================================================================
 * RANKING MESSAGE (reuso por hears/callback)
 * ========================================================================= */
async function sendRankingMessage(ctx: any) {
  const { data: chat } = await supa
    .from("telegram_chats")
    .select("tournament_id")
    .eq("chat_id", ctx.chat.id)
    .maybeSingle();

  const tid = chat?.tournament_id as string | undefined;
  if (!tid) {
    return ctx.reply("⚠️ Defina o torneio com:\n`/set_torneio <UUID>`", {
      parse_mode: "Markdown",
    });
  }

  const { data, error } = await supa.rpc("get_ranking", {
    p_tournament_id: tid,
    p_limit: 15,
  });
  if (error) {
    console.error(error);
    return ctx.reply("❌ Erro ao carregar o ranking.");
  }

  const rows: RankRow[] = (data ?? []) as RankRow[];
  if (!rows.length) return ctx.reply("🏁 Sem partidas ainda.");

  const table = asMonospaceTable(rows);
  const base =
    process.env.PUBLIC_FRONTEND_URL ||
    "https://poker-ranking-finhane.vercel.app";

  await ctx.replyWithMarkdown(table, {
    reply_markup: {
      inline_keyboard: [[{ text: "🌐 Ver Ranking Completo", url: `${base}/` }]],
    },
  });

  const top3 = rows
    .slice(0, 3)
    .map((r) => `${medal(r.posicao)} ${r.player_name} — ${r.total_points} pts`)
    .join("\n");

  await ctx.reply(`🏆 *Top 3*\n${top3}`, { parse_mode: "Markdown" });
}

/* =========================================================================
 * QUALITY OF LIFE: reexibir teclado em textos genéricos
 * ========================================================================= */
bot.on("text", async (ctx, next) => {
  const text = (ctx.message as any).text ?? "";
  const known = [
    "➕ Nova Partida",
    "🏆 Ranking",
    "🎲 Partidas",
    "⚙️ Trocar Torneio",
  ];

  // Se texto não for botão nem comando, sugere usar menu
  if (!known.includes(text) && !text.startsWith("/")) {
    await ctx.reply("Use o menu abaixo para navegar 👇", {
      reply_markup: mainReplyKeyboard(),
    });
  }
  return next();
});

/* =========================================================================
 * NEXT.JS HANDLERS (WEBHOOK)
 * ========================================================================= */
export async function POST(req: NextRequest) {
  try {
    await ensureCommands();
    const body = await req.json();
    await bot.handleUpdate(body);
    return new Response("ok");
  } catch (e: any) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
}

export async function GET() {
  await ensureCommands();
  return new Response("Telegram webhook ok");
}
