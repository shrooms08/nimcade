import { POP_MS } from './shared/effects'
import { spriteState } from './shared/sprites'
import type { BoardView } from './shared/useCanvasBoard'
import { sprites } from './TowerUpSprites'
import { CONFETTI_MS, FLOOR_H, GLOW_MS, LABEL_MS, STREET_H, TUMBLE_MS, windowsFor, WORLD_W } from './TowerUpWorld'
import type { Slab, World } from './TowerUpWorld'

/** Screen-space crane, in game units from the top of the canvas. */
const CRANE_Y = 8
const ARM_H = 9
const TROLLEY_W = 26
const TROLLEY_H = 8
const HOOK_W = 10
const HOOK_H = 12
const CABLE_W = 1.5

/** Clouds scroll at this fraction of the camera's speed, and drift sideways slowly. */
const CLOUD_PARALLAX = 0.35
const CLOUDS = [
  { x: 0.08, y: 70, w: 70, h: 26, drift: 6 },
  { x: 0.6, y: 230, w: 92, h: 32, drift: 4 },
  { x: 0.32, y: 400, w: 60, h: 22, drift: 8 },
]
const BIRDS_FROM_FLOOR = 30
const BIRD_PERIOD_MS = 9000
const BIRD_FLIGHT_MS = 4500
const MARKER_EVERY = 10
const MARKER_W = 26
const MARKER_H = 16
const LABEL_W = 180
const LABEL_H = 14
const CONFETTI_SIZE = 3

/** Game units visible top to bottom for a canvas of this size. */
export const unitsTall = (view: BoardView) => (view.width ? view.height / (view.width / WORLD_W) : 600)

const wrap = (value: number, span: number) => ((value % span) + span) % span

export function drawTowerUp(ctx: CanvasRenderingContext2D, view: BoardView, world: World) {
  const k = view.width / WORLD_W
  const viewH = view.height / k
  const base = spriteState(world.clock)
  /** World y (up from the street) to canvas px (down from the top). */
  const screenY = (worldY: number) => (viewH - STREET_H - (worldY - world.camera)) * k
  const floorBox = (slab: Slab, bottom: number) => [slab.x * k, screenY(bottom + FLOOR_H), slab.w * k, FLOOR_H * k] as const
  const visible = (bottom: number) => screenY(bottom) >= -FLOOR_H * k && screenY(bottom + FLOOR_H) <= view.height

  // Sky, then clouds that scroll slower than the camera, then birds high up.
  sprites.sky(ctx, 0, 0, view.width, view.height, { ...base, count: world.floors })
  for (const cloud of CLOUDS) {
    const y = wrap(cloud.y + world.camera * CLOUD_PARALLAX, viewH + cloud.h * 2) - cloud.h
    const x = wrap(cloud.x * WORLD_W + (world.clock / 1000) * cloud.drift, WORLD_W + cloud.w) - cloud.w
    sprites.cloud(ctx, x * k, y * k, cloud.w * k, cloud.h * k, base)
  }
  if (world.floors >= BIRDS_FROM_FLOOR && world.clock % BIRD_PERIOD_MS < BIRD_FLIGHT_MS) {
    const flight = Math.floor(world.clock / BIRD_PERIOD_MS)
    const progress = (world.clock % BIRD_PERIOD_MS) / BIRD_FLIGHT_MS
    const leftward = flight % 2 === 1
    const y = 40 + ((flight * 53) % 110)
    for (let i = 0; i < 2; i++) {
      const x = -24 + (WORLD_W + 48) * (leftward ? 1 - progress : progress) - i * 16
      sprites.bird(ctx, x * k, (y + i * 9) * k, 10 * k, 10 * k, { ...base, time: world.clock + i * 80 })
    }
  }

  // Street, slab, floors.
  sprites.street(ctx, 0, screenY(0), view.width, STREET_H * k + 2, base)
  sprites.slab(ctx, ...floorBox(world.stack[0], 0), base)
  const settle = world.pops[world.pops.length - 1]
  for (let level = 1; level < world.stack.length; level++) {
    const bottom = level * FLOOR_H
    if (!visible(bottom))
      continue
    const top = level === world.stack.length - 1
    const slab = world.stack[level]
    sprites.floor(ctx, ...floorBox(slab, bottom), {
      ...base,
      variant: level % 2,
      count: windowsFor(slab.w),
      glow: top ? world.glow / GLOW_MS : 0,
      scale: top && settle ? 1 + 0.12 * (1 - Math.min(1, settle.age / POP_MS)) : 1,
    })
  }
  for (let level = MARKER_EVERY; level < world.stack.length; level += MARKER_EVERY) {
    const bottom = level * FLOOR_H
    if (visible(bottom)) {
      const x = Math.max(2, world.stack[level].x * k - MARKER_W * k - 3)
      sprites.marker(ctx, x, screenY(bottom + FLOOR_H), MARKER_W * k, MARKER_H * k, { ...base, count: level })
    }
  }
  for (const piece of world.debris)
    sprites.floor(ctx, ...floorBox(piece, piece.bottom), { ...base, variant: piece.variant, count: windowsFor(piece.w), alpha: 0.85 })

  // Crane: arm across the top, trolley over the floor, cable down to the hook.
  const { load } = world
  const armBottom = (CRANE_Y + ARM_H) * k
  sprites.craneArm(ctx, 0, CRANE_Y * k, view.width, ARM_H * k, base)
  const centre = (load.x + load.w / 2) * k
  sprites.trolley(ctx, centre - (TROLLEY_W * k) / 2, armBottom, TROLLEY_W * k, TROLLEY_H * k, base)
  const hookTop = screenY(load.hookTop ?? load.bottom + FLOOR_H) - HOOK_H * k
  const cableTop = armBottom + TROLLEY_H * k
  if (hookTop > cableTop)
    sprites.cable(ctx, centre - (CABLE_W * k) / 2, cableTop, CABLE_W * k, hookTop - cableTop, base)
  sprites.hook(ctx, centre - (HOOK_W * k) / 2, Math.max(cableTop, hookTop), HOOK_W * k, HOOK_H * k, base)
  if (world.status !== 'missed')
    sprites.floor(ctx, ...floorBox(load, load.bottom), { ...base, variant: world.stack.length % 2, count: windowsFor(load.w) })

  // A missed floor tumbles away with a slight rotation.
  const { tumble } = world
  if (tumble) {
    const [x, y, w, h] = floorBox(tumble, tumble.bottom)
    ctx.save()
    ctx.translate(x + w / 2, y + h / 2)
    ctx.rotate(tumble.angle)
    sprites.floor(ctx, -w / 2, -h / 2, w, h, { ...base, variant: tumble.variant, count: windowsFor(tumble.w), alpha: 1 - 0.3 * Math.min(1, tumble.age / TUMBLE_MS) })
    ctx.restore()
  }

  for (const bit of world.confetti) {
    const alpha = 1 - bit.age / CONFETTI_MS
    sprites.confetti(ctx, bit.x * k, screenY(bit.y), CONFETTI_SIZE * k, CONFETTI_SIZE * k, { ...base, variant: bit.variant, alpha })
  }
  for (const label of world.labels) {
    const progress = label.age / LABEL_MS
    const scale = 1 + 0.35 * Math.max(0, 1 - label.age / 140)
    const y = screenY(label.y) - progress * 18 * k
    sprites.perfect(ctx, (label.x - LABEL_W / 2) * k, y, LABEL_W * k, LABEL_H * k, { ...base, count: label.bonus, scale, alpha: 1 - progress ** 2 })
  }
}
