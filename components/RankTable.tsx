"use client";

import { useQuery } from "@tanstack/react-query";

type Row = {
  position: number;
  player_name: string;
  total_knockouts: number;
  total_points: number;
};

export default function RankTable({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ranking", tournamentId],
    queryFn: async () => {
      const res = await fetch(`/api/ranking?tournament_id=${tournamentId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load ranking");
      const json = await res.json();
      return (json.rows ?? []) as Row[];
    },
  });

  if (isLoading) return <div className="p-4">Carregando ranking…</div>;
  if (error)
    return <div className="p-4 text-red-400">Erro ao carregar ranking.</div>;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-900/70">
          <tr className="text-left">
            <th className="px-4 py-3">Posição</th>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">Almas</th>
            <th className="px-4 py-3">Pontos</th>
          </tr>
        </thead>
        <tbody>
          {data!.map((r) => (
            <tr key={r.position} className="border-t border-zinc-800/70">
              <td className="px-4 py-3">{r.position}</td>
              <td className="px-4 py-3">{r.player_name}</td>
              <td className="px-4 py-3">{r.total_knockouts}</td>
              <td className="px-4 py-3 font-semibold">{r.total_points}</td>
            </tr>
          ))}
          {data!.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-zinc-400">
                Ainda não há partidas para este torneio.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
