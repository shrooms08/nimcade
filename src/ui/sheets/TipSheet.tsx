import { useState } from 'react'
import type { Game } from '../../games/types'
import { toMessage } from '../../lib/nimiq'
import { DEFAULT_TIP_NIM, TIP_PRESETS_NIM } from '../../lib/tip'
import type { TipAmount } from '../../lib/tip'
import { Coin } from '../components/Coin'
import { Sheet } from '../components/Sheet'
import { makerHandle } from '../format'

type TipState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'failed'; message: string }

/** Pick 1 / 5 / 10 NIM and send it to the game's maker. The sheet stays open if sending fails. */
export function TipSheet({
  game,
  tipsSoFar,
  onSend,
  onSent,
  onClose,
}: {
  game: Game
  /** NIM tipped to this game so far (TODO(backend): global total; per device for now). */
  tipsSoFar: number
  /** Sends through the wallet and resolves with the transaction hash; rejects with the wallet's error. */
  onSend: (amount: TipAmount) => Promise<string>
  onSent: (amount: TipAmount, hash: string) => void
  onClose: () => void
}) {
  const [amount, setAmount] = useState<TipAmount>(DEFAULT_TIP_NIM)
  const [state, setState] = useState<TipState>({ kind: 'idle' })
  const sending = state.kind === 'sending'
  const handle = makerHandle(game.maker)

  const send = async () => {
    if (sending)
      return
    setState({ kind: 'sending' })
    try {
      const hash = await onSend(amount)
      onSent(amount, hash)
    }
    catch (error) {
      // A rejected wallet dialog lands here as a normal error; the sheet stays open.
      setState({ kind: 'failed', message: toMessage(error) })
    }
  }

  return (
    <Sheet label={`Tip ${handle}`} onClose={() => { if (!sending) onClose() }}>
      <div className="nc-sheet__head">
        <h2 className="nc-sheet__title">Tip {handle}</h2>
        <p className="nc-sheet__sub">for {game.title} · {tipsSoFar.toLocaleString()} NIM tipped so far</p>
      </div>
      <div className="nc-tip-amounts" role="radiogroup" aria-label="Tip amount">
        {TIP_PRESETS_NIM.map(value => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === amount}
            className={value === amount ? 'nc-tip-amount is-on' : 'nc-tip-amount'}
            onClick={() => setAmount(value)}
            disabled={sending}
          >
            {value} NIM
          </button>
        ))}
      </div>
      {state.kind === 'failed' && (
        <p className="nc-tip-error" role="alert">Couldn't send: {state.message} Try again.</p>
      )}
      {state.kind === 'idle' && (
        <p className="nc-tip-note"><Coin size={14} />feeless, instant</p>
      )}
      <button
        type="button"
        className={sending ? 'nc-btn nc-btn--gold nc-btn--cta nc-btn--busy' : 'nc-btn nc-btn--gold nc-btn--cta'}
        onClick={send}
        aria-busy={sending}
      >
        {sending && <span className="nc-spinner" aria-hidden="true" />}
        {sending ? 'Sending…' : state.kind === 'failed' ? 'Try again' : 'Send tip'}
      </button>
    </Sheet>
  )
}
