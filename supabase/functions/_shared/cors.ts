/** Local and private-network dev servers (localhost, 127.0.0.1, 10.x, 172.16-31.x, 192.168.x), any port. */
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/

/**
 * The origin to echo in Access-Control-Allow-Origin, or null when it isn't allowed.
 * `configured` is the ALLOWED_ORIGINS secret: comma-separated, e.g. "https://nimcade.vercel.app".
 */
export function allowedOrigin(origin: string | null, configured: string | undefined): string | null {
  if (!origin)
    return null
  const listed = (configured ?? '').split(',').map(entry => entry.trim().replace(/\/$/, '')).filter(Boolean)
  return DEV_ORIGIN.test(origin) || listed.includes(origin) ? origin : null
}
