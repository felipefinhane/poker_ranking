import Dexie, { Table } from "dexie";

type PendingOp = {
  id: string; // uuid local
  endpoint: string; // ex: /api/matches
  method: "POST" | "PATCH";
  body: any; // payload serializado
  created_at: number;
};

export class OfflineDB extends Dexie {
  pending_ops!: Table<PendingOp, string>;
  constructor() {
    super("poker_offline");
    this.version(1).stores({
      pending_ops: "id,endpoint,method,created_at",
    });
  }
}

export const offlineDB = new OfflineDB();
