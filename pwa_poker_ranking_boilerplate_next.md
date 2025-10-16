# PWA Poker Ranking – Boilerplate (Next.js + Supabase + BFF fino + Offline)

Este boilerplate entrega:
- **PWA instalável** (manifest + service worker via `next-pwa`).
- **Frontend Next.js (App Router) + TS + Tailwind + shadcn**.
- **Realtime** (Supabase Realtime) para atualizar ranking/partidas.
- **BFF fino** (rotas `/app/api/*`) com **idempotência** e validação **Zod**.
- **Offline-first**: **Dexie (IndexedDB)** para rascunhos e **replay** quando voltar a conexão.
- **Schema SQL** do Supabase: tabelas, **trigger** de pontos, **view** `ranking`, **RLS** básica.

> Você pode copiar os blocos por arquivo. A árvore de pastas sugerida está abaixo.

---

## 1) Estrutura de pastas
```text
pwa-poker-ranking/
├─ app/
│  ├─ (public)/
│  │  ├─ page.tsx                     # Página pública do ranking
│  │  └─ matches/page.tsx             # Lista de partidas
│  ├─ (admin)/
│  │  ├─ page.tsx                     # Dashboard admin (criar partidas)
│  │  └─ matches/new/page.tsx         # Form de nova partida
│  ├─ api/
│  │  ├─ health/route.ts              # Healthcheck
│  │  ├─ matches/route.ts             # POST (criar) / GET (listar)
│  │  ├─ matches/[id]/route.ts        # GET / PATCH (ajustar posições)
│  │  ├─ participants/route.ts        # POST (adicionar participantes)
│  │  └─ ranking/route.ts             # GET ranking por torneio
│  ├─ layout.tsx
│  └─ globals.css
├─ components/
│  ├─ RankTable.tsx
│  ├─ MatchList.tsx
│  ├─ MatchForm.tsx
│  └─ RealtimeStatus.tsx
├─ lib/
│  ├─ supabaseClient.ts               # client do supabase (edge-safe)
│  ├─ types.ts                        # tipos compartilhados
│  ├─ idempotency.ts                  # util p/ idempotência
│  ├─ zod-schemas.ts                  # validações
│  └─ offline/
│     ├─ dexie-db.ts                  # schema IndexedDB (Dexie)
│     └─ offline-queue.ts             # replay de operações
├─ public/
│  ├─ manifest.json
│  ├─ icons/*                         # gerado via pwa-asset-generator
│  └─ robots.txt
├─ .env.local.example
├─ next.config.mjs
├─ package.json
├─ postcss.config.js
├─ tailwind.config.ts
├─ tsconfig.json
└─ README.md
```

---

## 2) package.json
```json
{
  "name": "pwa-poker-ranking",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.4",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "dexie": "^4.0.7",
    "lucide-react": "^0.452.0",
    "next": "^14.2.9",
    "next-pwa": "^5.6.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.53.0",
    "tailwind-merge": "^2.5.2",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.8",
    "@tanstack/react-query": "^5.59.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.10",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.9",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4"
  }
}
```

---

## 3) next.config.mjs (PWA)
```js
import withPWA from 'next-pwa';

const isProd = process.env.NODE_ENV === 'production';

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: !isProd,
  runtimeCaching: [
    // cache básico; ajuste se precisar de estratégias específicas
  ],
})({
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins: ['*'] }
  }
});
```

---

## 4) public/manifest.json
```json
{
  "name": "Poker Ranking",
  "short_name": "Ranking",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0b0f",
  "theme_color": "#111827",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 5) Tailwind setup
### tailwind.config.ts
```ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {}
  },
  plugins: [animate]
} satisfies Config;
```

### app/globals.css
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { height: 100%; }
```

---

## 6) lib/types.ts
```ts
export type UUID = string;

export type Player = {
  id: UUID;
  name: string;
  email?: string | null;
};

export type Tournament = {
  id: UUID;
  name: string;
  start_at: string;
  end_at?: string | null;
};

export type Match = {
  id: UUID;
  tournament_id: UUID;
  played_at: string;
};

export type MatchParticipant = {
  match_id: UUID;
  player_id: UUID;
  position: number; // 1 = campeão
  points_awarded: number;
};

export type RankingRow = {
  player_id: UUID;
  player_name: string;
  total_points: number;
  last_update: string;
};
```

---

## 7) lib/supabaseClient.ts
```ts
import { createClient } from '@supabase/supabase-js';

export const supabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
};
```

---

