-- The game has eleven rounds since the Swebits merge, but icelab_scores still only accepted levels 1-9, so every
-- score from rounds 10 and 11 was refused by the database (the page then kept it on the device only).
-- Allow up to 30 so the next few rounds do not hit the same wall, and index the per-round leaderboard.
alter table public.icelab_scores drop constraint if exists icelab_scores_level_check;
alter table public.icelab_scores add constraint icelab_scores_level_check check (level between 1 and 30);

create index if not exists icelab_scores_level_idx on public.icelab_scores (level, score desc, time_s asc) where hidden = false;
