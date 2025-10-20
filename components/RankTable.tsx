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
  total_knockouts: number;
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
  if (pos === 1)
    return (
      <span className="text-lg" title="1º">
        🥇
      </span>
    );
  if (pos === 2)
    return (
      <span className="text-lg" title="2º">
        🥈
      </span>
    );
  if (pos === 3)
    return (
      <span className="text-lg" title="3º">
        🥉
      </span>
    );
  return (
    <span
      title={`${pos}º`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-foreground text-xs font-semibold"
    >
      {pos}
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
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isFetching ? "Atualizando…" : "Atualizado agora"}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Atualizar
        </Button>
      </div>

      {/* MOBILE: cards */}
      <div className="space-y-3 md:hidden">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 h-16 animate-pulse bg-muted/30 rounded" />
            </Card>
          ))}

        {!isLoading && rows.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Ainda não há partidas para este torneio.
            </CardContent>
          </Card>
        )}

        {!isLoading &&
          rows.map((r) => (
            <Card key={`${r.position}-${r.player_name}`}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-3 text-base">
                  <Medal pos={r.position} /> {/* 👈 POSIÇÃO */}
                  <span className="font-medium">{r.player_name}</span>
                  <Badge className="ml-auto" variant="outline">
                    Almas {r.total_knockouts}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">Pontuação final</span>
                  <span className="font-semibold tabular-nums">
                    {r.total_points}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* DESKTOP: tabela */}
      <Card className="hidden md:block">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Ranking geral</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 w-full animate-pulse rounded bg-muted/30"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Ainda não há partidas para este torneio.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Posição</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Almas</TableHead>
                  <TableHead className="text-right">Pontuação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow
                    key={`${r.player_name}-${i}`}
                    className="hover:bg-muted/40"
                  >
                    <TableCell className="font-medium">
                      <Medal pos={r.position} />
                    </TableCell>{" "}
                    {/* 👈 POSIÇÃO */}
                    <TableCell>{r.player_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.total_knockouts}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {r.total_points}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
