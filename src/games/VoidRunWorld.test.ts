import { describe, expect, it } from 'vitest'
import { createWorld, GATE_POINTS, GRID, MAX_MULT10, START_SHIELDS, step } from './VoidRunWorld'
import type { World } from './VoidRunWorld'

/** A gate right at the camera: resolves on the next step. */
const gateAtCamera = (solid: boolean) => ({ depth: 0.0001, solid: new Array<boolean>(GRID * GRID).fill(solid) })

/** Runs one step with only the given gate in the tunnel (drops anything the step spawned before). */
function pass(world: World, solid = false) {
  world.gates = [gateAtCamera(solid)]
  step(world, 0.01)
}

function playing(): World {
  const world = createWorld()
  world.status = 'playing'
  return world
}

describe('Void Run multiplier', () => {
  it('grows by 0.1 per clean gate and stops at x5.0', () => {
    const world = playing()
    let highest = world.mult10
    for (let i = 0; i < 80; i++) {
      pass(world)
      highest = Math.max(highest, world.mult10)
    }
    expect(world.passes).toBe(80)
    expect(MAX_MULT10).toBe(50)
    expect(highest).toBe(MAX_MULT10)
    expect(world.mult10).toBe(MAX_MULT10)
  })

  it('scores a clean gate at the capped multiplier and stays capped', () => {
    const world = playing()
    world.mult10 = MAX_MULT10
    const before = world.score
    pass(world)
    expect(world.score - before).toBe(GATE_POINTS * 5)
    expect(world.mult10).toBe(MAX_MULT10)
  })

  it('still resets to x1.0 on a hit', () => {
    const world = playing()
    world.mult10 = MAX_MULT10
    pass(world, true)
    expect(world.mult10).toBe(10)
    expect(world.shields).toBe(START_SHIELDS - 1)
  })
})
