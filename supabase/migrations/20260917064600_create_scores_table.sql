-- Shared high scores for Swebits Rumble (applied to the "demodeling" Supabase project on 2026-09-17).
-- The page inserts with the publishable key and reads the top entries; nothing else is allowed from the client.
create table public.scores (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 1 and 16),
  fighter     text        not null check (char_length(fighter) between 1 and 24),
  score       integer     not null check (score between 0 and 50000),
  time_s      numeric(7,1) not null check (time_s >= 0),
  level       smallint    not null check (level between 1 and 9),
  hidden      boolean     not null default false,
  reports     integer     not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.scores is 'Swebits Rumble leaderboard. Insert-only from the game page; report_score() hides silly entries.';

alter table public.scores enable row level security;

create policy "anyone can read visible scores"
  on public.scores for select
  to anon, authenticated
  using (hidden = false);

create policy "anyone can add a score"
  on public.scores for insert
  to anon, authenticated
  with check (hidden = false and reports = 0);

create index scores_top_idx on public.scores (score desc, time_s asc) where hidden = false;
create index scores_fighter_idx on public.scores (fighter, score desc) where hidden = false;

-- A public write endpoint will eventually get a silly entry: reporting hides it for everyone.
create or replace function public.report_score(score_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.scores set reports = reports + 1, hidden = true where id = score_id;
$$;

revoke all on function public.report_score(bigint) from public;
grant execute on function public.report_score(bigint) to anon, authenticated;
