import { allowedOrigin } from './cors.ts'

/**
 * CORS for the browser-facing functions: the base headers from @supabase/supabase-js/cors, the
 * request's origin echoed back only when it is allowed, and a JSON reply helper.
 */
export function corsFor(req: Request, corsHeaders: Record<string, string>, allowedOrigins: string | undefined) {
  const requestOrigin = req.headers.get('origin')
  const origin = allowedOrigin(requestOrigin, allowedOrigins)
  const headers: Record<string, string> = { ...corsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' }
  delete headers['Access-Control-Allow-Origin']
  if (origin)
    headers['Access-Control-Allow-Origin'] = origin
  return {
    headers,
    /** Browsers always send Origin; a present but unlisted one is refused. */
    refused: requestOrigin !== null && origin === null,
    reply: (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } }),
  }
}