## 8) lib/zod-schemas.ts
```ts
import { z } from 'zod';

export const CreateMatchSchema = z.object({
  request_id: z.string().uuid(),
  tournament_id: z.string().uuid(),
  played_at: z.string().datetime(),
});

export const AddParticipantsSchema = z.object({
  request_id: z.string().uuid(),
  match_id: z.string().uuid(),
  participants: z.array(z.object({
    player_id: z.string().uuid(),
    position: z.number().int().positive()
  })).min(1)
});

export const PatchMatchPositionsSchema = z.object({
  request_id: z.string().uuid(),
  participants: z.array(z.object({
    player_id: z.string().uuid(),
    position: z.number().int().positive()
  })).min(1)
});

export const GetRankingSchema = z.object({
  tournament_id: z.string().uuid()
});
```

---

## 9) lib/idempotency.ts
```ts
/** Simples controle de idempotência in-memory (edge-safe ficaria no DB/cache).
 * Em produção, use uma tabela redis/pg + TTL e verificação por request_id. */
const seen = new Set<string>();

export function once(requestId: string): boolean {
  if (seen.has(requestId)) return false;
  seen.add(requestId);
  return true;
}
```

---

## 10) lib/offline/dexie-db.ts
```ts
import Dexie, { Table } from 'dexie';

type PendingOp = {
  id: string;              // uuid local
  endpoint: string;        // ex: /api/matches
  method: 'POST'|'PATCH';
  body: any;               // payload serializado
  created_at: number;
};

export class OfflineDB extends Dexie {
  pending_ops!: Table<PendingOp, string>;
  constructor() {
    super('poker_offline');
    this.version(1).stores({
      pending_ops: 'id,endpoint,method,created_at'
    });
  }
}

export const offlineDB = new OfflineDB();
```

---

## 11) lib/offline/offline-queue.ts
```ts
import { offlineDB } from './dexie-db';

export async function queueOp(op: {
  id: string;
  endpoint: string;
  method: 'POST'|'PATCH';
  body: any;
}) {
  await offlineDB.pending_ops.add({ ...op, created_at: Date.now() });
}

export async function replayOps(baseUrl = '') {
  const ops = await offlineDB.pending_ops.orderBy('created_at').toArray();
  for (const op of ops) {
    try {
      const res = await fetch(baseUrl + op.endpoint, {
        method: op.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op.body)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await offlineDB.pending_ops.delete(op.id);
    } catch (e) {
      // se falhou, mantém na fila
      console.warn('replay failed', op, e);
    }
  }
}
```

---

## 12) app/layout.tsx
```tsx
import './globals.css';
import type { Metadata } from 'next';
import { ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const metadata: Metadata = {
  title: 'Poker Ranking',
  description: 'PWA para ranking e partidas de poker'
};

const qc = new QueryClient();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="min-h-screen bg-neutral-950 text-neutral-100">
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </body>
    </html>
  );
}
```

---

## 13) app/(public)/page.tsx (Ranking público)
```tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import RankTable from '@/components/RankTable';

export default function HomePage() {
  const tournament_id = process.env.NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID!;

  const { data, refetch } = useQuery({
    queryKey: ['ranking', tournament_id],
    queryFn: async () => {
      const res = await fetch(`/api/ranking?tournament_id=${tournament_id}`);
      if (!res.ok) throw new Error('Falha ao carregar ranking');
      return res.json();
    }
  });

  // Realtime básico via SSE-like (revalida ao foco/online)
  useEffect(() => {
    const onFocus = () => refetch();
    const onOnline = () => refetch();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [refetch]);

  return (
    <main className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Ranking</h1>
      <RankTable rows={data?.rows ?? []} />
    </main>
  );
}
```

---

## 14) components/RankTable.tsx
```tsx
import { RankingRow } from '@/lib/types';

export default function RankTable({ rows }: { rows: RankingRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-900">
          <tr>
            <th className="px-3 py-2 text-left">Pos.</th>
            <th className="px-3 py-2 text-left">Jogador</th>
            <th className="px-3 py-2 text-right">Pontos</th>
          </tr>
        </thead>
        <tbody>
          {rows.sort((a,b)=>b.total_points - a.total_points).map((r, i) => (
            <tr key={r.player_id} className="border-t border-neutral-800">
              <td className="px-3 py-2">{i+1}</td>
              <td className="px-3 py-2">{r.player_name}</td>
              <td className="px-3 py-2 text-right font-semibold">{r.total_points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 15) app/(admin)/matches/new/page.tsx (Form de nova partida)
```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateMatchSchema } from '@/lib/zod-schemas';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { queueOp, replayOps } from '@/lib/offline/offline-queue';

