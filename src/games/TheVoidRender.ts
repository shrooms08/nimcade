import { InstancedMesh, Object3D, PerspectiveCamera, Texture, WebGLRenderer } from 'three'
import type { Material, Mesh } from 'three'
import {
  createVoidScene, HALF, MAX_SLABS, RING_BASE, RING_COUNT, RING_LIT, RING_SPACING, TILE, TRAIL_COUNT, WALL_CELL, Z_SPAN,
} from './TheVoidScene'
import { AREA_H, AREA_W, BOOST_RADIUS, GRID, isBoosting, MOUTH_HALF, MOUTH_Y } from './TheVoidWorld'
import type { World } from './TheVoidWorld'

const FOV = 60
/** Camera distance at which the mouth (half-size HALF at z = 0) fills the same share of the width as the 2D layout. */
const CAMERA_Z = HALF / ((MOUTH_HALF / AREA_W) * 2 * Math.tan((FOV * Math.PI) / 360) * (AREA_W / AREA_H))
/** Off-axis shift so the vanishing point sits at MOUTH_Y instead of mid-height. */
const VP_SHIFT = 0.5 - MOUTH_Y / AREA_H
/** The camera drifts with the ball by this much, for parallax. */
const SWAY = 0.06
const RING_PASS_MS = 300
const SHARD_FADE_MS = 400
const SHAKE_PX = 4
const FLASH_BLINK_MS = 60
const TRAIL_SPACING_FRAMES = 3
const TRAIL_DEPTH = 0.32
const TRAIL_OPACITY = 0.32
/** Glow strength and extra size: normal flight vs boosting. */
const GLOW_INTENSITY = 0.45
const GLOW_BOOST_INTENSITY = 0.7
const GLOW_BOOST_SCALE = 1.2

export interface VoidRenderer {
  /** Draws one frame from the world's current state. */
  render: (world: World) => void
  /** Releases the WebGL context, GPU resources, observers and the canvas. */
  dispose: () => void
  /** Draw calls and triangles in the last frame. */
  stats: () => { calls: number; triangles: number }
}

