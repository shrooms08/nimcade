import { TOWER_UP_ID } from '../../games/TowerUp'
import { CoverTile } from './CoverTile'
import type { CoverProps } from './CoverTile'

/** The hanging floor on the crane, then the stacked tower below. */
const FLOORS = [
  { x: 64, y: 34, w: 64, fill: '#ffe3b3' },
  { x: 50, y: 92, w: 84, fill: '#ffd9a0' },
  { x: 42, y: 120, w: 96, fill: '#ffc06b' },
  { x: 36, y: 148, w: 108, fill: '#ffa94d' },
]

/** A crane cable, the floor it carries and a slightly uneven stack of floors with windows. */
export function TowerUpCover(props: CoverProps) {
  return (
    <CoverTile
      game={TOWER_UP_ID}
      title="Tower Up"
      hook="Drop it. Stack it. Climb."
      {...props}
      art={(
        <>
          <path d="M96 0v30" stroke="#2b1030" strokeWidth="2" opacity="0.5" />
          <rect x="88" y="26" width="16" height="6" rx="1.5" fill="#2b1030" opacity="0.5" />
          {FLOORS.map(floor => (
            <g key={floor.y}>
              <rect x={floor.x} y={floor.y} width={floor.w} height="26" rx="3" fill={floor.fill} />
              {Array.from({ length: Math.floor((floor.w - 12) / 16) }, (_, i) => (
                <rect key={i} x={floor.x + 10 + i * 16} y={floor.y + 9} width="8" height="8" rx="1" fill="#2b1030" opacity="0.26" />
              ))}
            </g>
          ))}
        </>
      )}
    />
  )
}