export default function NewMatchPage() {
  const defaultTournament = process.env.NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID!;
  const form = useForm<z.infer<typeof CreateMatchSchema>>({
    resolver: zodResolver(CreateMatchSchema),
    defaultValues: {
      request_id: uuid(),
      tournament_id: defaultTournament,
      played_at: new Date().toISOString()
    }
  });

  async function onSubmit(values: z.infer<typeof CreateMatchSchema>) {
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (!navigator.onLine || !res.ok) {
        await queueOp({ id: values.request_id, endpoint: '/api/matches', method: 'POST', body: values });
        alert('Sem conexão ou erro no servidor. Operação salva para enviar depois.');
      } else {
        alert('Partida criada!');
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
          <input className="w-full bg-neutral-900 rounded px-3 py-2" {...form.register('tournament_id')} />
        </div>
        <div>
          <label className="block text-sm mb-1">Played At</label>
          <input type="datetime-local" className="w-full bg-neutral-900 rounded px-3 py-2"
            onChange={(e) => form.setValue('played_at', new Date(e.target.value).toISOString())}
          />
        </div>
        <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500">Criar</button>
      </form>
    </main>
  );
}
```

---

## 16) Rotas de API (BFF fino)
### app/api/health/route.ts
```ts
import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
```

### app/api/matches/route.ts (POST/GET)
```ts
import { NextRequest, NextResponse } from 'next/server';
import { CreateMatchSchema } from '@/lib/zod-schemas';
import { once } from '@/lib/idempotency';
import { supabaseClient } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateMatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { request_id, tournament_id, played_at } = parsed.data;
  if (!once(request_id)) return NextResponse.json({ status: 'duplicate' }, { status: 200 });

  const supa = supabaseClient();
  const { data, error } = await supa.from('matches').insert({ tournament_id, played_at }).select().single();
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ match: data });
}

export async function GET() {
  const supa = supabaseClient();
  const { data, error } = await supa.from('matches').select('*').order('played_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ rows: data });
}
```

### app/api/matches/[id]/route.ts (GET/PATCH posições)
```ts
import { NextRequest, NextResponse } from 'next/server';
import { PatchMatchPositionsSchema } from '@/lib/zod-schemas';
import { once } from '@/lib/idempotency';
import { supabaseClient } from '@/lib/supabaseClient';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supa = supabaseClient();
  const { data, error } = await supa
    .from('match_participants')
    .select('*')
    .eq('match_id', params.id);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ rows: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = PatchMatchPositionsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { request_id, participants } = parsed.data;
  if (!once(request_id)) return NextResponse.json({ status: 'duplicate' }, { status: 200 });

  const supa = supabaseClient();
  // Atualiza posições (trigger recalc points)
  for (const p of participants) {
    const { error } = await supa
      .from('match_participants')
      .update({ position: p.position })
      .eq('match_id', params.id)
      .eq('player_id', p.player_id);
    if (error) return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

### app/api/participants/route.ts (POST adicionar participantes)
```ts
import { NextRequest, NextResponse } from 'next/server';
import { AddParticipantsSchema } from '@/lib/zod-schemas';
import { once } from '@/lib/idempotency';
import { supabaseClient } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = AddParticipantsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { request_id, match_id, participants } = parsed.data;
  if (!once(request_id)) return NextResponse.json({ status: 'duplicate' }, { status: 200 });

  const supa = supabaseClient();
  const rows = participants.map(p => ({ match_id, player_id: p.player_id, position: p.position }));
  const { error } = await supa.from('match_participants').insert(rows);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

### app/api/ranking/route.ts (GET)
```ts
import { NextRequest, NextResponse } from 'next/server';
import { GetRankingSchema } from '@/lib/zod-schemas';
import { supabaseClient } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournament_id = searchParams.get('tournament_id');
  const parsed = GetRankingSchema.safeParse({ tournament_id });
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supa = supabaseClient();
  const { data, error } = await supa
    .from('ranking')
    .select('*')
    .eq('tournament_id', tournament_id)
    .order('total_points', { ascending: false });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ rows: data });
}
```

---

## 17) SQL – Supabase (Postgres)
Crie um projeto no Supabase e rode os blocos a seguir no SQL Editor.

### 17.1 Tabelas base
```sql
create extension if not exists "uuid-ossp";

create table if not exists players (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique
);

