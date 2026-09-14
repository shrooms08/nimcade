import { FLIP_DODGE_ID } from '../../games/FlipDodge'
import { CoverTile } from './CoverTile'
import type { CoverProps } from './CoverTile'

/** Two lanes split by a dashed line, barriers in each, the runner about to flip. */
export function FlipDodgeCover(props: CoverProps) {
  return (
    <CoverTile
      game={FLIP_DODGE_ID}
      title="Flip Dodge"
      hook="Two lanes. No mercy."
      {...props}
      art={(
        <>
          <rect x="40" y="0" width="100" height="176" fill="#063836" opacity="0.55" />
          <path d="M40 0v176M140 0v176" stroke="#5ff2e4" strokeWidth="3" opacity="0.7" />
          <path d="M90 0v176" stroke="#5ff2e4" strokeWidth="2" strokeDasharray="10 10" opacity="0.45" />
          <rect x="100" y="30" width="32" height="10" rx="3" fill="#ff5d8f" />
          <rect x="48" y="78" width="32" height="10" rx="3" fill="#ff5d8f" />
          <circle cx="116" cy="134" r="10" fill="#ffffff" />
          <path d="M96 134H70m0 0l7-7m-7 7l7 7" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </>
      )}
    />
  )
}
