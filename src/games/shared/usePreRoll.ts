import { useCallback, useEffect, useRef, useState } from 'react'
import { play } from '../../lib/sound'

/** Shown in order, PRE_ROLL_STEP_MS each; the action starts once GO has had its turn. */
export const PRE_ROLL_STEPS = ['3', '2', '1', 'GO'] as const
export const PRE_ROLL_STEP_MS = 600
export type PreRollLabel = (typeof PRE_ROLL_STEPS)[number]

/**
 * A 3-2-1-GO countdown between a game's first input and its action. `start`
 * runs it and calls `onDone` at the end; `cancel` stops it without calling
 * `onDone` (the card left play). The game keeps rendering its ready state
 * meanwhile and decides which input, if any, it still accepts.
 */
export function usePreRoll(onDone: () => void) {
  const [label, setLabel] = useState<PreRollLabel | null>(null)
  const timerRef = useRef<number | null>(null)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  })

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    clearTimer()
    setLabel(null)
  }, [clearTimer])

  const start = useCallback(() => {
    clearTimer()
    function show(index: number) {
      setLabel(PRE_ROLL_STEPS[index])
      play(index === PRE_ROLL_STEPS.length - 1 ? 'countdown-go' : 'countdown-beep')
      timerRef.current = window.setTimeout(() => {
        if (index + 1 < PRE_ROLL_STEPS.length) {
          show(index + 1)
          return
        }
        timerRef.current = null
        setLabel(null)
        onDoneRef.current()
      }, PRE_ROLL_STEP_MS)
    }
    show(0)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  return { label, running: label !== null, start, cancel }
}
