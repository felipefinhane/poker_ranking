// app/(public)/matches/page.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type MatchRow = {
  id: string;
  played_at: string; // ISO
  participants: number;
  winner_name: string | null;
};

async function fetchMatches(tournamentId: string): Promise<MatchRow[]> {
  const r = await fetch(`/api/matches?tournament_id=${tournamentId}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Falha ao carregar partidas");
  const j = await r.json();
  return (j.rows ?? []) as MatchRow[];
}

export default function MatchesPage() {
  const tournamentId = process.env.NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID!;
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["matches", tournamentId],
    queryFn: () => fetchMatches(tournamentId),
    refetchInterval: 20000,
  });

  const rows = data ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partidas</h1>
          <p className="text-xs text-muted-foreground">
            {isFetching ? "Atualizando…" : "Atualizado agora"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Atualizar
          </Button>
          <Link href="/" passHref>
            <Button size="sm">Ver Ranking</Button>
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg">
            Lista de partidas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="text-[13px] md:text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Vencedor</TableHead>
                  <TableHead className="text-right">Participantes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                      <TableCell>
                        <div className="h-5 w-24 rounded bg-muted/40" />
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-40 rounded bg-muted/40" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-5 w-10 ml-auto rounded bg-muted/40" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-6 text-center text-muted-foreground"
                    >
                      Nenhuma partida registrada para este campeonato.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((m) => {
                    const d = new Date(m.played_at);
                    const dateLabel = d.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    });
                    const href = `/matches/${m.id}`;
                    return (
                      <TableRow key={m.id} className="hover:bg-muted/40">
                        <TableCell className="font-medium">
                          <Link
                            href={href}
                            className="underline-offset-2 hover:underline"
                          >
                            {dateLabel}
                          </Link>
                        </TableCell>
                        <TableCell>{m.winner_name ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.participants}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
