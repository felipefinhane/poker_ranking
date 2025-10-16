/** Simples controle de idempotência in-memory (edge-safe ficaria no DB/cache).
 * Em produção, use uma tabela redis/pg + TTL e verificação por request_id. */
const seen = new Set<string>();

export function once(requestId: string): boolean {
  if (seen.has(requestId)) return false;
  seen.add(requestId);
  return true;
}
