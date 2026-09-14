import { createContext, useContext } from 'react'

export interface RoundReport {
  /** One line on why the round ended, e.g. "Caught!". */
  reason: string
  score: number
  /** Best including this round (the card works out whether it is new). */
  best: number
}

/**
 * Provided by the feed card. When a game's round ends, its EndPanel reports
 * the result here and the card draws the game-over overlay over the whole card.
 */
export const RoundReportContext = createContext<(report: RoundReport) => void>(() => {})

export const useRoundReporter = () => useContext(RoundReportContext)
