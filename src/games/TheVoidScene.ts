import {
  AdditiveBlending, AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, DirectionalLight, DoubleSide,
  Float32BufferAttribute, Fog, InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Path, PlaneGeometry, PointLight, Points, RepeatWrapping, Scene, ShaderMaterial, Shape, SRGBColorSpace,
  ShapeGeometry, SphereGeometry, TetrahedronGeometry,
} from 'three'
import { BALL_RADIUS, GRID, MOUTH_HALF } from './TheVoidWorld'

/** Scene units: the tunnel cross-section spans -HALF..HALF; tunnel-plane x,y map 1:1 (y flipped). */
export const HALF = 1
/** World depth 1 (where gates spawn) sits this far down -z, matching the old 1/8-size perspective. */
export const Z_SPAN = 19
export const TUNNEL_LENGTH = 48
export const WALL_CELL = 0.5
export const RING_SPACING = 2.4
export const RING_COUNT = Math.ceil(TUNNEL_LENGTH / RING_SPACING)
export const RING_BASE = 0.22
export const RING_LIT = 1
/** Ball radius in scene units: the same share of the tunnel as in the 2D layout. */
export const BALL_SIZE = (BALL_RADIUS / MOUTH_HALF) * HALF
export const TILE = (HALF * 2) / GRID
/** Enough instances for four full gates; gates in flight never exceed three. */
export const MAX_SLABS = GRID * GRID * 4
export const SHARD_POOL = 16
export const TRAIL_COUNT = 4
const RING_WIDTH = 0.018
const FOG_NEAR = 5
const FOG_FAR = 34
const STAR_COUNT = 320

export interface VoidScene {
  scene: Scene
  wallTexture: CanvasTexture
  rings: InstancedMesh
  ringMaterial: MeshStandardMaterial
  slabs: InstancedMesh
  ball: Mesh
  ballMaterial: MeshStandardMaterial
  glow: Mesh
  glowMaterial: ShaderMaterial
  ballLight: PointLight
  trail: Mesh<SphereGeometry, MeshBasicMaterial>[]
  shards: Mesh<TetrahedronGeometry, MeshStandardMaterial>[]
  starMaterial: ShaderMaterial
}

/** A dark tile with a faint grey line on two edges; repeated, it becomes the wall grid. */
function gridTexture(anisotropy: number): CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#060608'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#2a2b33'
  ctx.fillRect(0, 0, size, 2)
  ctx.fillRect(0, 0, 2, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace // the canvas is drawn in sRGB; untagged, the dark greys come out washed-out
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set((HALF * 2) / WALL_CELL, TUNNEL_LENGTH / WALL_CELL)
  texture.anisotropy = Math.min(8, anisotropy)
  return texture
}

