import { play } from '../../lib/sound'
import type { Cue } from '../../lib/sound'

/** Counters read off a world each frame; a flag is 0 or 1. */
export type CueCounts = Record<string, number>

/**
 * Plays a cue whenever one of a world's counters goes up. Games keep reporting through the
 * numbers they already track, so adding sound changes no game logic.
 */
export function createCues(rules: Record<string, Cue>) {
  let last: CueCounts = {}
  return {
    /** Takes these values as the baseline, playing nothing (a fresh round). */
    reset(values: CueCounts) {
      last = { ...values }
    },
    frame(values: CueCounts) {
      for (const [key, cue] of Object.entries(rules)) {
        if ((values[key] ?? 0) > (last[key] ?? 0))
          play(cue)
      }
      last = { ...values }
    },
  }
}
