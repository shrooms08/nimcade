/** "NQ69 AB12 … B17D" or "NQ69AB12…B17D" -> "NQ69…B17D", as in the prototype. */
export function shortAddress(address: string): string {
  const compact = address.replace(/\s+/g, '')
  return compact.length <= 10 ? compact : `${compact.slice(0, 4)}…${compact.slice(-4)}`
}

/** The wallet chip's label: just the address tail ("…B17D"), so the chip never runs into the centred segment. */
export function chipAddress(address: string): string {
  return `…${address.replace(/\s+/g, '').slice(-4)}`
}

/** A transaction hash shortened for display. */
export function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash
}

/** "Nimcade" -> "@nimcade". */
export function makerHandle(maker: string): string {
  return maker.startsWith('@') ? maker : `@${maker.toLowerCase().replace(/\s+/g, '')}`
}

/** NIM with at most two decimals and grouping: 1234.5 -> "1,234.5". */
export function formatNim(nim: number): string {
  return nim.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
