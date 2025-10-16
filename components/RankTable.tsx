import { RankingRow } from "@/lib/types";

export default function RankTable({ rows }: { rows: RankingRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-900">
          <tr>
            <th className="px-3 py-2 text-left">Pos.</th>
            <th className="px-3 py-2 text-left">Jogador</th>
            <th className="px-3 py-2 text-right">Pontos</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .sort((a, b) => b.total_points - a.total_points)
            .map((r, i) => (
              <tr key={r.player_id} className="border-t border-neutral-800">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">{r.player_name}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {r.total_points}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
