-- Álbum Panini Mundial 2026 — esquema de base de datos
-- Pegar y ejecutar en: Supabase → SQL Editor → New Query

-- ============================================
-- Tabla: sticker_states (estado de cada figu por usuario)
-- ============================================
create table if not exists public.sticker_states (
  user_id      uuid not null references auth.users(id) on delete cascade,
  sticker_id   integer not null,
  status       text not null check (status in ('missing', 'owned', 'duplicate')),
  duplicates   integer not null default 0 check (duplicates >= 0),
  notes        text,
  updated_at   timestamptz not null default now(),
  primary key (user_id, sticker_id)
);

create index if not exists sticker_states_user_idx on public.sticker_states(user_id);
create index if not exists sticker_states_status_idx on public.sticker_states(user_id, status);

-- ============================================
-- Tabla: trades (canjes)
-- ============================================
create table if not exists public.trades (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  sticker_id   integer not null,
  kind         text not null check (kind in ('in', 'out')),
  with_whom    text not null,
  notes        text,
  occurred_at  timestamptz not null default now()
);

create index if not exists trades_user_idx on public.trades(user_id, occurred_at desc);

-- ============================================
-- Tabla: team_names (renombres de equipos por usuario)
-- ============================================
create table if not exists public.team_names (
  user_id      uuid not null references auth.users(id) on delete cascade,
  group_slot   text not null,
  custom_name  text not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, group_slot)
);

-- ============================================
-- Tabla: player_names (nombres de jugadores por usuario)
-- ============================================
create table if not exists public.player_names (
  user_id      uuid not null references auth.users(id) on delete cascade,
  sticker_id   integer not null,
  custom_label text not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, sticker_id)
);

-- ============================================
-- Row Level Security: cada user ve y modifica SOLO sus filas
-- ============================================
alter table public.sticker_states enable row level security;
alter table public.trades enable row level security;
alter table public.team_names enable row level security;
alter table public.player_names enable row level security;

-- sticker_states
drop policy if exists "users read own sticker_states" on public.sticker_states;
create policy "users read own sticker_states" on public.sticker_states
  for select using (auth.uid() = user_id);

drop policy if exists "users insert own sticker_states" on public.sticker_states;
create policy "users insert own sticker_states" on public.sticker_states
  for insert with check (auth.uid() = user_id);

drop policy if exists "users update own sticker_states" on public.sticker_states;
create policy "users update own sticker_states" on public.sticker_states
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users delete own sticker_states" on public.sticker_states;
create policy "users delete own sticker_states" on public.sticker_states
  for delete using (auth.uid() = user_id);

-- trades
drop policy if exists "users read own trades" on public.trades;
create policy "users read own trades" on public.trades
  for select using (auth.uid() = user_id);

drop policy if exists "users insert own trades" on public.trades;
create policy "users insert own trades" on public.trades
  for insert with check (auth.uid() = user_id);

drop policy if exists "users update own trades" on public.trades;
create policy "users update own trades" on public.trades
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users delete own trades" on public.trades;
create policy "users delete own trades" on public.trades
  for delete using (auth.uid() = user_id);

-- team_names
drop policy if exists "users full access own team_names" on public.team_names;
create policy "users full access own team_names" on public.team_names
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- player_names
drop policy if exists "users full access own player_names" on public.player_names;
create policy "users full access own player_names" on public.player_names
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
