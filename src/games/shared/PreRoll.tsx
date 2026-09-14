import type { PreRollLabel } from './usePreRoll'

/** The centred 3-2-1-GO. Each label remounts (key), so its scale-in pop replays. */
export function PreRoll({ label }: { label: PreRollLabel | null }) {
  if (!label)
    return null
  return (
    <div className="pre-roll" role="status" aria-live="assertive">
      <span key={label} className={label === 'GO' ? 'pre-roll__label is-go' : 'pre-roll__label'}>{label}</span>
    </div>
  )
}