/** Soft glow: bright where the sphere faces the camera, fading to nothing at its silhouette. */
const GLOW_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`
const GLOW_FRAGMENT = `
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = max(dot(vNormal, vView), 0.0);
    gl_FragColor = vec4(vec3(1.0), pow(facing, 2.6) * uIntensity);
  }`

const STAR_VERTEX = `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    vAlpha = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * 1.3 + aPhase));
  }`
const STAR_FRAGMENT = `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.0, d) * vAlpha);
  }`

export function createVoidScene(anisotropy: number): VoidScene {
  const scene = new Scene()
  scene.fog = new Fog(0x000000, FOG_NEAR, FOG_FAR)
  scene.add(new AmbientLight(0xffffff, 0.12))
  const key = new DirectionalLight(0xffffff, 0.9)
  key.position.set(0.8, 1.4, 6) // from the camera side
  scene.add(key)

  // Walls: one plane laid along -z (as the floor), rotated about z into all four sides.
  const wallTexture = gridTexture(anisotropy)
  const wallGeometry = new PlaneGeometry(HALF * 2, TUNNEL_LENGTH).rotateX(-Math.PI / 2).translate(0, -HALF, -TUNNEL_LENGTH / 2)
  const wallMaterial = new MeshBasicMaterial({ map: wallTexture })
  for (let side = 0; side < 4; side++) {
    const wall = new Mesh(wallGeometry, wallMaterial)
    wall.rotation.z = (side * Math.PI) / 2
    scene.add(wall)
  }

  // Bright corner edges down the tunnel, plus the mouth outline.
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const edgePoints = corners.flatMap(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % 4]
    return [x, y, 0, x, y, -TUNNEL_LENGTH, x, y, 0, nx, ny, 0].map((v, j) => (j % 3 === 2 ? v : v * HALF))
  })
  scene.add(new LineSegments(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute(edgePoints, 3)),
    new LineBasicMaterial({ color: 0xdadce4, transparent: true, opacity: 0.6 }),
  ))

  // Thin square rings, instanced: one draw call.
  const outer = new Shape().moveTo(-HALF, -HALF).lineTo(HALF, -HALF).lineTo(HALF, HALF).lineTo(-HALF, HALF).closePath()
  const inset = HALF - RING_WIDTH
  outer.holes.push(new Path().moveTo(-inset, -inset).lineTo(-inset, inset).lineTo(inset, inset).lineTo(inset, -inset).closePath())
  const ringMaterial = new MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: RING_BASE, side: DoubleSide })
  const rings = new InstancedMesh(new ShapeGeometry(outer).scale(0.995, 0.995, 1), ringMaterial, RING_COUNT)
  rings.frustumCulled = false
  scene.add(rings)

  // Gate slabs, instanced: one shared box and material for every solid tile in flight.
  const slabs = new InstancedMesh(
    new BoxGeometry(TILE * 0.94, TILE * 0.94, 0.14),
    new MeshStandardMaterial({ color: 0xd6d8de, emissive: 0x3a3b40, emissiveIntensity: 0.6, roughness: 0.55, metalness: 0.05 }),
    MAX_SLABS,
  )
  slabs.count = 0
  slabs.frustumCulled = false
  scene.add(slabs)

  // Ball: emissive core, additive glow sphere, and a point light the slabs catch.
  const ballGeometry = new SphereGeometry(BALL_SIZE, 32, 16)
  const ballMaterial = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 })
  const ball = new Mesh(ballGeometry, ballMaterial)
  const glowMaterial = new ShaderMaterial({
    uniforms: { uIntensity: { value: 0.45 } },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const glow = new Mesh(new SphereGeometry(BALL_SIZE * 3, 32, 16), glowMaterial)
  const ballLight = new PointLight(0xffffff, 3, 3.5, 2)
  scene.add(ball, glow, ballLight)

  const trail = Array.from({ length: TRAIL_COUNT }, () => {
    const copy = new Mesh(ballGeometry, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }))
    copy.visible = false
    scene.add(copy)
    return copy
  })

  // Pooled shards for broken gates.
  const shardGeometry = new TetrahedronGeometry(0.07)
  const shards = Array.from({ length: SHARD_POOL }, () => {
    const shard = new Mesh(shardGeometry, new MeshStandardMaterial({ color: 0xe8e9ee, emissive: 0x555555, transparent: true }))
    shard.visible = false
    scene.add(shard)
    return shard
  })

  // Stars far behind the tunnel, twinkling in the shader: one draw call.
  const positions: number[] = [], sizes: number[] = [], phases: number[] = []
  for (let i = 0; i < STAR_COUNT; i++) {
    positions.push((Math.random() - 0.5) * 90, (Math.random() - 0.5) * 110, -70 - Math.random() * 50)
    sizes.push(1 + Math.random() * 1.8)
    phases.push(Math.random() * Math.PI * 2)
  }
  const starGeometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('aSize', new Float32BufferAttribute(sizes, 1))
    .setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
  const starMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
  })
  scene.add(new Points(starGeometry, starMaterial))

  return { scene, wallTexture, rings, ringMaterial, slabs, ball, ballMaterial, glow, glowMaterial, ballLight, trail, shards, starMaterial }
}
