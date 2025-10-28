// app/api/telegram/route.ts
import { NextRequest } from "next/server";
import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

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
const ORDER_DESC = true; // true = pedir do último -> primeiro

type RankRow = {
  posicao: number;
  player_name: string;
  total_knockouts: number;
  total_points: number;
};

// HELPERS ======
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
function medal(pos: number) {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return `${pos}º`;
}

function padRight(s: string, n: number) {
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number) {
  if (s.length >= n) return s;
  return " ".repeat(n - s.length) + s;
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
      { command: "menu", description: "Abrir menu principal" }, // <<<<<
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
  const order = Object.keys(positions)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((k) => positions[String(k)]);
  return order; // array de player_ids ordenado pela colocação (1..n)
}

async function askKnockoutsSmart(ctx: any) {
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

  const selected: string[] = sess.selected_ids ?? [];
  const positions: Record<string, string> = sess.positions_json ?? {};
  const kos: Record<string, number> = sess.kos_json ?? {};

  const N = selected.length;
  const POOL = Math.max(0, N - 1 - sumKos(kos)); // saldo remanescente

  // monta teclas: uma linha por jogador, com - [nome: K] +
  const order = await currentOrderFromPositions(positions);
  const { data: players } = await supa
    .from("players")
    .select("id,name")
    .in("id", order);
  const nameOf = (id: string) => players?.find((p) => p.id === id)?.name ?? "—";

  const rows: any[] = order.map((pid) => {
    const k = Number(kos[pid] ?? 0);
    // desabilitar + quando POOL=0; desabilitar - quando k=0
    return [
      Markup.button.callback("−", `ko_${pid}_minus`),
      Markup.button.callback(`${nameOf(pid)}: ${k}`, "noop"),
      Markup.button.callback(POOL > 0 ? "+" : " ", `ko_${pid}_plus`),
    ];
  });

  // mostrar o saldo remanescente e botões finais
  rows.push([
    Markup.button.callback(`✅ Concluir (restam ${POOL})`, "done_kos"),
  ]);

  await ctx.reply(
    `Ajuste as *almas* (KOs). Saldo total disponível: *${N - 1 - sumKos(kos)}*`,
    { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) },
  );
}

async function renderSelectKeyboard(ctx: any, selectedIds: string[]) {
  // Recarrega a lista completa de jogadores (ordenada)
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

  // Atualiza SOMENTE o teclado da mesma mensagem
  await ctx.editMessageReplyMarkup({ inline_keyboard: rows });
}

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

