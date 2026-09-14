import { corsFor } from '../_shared/http.ts'
import { handleTip } from '../_shared/recordTip.ts'
import type { RecordTipDeps } from '../_shared/recordTip.ts'

export interface RecordTipOptions {
  deps: RecordTipDeps
  /** Base CORS headers (from @supabase/supabase-js/cors); the origin is set per request. */
  corsHeaders: Record<string, string>
  /** The ALLOWED_ORIGINS secret. */
  allowedOrigins?: string
}

/** The record-tip HTTP handler. index.ts wires in the RPC client, database and headers. */
export function createRecordTipHandler(options: RecordTipOptions) {
  return async (req: Request): Promise<Response> => {
    const { headers, refused, reply } = corsFor(req, options.corsHeaders, options.allowedOrigins)

    // Server-to-server calls (no Origin) are judged by the chain alone.
    if (refused)
      return reply(403, { ok: false, error: 'Origin not allowed.' })
    if (req.method === 'OPTIONS')
      return new Response('ok', { headers })
    if (req.method !== 'POST')
      return reply(405, { ok: false, error: 'Use POST.' })

    let body: unknown
    try {
      body = await req.json()
    }
    catch {
      return reply(400, { ok: false, error: 'Expected a JSON body.' })
    }
    try {
      const result = await handleTip(body, options.deps)
      return reply(result.status, result.body)
    }
    catch (error) {
      console.error('record-tip failed', error)
      return reply(500, { ok: false, error: 'Could not record the tip.' })
    }
  }
}
