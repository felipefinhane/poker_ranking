"use client";

import RankTable from "@/components/RankTable";

export default function HomePage() {
  const tournamentId = process.env.NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID!;
  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl mb-4">Ranking</h1>
      <RankTable tournamentId={tournamentId} />
    </main>
  );
}
