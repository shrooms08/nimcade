-- Nimcade backend, part 1: player profiles, signed Daily Cup scores, tips and cups.
--
-- Access model: the browser holds only the anon (publishable) key and can read the public
-- Cup data. Every write goes through Edge Functions running with the service role, which
-- bypasses RLS. Nothing below grants anon or authenticated any write access.

-- Tables ----------------------------------------------------------------------

create table public.profiles (
  device_id  text primary key,
  wallet     text,
  name       text,
  updated_at timestamptz not null default now()
);

create table public.scores (
  id         bigint generated always as identity primary key,
  game_id    text not null,
  day        date not null,
  score      integer not null check (score >= 0 and score < 10000000),
  wallet     text not null,
  device_id  text not null,
  name       text,
  signature  text not null,
  public_key text not null,
  created_at timestamptz not null default now(),
  unique (game_id, day, device_id)
);

create table public.tips (
  id          bigint generated always as identity primary key,
  game_id     text not null,
  from_wallet text not null,
  to_wallet   text not null,
  amount_luna bigint not null check (amount_luna > 0),
  tx_hash     text not null unique,
  created_at  timestamptz not null default now()
);

create table public.cups (
  game_id   text not null,
  day       date not null,
  seed_luna bigint not null default 0,
  pool_luna bigint not null default 0,
  paid_at   timestamptz,
  primary key (game_id, day)
);

create index scores_board_idx on public.scores (game_id, day, score desc);
create index tips_game_idx on public.tips (game_id);

-- Views -----------------------------------------------------------------------

-- Each game's board per day. security_invoker: reading it goes through the RLS on scores.
create view public.cup_board
with (security_invoker = true) as
select
  game_id,
  day,
  rank() over (partition by game_id, day order by score desc) as rank,
  name,
  wallet,
  score,
  device_id
from public.scores;

-- Tip totals per game. Deliberately runs with the owner's rights (security_invoker = false):
-- anon may read these aggregates, but has no access to individual tips.
create view public.tip_counts
with (security_invoker = false) as
select
  game_id,
  count(*)::integer as tips,
  coalesce(sum(amount_luna), 0)::bigint as amount_luna
from public.tips
group by game_id;

-- Row level security and grants ---------------------------------------------------

alter table public.profiles enable row level security;
alter table public.scores enable row level security;
alter table public.tips enable row level security;
alter table public.cups enable row level security;

create policy "Anyone can read scores" on public.scores for select to anon, authenticated using (true);
create policy "Anyone can read cups" on public.cups for select to anon, authenticated using (true);
-- profiles and tips have no policies: with RLS on, anon and authenticated read nothing there.

-- New objects in public come with broad default grants to anon and authenticated.
-- Take them all back, then allow reading the public Cup data only.
revoke all on public.profiles, public.scores, public.tips, public.cups, public.cup_board, public.tip_counts from anon, authenticated;
grant select on public.scores, public.cups, public.cup_board, public.tip_counts to anon, authenticated;

-- Writes ------------------------------------------------------------------------

-- Keeps a device's best score per game and day (with the wallet, signature and key that
-- proved it) and upserts its profile. Called by the submit-score Edge Function with the
-- service role; returns the stored best score.
create function public.record_score(
  p_game_id text,
  p_day date,
  p_score integer,
  p_wallet text,
  p_device_id text,
  p_name text,
  p_signature text,
  p_public_key text
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  best integer;
begin
  insert into public.scores as s (game_id, day, score, wallet, device_id, name, signature, public_key)
  values (p_game_id, p_day, p_score, p_wallet, p_device_id, p_name, p_signature, p_public_key)
  on conflict (game_id, day, device_id) do update
    set score = greatest(s.score, excluded.score),
        wallet = case when excluded.score > s.score then excluded.wallet else s.wallet end,
        signature = case when excluded.score > s.score then excluded.signature else s.signature end,
        public_key = case when excluded.score > s.score then excluded.public_key else s.public_key end,
        name = coalesce(excluded.name, s.name)
  returning s.score into best;

  insert into public.profiles as p (device_id, wallet, name, updated_at)
  values (p_device_id, p_wallet, p_name, now())
  on conflict (device_id) do update
    set wallet = excluded.wallet,
        name = coalesce(excluded.name, p.name),
        updated_at = now();

  return best;
end;
$$;

revoke execute on function public.record_score(text, date, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_score(text, date, integer, text, text, text, text, text) to service_role;
