"use client";

import RankTable from "@/components/RankTable";
import InstallPWA from "@/components/InstallPWA"; // 👈 ADICIONE ISTO

export default function HomePage() {
  const tournament_id = process.env.NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID!;

  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">Ranking do Campeonato</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Critérios de desempate: Pontos → Almas
      </p>

      {/* ✅ Renderiza apenas a versão nova */}
      <RankTable tournamentId={tournament_id} />

      {/* Apenas mobile: botão para instalar PWA */}
      <div className="md:hidden mt-4">
        {/* @ts-ignore */}
        <InstallPWA />
      </div>
    </main>
  );
}