create table if not exists tournaments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  start_at timestamptz not null,
  end_at timestamptz
);

create table if not exists matches (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  played_at timestamptz not null
);

create table if not exists match_participants (
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  position int not null check (position > 0),
  points_awarded numeric not null default 0,
  primary key (match_id, player_id)
);

create table if not exists points_rules (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  position int not null,
  points numeric not null,
  primary key (tournament_id, position)
);
```

### 17.2 Função & trigger para calcular pontos
```sql
create or replace function apply_points()
returns trigger as $$
begin
  update match_participants mp
  set points_awarded = coalesce(pr.points, 0)
  from points_rules pr
  where mp.match_id = coalesce(new.match_id, old.match_id)
    and mp.position = pr.position
    and pr.tournament_id = (select tournament_id from matches where id = mp.match_id);
  return new;
end;
$$ language plpgsql;

-- Recalcula ao inserir/atualizar participantes e ao atualizar posições
create or replace trigger trg_apply_points_ins
after insert on match_participants
for each statement execute function apply_points();

create or replace trigger trg_apply_points_upd
after update of position on match_participants
for each statement execute function apply_points();
```

### 17.3 View de ranking
```sql
create or replace view ranking as
select
  m.tournament_id,
  p.id as player_id,
  p.name as player_name,
  sum(mp.points_awarded) as total_points,
  max(m.played_at) as last_update
from matches m
join match_participants mp on mp.match_id = m.id
join players p on p.id = mp.player_id
group by 1,2,3;
```

### 17.4 Realtime (Supabase)
No Dashboard do Supabase, habilite **Realtime** para as tabelas `match_participants` e `matches`. O front revalida o cache ao receber foco/online, mas você pode assinar `postgres_changes` no client se quiser push imediato.

### 17.5 RLS (básico por torneio)
> Ajuste conforme seu auth. Exemplo abre leitura pública do ranking e restringe escrita.
```sql
alter table players enable row level security;
alter table tournaments enable row level security;
alter table matches enable row level security;
alter table match_participants enable row level security;
alter table points_rules enable row level security;

-- Público: leitura do ranking via view (sem RLS na view). Para segurança, crie políticas de SELECT nas base tables.
create policy "public can read matches" on matches for select using (true);
create policy "public can read match_participants" on match_participants for select using (true);

-- Escrita: somente usuários autenticados (role authenticated)
create policy "auth can insert matches" on matches for insert to authenticated using (true) with check (true);
create policy "auth can manage match_participants" on match_participants for all to authenticated using (true) with check (true);

-- Regras de pontos: somente admin (exemplo simples)
create policy "auth can read points_rules" on points_rules for select using (true);
create policy "auth can write points_rules" on points_rules for all to authenticated using (true) with check (true);
```

---

## 18) .env.local.example
```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID=00000000-0000-0000-0000-000000000000
```

---

## 19) README.md (uso rápido)
```md
# Poker Ranking PWA

## Instalação
```bash
pnpm i # ou npm i / yarn
cp .env.local.example .env.local
# Preencha as variáveis do Supabase
```

## Desenvolvimento
```bash
pnpm dev
```
Acesse http://localhost:3000 e instale como app (PWA).

## Deploy
- Front: Vercel (build padrão Next).
- Backend: Supabase (crie o projeto, rode o SQL e copie URL/Anon Key para `.env.local`).

## Fluxo
1. Crie `tournaments`, `players` e defina `points_rules` no Supabase.
2. Crie partidas via `/admin` ou `POST /api/matches`.
3. Adicione participantes via `POST /api/participants`.
4. Ajuste posições via `PATCH /api/matches/:id`.
5. Ranking público em `/`.

## Offline
- Operações de escrita são enfileiradas no IndexedDB quando offline e reenviadas ao voltar a conexão.
- Revalidação de ranking ao voltar foco/online.
```

---

## 20) Dicas de evolução
- **Assinatura realtime**: usar `supabaseClient().channel('postgres_changes')` para refetch automático sem depender de foco/online.
- **Idempotência robusta**: mover `once()` para Redis/PG com tabela `idempotency_keys` (request_id + ttl).
- **Autorização por campeonato**: adicionar coluna `owner_id` nas tabelas e RLS por `auth.uid()`.
- **View materializada**: se o volume crescer, materialize `ranking` e agende refresh por cron/trigger.
- **Desempates**: adicionar critérios (maior número de vitórias, últimas partidas, etc.).
- **Import/Export**: endpoints para CSV das partidas e ranking.

