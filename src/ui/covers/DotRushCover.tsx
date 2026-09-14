import { DOT_RUSH_ID } from '../../games/DotRush'
import { CoverTile } from './CoverTile'
import type { CoverProps } from './CoverTile'

const DOTS = [
  [40, 39], [76, 39], [92, 39], [108, 39], [40, 56], [40, 72], [76, 72], [92, 72], [108, 72], [140, 72],
  [76, 104], [92, 104], [108, 104], [140, 104], [140, 120], [76, 137], [104, 137], [140, 137],
]

/** Maze walls, a trail of dots, the player block and a red chaser star. */
export function DotRushCover(props: CoverProps) {
  return (
    <CoverTile
      game={DOT_RUSH_ID}
      title="Dot Rush"
      hook="Eat. Dodge. Survive."
      {...props}
      art={(
        <>
          <g fill="none" stroke="#4f6bff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="22" y="22" width="136" height="132" rx="10" />
            <path d="M58 22v34M122 154v-34M22 88h40M118 88h40M86 56h36M58 120h36" />
          </g>
          <g fill="#3be3e0">
            {DOTS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" />)}
          </g>
          <rect x="34" y="128" width="13" height="13" rx="2.5" fill="#3be3e0" />
          <path d="M140 38l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#ff4d6d" />
        </>
      )}
    />
  )
}
