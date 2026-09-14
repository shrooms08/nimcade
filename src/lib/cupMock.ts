/**
 * Daily Cup data.
 *
 * TODO(backend): everything here is MOCK data from the design prototype. Replace
 * `cupSource` with an API-backed implementation of `CupDataSource`; the Cup and
 * wallet sheets only depend on the interfaces below.
 */

export interface CupEntry {
  rank: number
  /** A short address ("NQ21…9KC4") or a name. */
  name: string
  score: number
  /** NIM won by this rank, or null outside the prize zone. */
  prizeNim: number | null
}

export interface CupStanding {
  /** Null until the player has a score for this game. */
  rank: number | null
  score: number
  /** Points still needed to reach the last prize rank, null when already there or unranked. */
  toPrizeZone: number | null
}

export interface CupSnapshot {
  gameId: string
  prizePoolNim: number
  /** Epoch ms when this Cup closes (next 00:00 UTC). */
  resetsAt: number
  top: CupEntry[]
  you: CupStanding
}

export interface CupPlayer {
  bestScore: number
  address: string | null
}

export interface CupDataSource {
  getSnapshot: (gameId: string, player: CupPlayer) => Promise<CupSnapshot>
  /** Total NIM this wallet has won in past Cups. */
  getWinnings: (address: string | null) => Promise<number>
}

/** The next 00:00 UTC after `now`. */
export function nextUtcMidnight(now = Date.now()): number {
  const day = 86_400_000
  return Math.floor(now / day) * day + day
}

const PRIZES_NIM = [500, 300, 150]

const MOCK_BOARDS: Record<string, [string, number][]> = {
  'dot-rush': [['NQ21…9KC4', 4180], ['bauer.nim', 3905], ['NQ44…LM02', 3710], ['NQ58…3PX9', 3402], ['lena.nim', 3188], ['NQ07…QQ55', 2940], ['NQ93…7TF1', 2715], ['koto.nim', 2602], ['NQ12…8BD3', 2410], ['NQ66…X1V8', 2240]],
  'tower-up': [['mira.nim', 1920], ['NQ84…2RT7', 1804], ['NQ19…KD40', 1755], ['solly.nim', 1610], ['NQ73…9AA1', 1502], ['NQ05…PL88', 1440], ['dax.nim', 1377], ['NQ61…VV20', 1290], ['NQ38…6HJ5', 1204], ['NQ90…QW14', 1150]],
  'the-void': [['NQ11…ZZ01', 7420], ['nova.nim', 7180], ['NQ47…8KK2', 6905], ['NQ22…3DL9', 6540], ['rin.nim', 6210], ['NQ80…5MN4', 5980], ['NQ03…7YT8', 5740], ['aleph.nim', 5520], ['NQ55…1QQ6', 5301], ['NQ29…4WB0', 5120]],
  'flip-dodge': [['NQ76…0PL3', 980], ['juno.nim', 940], ['NQ14…8SD1', 905], ['NQ62…2KK7', 870], ['pim.nim', 822], ['NQ33…9LL4', 790], ['NQ08…5TT2', 744], ['vesna.nim', 710], ['NQ91…3CC8', 688], ['NQ50…6RR1', 651]],
  'tap-tempo': [['tempo.nim', 3320], ['NQ27…4BB9', 3180], ['NQ69…B17D', 3044], ['NQ13…7FF2', 2905], ['oke.nim', 2810], ['NQ44…1NN5', 2702], ['NQ86…9GG3', 2640], ['sora.nim', 2588], ['NQ02…8HH7', 2510], ['NQ71…5JJ0', 2455]],
}

const MOCK_POOLS_NIM: Record<string, number> = {
  'dot-rush': 1250, 'tower-up': 980, 'the-void': 2400, 'flip-dodge': 640, 'tap-tempo': 1780,
}

const MOCK_WINNINGS_NIM = 300

export const mockCupSource: CupDataSource = {
  async getSnapshot(gameId, player) {
    const board = MOCK_BOARDS[gameId] ?? []
    const top = board.map(([name, score], i) => ({ rank: i + 1, name, score, prizeNim: PRIZES_NIM[i] ?? null }))
    const lastPrize = top[PRIZES_NIM.length - 1]
    const ranked = player.bestScore > 0
    const rank = ranked ? top.filter(entry => entry.score > player.bestScore).length + 1 : null
    return {
      gameId,
      prizePoolNim: MOCK_POOLS_NIM[gameId] ?? 0,
      resetsAt: nextUtcMidnight(),
      top,
      you: {
        rank,
        score: player.bestScore,
        toPrizeZone: ranked && lastPrize && player.bestScore <= lastPrize.score ? lastPrize.score - player.bestScore + 1 : null,
      },
    }
  },
  async getWinnings(address) {
    return address ? MOCK_WINNINGS_NIM : 0
  },
}

/** TODO(backend): point this at the real Cup API. */
export const cupSource: CupDataSource = mockCupSource
