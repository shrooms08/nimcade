-- Nimcade backend: a daily seed for each game's Cup, and a reason on due payouts.
--
-- cup_settings holds each game's daily seed (in Luna). seed_today_cups() gives every game a
-- cups row for today (UTC) carrying that seed, and pg_cron runs it at 00:00:30 UTC. pay-cup
-- pays pool plus seed, so the seed is what winners get on a day without tips.

-- Why a payout is due (e.g. 'insufficient hot wallet balance' or the send error).
alter table public.payouts add column if not exists reason text;

-- Settings ----------------------------------------------------------------------

create table public.cup_settings (
  game_id         text primary key,
  daily_seed_luna bigint not null default 0 check (daily_seed_luna >= 0)
);

insert into public.cup_settings (game_id)
values ('nimnom'), ('build-up'), ('void-run'), ('dodge'), ('tap-speed')
on conflict (game_id) do nothing;

alter table public.cup_settings enable row level security;
create policy "Anyone can read cup settings" on public.cup_settings for select to anon, authenticated using (true);

revoke all on public.cup_settings from anon, authenticated;
grant select on public.cup_settings to anon, authenticated;

-- Seeding -----------------------------------------------------------------------

-- Creates today's (UTC) cups row for each game with its daily seed. An existing row keeps its
-- seed, except one a tip created in the first seconds of the day (seed still 0, unpaid), which
-- gets the seed too. Setting, never adding, makes it safe to run again. Returns the rows
-- created or seeded.
create function public.seed_today_cups()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with seeded as (
    insert into public.cups as c (game_id, day, seed_luna)
    select s.game_id, (now() at time zone 'utc')::date, s.daily_seed_luna
      from public.cup_settings s
    on conflict (game_id, day) do update
      set seed_luna = excluded.seed_luna
      where c.seed_luna = 0 and c.paid_at is null and excluded.seed_luna > 0
    returning 1
  )
  select count(*)::integer from seeded;
$$;

revoke execute on function public.seed_today_cups() from public, anon, authenticated;
grant execute on function public.seed_today_cups() to service_role;

-- Schedule ----------------------------------------------------------------------

-- pg_cron schedules have minute resolution (or "N seconds" intervals), so the job starts at
-- 00:00 UTC and waits 30 seconds. Scheduling under an existing name replaces that job.
create extension if not exists pg_cron;

select cron.schedule(
  'nimcade-seed-cups',
  '0 0 * * *',
  $$ select pg_sleep(30); select public.seed_today_cups(); $$
);
