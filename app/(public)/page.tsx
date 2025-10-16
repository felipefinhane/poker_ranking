"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import RankTable from "@/components/RankTable";

export default function HomePage() {
  const tournament_id = process.env.NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID!;

  const { data, refetch } = useQuery({
    queryKey: ["ranking", tournament_id],
    queryFn: async () => {
      const res = await fetch(`/api/ranking?tournament_id=${tournament_id}`);
      if (!res.ok) throw new Error("Falha ao carregar ranking");
      return res.json();
    },
  });

  // Realtime básico via SSE-like (revalida ao foco/online)
  useEffect(() => {
    const onFocus = () => refetch();
    const onOnline = () => refetch();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [refetch]);

  return (
    <main className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Ranking</h1>
      <RankTable rows={data?.rows ?? []} />
    </main>
  );
}
