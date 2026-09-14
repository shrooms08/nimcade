import { allowedOrigin } from '../_shared/cors.ts'
import { handleSubmission } from '../_shared/submitScore.ts'
import type { SubmitDeps } from '../_shared/submitScore.ts'

export interface SubmitScoreOptions {
  verifier: SubmitDeps['verifier']
  store: Pick<SubmitDeps, 'recordScore' | 'rankOf'>
  /** Base CORS headers (from @supabase/supabase-js/cors); the origin is set per request. */
  corsHeaders: Record<string, string>
  /** The ALLOWED_ORIGINS secret. */
  allowedOrigins?: string
  now?: () => Date
}

/** The submit-score HTTP handler. index.ts wires in the real verifier, database and headers. */
export function createSubmitScoreHandler(options: SubmitScoreOptions) {
  return async (req: Request): Promise<Response> => {
    const requestOrigin = req.headers.get('origin')
    const origin = allowedOrigin(requestOrigin, options.allowedOrigins)
    const headers: Record<string, string> = { ...options.corsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' }
    delete headers['Access-Control-Allow-Origin']
    if (origin)
      headers['Access-Control-Allow-Origin'] = origin
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })

    // Browsers always send Origin; server-to-server calls (no Origin) are judged by the signature alone.
    if (requestOrigin && !origin)
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
      const result = await handleSubmission(body, { verifier: options.verifier, now: options.now ?? (() => new Date()), ...options.store })
      return reply(result.status, result.body)
    }
    catch (error) {
      console.error('submit-score failed', error)
      return reply(500, { ok: false, error: 'Could not record the score.' })
    }
  }
}
