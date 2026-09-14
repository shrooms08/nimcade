/**
 * Geometry of the Nimcade app icon in a 512 box: a black rounded square (22% radius)
 * with the double chevron from wordmark option B. Each chevron keeps the wordmark
 * glyph's proportions (45 degree arms, square caps, stroke 22.5% of its width); the
 * stroke is 12% of the icon and the apexes sit two strokes apart, as in the UI kit.
 * The component and `npm run icons` both draw from these numbers.
 */
export const ICON_SIZE = 512
export const ICON_RADIUS = Math.round(ICON_SIZE * 0.22)
export const CHEVRON_GREY = '#8A8A90'

const STROKE = ICON_SIZE * 0.12
const WIDTH = STROKE / 0.225
const STEP = STROKE * 2
/** How far a square-capped 45 degree stroke's outline reaches past its centreline, on each axis. */
const CAP = (STROKE / 2) * Math.SQRT2

const round = (n: number) => Math.round(n * 100) / 100

/** Outline of one chevron stroke (M arm-left, apex, arm-right) as polygon points. */
function outline(apexY: number): string {
  const cx = ICON_SIZE / 2
  const half = WIDTH / 2
  return [
    [cx - half - CAP, apexY + half],
    [cx, apexY - CAP],
    [cx + half + CAP, apexY + half],
    [cx + half, apexY + half + CAP],
    [cx, apexY + CAP],
    [cx - half, apexY + half + CAP],
  ].map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
}

/** Both chevrons, centred vertically as a group. */
const firstApex = (ICON_SIZE - (STEP + WIDTH / 2 + 2 * CAP)) / 2 + CAP

export const CHEVRON_TOP = outline(firstApex)
export const CHEVRON_BOTTOM = outline(firstApex + STEP)

/** Square box around both chevrons (x = y), for the mono glyph without the square. */
export const GLYPH_BOX = { origin: round(ICON_SIZE / 2 - (WIDTH / 2 + CAP)), size: round(WIDTH + 2 * CAP) }
