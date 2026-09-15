# Nimcade backend

Supabase Postgres plus three Edge Functions. The browser only ever holds the publishable key and reads public data; every write goes through a function running with the service role.

| Function | What it does | Auth |
| --- | --- | --- |
| `submit-score` | Verifies a Nimiq-signed Daily Cup entry and keeps the device's best score | The wallet signature |
| `record-tip` | Checks a tip on chain (sender, recipient, value), records it once and adds 30% to today's Cup pool | The chain |
| `pay-cup` | Pays each game's finished Cup 50/30/20 (pool plus seed) from a hot wallet | `X-Cup-Admin-Key` header |

All three are deployed with `--no-verify-jwt`: the app's publishable key isn't a JWT.

## Database

Migrations live in [migrations/](migrations/). Apply them in order, either with `supabase db push` on a linked project or by pasting each file into the dashboard SQL editor:

```bash
cat supabase/migrations/0002_tips_payouts.sql | pbcopy
cat supabase/migrations/0003_schedule_pay_cup.sql | pbcopy
```

- `0001_init.sql`: profiles, scores, tips, cups, the `cup_board` and `tip_counts` views, `record_score`.
- `0002_tips_payouts.sql`: the `payouts` table (anyone can read it) and the service-role helpers `add_to_cup_pool`, `record_tip` and `claim_cup`.
- `0003_schedule_pay_cup.sql`: the daily 00:05 UTC run.
- `0004_cup_seed.sql`: `cup_settings` (a daily seed per game, anyone can read it), `seed_today_cups()` with its 00:00:30 UTC job, and `payouts.reason`.

```bash
cat supabase/migrations/0004_cup_seed.sql | pbcopy
```

To start mainnet with no testnet data, run [scripts/reset-data.sql](../scripts/reset-data.sql) once in the SQL editor. It empties payouts, tips, cups, scores and profiles, and keeps `cup_settings`, the schema and the cron jobs. It cannot be undone.

### Schedule

The Supabase CLI has no Edge Function schedules (`config.toml` has no cron settings), so the schedule is a database job: `pg_cron` runs `net.http_post` (pg_net) against `pay-cup` every day at `5 0 * * *` UTC. The job reads two Vault secrets, which you create once in the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'nimcade_project_url');
select vault.create_secret('<the CUP_ADMIN_KEY value>', 'nimcade_cup_admin_key');
```

Check runs with `select * from cron.job_run_details order by start_time desc limit 5;` and the HTTP results with `select * from net._http_response order by created desc limit 5;`.

### Daily seed

`nimcade-seed-cups` runs `seed_today_cups()` at 00:00:30 UTC. pg_cron schedules have minute resolution, so the job starts at 00:00 and waits 30 seconds. The function gives each game a cups row for today with `seed_luna` from `cup_settings`.

- **Rows that already exist:** they keep their seed. The one exception is a row a tip created in the first seconds of the day (seed still 0, unpaid), which gets the seed too.
- **Running it again:** it sets the seed and never adds to it, so a second run changes nothing.

Seeds start at 0. Set one per game, in Luna (1 NIM = 100,000 Luna), for example 50 NIM a day for Dodge:

```sql
update public.cup_settings set daily_seed_luna = 5000000 where game_id = 'dodge';
```

The seed is paid out of the hot wallet with the pool, so keep the wallet funded for the seeds you set.

## Function secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase. Set the rest with `supabase secrets set NAME=value`:

| Secret | Used by | Value |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | submit-score, record-tip | Comma-separated app origins, e.g. the deployed URL (localhost and private networks are always allowed) |
| `NIMIQ_NETWORK` | record-tip, pay-cup | `mainnet` or `testnet` |
| `MAKER_ADDRESS` | record-tip | The address tips go to (the app's `VITE_MAKER_ADDRESS`); comma-separate several |
| `CUP_ADMIN_KEY` | pay-cup | A long random string, e.g. `openssl rand -hex 32` |
| `CUP_HOT_WALLET_SEED` | pay-cup | The hot wallet key: 64 hex characters read as a private key, or `entropy:<64 hex>` for a wallet's entropy (its first account, `m/44'/242'/0'/0'`) |
| `NIMIQ_RPC_URL` | record-tip, pay-cup | Optional. Defaults to the public server for the network (`rpc.nimiqwatch.com`, `rpc.testnet.nimiqwatch.com`) |

The seed is never logged or returned. `pay-cup` answers with the hot wallet's address so you can check which account it is.

### Hot wallet key file

Create the hot wallet once with:

```bash
node scripts/gen-hot-wallet.mjs                                   # testnet: ~/.nimcade-hot.key
node scripts/gen-hot-wallet.mjs --out ~/.nimcade-hot-mainnet.key  # mainnet
```

It generates a new key pair, writes the private key as 64 hex characters to the `--out` path (default `~/.nimcade-hot.key`, mode 600) and prints only the address. It refuses to overwrite an existing file, so it never replaces a wallet that may hold funds. It also refuses paths inside the repository, so the key can't be committed by accident.

For mainnet, set the secret from the mainnet file:

```bash
supabase secrets set NIMIQ_NETWORK=mainnet CUP_HOT_WALLET_SEED="$(cat ~/.nimcade-hot-mainnet.key)"
```

- **Set the secret from the file**, without the key touching your screen or shell history:

  ```bash
  supabase secrets set CUP_HOT_WALLET_SEED="$(cat ~/.nimcade-hot.key)"
  ```

  Then trigger a dry run and check that the `hotWallet` in the response is the printed address.
- **Never print, paste, share or commit it.** It lives in your home directory, not the project. Don't copy it into `.env`, `supabase/`, or a chat or ticket. `cat` it only inside `$(...)` as above.
- **Keep the file private.** `ls -l ~/.nimcade-hot.key` should show `-rw-------`; restore that with `chmod 600 ~/.nimcade-hot.key`.
- **Back it up offline.** Keep a copy in a password manager or on encrypted storage. Losing the file (and the secret) loses the funds in the wallet.
- **Keep the balance small.** Fund the address with roughly what the next few days of Cups pay out, and top it up as needed.
- **Rotating** after a suspected leak:
  1. Move the file aside (`mv ~/.nimcade-hot.key ~/.nimcade-hot.key.old`) and generate a new wallet.
  2. Send the remaining NIM from the old address to the new one.
  3. Set the secret again from the new file.
  4. Delete the old file once the old address is empty (`rm -P` on macOS).
- **Testnet and mainnet use the same key format.** Keep a separate key file per network: `~/.nimcade-hot.key` for testnet, `~/.nimcade-hot-mainnet.key` for mainnet. Never set the testnet key while `NIMIQ_NETWORK=mainnet`.

## Deploy

```bash
supabase link --project-ref <project-ref>
supabase functions deploy submit-score --no-verify-jwt
supabase functions deploy record-tip --no-verify-jwt
supabase functions deploy pay-cup --no-verify-jwt
```

## Payouts

`pay-cup` pays yesterday (UTC) for every game. For each one it skips a Cup that is already paid (`cups.paid_at`), has an empty pool, or has no scores. Otherwise it:

1. sets `paid_at` first, so a second run can never pay twice;
2. writes one `payouts` row per prize with status `sending` (ranks 1 to 3 by score, earlier entries win ties; each prize is rounded down to whole Luna);
3. signs each transaction locally with `@nimiq/core` (fee 0, a note like `Nimcade Daily Cup 2026-09-13 dodge #1`) and broadcasts it over JSON-RPC;
4. marks the row `sent` with its `tx_hash`, or `due` with `tx_hash` null when sending failed.

