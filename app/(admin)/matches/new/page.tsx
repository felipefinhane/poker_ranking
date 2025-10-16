"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod"; // ✅
import { CreateMatchSchema } from "@/lib/zod-schemas";
import { z } from "zod";
import { queueOp, replayOps } from "@/lib/offline/offline-queue";

export default function NewMatchPage() {
  const defaultTournament = process.env.NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID!;
  const form = useForm<z.infer<typeof CreateMatchSchema>>({
    resolver: zodResolver(CreateMatchSchema),
    defaultValues: {
      request_id: crypto.randomUUID(),
      tournament_id: defaultTournament,
      played_at: new Date().toISOString(),
    },
  });

  async function onSubmit(values: z.infer<typeof CreateMatchSchema>) {
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!navigator.onLine || !res.ok) {
        await queueOp({
          id: values.request_id,
          endpoint: "/api/matches",
          method: "POST",
          body: values,
        });
        alert(
          "Sem conexão ou erro no servidor. Operação salva para enviar depois.",
        );
      } else {
        alert("Partida criada!");
      }
    } finally {
      if (navigator.onLine) await replayOps();
    }
  }

  return (
    <main className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Nova Partida</h1>
      <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
        <div>
          <label className="block text-sm mb-1">Tournament ID</label>
          <input
            className="w-full bg-neutral-900 rounded px-3 py-2"
            {...form.register("tournament_id")}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Played At</label>
          <input
            type="datetime-local"
            className="w-full bg-neutral-900 rounded px-3 py-2"
            onChange={(e) =>
              form.setValue("played_at", new Date(e.target.value).toISOString())
            }
          />
        </div>
        <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500">
          Criar
        </button>
      </form>
    </main>
  );
}
