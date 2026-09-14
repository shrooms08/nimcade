const KEY_PREFIX = 'nimcade:best:'

/**
 * Best scores are per-device and local-only in Phase 1: no backend, no
 * leaderboard. localStorage can throw inside a WebView with storage disabled,
 * so every access is guarded.
 */
export function readBest(gameId: string): number {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + gameId)
    const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : 0
  }
  catch {
    return 0
  }
}

export function writeBest(gameId: string, score: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + gameId, String(score))
  }
  catch {
    // Storage unavailable: the session still plays, the best score just
    // does not survive a reload.
  }
}