bot.command("menu", async (ctx) => {
  await showMainMenu(ctx);
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

// ====== COMANDO /ranking ======
bot.command("ranking", async (ctx) => {
  try {
    // Torneio padrão do chat
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

    // Busca ranking no Supabase (usa a função get_ranking criada no SQL)
    const { data, error } = await supa.rpc("get_ranking", {
      p_tournament_id: tid,
      p_limit: 15,
    });

    if (error) {
      console.error(error);
      return ctx.reply("❌ Erro ao carregar o ranking do torneio.");
    }

    const rows: RankRow[] = (data ?? []) as RankRow[];
    if (rows.length === 0) {
      return ctx.reply(
        "🏁 Nenhuma partida registrada ainda para este torneio.",
      );
    }

    const table = asMonospaceTable(rows);
    const base =
      process.env.PUBLIC_FRONTEND_URL ||
      "https://poker-ranking-finhane.vercel.app";

    // Envia tabela monoespaçada com botão para abrir o site
    await ctx.replyWithMarkdown(table, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌐 Ver Ranking Completo", url: `${base}/` }],
        ],
      },
    });

    // Resumo Top 3 (opcional)
    const top3 = rows
      .slice(0, 3)
      .map(
        (r: RankRow) =>
          `${medal(r.posicao)} ${r.player_name} — ${r.total_points} pts`,
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

  // ===== atalhos do /menu =====
  if (data === "menu_newmatch") {
    // mesmo fluxo do /nova_partida
    const chat = await getOrCreateChat(ctx.chat.id);
    if (!chat.tournament_id) {
      await ctx.answerCbQuery();
      return ctx.reply("Defina o torneio com /set_torneio <UUID> antes.");
    }
    // carrega jogadores
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

    await setSession(ctx.chat.id, ctx.from.id, {
      state: "selecting_players",
      tournament_id: chat.tournament_id,
      selected_ids: [],
      positions_json: {},
      kos_json: {},
      played_at: new Date().toISOString(),
    });

    await ctx.answerCbQuery();
    // renderiza a lista com checkboxes (reutiliza helper que atualiza ✅/⬜)
    await ctx.reply(
      "Selecione os participantes (toque para alternar). Depois clique em ✅ Concluir seleção.",
      { reply_markup: { inline_keyboard: [] } }, // placeholder; logo abaixo renderizamos o teclado
    );
    await renderSelectKeyboard(ctx, []); // << depende do helper já enviado
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
  // ===== fim dos atalhos do /menu =====

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
      if (selected.includes(pid)) {
        selected = selected.filter((x) => x !== pid);
      } else {
        selected.push(pid);
      }
      await setSession(chat_id, user_id, { selected_ids: selected });
      await ctx.answerCbQuery(`Selecionados: ${selected.length}`);
      await renderSelectKeyboard(ctx, selected); // <<<<<<<<<< atualiza os checkboxes
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

      const selected: string[] = sess.selected_ids ?? [];
      await setSession(chat_id, user_id, { positions_json: positions });

      // calcula a próxima posição conforme a direção
      const nextPos = ORDER_DESC ? pos - 1 : pos + 1;
      const finished = ORDER_DESC ? nextPos < 1 : nextPos > selected.length;

      if (finished) {
        // terminou a ordenação ⇒ iniciar KOs inteligentes
        const kos: Record<string, number> = {};
        selected.forEach((id) => (kos[id] = 0));
        await setSession(chat_id, user_id, {
          state: "setting_knockouts",
          kos_json: kos,
        });
        await askKnockoutsSmart(ctx); // <<<<<<<< novo helper (abaixo)
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

      // Re-renderiza o teclado com o novo saldo
      await askKnockoutsSmart(ctx);
      return;
    }

    if (data === "done_kos") {
      // Validar: não precisa zerar 100%, mas normalmente soma = N-1
      // Se quiser forçar, descomente abaixo:
      /*
    const selected: string[] = sess.selected_ids ?? [];
    const N = selected.length;
    const kos = sess.kos_json || {};
    if (sumKos(kos) !== (N - 1)) {
      await ctx.answerCbQuery();
      return ctx.reply(`A soma das almas deve ser exatamente ${N-1}. Ajuste antes de concluir.`);
    }
    */

      await setSession(chat_id, user_id, { state: "confirming" });
      await confirmSummary(ctx);
      return;
    }
  }

  // Confirmação final
  if (sess.state === "confirming") {
    if (data === "confirm_save") {
      const request_id = randomUUID();
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
  currentPos: number,
) {
  // quando ORDER_DESC=true, currentPos começa em selected.length e vai diminuindo até 1
  // quando ORDER_DESC=false, currentPos começa em 1 e vai subindo até selected.length

  // Descobre quem ainda não foi escolhido
  const already = new Set(Object.values(positions));
  const remaining = selected.filter((id) => !already.has(id));

  if (!remaining.length) return;

  // Carrega nomes dos "remaining"
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

async function sendRankingMessage(ctx: any) {
  // torneio padrão
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
  if (rows.length === 0) return ctx.reply("🏁 Sem partidas ainda.");

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
    .map(
      (r: RankRow) =>
        `${medal(r.posicao)} ${r.player_name} — ${r.total_points} pts`,
    )
    .join("\n");
  await ctx.reply(`🏆 *Top 3*\n${top3}`, { parse_mode: "Markdown" });
}

/** Webhook handler (Next.js) */
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

// Opcional: sanity check
export async function GET() {
  await ensureCommands();
  return new Response("Telegram webhook ok");
}
