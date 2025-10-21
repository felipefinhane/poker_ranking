// app/(public)/matches/[id]/page.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
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

type Participant = {
  player_id: string;
  player_name: string;
  position: number | null;
  knockouts: number;
  points_awarded: number;
};

type MatchDetail = {
  id: string;
  tournament_id: string;
  played_at: string;
  participants: Participant[];
};

async function fetchMatch(id: string): Promise<MatchDetail> {
  const r = await fetch(`/api/matches/${id}`, { cache: "no-store" });
  if (!r.ok) throw new Error("Falha ao carregar a partida");
  const j = await r.json();
  return j.match as MatchDetail;
}

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["match-detail", id],
    queryFn: () => fetchMatch(id),
    enabled: !!id,
    refetchInterval: 20000,
  });

  const playedLabel = data
    ? new Date(data.played_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Detalhes da Partida
          </h1>
          <p className="text-xs text-muted-foreground">
            {isFetching ? "Atualizando…" : "Atualizado agora"} • Data:{" "}
            {playedLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Atualizar
          </Button>
          <Link href="/matches" passHref>
            <Button size="sm" variant="ghost">
              Voltar
            </Button>
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg">Participantes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="text-[13px] md:text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Posição</TableHead>
                  <TableHead>Participante</TableHead>
                  <TableHead className="text-right">Almas</TableHead>
                  <TableHead className="text-right">Pontos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                      <TableCell>
                        <div className="h-5 w-10 rounded bg-muted/40" />
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-40 rounded bg-muted/40" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-5 w-10 ml-auto rounded bg-muted/40" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-5 w-10 ml-auto rounded bg-muted/40" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (data?.participants ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-6 text-center text-muted-foreground"
                    >
                      Nenhum participante encontrado para esta partida.
                    </TableCell>
                  </TableRow>
                ) : (
                  data!.participants.map((p) => (
                    <TableRow key={p.player_id} className="hover:bg-muted/40">
                      <TableCell className="font-medium tabular-nums">
                        {p.position ?? "—"}
                      </TableCell>
                      <TableCell>{p.player_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.knockouts}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.points_awarded}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
