import { CHEVRON_BOTTOM, CHEVRON_GREY, CHEVRON_TOP, ICON_RADIUS, ICON_SIZE } from './chevron'

/** The Nimcade app icon: a black rounded square with the double chevron (wordmark option B's glyph). */
export function NimcadeIcon({
  size,
  className,
  squareClassName,
  glyphClassName,
}: {
  size?: number
  className?: string
  /** Hooks for animating the square and the chevrons separately, as the splash does. */
  squareClassName?: string
  glyphClassName?: string
}) {
  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} aria-hidden="true">
      <rect className={squareClassName} width={ICON_SIZE} height={ICON_SIZE} rx={ICON_RADIUS} fill="#000000" />
      <g className={glyphClassName}>
        <polygon points={CHEVRON_BOTTOM} fill={CHEVRON_GREY} />
        <polygon points={CHEVRON_TOP} fill="#FFFFFF" />
      </g>
    </svg>
  )
}
