"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Row = {
  position: number;
  player_name: string;
  total_knockouts: number; // Almas
  total_points: number;
};

async function fetchRanking(tournamentId: string): Promise<Row[]> {
  const r = await fetch(`/api/ranking?tournament_id=${tournamentId}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Failed to load ranking");
  const j = await r.json();
  return (j.rows ?? []) as Row[];
}

function Medal({ pos }: { pos: number }) {
  let strPosition = "";
  switch (pos) {
    case 1:
      strPosition = "🥇";
      break;

    case 2:
      strPosition = "🥈";
      break;
    case 3:
      strPosition = "🥉";
      break;
    default:
      strPosition = pos + "º";
      break;
  }
  return (
    <span title={`${pos}º`} className="text-base md:text-lg ">
      {strPosition}
    </span>
  );
}

export default function RankTable({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["ranking", tournamentId],
    queryFn: () => fetchRanking(tournamentId),
    refetchInterval: 20000,
  });

  const rows = data ?? [];

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-destructive">
          Erro ao carregar ranking.
          <div className="mt-3">
            <Button onClick={() => refetch()} size="sm" variant="outline">
              Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base md:text-lg">Ranking geral</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* TABELA ÚNICA (mobile-first, compacta) */}
          <div className="overflow-x-auto">
            <Table className="text-[13px] md:text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 md:w-20">Pos.</TableHead>
                  <TableHead className="text-center w-24">Nome</TableHead>
                  <TableHead className="text-center w-24">Almas</TableHead>
                  <TableHead className="text-center w-28">Pontos</TableHead>
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
                        <div className="h-5 w-32 rounded bg-muted/40" />
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-10 rounded bg-muted/40" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="h-5 w-12 ml-auto rounded bg-muted/40" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-6 text-center text-muted-foreground"
                    >
                      Ainda não há partidas para este torneio.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r, i) => (
                    <TableRow
                      key={`${r.player_name}-${i}`}
                      className="hover:bg-muted/40"
                    >
                      <TableCell className="text-center font-medium">
                        <Medal pos={r.position} />
                      </TableCell>
                      <TableCell className="text-center truncate">
                        {r.player_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-center px-2 py-0.5"
                        >
                          {r.total_knockouts}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-semibold tabular-nums">
                        {r.total_points}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isFetching ? "Atualizando…" : "Atualizado agora"}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Atualizar
        </Button>
      </div>
    </>
  );
}
