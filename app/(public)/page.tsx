// app/(public)/page.tsx
"use client";

import Link from "next/link";
import RankTable from "@/components/RankTable";
import { Button } from "@/components/ui/button";
// import InstallPWA from "@/components/InstallPWA"; // se estiver usando

export default function HomePage() {
  const tournamentId = process.env.NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID!;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ranking do Campeonato
          </h1>
          <p className="text-xs text-muted-foreground">
            Critérios de desempate: Pontos → Almas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/matches" passHref>
            <Button size="sm" variant="outline">
              Partidas
            </Button>
          </Link>
        </div>
      </header>

      {/* opcional: banner p/ instalar PWA no mobile */}
      {/* <div className="md:hidden mb-4"><InstallPWA /></div> */}

      <RankTable tournamentId={tournamentId} />
    </main>
  );
}
