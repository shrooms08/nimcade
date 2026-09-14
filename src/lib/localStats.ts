/**
 * Per-device counters kept in localStorage until a backend exists
 * (TODO(backend): plays and tips become global numbers from the API).
 * Every access is guarded: storage can be disabled inside a WebView.
 */

const KEYS = {
  plays: (gameId: string) => `nimcade:plays:${gameId}`,
  tips: (gameId: string) => `nimcade:tips:${gameId}`,
  tipsSent: 'nimcade:tips-sent',
  swipeHintSeen: 'nimcade:swipe-hint-seen',
}

function readNumber(key: string): number {
  try {
    const value = Number(localStorage.getItem(key))
    return Number.isFinite(value) ? value : 0
  }
  catch {
    return 0
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  }
  catch {
    // Storage unavailable: the count just won't survive a reload.
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  }
  catch {
    return false
  }
}

export const localStats = {
  plays: (gameId: string) => readNumber(KEYS.plays(gameId)),
  addPlay: (gameId: string) => write(KEYS.plays(gameId), String(readNumber(KEYS.plays(gameId)) + 1)),
  /** NIM this device has tipped the game's maker. */
  tips: (gameId: string) => readNumber(KEYS.tips(gameId)),
  /** NIM this device has tipped across all games. */
  tipsSent: () => readNumber(KEYS.tipsSent),
  addTip(gameId: string, nim: number) {
    write(KEYS.tips(gameId), String(readNumber(KEYS.tips(gameId)) + nim))
    write(KEYS.tipsSent, String(readNumber(KEYS.tipsSent) + nim))
  },
  /** Removes the per-game hint flags older builds stored; the cover now shows how to play. */
  forgetHintFlags() {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('nimcade:hint-seen:'))
          localStorage.removeItem(key)
      }
    }
    catch {
      // Storage unavailable: nothing to clean up.
    }
  },
  swipeHintSeen: () => readFlag(KEYS.swipeHintSeen),
  markSwipeHintSeen: () => write(KEYS.swipeHintSeen, '1'),
}

/** 11_500 -> "11.5K", 842 -> "842". */
export function compactNumber(value: number): string {
  if (value < 1000)
    return String(value)
  if (value < 1_000_000)
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}
