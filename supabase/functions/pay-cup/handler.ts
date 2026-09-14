import { isFinishedDay, payCups, previousUtcDay, sameSecret } from '../_shared/cupPayout.ts'
import type { PayCupDeps } from '../_shared/cupPayout.ts'

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
 * The pay-cup HTTP handler: POST with X-Cup-Admin-Key. Pays yesterday (UTC) by default; pass
 * `day` (YYYY-MM-DD) and `dryRun` in the query string or a JSON body to test.
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
    const now = options.now?.() ?? new Date()
    const day = query.get('day') ?? body.day ?? previousUtcDay(now)
    if (!isFinishedDay(day, now))
      return reply(400, { ok: false, error: 'day must be a finished UTC day, as YYYY-MM-DD.' })
    const dryRun = ['1', 'true'].includes(query.get('dryRun') ?? '') || body.dryRun === true

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
      const summary = await payCups(day, options.deps, { dryRun })
      return reply(200, { ok: true, dryRun, hotWallet, ...summary })
    }
    catch (error) {
      console.error('pay-cup failed', errorText(error))
      return reply(500, { ok: false, error: 'Could not pay the Cup.' })
    }
  }
}
