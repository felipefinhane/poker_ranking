-- =========================================================
-- Poker Ranking – FULL SETUP (Supabase/Postgres)
-- =========================================================

-- ----------------------------
-- 0) EXTENSIONS
-- ----------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------
-- 1) TABLES
-- ----------------------------
drop table if exists telegram_chats cascade;
drop table if exists telegram_admins cascade;
drop table if exists match_participants cascade;
drop table if exists matches cascade;
drop table if exists points_rules cascade;
drop table if exists players cascade;
drop table if exists tournaments cascade;

create table players (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique
);

create table tournaments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  start_at timestamptz not null,
  end_at timestamptz
);

create table matches (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  played_at timestamptz not null
);

create index if not exists idx_matches_tournament_id on matches(tournament_id);
create index if not exists idx_matches_played_at on matches(played_at);

create table points_rules (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  position int not null,
  points numeric not null,
  primary key (tournament_id, position)
);

create table match_participants (
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  position int not null check (position > 0),
  points_awarded numeric not null default 0,
  primary key (match_id, player_id)
);

create index if not exists idx_mp_match_id on match_participants(match_id);
create index if not exists idx_mp_player_id on match_participants(player_id);
create index if not exists idx_mp_position on match_participants(position);

-- (Opcional) Tabelas para integração com Telegram Bot
create table telegram_admins (
  telegram_user_id bigint primary key,
  display_name text
);

create table telegram_chats (
  chat_id bigint primary key,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  created_at timestamptz default now()
);

-- ----------------------------
-- 2) TRIGGER FUNCTION (row-level) – calcular pontos
-- ----------------------------
create or replace function apply_points_row()
returns trigger as $$
declare
  pts numeric;
begin
  /* Busca os pontos conforme torneio e posição desta linha */
  select pr.points into pts
  from matches m
  join points_rules pr
    on pr.tournament_id = m.tournament_id
   and pr.position = new.position
  where m.id = new.match_id;

  new.points_awarded = coalesce(pts, 0);
  return new;
end;
$$ language plpgsql;

-- Remove triggers antigos se existirem
drop trigger if exists trg_apply_points_bi on match_participants;
drop trigger if exists trg_apply_points_bu on match_participants;

-- BEFORE INSERT/UPDATE para setar points_awarded linha a linha
create trigger trg_apply_points_bi
before insert on match_participants
for each row execute function apply_points_row();

create trigger trg_apply_points_bu
before update of position on match_participants
for each row execute function apply_points_row();

-- ----------------------------
-- 3) VIEW – RANKING
-- ----------------------------
drop view if exists ranking cascade;

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

-- ----------------------------
-- 4) RLS – Row Level Security
-- ----------------------------
alter table players               enable row level security;
alter table tournaments           enable row level security;
alter table matches               enable row level security;
alter table match_participants    enable row level security;
alter table points_rules          enable row level security;
alter table telegram_admins       enable row level security;
alter table telegram_chats        enable row level security;

-- Limpa policies antigas (idempotente)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- POLÍTICAS
-- Leitura pública (para ranking/consultas GET)
create policy "anon select players"             on players            for select to anon using (true);
create policy "anon select tournaments"         on tournaments        for select to anon using (true);
create policy "anon select matches"             on matches            for select to anon using (true);
create policy "anon select match_participants"  on match_participants for select to anon using (true);
create policy "anon select points_rules"        on points_rules       for select to anon using (true);

-- Escrita apenas para usuários autenticados (ou service role via server-side)
-- INSERT → apenas WITH CHECK
create policy "auth insert matches" on matches for insert to authenticated with check (true);
create policy "auth insert mp"      on match_participants for insert to authenticated with check (true);
create policy "auth insert players" on players for insert to authenticated with check (true);
create policy "auth insert tournaments" on tournaments for insert to authenticated with check (true);
create policy "auth insert points_rules" on points_rules for insert to authenticated with check (true);

-- UPDATE → USING + WITH CHECK
create policy "auth update matches" on matches for update to authenticated using (true) with check (true);
create policy "auth update mp"      on match_participants for update to authenticated using (true) with check (true);
create policy "auth update players" on players for update to authenticated using (true) with check (true);
create policy "auth update tournaments" on tournaments for update to authenticated using (true) with check (true);
create policy "auth update points_rules" on points_rules for update to authenticated using (true) with check (true);