export function createVoidRenderer(host: HTMLElement): VoidRenderer {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  const canvas = renderer.domElement
  canvas.className = 'void-canvas'
  host.prepend(canvas)

  const parts = createVoidScene(renderer.capabilities.getMaxAnisotropy())
  const camera = new PerspectiveCamera(FOV, AREA_W / AREA_H, 0.05, 250)
  const dummy = new Object3D()
  const history: [number, number][] = []
  let width = 1, height = 1
  let lastWorld: World | null = null
  let lastClock = -1, lastPasses = 0, passAt = Number.NEGATIVE_INFINITY

  function render(world: World) {
    lastWorld = world
    if (world.clock < lastClock) { // a fresh round
      lastPasses = world.passes
      passAt = Number.NEGATIVE_INFINITY
      history.length = 0
    }
    if (world.passes > lastPasses)
      passAt = world.clock
    lastPasses = world.passes
    const advanced = world.clock !== lastClock
    lastClock = world.clock
    const travel = world.travel * Z_SPAN

    // Walls and rings scroll toward the camera; rings flare on a clean pass and fade over 300ms.
    parts.wallTexture.offset.y = (travel / WALL_CELL) % 1
    parts.ringMaterial.emissiveIntensity = RING_BASE + (RING_LIT - RING_BASE) * Math.max(0, 1 - (world.clock - passAt) / RING_PASS_MS)
    const ringShift = travel % RING_SPACING
    dummy.rotation.set(0, 0, 0)
    dummy.scale.setScalar(1)
    for (let i = 0; i < RING_COUNT; i++) {
      dummy.position.set(0, 0, -((i + 1) * RING_SPACING - ringShift))
      dummy.updateMatrix()
      parts.rings.setMatrixAt(i, dummy.matrix)
    }
    parts.rings.instanceMatrix.needsUpdate = true

    // Every solid tile of every gate in flight becomes a slab instance at its depth.
    let slabs = 0
    for (const gate of world.gates) {
      const z = -gate.depth * Z_SPAN
      for (let i = 0; i < gate.solid.length && slabs < MAX_SLABS; i++) {
        if (!gate.solid[i])
          continue
        dummy.position.set((-1 + TILE * ((i % GRID) + 0.5)) * HALF, -(-1 + TILE * (Math.floor(i / GRID) + 0.5)) * HALF, z)
        dummy.updateMatrix()
        parts.slabs.setMatrixAt(slabs++, dummy.matrix)
      }
    }
    parts.slabs.count = slabs
    parts.slabs.instanceMatrix.needsUpdate = true

    // Ball, glow and light; boost swells the glow and leaves a trail.
    const boosting = isBoosting(world)
    const bx = world.ball.x * HALF, by = -world.ball.y * HALF
    const size = boosting ? BOOST_RADIUS : 1
    const blink = world.flash > 0 && Math.floor(world.flash / FLASH_BLINK_MS) % 2 === 0
    parts.ball.position.set(bx, by, 0)
    parts.ball.scale.setScalar(size)
    parts.ballMaterial.emissiveIntensity = blink ? 0.12 : 1
    parts.ballMaterial.color.setScalar(blink ? 0.35 : 1)
    parts.glow.position.set(bx, by, 0)
    parts.glow.scale.setScalar(size * (boosting ? GLOW_BOOST_SCALE : 1))
    parts.glowMaterial.uniforms.uIntensity.value = blink ? 0.12 : boosting ? GLOW_BOOST_INTENSITY : GLOW_INTENSITY
    parts.ballLight.position.set(bx, by, 0.35)
    parts.ballLight.intensity = boosting ? 5 : 3
    if (advanced) {
      history.push([bx, by])
      if (history.length > TRAIL_COUNT * TRAIL_SPACING_FRAMES + 1)
        history.shift()
    }
    parts.trail.forEach((copy, index) => {
      const step = index + 1
      const sample = history[history.length - 1 - step * TRAIL_SPACING_FRAMES]
      copy.visible = boosting && sample !== undefined
      if (!sample)
        return
      copy.position.set(sample[0], sample[1], -step * TRAIL_DEPTH)
      copy.scale.setScalar(size * (0.85 - step * 0.14))
      copy.material.opacity = TRAIL_OPACITY * (1 - (step - 1) / TRAIL_COUNT)
    })

    // Shards follow the world's fragments and fade over 400ms.
    parts.shards.forEach((shard, i) => {
      const bit = world.fragments[i]
      const alpha = bit ? 1 - bit.age / SHARD_FADE_MS : 0
      shard.visible = alpha > 0
      if (!bit || alpha <= 0)
        return
      shard.position.set(bit.x * HALF, -bit.y * HALF, (0.5 * bit.age) / SHARD_FADE_MS)
      shard.rotation.set(bit.age * 0.012 + i, bit.age * 0.009, bit.age * 0.015)
      shard.material.opacity = alpha
    })

    parts.starMaterial.uniforms.uTime.value = world.clock / 1000
    parts.starMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio()

    // Camera: slight sway with the ball, vanishing point at MOUTH_Y, 4px shake on a hit.
    camera.position.set(world.ball.x * SWAY, -world.ball.y * SWAY, CAMERA_Z)
    const shake = () => (world.shake > 0 ? (Math.random() < 0.5 ? -SHAKE_PX : SHAKE_PX) : 0)
    camera.setViewOffset(width, height, shake(), VP_SHIFT * height + shake(), width, height)
    renderer.render(parts.scene, camera)
  }

  const observer = new ResizeObserver(() => {
    const rect = host.getBoundingClientRect()
    width = Math.max(1, Math.round(rect.width))
    height = Math.max(1, Math.round(rect.height))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (lastWorld)
      render(lastWorld)
  })
  observer.observe(host)

  function dispose() {
    observer.disconnect()
    parts.scene.traverse((object) => {
      if (object instanceof InstancedMesh)
        object.dispose()
      const mesh = object as Mesh
      mesh.geometry?.dispose()
      const materials = ([] as (Material | undefined)[]).concat(mesh.material as Material | Material[] | undefined)
      for (const material of materials) {
        if (!material)
          continue
        for (const value of Object.values(material)) {
          if (value instanceof Texture)
            value.dispose()
        }
        material.dispose()
      }
    })
    renderer.renderLists.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  }

  return {
    render,
    dispose,
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  }
}
