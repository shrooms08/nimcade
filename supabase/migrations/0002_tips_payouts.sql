-- Nimcade backend, part 2: tip recording and Daily Cup payouts.
--
-- Same access model as 0001: anon reads public data, every write goes through an Edge
-- Function with the service role. record-tip calls record_tip; pay-cup calls claim_cup and
-- writes payouts.

-- Payouts ----------------------------------------------------------------------

-- One row per prize. pay-cup inserts 'sending' rows, then marks each 'sent' with its
-- transaction hash, or 'due' (tx_hash null) when sending failed and it must be paid by hand.
-- A row still 'sending' after a run means the function stopped mid-way: check the hot wallet.
create table public.payouts (
  id          bigint generated always as identity primary key,
  game_id     text not null,
  day         date not null,
  rank        smallint not null check (rank between 1 and 3),
  wallet      text not null,
  name        text,
  score       integer,
  amount_luna bigint not null check (amount_luna > 0),
  tx_hash     text unique,
  status      text not null default 'sending' check (status in ('sending', 'sent', 'due')),
  created_at  timestamptz not null default now(),
  unique (game_id, day, rank),
  check (status <> 'sent' or tx_hash is not null)
);

create index payouts_wallet_idx on public.payouts (wallet);

alter table public.payouts enable row level security;
create policy "Anyone can read payouts" on public.payouts for select to anon, authenticated using (true);

revoke all on public.payouts from anon, authenticated;
grant select on public.payouts to anon, authenticated;

-- Pool helpers -------------------------------------------------------------------

-- Adds Luna to a game's pool for a day, creating the cups row if needed. Returns the new pool.
create function public.add_to_cup_pool(p_game_id text, p_day date, p_amount_luna bigint)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pool bigint;
begin
  if p_amount_luna is null or p_amount_luna < 0 then
    raise exception 'add_to_cup_pool: amount must be zero or more';
  end if;

  insert into public.cups as c (game_id, day, pool_luna)
  values (p_game_id, p_day, p_amount_luna)
  on conflict (game_id, day) do update
    set pool_luna = c.pool_luna + excluded.pool_luna
  returning c.pool_luna into pool;

  return pool;
end;
$$;

-- Records a verified tip once (tx_hash is unique) and adds its pool share. Returns the new
-- pool, or null when the transaction was already recorded (a replay changes nothing).
create function public.record_tip(
  p_game_id text,
  p_day date,
  p_tx_hash text,
  p_from_wallet text,
  p_to_wallet text,
  p_amount_luna bigint,
  p_pool_share_luna bigint
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tip_id bigint;
begin
  if p_pool_share_luna < 0 or p_pool_share_luna > p_amount_luna then
    raise exception 'record_tip: pool share out of range';
  end if;

  insert into public.tips (game_id, from_wallet, to_wallet, amount_luna, tx_hash)
  values (p_game_id, p_from_wallet, p_to_wallet, p_amount_luna, p_tx_hash)
  on conflict (tx_hash) do nothing
  returning id into tip_id;

  if tip_id is null then
    return null;
  end if;

  return public.add_to_cup_pool(p_game_id, p_day, p_pool_share_luna);
end;
$$;

-- Marks a finished Cup as paid before any NIM moves, so two runs can't both pay it.
-- Returns pool plus seed, or null when it was already paid or empty.
create function public.claim_cup(p_game_id text, p_day date)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  update public.cups
     set paid_at = now()
   where game_id = p_game_id
     and day = p_day
     and paid_at is null
     and pool_luna + seed_luna > 0
  returning pool_luna + seed_luna;
$$;

revoke execute on function public.add_to_cup_pool(text, date, bigint) from public, anon, authenticated;
revoke execute on function public.record_tip(text, date, text, text, text, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.claim_cup(text, date) from public, anon, authenticated;
grant execute on function public.add_to_cup_pool(text, date, bigint) to service_role;
grant execute on function public.record_tip(text, date, text, text, text, bigint, bigint) to service_role;
grant execute on function public.claim_cup(text, date) to service_role;