**Balance guard.** Each run reads the hot wallet balance once, before claiming anything, and draws it down game by game.

- **Short balance:** if a game's prizes add up to more than what's left, none of that game's prizes are sent. Every row is marked `due` with `reason = 'insufficient hot wallet balance'`, so nobody gets a partial payout while others wait.
- **Unreadable balance:** the run stops with HTTP 502 and claims nothing.
- **In the response:** the response includes `balanceLuna` for the run and for each game.

**Retrying.** The daily job never revisits a Cup once `paid_at` is set. After topping up the hot wallet, re-attempt a day's `due` rows by hand:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/pay-cup?retryDue=1&day=2026-09-13" \
  -H "X-Cup-Admin-Key: $CUP_ADMIN_KEY"
```

A retry works per game, all or nothing, under the same balance guard.

- **No double pays:** before resending, it searches the hot wallet's last 100 transactions for each prize (same recipient, amount and note). A prize an earlier attempt did get on chain is marked `sent` with that hash instead of being paid twice.
- **Concurrent retries:** each row moves from `due` to `sending` before it is sent, so two retries can't send the same prize.
- **Dry run:** add `dryRun=1` to see the plan first.

You can still pay a `due` row by hand: set `status = 'sent'` and the `tx_hash` afterwards. A row left at `sending` means a run stopped mid-way: check the hot wallet's history before paying it.

Trigger it by hand to test. `day` and `dryRun` work in the query string or a JSON body; a dry run plans the payouts without writing or sending anything:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/pay-cup?day=2026-09-13&dryRun=1" \
  -H "X-Cup-Admin-Key: $CUP_ADMIN_KEY"
```

## Tips

After a tip, the app posts `{ gameId, txHash, fromWallet, toWallet, amountLuna }` to `record-tip`. The function:

1. **Reads the hash.** It accepts what the wallet returned: a transaction hash, or a serialized transaction, which it hashes with `@nimiq/core`. `0x` and any letter case are fine; the RPC server itself only parses bare hex.
2. **Waits for the block.** A first lookup plus up to 5 retries over 15 seconds.
3. **Checks the transfer.** Recipient and value must match, and the transfer must be less than an hour old.
4. **Checks the sender.** It must be `fromWallet`, or a one-off HTLC that `fromWallet` funded. Nimiq Pay pays that way: the wallet funds an HTLC, which sends the payment and returns the change, so the on-chain sender is the HTLC.

If the transaction still isn't in a block, the function answers `{ ok: false, pending: true }` and the app asks once more 10 seconds later. `tips.tx_hash` is unique, so a replay changes nothing.

Every request logs one JSON line per step, under **Edge Functions → record-tip → Logs**:

- `tip`: gameId, txHash, amountLuna and the RPC server's origin
- `lookup`: each attempt, with `found`, `not found` or the RPC error
- `decision`: `recorded` (with `replay`), `pending`, or `rejected` with the reason and the mismatching field

Secrets are never logged.

To see what the function sees for a transaction:

```bash
node scripts/check-tx.mjs <tx-hash or serialized tx> testnet
```
