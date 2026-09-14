/** Shared game-feel constants for every Nimcade canvas game. */
export const SHAKE_MS = 150
export const SHAKE_PX = 4
export const POP_MS = 180
export const MAX_DPR = 2

/** A scoring pop at a point in the game's own units. */
export interface Pop {
  x: number
  y: number
  age: number
}

export function agePops<T extends { age: number }>(pops: T[], ms: number, life = POP_MS): T[] {
  return pops.map(pop => ({ ...pop, age: pop.age + ms })).filter(pop => pop.age < life)
}

/** Grows and fades over its life: scale 1 -> 2.6, alpha 1 -> 0. */
export function popLook(age: number, life = POP_MS): { scale: number; alpha: number } {
  const progress = Math.min(1, age / life)
  return { scale: 1 + progress * 1.6, alpha: 1 - progress }
}

/** Jolts the element by SHAKE_PX in a random diagonal while `msLeft` > 0. */
export function applyShake(element: HTMLElement | null, msLeft: number) {
  if (!element)
    return
  if (msLeft > 0) {
    const sx = Math.random() < 0.5 ? -SHAKE_PX : SHAKE_PX
    const sy = Math.random() < 0.5 ? -SHAKE_PX : SHAKE_PX
    element.style.transform = `translate(${sx}px, ${sy}px)`
  }
  else if (element.style.transform) {
    element.style.transform = ''
  }
}

/** Fills the whole canvas with `rgb` at `alpha`, for flashes. */
export function drawTint(ctx: CanvasRenderingContext2D, width: number, height: number, rgb: string, alpha: number) {
  if (alpha <= 0)
    return
  ctx.fillStyle = `rgba(${rgb}, ${alpha})`
  ctx.fillRect(0, 0, width, height)
}
