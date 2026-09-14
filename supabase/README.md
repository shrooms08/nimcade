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

### Schedule

The Supabase CLI has no Edge Function schedules (`config.toml` has no cron settings), so the schedule is a database job: `pg_cron` runs `net.http_post` (pg_net) against `pay-cup` every day at `5 0 * * *` UTC. The job reads two Vault secrets, which you create once in the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'nimcade_project_url');
select vault.create_secret('<the CUP_ADMIN_KEY value>', 'nimcade_cup_admin_key');
```

Check runs with `select * from cron.job_run_details order by start_time desc limit 5;` and the HTTP results with `select * from net._http_response order by created desc limit 5;`.

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
node scripts/gen-hot-wallet.mjs
```

It generates a new key pair, writes the private key as 64 hex characters to `~/.nimcade-hot.key` (mode 600, outside the repo) and prints only the address. It refuses to run if that file already exists, so it never replaces a wallet that may hold funds.

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
- **Testnet and mainnet use the same key format.** Use a separate key file for each network. Move one aside before generating the other, and keep them apart by name.

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

Pay `due` rows by hand, then set `status = 'sent'` and the `tx_hash`. A row left at `sending` means the run stopped mid-way: check the hot wallet's history before paying it.

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
