import { TAP_SPEED_ID } from '../../games/TapSpeed'
import { CoverTile } from './CoverTile'
import type { CoverProps } from './CoverTile'

/** A tap point with ripples spreading out from it. */
export function TapSpeedCover(props: CoverProps) {
  return (
    <CoverTile
      game={TAP_SPEED_ID}
      title="Tap Speed"
      hook="How fast can you tap?"
      {...props}
      art={(
        <>
          {[66, 48, 31].map((r, i) => (
            <circle key={r} cx="90" cy="88" r={r} fill="none" stroke="#171100" strokeWidth="3" opacity={0.16 + i * 0.2} />
          ))}
          <circle cx="90" cy="88" r="15" fill="#171100" />
        </>
      )}
    />
  )
}
