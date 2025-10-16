import { offlineDB } from "./dexie-db";

export async function queueOp(op: {
  id: string;
  endpoint: string;
  method: "POST" | "PATCH";
  body: any;
}) {
  await offlineDB.pending_ops.add({ ...op, created_at: Date.now() });
}

export async function replayOps(baseUrl = "") {
  const ops = await offlineDB.pending_ops.orderBy("created_at").toArray();
  for (const op of ops) {
    try {
      const res = await fetch(baseUrl + op.endpoint, {
        method: op.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(op.body),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      await offlineDB.pending_ops.delete(op.id);
    } catch (e) {
      // se falhou, mantém na fila
      console.warn("replay failed", op, e);
    }
  }
}