-- DELETE → USING
create policy "auth delete matches" on matches for delete to authenticated using (true);
create policy "auth delete mp"      on match_participants for delete to authenticated using (true);
create policy "auth delete players" on players for delete to authenticated using (true);
create policy "auth delete tournaments" on tournaments for delete to authenticated using (true);
create policy "auth delete points_rules" on points_rules for delete to authenticated using (true);

-- (Telegram) restrinja como preferir; por padrão somente AUTH lê/escreve
create policy "auth all telegram_admins" on telegram_admins for all to authenticated using (true) with check (true);
create policy "auth all telegram_chats"  on telegram_chats  for all to authenticated using (true) with check (true);
create policy "anon select telegram_chats" on telegram_chats for select to anon using (true);

-- ----------------------------
-- 5) REALTIME – habilitar publicação
-- (equivalente ao toggle do dashboard)
-- ----------------------------
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table match_participants;

-- =========================================================
-- OPTIONAL: SEEDS (use se quiser repor seu estado atual)
-- =========================================================

-- Torneio (usa o mesmo UUID seu)
insert into tournaments (id, name, start_at, end_at)
values ('40a20d2a-c15a-44d6-bb1f-c9197666b2e8', 'Liga Amigos - 2025', now(), null)
on conflict (id) do nothing;

-- Jogadores (mesmos UUIDs seus)
insert into players (id, name, email) values
('0df309cf-13b1-4564-b48a-2074172830f8','Bruno',null),
('4eb87e65-c733-42a8-9898-3a43684ed4d3','Eva',null),
('8281502f-52cb-4270-9635-9ba0087e1260','Carla',null),
('97b9dcc3-8a0f-4868-866f-e4c3c600d54b','Diego',null),
('ef62cf2e-45fb-460e-b111-a883dd78f0d0','Alice',null)
on conflict (id) do nothing;

-- Regras de pontos (Top 10 – ajuste como quiser)
insert into points_rules (tournament_id, position, points) values
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',1,100),
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',2,75),
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',3,60),
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',4,50),
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',5,45),
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',6,40),
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',7,35),
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',8,30),
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',9,25),
('40a20d2a-c15a-44d6-bb1f-c9197666b2e8',10,20)
on conflict do nothing;

-- (Opcional) Criar uma partida e participantes de exemplo
-- insert into matches (id, tournament_id, played_at)
-- values ('f75b2ac5-a2bf-46fa-8e2c-81073c8f9f17','40a20d2a-c15a-44d6-bb1f-c9197666b2e8','2025-10-15T20:00:00+00:00')
-- on conflict (id) do nothing;

-- insert into match_participants (match_id, player_id, position)
-- values
-- ('f75b2ac5-a2bf-46fa-8e2c-81073c8f9f17','ef62cf2e-45fb-460e-b111-a883dd78f0d0',1),
-- ('f75b2ac5-a2bf-46fa-8e2c-81073c8f9f17','0df309cf-13b1-4564-b48a-2074172830f8',2),
-- ('f75b2ac5-a2bf-46fa-8e2c-81073c8f9f17','8281502f-52cb-4270-9635-9ba0087e1260',3),
-- ('f75b2ac5-a2bf-46fa-8e2c-81073c8f9f17','97b9dcc3-8a0f-4868-866f-e4c3c600d54b',4),
-- ('f75b2ac5-a2bf-46fa-8e2c-81073c8f9f17','4eb87e65-c733-42a8-9898-3a43684ed4d3',5);

-- (Se precisar backfill nos pontos por qualquer motivo)
-- UPDATE match_participants mp
-- SET points_awarded = COALESCE((
--   SELECT pr.points
--   FROM matches m
--   JOIN points_rules pr
--     ON pr.tournament_id = m.tournament_id
--    AND pr.position = mp.position
--   WHERE m.id = mp.match_id
-- ), 0);

-- =========================================================
-- FIM
-- =========================================================
