-- Nimcade backend, part 2: run pay-cup every day at 00:05 UTC.
--
-- The Supabase CLI has no Edge Function schedules (config.toml has no cron settings), so the
-- schedule lives in the database: pg_cron fires the job and pg_net makes the HTTP call.
-- pg_cron on Supabase runs in UTC.
--
-- The call reads the project URL and the admin key from Vault. Create both once in the SQL
-- editor before the first run (the values are yours; don't commit them):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'nimcade_project_url');
--   select vault.create_secret('<the CUP_ADMIN_KEY value>', 'nimcade_cup_admin_key');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Scheduling under an existing name replaces that job, so this is safe to run again.
select cron.schedule(
  'nimcade-pay-cup',
  '5 0 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'nimcade_project_url') || '/functions/v1/pay-cup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cup-Admin-Key', (select decrypted_secret from vault.decrypted_secrets where name = 'nimcade_cup_admin_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
