import { toggleMuted } from '../../lib/sound'
import { useMuted } from '../../lib/useMuted'
import { SoundOffIcon, SoundOnIcon } from './icons'

/** Speaker toggle. Reads the sound store directly, so it needs no props from the card or App. */
export function MuteButton({ className, tabIndex = 0 }: { className: string; tabIndex?: number }) {
  const muted = useMuted()
  return (
    <button
      type="button"
      className={className}
      onClick={() => toggleMuted()}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      tabIndex={tabIndex}
    >
      {muted ? <SoundOffIcon /> : <SoundOnIcon />}
    </button>
  )
}
