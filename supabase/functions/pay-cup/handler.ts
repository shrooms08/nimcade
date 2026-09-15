import { isFinishedDay, previousUtcDay, sameSecret } from '../_shared/cupPayout.ts'
import { BalanceUnavailableError, payCups } from '../_shared/payCups.ts'
import type { PayCupDeps } from '../_shared/payCups.ts'

export interface PayCupOptions {
  /** The CUP_ADMIN_KEY secret; requests must send it as X-Cup-Admin-Key. */
  adminKey: string | undefined
  deps: PayCupDeps
  /** The hot wallet's address; throws (without the key in the message) when the key is missing or unreadable. */
  hotWalletAddress: () => string
  now?: () => Date
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * The pay-cup HTTP handler: POST with X-Cup-Admin-Key. Pays yesterday (UTC) by default. In the
 * query string or a JSON body: `day` (YYYY-MM-DD), `dryRun` to plan without writing or sending,
 * and `retryDue` to re-attempt that day's 'due' payouts.
 */
export function createPayCupHandler(options: PayCupOptions) {
  return async (req: Request): Promise<Response> => {
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

    if (req.method !== 'POST')
      return reply(405, { ok: false, error: 'Use POST.' })
    if (!options.adminKey)
      return reply(500, { ok: false, error: 'CUP_ADMIN_KEY is not set.' })
    if (!sameSecret(req.headers.get('x-cup-admin-key'), options.adminKey))
      return reply(401, { ok: false, error: 'Missing or wrong X-Cup-Admin-Key.' })

    let body: Record<string, unknown> = {}
    const text = await req.text()
    if (text.trim()) {
      try {
        const parsed: unknown = JSON.parse(text)
        if (parsed !== null && typeof parsed === 'object')
          body = parsed as Record<string, unknown>
      }
      catch {
        return reply(400, { ok: false, error: 'Expected a JSON body.' })
      }
    }
    const query = new URL(req.url).searchParams
    const flag = (name: string) => ['1', 'true'].includes(query.get(name) ?? '') || body[name] === true
    const now = options.now?.() ?? new Date()
    const day = query.get('day') ?? body.day ?? previousUtcDay(now)
    if (!isFinishedDay(day, now))
      return reply(400, { ok: false, error: 'day must be a finished UTC day, as YYYY-MM-DD.' })
    const dryRun = flag('dryRun')
    const retryDue = flag('retryDue')

    let hotWallet: string | null = null
    try {
      hotWallet = options.hotWalletAddress()
    }
    catch (error) {
      // Nothing is claimed without a usable key, so the next run can still pay.
      if (!dryRun)
        return reply(500, { ok: false, error: errorText(error) })
    }

    try {
      const summary = await payCups(day, options.deps, { dryRun, retryDue })
      return reply(200, { ok: true, dryRun, retryDue, hotWallet, ...summary })
    }
    catch (error) {
      if (error instanceof BalanceUnavailableError)
        return reply(502, { ok: false, hotWallet, error: error.message })
      console.error('pay-cup failed', errorText(error))
      return reply(500, { ok: false, error: 'Could not pay the Cup.' })
    }
  }
}
