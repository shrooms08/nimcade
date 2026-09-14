import { useCallback, useEffect, useRef, useState } from 'react'
import type { NimiqProvider, SignatureResult } from '@nimiq/mini-app-sdk'
import { buildScoreMessage, utcDay } from '../../supabase/functions/_shared/scoreMessage.ts'
import { getDeviceId } from './deviceId'
import { toMessage, unwrap } from './nimiq'
import { getName } from './profile'
import { backendOn, supabase } from './supabase'

/** Where the finished round stands in today's Cup, for the game over rank line. */
export type CupEntryState =
  /** The live Cup is off (mock mode or no Supabase config). */
  | { kind: 'off' }
  | { kind: 'needs-wallet' }
  | { kind: 'entering' }
  | { kind: 'entered'; rank: number | null; best: number }
  /** Declined signing or consent, or the submission failed. Never blocks Play again. */
  | { kind: 'not-entered' }

/** Signs the score with the wallet and submits it; resolves with the rank and the day's best. */
export async function enterCup({ provider, gameId, score, wallet }: { provider: NimiqProvider; gameId: string; score: number; wallet: string }) {
  if (!supabase)
    throw new Error('The Daily Cup is not configured.')
  const day = utcDay()
  const deviceId = await getDeviceId()
  const message = buildScoreMessage({ gameId, day, score, deviceId })
  const signed = unwrap<SignatureResult>(await provider.sign(message))
  const { data, error } = await supabase.functions.invoke('submit-score', {
    body: { gameId, day, score, wallet, deviceId, name: getName(), message, signature: signed.signature, publicKey: signed.publicKey },
  })
  if (error)
    throw error
  if (!data?.ok)
    throw new Error(data?.error ?? 'The score was not accepted.')
  return { rank: typeof data.rank === 'number' ? data.rank : null, best: Number(data.best) }
}

/**
 * Enters each finished round into the Cup: straight away when a wallet is connected, otherwise
 * once the player connects while that round's game over is still on screen.
 */
export function useCupEntry({ connected, address, getProvider, gameOver }: {
  connected: boolean
  address: string | null
  getProvider: () => Promise<NimiqProvider | null>
  gameOver: { gameId: string; info: { score: number } } | null
}) {
  const [entry, setEntry] = useState<CupEntryState>({ kind: 'off' })
  /** Bumped per round, so a late answer for an earlier round can't overwrite the current one. */
  const runRef = useRef(0)

  const submit = useCallback(async (gameId: string, score: number, wallet: string) => {
    const run = ++runRef.current
    try {
      const provider = await getProvider()
      if (run === runRef.current)
        setEntry({ kind: 'entering' })
      if (!provider)
        throw new Error('No wallet provider.')
      const result = await enterCup({ provider, gameId, score, wallet })
      if (run === runRef.current)
        setEntry({ kind: 'entered', ...result })
    }
    catch (error) {
      if (run === runRef.current)
        setEntry({ kind: 'not-entered' })
      if (import.meta.env.DEV)
        console.info(`[cup] not entered: ${toMessage(error)}`)
    }
  }, [getProvider])

  /** Call when a round ends. */
  const roundEnded = useCallback((gameId: string, score: number) => {
    runRef.current++
    if (!backendOn)
      setEntry({ kind: 'off' })
    else if (connected && address)
      void submit(gameId, score, address)
    else
      setEntry({ kind: 'needs-wallet' })
  }, [address, connected, submit])

  // Connected after "Connect to enter the Cup": enter the round that is still on screen.
  useEffect(() => {
    if (entry.kind !== 'needs-wallet' || !connected || !address || !gameOver)
      return
    const timer = window.setTimeout(() => void submit(gameOver.gameId, gameOver.info.score, address), 0)
    return () => window.clearTimeout(timer)
  }, [address, connected, entry.kind, gameOver, submit])

  return { entry, roundEnded }
}
