import { useId } from 'react'
import { VOID_RUN_ID } from '../../games/VoidRun'
import { CoverTile } from './CoverTile'
import type { CoverProps } from './CoverTile'

/** A square tunnel receding to a point, a soft grey glow and the white ball. */
export function VoidRunCover(props: CoverProps) {
  const glow = useId()
  return (
    <CoverTile
      game={VOID_RUN_ID}
      title="Void Run"
      hook="Steer through the dark."
      {...props}
      art={(
        <>
          <defs>
            <radialGradient id={glow}>
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="90" cy="84" r="82" fill={`url(#${glow})`} />
          <g fill="none" stroke="#ffffff">
            <rect x="18" y="12" width="144" height="144" strokeWidth="2" opacity="0.5" />
            <rect x="46" y="40" width="88" height="88" strokeWidth="1.5" opacity="0.36" />
            <rect x="66" y="60" width="48" height="48" opacity="0.26" />
            <rect x="80" y="74" width="20" height="20" opacity="0.18" />
            <path d="M18 12L80 74M162 12L100 74M18 156L80 94M162 156L100 94" opacity="0.28" />
          </g>
          <circle cx="120" cy="122" r="9" fill="#ffffff" />
        </>
      )}
    />
  )
}
