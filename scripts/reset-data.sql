-- Nimcade: delete all player data so mainnet starts clean.
--
-- DESTRUCTIVE AND IRREVERSIBLE: every score, tip, Cup pool, payout record and profile is gone.
-- Run it once, in the Supabase dashboard SQL editor, before the app switches to mainnet.
-- Settle or note any testnet payouts you still care about first.
--
-- Kept: cup_settings (daily seeds), the schema, views, functions, cron jobs and Vault secrets.
--
-- There are no foreign keys between these tables. They are still emptied from the most
-- derived records to the base ones (payouts come from cups and scores, tips fill cups, scores
-- belong to profiles) inside one transaction: either everything is cleared or nothing is.
-- RESTART IDENTITY resets the id counters.

begin;

truncate table public.payouts restart identity;
truncate table public.tips restart identity;
truncate table public.cups;
truncate table public.scores restart identity;
truncate table public.profiles;

commit;

-- Every count should be 0.
select 'payouts' as table_name, count(*) as rows from public.payouts
union all select 'tips', count(*) from public.tips
union all select 'cups', count(*) from public.cups
union all select 'scores', count(*) from public.scores
union all select 'profiles', count(*) from public.profiles;
