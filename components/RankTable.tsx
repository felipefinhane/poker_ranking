"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

type Row = {
  position: number;
  player_name: string;
  total_knockouts: number; // Almas
  total_points: number;
};

async function fetchRanking(tournamentId: string): Promise<Row[]> {
  const res = await fetch(`/api/ranking?tournament_id=${tournamentId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load ranking");
  const json = await res.json();
  return (json.rows ?? []) as Row[];
}

function Medal({ pos }: { pos: number }) {
  if (pos === 1)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-300 font-bold">
        🥇
      </span>
    );
  if (pos === 2)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-zinc-500/20 text-zinc-200">
        🥈
      </span>
    );
  if (pos === 3)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/20 text-amber-300">
        🥉
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-zinc-800 text-zinc-300 text-[13px]">
      {pos}
    </span>
  );
}

function SkeletonRow({ variant = "card" as "card" | "table" }) {
  if (variant === "card") {
    return (
      <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900/40 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-zinc-800" />
          <div className="h-4 w-32 bg-zinc-800 rounded" />
          <div className="ml-auto h-6 w-12 bg-zinc-800 rounded" />
        </div>
        <div className="mt-3 h-3 w-20 bg-zinc-800 rounded" />
      </div>
    );
  }
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-4">
        <div className="w-7 h-7 rounded-full bg-zinc-800" />
      </td>
      <td className="px-4 py-4">
        <div className="h-4 w-36 bg-zinc-800 rounded" />
      </td>
      <td className="px-4 py-4">
        <div className="h-6 w-12 bg-zinc-800 rounded" />
      </td>
      <td className="px-4 py-4">
        <div className="h-5 w-16 bg-zinc-800 rounded" />
      </td>
    </tr>
  );
}

export default function RankTable({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ranking", tournamentId],
    queryFn: () => fetchRanking(tournamentId),
    refetchInterval: 15000, // auto-refresh a cada 15s
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Mobile-first cards
  if (isLoading) {
    return (
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} variant="card" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/40 bg-red-950/40 p-4">
        <p className="text-red-300">Erro ao carregar ranking.</p>
        <button
          onClick={handleRefresh}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-800 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/20"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <>
      {/* Header + Ações */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-zinc-400">
          {isFetching ? "Atualizando…" : `Atualizado agora`}
        </div>
        <button
          onClick={handleRefresh}
          className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          Atualizar
        </button>
      </div>

      {/* Mobile (cards) */}
      <div className="md:hidden space-y-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-zinc-800 p-6 text-center text-zinc-400">
            Ainda não há partidas para este torneio.
          </div>
        )}
        {rows.map((r) => (
          <div
            key={`${r.position}-${r.player_name}`}
            className="rounded-xl border border-zinc-800 p-4 bg-gradient-to-b from-zinc-900/60 to-transparent"
          >
            <div className="flex items-center gap-3">
              <Medal pos={r.position} />
              <div className="font-medium">{r.player_name}</div>
              <div className="ml-auto inline-flex items-center gap-2">
                <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                  Almas: <b className="ml-1">{r.total_knockouts}</b>
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-sm text-zinc-400">Pontuação final</span>
              <span className="text-lg font-semibold tracking-tight">
                {r.total_points}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop (table) */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-zinc-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-900/70 sticky top-0">
              <tr className="text-left">
                <th className="px-4 py-3">Posição</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Almas</th>
                <th className="px-4 py-3">Pontuação</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-zinc-400"
                  >
                    Ainda não há partidas para este torneio.
                  </td>
                </tr>
              )}
              {rows.map((r, idx) => (
                <tr
                  key={`${r.position}-${idx}`}
                  className="border-t border-zinc-800/70 hover:bg-zinc-900/40"
                >
                  <td className="px-4 py-3">
                    <Medal pos={r.position} />
                  </td>
                  <td className="px-4 py-3 font-medium">{r.player_name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full border border-zinc-800 px-2 py-0.5 text-xs">
                      {r.total_knockouts}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{r.total_points}</td>
                </tr>
              ))}
              {/* Skeleton enquanto refetch (opcional) */}
              {isFetching &&
                Array.from({ length: 2 }).map((_, i) => (
                  <SkeletonRow key={`sk-${i}`} variant="table" />
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
