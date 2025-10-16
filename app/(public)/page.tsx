"use client";

import RankTable from "@/components/RankTable";

export default function HomePage() {
  const tournamentId = process.env.NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID!;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
      <header className="mb-5">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
          Ranking do Campeonato
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Critérios de desempate: Pontos &rarr; Almas &rarr; Última partida
          &rarr; Nome
        </p>
      </header>
      <RankTable tournamentId={tournamentId} />
    </main>
  );
}
