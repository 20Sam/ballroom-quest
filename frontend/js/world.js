// Evans Hall Ballroom: Yale SOM's glass hall with five rectangular ballrooms around it.
//
// Plan (north = -z is the top of the minimap; the game camera looks north from the south):
//   north row   Standard | Smooth | Latin                       (doors open south onto the hall)
//   the hall    Ross Library (west) · Coach Marisol (centre) · Beinecke Terrace (east, glass wall)
//   south row   Rhythm | glass courtyard (spawn) | Social & Nightclub   (doors open north onto the hall)
// Standard is the grand competition hall (theme 'grand', 7.6 m high): deep blue walls with gilt mouldings and
// candle sconces, a mezzanine with turned balustrades along both long walls carried on columns with gilt
// Corinthian-style capitals and arches, a polished black marble floor with a sand-and-brass inlay border, one huge
// tiered crystal chandelier plus two small ones, a great arched doorway full of light between two scoreboards on
// the north wall (setScoreboards), tall arched windows, and spectators below and on the balconies. Its marble
// really mirrors the hall and the dancers (a half-resolution planar reflection under the veined stone, sharp at the
// floor and softer the higher the mirrored point, run only while the camera or the focus is in the hall:
// planarReflection, reflectionShader, api.reflection).
// Smooth, Latin and Rhythm follow the classic painting: ivory panelled walls under a cornice, tall arched windows
// with blue-gray drapes and swags, two crystal chandeliers, warm sconces, a glossy herringbone floor, and
// spectators seated along the long walls. Social is a nightclub. Ceilings face down, so they show only from
// below the cornice (eye-level views); the higher cameras look in like a dollhouse, and update() sinks the walls
// (and the grand hall's balconies) that stand between the camera and the focus (Sims-style cutaway).
// Real lights: hemisphere + sun (shadows) + two nightclub spotlights. Everything else glows by emissive tricks.
// textSprite() name tags are depth-tested (walls hide them) unless created with { depthTest: false }.
import * as THREE from 'three'

// ====================================================================================================
// Layout (pure data: safe to import in node without a DOM)
// ====================================================================================================
export const ROOM = { w: 54, d: 40 } // building footprint, centred on the origin: x ∈ [-27, 27], z ∈ [-20, 20]
export const WALL_H = 5.2
const H = WALL_H
const H_GRAND = 7.6 // the grand competition hall (Standard) is taller: a mezzanine and a coffered ceiling
const T = 0.24 // wall thickness; every room owns its four walls, inset inside its own rectangle
const STUB = 0.3 // what is left of a wall when the cutaway drops it
const DOOR_W = 2.4
const DOOR_H = 3.0
const BX = ROOM.w / 2, BZ = ROOM.d / 2
const HALL = { x0: -BX, x1: BX, z0: -7, z1: 7 } // the hall: the lobby's east-west spine
const COURT = { x0: -9, x1: 9, z0: 7, z1: BZ } // the glass courtyard south of the hall (also lobby)

// r.h = wall (and ceiling) height of the room
const mkRoom = (x, z, label, name, color, theme = 'classic') => ({ x, z, w: 18, d: 13, h: theme === 'grand' ? H_GRAND : H, label, name, color, theme })
export const ROOMS = {
  standard: mkRoom(-18, -13.5, 'STANDARD', 'Standard Ballroom', 0x7a6bd1, 'grand'),
  smooth: mkRoom(0, -13.5, 'SMOOTH', 'Smooth Ballroom', 0x3a9fc4),
  latin: mkRoom(18, -13.5, 'LATIN', 'Latin Ballroom', 0xe98a6b),
  rhythm: mkRoom(-18, 13.5, 'RHYTHM', 'Rhythm Ballroom', 0x2f9e7a),
  social: mkRoom(18, 13.5, 'SOCIAL', 'Social & Nightclub', 0xd4a24c, 'nightclub'),
}
// door: centre of the doorway on the wall's centre line; (nx, nz) points out of the room into the hall
for (const r of Object.values(ROOMS)) {
  const north = r.z < 0
  r.door = { x: r.x, z: north ? r.z + r.d / 2 - T / 2 : r.z - r.d / 2 + T / 2, nx: 0, nz: north ? 1 : -1, w: DOOR_W }
}

// The dance floor inside each room (long side along x, ≥ 1.2 m from every wall face).
export const FLOORS = Object.fromEntries(Object.entries(ROOMS).map(([k, r]) => {
  const club = r.theme === 'nightclub' // leaves room for the bar and DJ booth by the north wall
  return [k, { x: r.x, z: club ? r.z + 0.5 : r.z, w: club ? 14 : 15, d: club ? 8.5 : 9, color: r.color, label: r.label }]
}))

export const STATIONS = [
  ...Object.entries(ROOMS).map(([k, r]) => ({ id: k, label: `${r.name} · step onto the floor`, x: FLOORS[k].x, z: FLOORS[k].z, r: 3.6 })),
  { id: 'coach', label: 'Coach Marisol', x: 0, z: -2.5, r: 2.6 },
  { id: 'drills', label: 'Ross Library · Team Drill Board', x: -24.4, z: 0, r: 2.8 },
  { id: 'planner', label: 'Beinecke Terrace · Competition Planner', x: 24.4, z: 0, r: 2.8 },
]
export const SPAWN = { x: 0, z: 12.5, yaw: Math.PI } // in the courtyard, facing north up the hall

// The grand hall's mezzanine, in metres (z is measured into the room from a long wall's inner face).
// col: the column line; depth: the balcony's front edge; spring: capital top, where the arches spring;
// slab..floor: the balcony slab; rail: handrail top; top: the posts' finials. 5 bays per long wall.
const BAL = { bays: 5, col: 0.85, depth: 1.12, spring: 2.71, rise: 0.8, slab: 3.6, floor: 3.98, rail: 4.88, top: 4.98 }
const GRAND = Object.values(ROOMS).find((r) => r.theme === 'grand')
const GRAND_COLS = [] // the free-standing columns under both balconies (they also block walking)
if (GRAND) {
  const ix0 = GRAND.x - GRAND.w / 2 + T, bw = (GRAND.w - 2 * T) / BAL.bays
  for (const zf of [GRAND.z - GRAND.d / 2 + T + BAL.col, GRAND.z + GRAND.d / 2 - T - BAL.col]) {
    for (let j = 1; j < BAL.bays; j++) GRAND_COLS.push({ x: ix0 + j * bw, z: zf, r: 0.2 })
  }
}

// Furniture that blocks walking (shared by the builder and move()).
const SOC = ROOMS.social
const CLUB = {
  bar: { x0: SOC.x - 7.8, x1: SOC.x - 2.4, z0: SOC.z - SOC.d / 2 + T, z1: SOC.z - SOC.d / 2 + 1.6 }, // along the north wall, west of the door
  dj: { x0: SOC.x + 3.2, x1: SOC.x + 7.0, z0: SOC.z - SOC.d / 2 + T, z1: SOC.z - SOC.d / 2 + 1.75 },
  lounge: { x0: SOC.x - 7.2, x1: SOC.x + 7.2, z0: SOC.z + SOC.d / 2 - 1.6, z1: SOC.z + SOC.d / 2 - T },
}
const LIB = { x0: HALL.x0 + T, shelves: [[-6.6, -1.9], [1.9, 6.6]], depth: 0.42, table: { x0: -24.15, x1: -21.65, z0: 2.75, z1: 6.25 } }
const POOL = { x0: -4, x1: 4, z0: 15.4, z1: 18.4 }
const BENCHES = [{ x: -5.9, z: 12.6 }, { x: 5.9, z: 12.6 }, { x: 23.2, z: -4.8 }, { x: 23.2, z: 4.8 }] // 0.5 × 2.2, long side along z
const PLANNER_BOARD = { x: 25.6, z: 0, w: 2.6, ry: -Math.PI / 3 } // faces south-west, toward the hall
const PLANTERS = [[-9, -5.4], [9, -5.4], [-9, 5.4], [9, 5.4], [-7.6, 8.8], [7.6, 8.8], [-7.6, 18.9], [7.6, 18.9],
  [26.2, -6.3], [26.2, 6.3], [21.8, -6.3], [21.8, 6.3]].map(([x, z]) => ({ x, z, r: 0.34 }))

// ---------- wall specs ----------
// Each wall is a straight piece in its own frame: local x runs along the wall (0..len), y is up, local z is the
// inward normal (the decorated side). phi = rotation.y of that frame; (ox, oz) its origin; door = local x of the doorway.
function wallSpecs() {
  const out = []
  const add = (owner, kind, cx, cz, nx, nz, len, exterior, door, h = H) => {
    const phi = Math.atan2(nx, nz), dx = Math.cos(phi), dz = -Math.sin(phi)
    const ox = cx - (dx * len) / 2, oz = cz - (dz * len) / 2
    out.push({
      id: `${owner}-${out.length}`, owner, kind, cx, cz, nx, nz, len, exterior, phi, dx, dz, ox, oz, ns: nx === 0, h,
      door: door ? (door.x - ox) * dx + (door.z - oz) * dz : null,
    })
  }
  for (const [k, r] of Object.entries(ROOMS)) {
    const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2
    const kind = r.theme === 'nightclub' ? 'club' : r.theme === 'grand' ? 'grand' : 'classic', north = r.z < 0
    add(k, kind, r.x, z0 + T / 2, 0, 1, r.w, z0 <= -BZ + 0.01, north ? null : r.door, r.h) // north wall
    add(k, kind, r.x, z1 - T / 2, 0, -1, r.w, z1 >= BZ - 0.01, north ? r.door : null, r.h) // south wall
    add(k, kind, x0 + T / 2, r.z, 1, 0, r.d - 2 * T, x0 <= -BX + 0.01, null, r.h) // west wall (between N and S)
    add(k, kind, x1 - T / 2, r.z, -1, 0, r.d - 2 * T, x1 >= BX - 0.01, null, r.h) // east wall
  }
  add('lobby', 'hall', HALL.x0 + T / 2, 0, 1, 0, HALL.z1 - HALL.z0, true, null) // Ross Library wall (west)
  add('lobby', 'glass', HALL.x1 - T / 2, 0, -1, 0, HALL.z1 - HALL.z0, true, null) // Beinecke Terrace glass (east)
  add('lobby', 'glass', 0, COURT.z1 - T / 2, 0, -1, COURT.x1 - COURT.x0, true, null) // courtyard glass (south)
  return out
}
const WALLS = wallSpecs()
const solidSpans = (w) => (w.door == null ? [[0, w.len]] : [[0, w.door - DOOR_W / 2], [w.door + DOOR_W / 2, w.len]])
function footprint(w, a, b) {
  const xs = [], zs = []
  for (const s of [a, b]) for (const n of [-T / 2, T / 2]) { xs.push(w.ox + w.dx * s + w.nx * n); zs.push(w.oz + w.dz * s + w.nz * n) }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
}

// ---------- collision ----------
const R_WALK = 0.3 // walker radius
const WALL_RECTS = []
for (const w of WALLS) for (const [a, b] of solidSpans(w)) WALL_RECTS.push(footprint(w, a, b))
const FURNITURE = [CLUB.bar, CLUB.dj, CLUB.lounge, LIB.table, POOL,
  ...LIB.shelves.map(([z0, z1]) => ({ x0: LIB.x0, x1: LIB.x0 + LIB.depth, z0, z1 })),
  ...BENCHES.map((b) => ({ x0: b.x - 0.25, x1: b.x + 0.25, z0: b.z - 1.1, z1: b.z + 1.1 })),
  { x0: PLANNER_BOARD.x - 0.7, x1: PLANNER_BOARD.x + 0.7, z0: PLANNER_BOARD.z - 1.15, z1: PLANNER_BOARD.z + 1.15 }]
// spectators sit along the long walls of the classic rooms and the grand hall (a gap at the door)
for (const r of Object.values(ROOMS)) {
  if (r.theme === 'nightclub') continue
  const ix0 = r.x - r.w / 2 + T + 0.6, ix1 = r.x + r.w / 2 - T - 0.6
  for (const north of [true, false]) {
    const zw = north ? r.z - r.d / 2 + T : r.z + r.d / 2 - T
    const z0 = north ? zw : zw - 0.95, z1 = north ? zw + 0.95 : zw
    const doorHere = north === r.z > 0
    if (doorHere) FURNITURE.push({ x0: ix0, x1: r.door.x - 1.5, z0, z1 }, { x0: r.door.x + 1.5, x1: ix1, z0, z1 })
    else FURNITURE.push({ x0: ix0, x1: ix1, z0, z1 })
  }
}
const ROUND = [...PLANTERS, ...GRAND_COLS]

const inRect = (b, x, z, m) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m
const hitsWall = (x, z) => WALL_RECTS.some((b) => inRect(b, x, z, R_WALK)) || Math.abs(x) > BX - 0.1 || Math.abs(z) > BZ - 0.1
const hitsFurniture = (x, z) => FURNITURE.some((b) => inRect(b, x, z, R_WALK)) || ROUND.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + R_WALK)

// Walk from `from` toward `to`, sliding along walls and furniture. Doorways are open. A walker that starts
// inside furniture (e.g. placed there by the game) may walk out of it, but never through a wall.
export function move(from, to) {
  let x = from.x, z = from.z
  const dx = to.x - from.x, dz = to.z - from.z
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15))
  const sx = dx / n, sz = dz / n
  const stuckWall = hitsWall(x, z), stuckFurn = hitsFurniture(x, z)
  const free = (px, pz) => (stuckWall || !hitsWall(px, pz)) && (stuckFurn || !hitsFurniture(px, pz))
  for (let i = 0; i < n; i++) {
    if (free(x + sx, z + sz)) { x += sx; z += sz }
    else if (sx && free(x + sx, z)) x += sx
    else if (sz && free(x, z + sz)) z += sz
    else break
  }
  return { x, z }
}

// Which ballroom (style key) contains the point, or null for the hall, courtyard and doorways.
export function roomAt(x, z) {
  for (const [k, r] of Object.entries(ROOMS)) if (Math.abs(x - r.x) < r.w / 2 - T && Math.abs(z - r.z) < r.d / 2 - T) return k
  return null
}

// Distance from a point to a wall owner's region (0 inside).
function regionDist(owner, x, z) {
  const d = (b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1))
  if (owner === 'lobby') return Math.min(d(HALL), d(COURT))
  const r = ROOMS[owner]
  return d({ x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2 })
}

// ====================================================================================================
// Small helpers
// ====================================================================================================
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(a, b, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  return c
}
function canvasTexture(w, h, draw, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(makeCanvas(w, h, draw))
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// A rounded name tag. It is depth-tested by default, so walls, columns and people in front hide it like any other
// object (a tag must not show through walls); pass { depthTest: false } for an always-on-top tag. It never writes
// depth, so its transparent corners cannot cut holes in what is drawn after it.
export function textSprite(text, { size = 64, color = '#0d3b52', bg = 'rgba(255,250,240,0.92)', scale = 1, depthTest = true } = {}) {
  const pad = 24
  const ctx0 = document.createElement('canvas').getContext('2d')
  ctx0.font = `600 ${size}px Georgia, serif`
  const w = Math.ceil(ctx0.measureText(text).width) + pad * 2
  const h = size + pad * 1.4
  const tex = canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, h / 2); ctx.fill()
    ctx.font = `600 ${size}px Georgia, serif`
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
    ctx.fillText(text, w / 2, h / 2 + 2)
  })
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: depthTest !== false, depthWrite: false, transparent: true }))
  s.scale.set((w / h) * 0.55 * scale, 0.55 * scale, 1)
  s.renderOrder = 10
  return s
}

// ====================================================================================================
// Planar floor reflection (the grand hall's polished marble)
// ====================================================================================================
// three's Reflector, folded into the floor's own material so the stone stays opaque and lit: before the floor mesh
// draws, the scene is rendered from the camera mirrored in the plane y = y0 into a reduced-resolution HDR target,
// with an oblique near plane on the floor so nothing under it shows. The floor's shader (reflectionShader) samples
// that image through `uReflMatrix` and lays it under the veined stone. k (0..1, set by the caller) scales the effect;
// at k = 0 no pass runs. Only the mesh given to attach() is mirrored, and it is hidden during its own pass.
// The pass also keeps its depth and a mip chain, so the floor can blur each reflected point by how high above the
// floor it stands (glossy stone: the dancers' feet sharp, their heads softer, the chandelier a warm glow):
// b = 1 - (eye to floor) / (eye to the mirrored point) along the reflected ray, decoded from the oblique depth
// (uReflClip = [s, eye height, clipBias]: the clip row is s·(height above the floor) + (1 - clipBias)·z_view).
// opts: scale = target size / drawing-buffer size, maxWidth caps the target, clipBias pushes the clip plane up a
// hair (no acne at the floor line), gloss = the stone's blur cone (radians) for points far above it, during() /
// after() run around the pass (e.g. show a ceiling the camera hides; they get the scene).
function planarReflection(y0, { scale = 0.5, maxWidth = 1024, clipBias = 0.003, gloss = 0.03, during = null, after = null } = {}) {
  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType, depthBuffer: true, depthTexture: new THREE.DepthTexture(2, 2),
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  })
  target.texture.name = 'floor-reflection'
  const cam = new THREE.PerspectiveCamera()
  const uniforms = {
    uReflMap: { value: target.texture }, uReflDepth: { value: target.depthTexture }, uReflMatrix: { value: new THREE.Matrix4() },
    uReflK: { value: 0 }, uReflTexel: { value: new THREE.Vector2(0.5, 0.5) },
    uReflClip: { value: new THREE.Vector3(1, 1, clipBias) }, uReflGloss: { value: 0 },
  }
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), rot = new THREE.Matrix4(), size = new THREE.Vector2()
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4(), UP = new THREE.Vector3(0, 1, 0)
  const R = { y: y0, k: 0, target, camera: cam, uniforms, mesh: null, passes: 0, busy: false, scale, maxWidth }
  R.attach = (mesh) => {
    R.mesh = mesh
    mesh.onBeforeRender = (renderer, scene, camera) => R.render(renderer, scene, camera)
    return R
  }
  // target size for a drawing buffer of w × h px
  R.sizeFor = (w, h) => {
    const tw = Math.max(2, Math.min(maxWidth, Math.round(w * scale)))
    return [tw, Math.max(2, Math.round((tw * h) / Math.max(1, w)))]
  }
  // the shader's decode, for tests: b (0 at the floor .. 1 at infinity) from the pass's depth d (0..1) and the floor
  // point's clip w (its depth from the mirror camera)
  R.blurFraction = (d, wFloor) => {
    const [s, H, bias] = uniforms.uReflClip.value.toArray()
    return Math.min(1, Math.max(0, ((2 * d - bias) * wFloor) / (s * H)))
  }
  R.render = (renderer, scene, camera) => {
    uniforms.uReflK.value = 0
    if (R.busy || !R.mesh || R.k < 0.01 || !camera.isPerspectiveCamera) return
    eye.setFromMatrixPosition(camera.matrixWorld)
    if (eye.y < y0 + 0.02) return // under the floor: nothing to mirror
    renderer.getDrawingBufferSize(size)
    const [tw, th] = R.sizeFor(size.x, size.y)
    if (target.width !== tw || target.height !== th) target.setSize(tw, th)
    uniforms.uReflTexel.value.set(1 / tw, 1 / th)
    // the camera mirrored in the floor: its position, view direction and up vector all flip in y
    rot.extractRotation(camera.matrixWorld)
    cam.position.set(eye.x, 2 * y0 - eye.y, eye.z)
    cam.up.set(0, 1, 0).applyMatrix4(rot); cam.up.y = -cam.up.y
    fwd.set(0, 0, -1).applyMatrix4(rot); fwd.y = -fwd.y
    cam.lookAt(fwd.add(cam.position))
    cam.far = camera.far; cam.near = camera.near
    cam.layers.mask = camera.layers.mask
    cam.updateMatrixWorld()
    cam.projectionMatrix.copy(camera.projectionMatrix)
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse)
    // world → the mirror image's uv (the oblique clip below changes only the depth row, so x/y stay valid)
    uniforms.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(R.mesh.matrixWorld)
    // oblique near plane on the floor (Lengyel, as in Reflector): everything below y0 is clipped
    plane.set(UP, -y0).applyMatrix4(cam.matrixWorldInverse)
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
    const e = cam.projectionMatrix.elements
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14])
    const s = 2 / clip.dot(q)
    clip.multiplyScalar(s)
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - clipBias; e[14] = clip.w
    // the depth decode, and the gloss cone in target texels (e[5] = 1 / tan(fov / 2))
    uniforms.uReflClip.value.set(s, eye.y - y0, clipBias)
    uniforms.uReflGloss.value = (gloss * th * e[5]) / 2
    // render: the floor hidden, no XR camera swap, the frame's shadow maps and world matrices reused
    const prevTarget = renderer.getRenderTarget(), xr = renderer.xr.enabled, shadows = renderer.shadowMap.autoUpdate
    const autoMatrices = scene.matrixWorldAutoUpdate
    R.busy = true
    R.mesh.visible = false
    try {
      during?.(scene)
      renderer.xr.enabled = false
      renderer.shadowMap.autoUpdate = false
      scene.matrixWorldAutoUpdate = false
      renderer.setRenderTarget(target)
      renderer.state.buffers.depth.setMask(true) // so the target's depth clears (three #18897)
      if (renderer.autoClear === false) renderer.clear()
      renderer.render(scene, cam) // three builds the target's mip chain after it
      R.passes++
    } finally {
      after?.(scene)
      scene.matrixWorldAutoUpdate = autoMatrices
      renderer.xr.enabled = xr
      renderer.shadowMap.autoUpdate = shadows
      renderer.setRenderTarget(prevTarget)
      if (camera.viewport !== undefined) renderer.state.viewport(camera.viewport)
      R.mesh.visible = true
      R.busy = false
    }
    uniforms.uReflK.value = R.k
  }
  return R
}

// Shader patch for a MeshStandardMaterial floor that shows a planarReflection under a semi-transparent stone layer:
// the stone's lit colour is mixed over the (blurred, cool-tinted) mirror image with an opacity that is highest on
// the pale veins and joints (they stay crisp on top) and lowest at grazing angles (Fresnel), so it reads as polished
// stone rather than a mirror. `see` = how much mirror shows through the dark stone, looking straight down and at a
// grazing angle. The blur grows with the mirrored point's height above the floor (b, see planarReflection): `blur`
// texels at the floor line plus uReflGloss·b, read from the mip level that matches the tap spacing.
function reflectionShader(sh, uniforms, { see = [0.08, 0.3], tint = [0.78, 0.83, 0.9], blur = 3 } = {}) {
  Object.assign(sh.uniforms, uniforms)
  const f = (x) => x.toFixed(3)
  // 9 taps within a radius of 1, stretched along the screen's vertical (polished floors smear reflections toward
  // the viewer); weights sum to 1
  const taps = [[0, 0, 0.2], [0.35, 0.55, 0.12], [-0.35, 0.55, 0.12], [0.35, -0.55, 0.12], [-0.35, -0.55, 0.12], [0, 1, 0.08], [0, -1, 0.08], [0.6, 0, 0.08], [-0.6, 0, 0.08]]
  const sample = taps.map(([x, y, w]) => `textureLod( uReflMap, ruv + ro * vec2( ${f(x)}, ${f(y)} ), lod ).rgb * ${f(w)}`).join('\n\t\t\t+ ')
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflUv;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n\tvReflUv = uReflMatrix * vec4( transformed, 1.0 );')
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D uReflMap;\nuniform sampler2D uReflDepth;\nuniform float uReflK;\nuniform vec2 uReflTexel;\nuniform vec3 uReflClip;\nuniform float uReflGloss;\nvarying vec4 vReflUv;')
    .replace('#include <opaque_fragment>', `if ( uReflK > 0.0 ) {
		vec2 ruv = vReflUv.xy / vReflUv.w;
		float b = saturate( ( 2.0 * texture2D( uReflDepth, ruv ).x - uReflClip.z ) * vReflUv.w / ( uReflClip.x * uReflClip.y ) );
		float r = ${f(blur)} + uReflGloss * b;
		vec2 ro = uReflTexel * r;
		float lod = log2( max( r * 0.5, 1.0 ) );
		vec3 mirror = ${sample};
		float vein = smoothstep( 0.012, 0.09, dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
		float graze = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
		float see = uReflK * mix( ${f(see[0])}, ${f(see[1])}, graze ) * ( 1.0 - 0.8 * vein );
		outgoingLight = mix( outgoingLight, mirror * vec3( ${tint.map(f).join(', ')} ), see );
	}
	#include <opaque_fragment>`)
  return sh
}

// Geometry: transform in place. Rotation order YXZ = roll (z), then tilt (x), then yaw (y).
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3()
function xf(g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e)
  return g.applyMatrix4(_m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)))
}
const box = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) => xf(new THREE.BoxGeometry(w, h, d), x, y, z, ry, rx, rz)
const cyl = (rt, rb, h, x, y, z, seg = 10) => xf(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z)
const sph = (r, x, y, z, ws = 10, hs = 8) => xf(new THREE.SphereGeometry(r, ws, hs), x, y, z)
const rectXZ = (x0, z0, x1, z1, y) => xf(new THREE.PlaneGeometry(x1 - x0, z1 - z0), (x0 + x1) / 2, y, (z0 + z1) / 2, 0, -Math.PI / 2)
function rod(a, b, r0, r1 = r0, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  return new THREE.CylinderGeometry(r1, r0, len, seg).applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)))
}
// planar UVs from world x/z (size = metres per texture tile)
function planar(g, size) {
  const p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / size, -p.getZ(i) / size)
  return g
}
function fitUV(g, x0, y0, w, h) {
  const p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x0) / w, (p.getY(i) - y0) / h)
  return g
}
function tint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g
}
// A wall-face rectangle in a wall's local frame, UVs from wall coordinates (u0/us along, vs up).
function faceRect(x0, x1, y0, y1, z, outward, u0, us, vs) {
  const g = xf(new THREE.PlaneGeometry(x1 - x0, y1 - y0), (x0 + x1) / 2, (y0 + y1) / 2, z, outward ? Math.PI : 0)
  const p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, ((outward ? -1 : 1) * (p.getX(i) - u0)) / us, p.getY(i) / vs)
  return g
}
// The parts of [a, c] × [STUB, h] that are not the doorway [da, db] × [0, DOOR_H].
function holeSpans(a, c, da, db, h = H) {
  if (da == null || db <= a || da >= c) return [[a, c, STUB, h]]
  const out = []
  if (da > a) out.push([a, da, STUB, h])
  if (db < c) out.push([db, c, STUB, h])
  out.push([Math.max(a, da), Math.min(c, db), DOOR_H, h])
  return out
}

function mergeGeoms(list) {
  let nv = 0, ni = 0, colors = false
  for (const g of list) {
    nv += g.attributes.position.count
    ni += g.index ? g.index.count : g.attributes.position.count
    if (g.attributes.color) colors = true
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2)
  const col = colors ? new Float32Array(nv * 3) : null
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)
  let v = 0, i = 0
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals()
    const a = g.attributes, n = a.position.count
    pos.set(a.position.array.subarray(0, n * 3), v * 3)
    nor.set(a.normal.array.subarray(0, n * 3), v * 3)
    if (a.uv) uv.set(a.uv.array.subarray(0, n * 2), v * 2)
    if (col) { if (a.color) col.set(a.color.array.subarray(0, n * 3), v * 3); else col.fill(1, v * 3, (v + n) * 3) }
    if (g.index) { const ix = g.index.array; for (let k = 0; k < g.index.count; k++) idx[i++] = ix[k] + v }
    else for (let k = 0; k < n; k++) idx[i++] = k + v
    v += n
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  out.computeBoundingSphere()
  return out
}

// Collects geometry per material, then builds one merged mesh per material (few draw calls).
class Batch {
  constructor() { this.groups = new Map() }
  add(mat, ...geoms) {
    let l = this.groups.get(mat)
    if (!l) this.groups.set(mat, (l = []))
    l.push(...geoms)
    return this
  }
  build(parent, { cast = true, receive = true } = {}) {
    for (const [mat, list] of this.groups) {
      if (!list.length) continue
      const mesh = new THREE.Mesh(mergeGeoms(list), mat)
      mesh.castShadow = cast && !mat.transparent && !mat.userData.noShadow
      mesh.receiveShadow = receive && !mat.isMeshBasicMaterial
      parent.add(mesh)
    }
    this.groups.clear()
    return parent
  }
}
// geometry built in a wall's local frame → world
const toWorld = (g, w) => xf(g, w.ox, 0, w.oz, w.phi)

function archShape(w, hs, y0 = 0, path = new THREE.Shape()) {
  path.moveTo(-w / 2, y0); path.lineTo(w / 2, y0); path.lineTo(w / 2, hs)
  path.absarc(0, hs, w / 2, 0, Math.PI, false); path.lineTo(-w / 2, y0)
  return path
}
function archFrame(w, hs, rim = 0.12) {
  const s = archShape(w + rim * 2, hs, -rim)
  s.holes.push(archShape(w, hs, 0, new THREE.Path()))
  return s
}
// A half-ring (an arch band without a sill): radius r to r + rim, springing at y = 0, extruded toward +z.
function arcBand(r, rim, depth) {
  const s = new THREE.Shape()
  s.moveTo(r + rim, 0); s.absarc(0, 0, r + rim, 0, Math.PI, false); s.lineTo(-r, 0); s.absarc(0, 0, r, Math.PI, 0, true)
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 28 })
}
// The wall between two columns above an elliptical arch: span × hgt, the arch opening rising `rise` from y = 0.
function spandrelGeom(span, rise, hgt, depth = 0.24) {
  const s = new THREE.Shape()
  s.moveTo(-span / 2, 0); s.lineTo(-span / 2, hgt); s.lineTo(span / 2, hgt); s.lineTo(span / 2, 0)
  s.absellipse(0, 0, span / 2, rise, 0, Math.PI, false)
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -depth / 2)
}
// The gilt band along that arch's opening.
function archivoltGeom(span, rise, wd = 0.07) {
  const s = new THREE.Shape()
  s.moveTo(span / 2 + wd, 0); s.absellipse(0, 0, span / 2 + wd, rise + wd, 0, Math.PI, false)
  s.lineTo(-span / 2, 0); s.absellipse(0, 0, span / 2, rise, Math.PI, 0, true)
  return new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false, curveSegments: 24 })
}

// ====================================================================================================
// Textures (canvas-drawn)
// ====================================================================================================
const TEX_FLOOR = 3.6 // metres per herringbone tile

function herringboneTexture() {
  // 90° herringbone (L = 4 W) that tiles every S pixels; rotated 45° on the floor it reads as classic zigzags
  const S = 1024, L = 128, W = 32, per = S / W, bands = S / (2 * L)
  const t = canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#4a2c17'; ctx.fillRect(0, 0, S, S)
    const plank = (x, y, w, h, id) => {
      if (x > S || y > S || x + w < 0 || y + h < 0) return
      const r = (i) => hash(id, i, 11)
      const tone = r(1), warm = r(2)
      ctx.fillStyle = `rgb(${(150 + tone * 52) | 0},${(94 + tone * 38 - warm * 6) | 0},${(48 + tone * 22 - warm * 8) | 0})`
      ctx.fillRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6)
      const horiz = w > h, across = horiz ? h : w, along = horiz ? w : h
      ctx.lineWidth = 1
      for (let g = 0; g < 8; g++) {
        const off = 3 + r(30 + g) * (across - 6), wob = (r(40 + g) - 0.5) * 5
        ctx.strokeStyle = r(10 + g) > 0.45 ? `rgba(70,38,16,${0.07 + r(20 + g) * 0.12})` : `rgba(255,226,180,${0.05 + r(20 + g) * 0.08})`
        ctx.beginPath()
        if (horiz) { ctx.moveTo(x + 1, y + off); ctx.bezierCurveTo(x + along * 0.33, y + off + wob, x + along * 0.66, y + off - wob, x + along - 1, y + off) }
        else { ctx.moveTo(x + off, y + 1); ctx.bezierCurveTo(x + off + wob, y + along * 0.33, x + off - wob, y + along * 0.66, x + off, y + along - 1) }
        ctx.stroke()
      }
      const gr = horiz ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0)
      gr.addColorStop(0, 'rgba(255,236,200,0.12)'); gr.addColorStop(0.5, 'rgba(255,236,200,0)'); gr.addColorStop(1, 'rgba(50,25,8,0.14)')
      ctx.fillStyle = gr; ctx.fillRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6)
    }
    for (let k = -6; k < per + 6; k++) for (let j = -bands - 3; j < bands + 3; j++) {
      // the pattern repeats under (k, j) → (k + per, j - bands) and (k, j + bands): colour by canonical id
      const kk = ((k % per) + per) % per, q = (k - kk) / per, jj = (((j + bands * q) % bands) + bands) % bands
      const id = kk * 16 + jj
      plank(k * W + j * 2 * L, k * W, L, W, id * 2)
      plank(k * W + L + j * 2 * L, k * W + W - L, W, L, id * 2 + 1)
    }
  }, { repeat: true })
  t.center.set(0.5, 0.5)
  t.rotation = Math.PI / 4
  return t
}

function borderTexture() { // dark walnut band with maple stringing and diamond inlays (512 px = 8 × its width)
  return canvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#4b2c18'; ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 26; i++) { ctx.strokeStyle = `rgba(${i % 2 ? '25,12,4' : '120,80,45'},0.25)`; ctx.beginPath(); ctx.moveTo(0, 14 + i * 1.5); ctx.lineTo(w, 13 + i * 1.5 + (i % 3)); ctx.stroke() }
    ctx.fillStyle = '#e3c595'; ctx.fillRect(0, 7, w, 4); ctx.fillRect(0, h - 11, w, 4)
    for (let x = 64; x < w; x += 128) {
      ctx.beginPath(); ctx.moveTo(x - 16, h / 2); ctx.lineTo(x, h / 2 - 10); ctx.lineTo(x + 16, h / 2); ctx.lineTo(x, h / 2 + 10); ctx.closePath(); ctx.fill()
    }
  }, { repeat: true })
}

// Ivory wall for one bay (3 m wide × the wall height): pilasters, frieze with dentils, dado rail, skirting,
// and (unless plain) a tall raised panel with a gilt inner line. Plain bays sit behind windows and mirrors.
function panelTexture(plain) {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    const Y = (m) => h * (1 - m / H)
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#f7f0e3'); g.addColorStop(1, '#ebdfc8')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    const rr = rng(plain ? 7 : 3)
    for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(${rr() > 0.5 ? '255,255,250' : '200,180,150'},0.05)`; ctx.beginPath(); ctx.ellipse(rr() * w, rr() * h, 20 + rr() * 60, 10 + rr() * 40, rr() * 3, 0, 7); ctx.fill() }
    const mould = (x, y, ww, hh, gilt) => {
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(255,253,246,0.95)'; ctx.strokeRect(x, y, ww, hh)
      ctx.strokeStyle = 'rgba(150,122,86,0.38)'; ctx.strokeRect(x + 4, y + 4, ww - 8, hh - 8)
      ctx.strokeStyle = 'rgba(255,253,246,0.7)'; ctx.strokeRect(x + 8, y + 8, ww - 16, hh - 16)
      if (gilt) {
        ctx.lineWidth = 2; ctx.strokeStyle = '#c9a463'; ctx.strokeRect(x + 18, y + 18, ww - 36, hh - 36)
        ctx.fillStyle = '#c9a463'
        for (const [cx, cy] of [[x + 18, y + 18], [x + ww - 18, y + 18], [x + 18, y + hh - 18], [x + ww - 18, y + hh - 18]]) { ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fill() }
      }
    }
    // pilasters at the bay edges (they meet between bays)
    for (const x0 of [0, w - 30]) {
      ctx.fillStyle = 'rgba(255,252,244,0.85)'; ctx.fillRect(x0, Y(H - 0.45), 30, Y(0.3) - Y(H - 0.45))
      ctx.fillStyle = 'rgba(150,122,86,0.22)'; ctx.fillRect(x0 === 0 ? 28 : x0, Y(H - 0.45), 2, Y(0.3) - Y(H - 0.45))
    }
    // frieze + dentils
    ctx.fillStyle = '#e7d9bf'; ctx.fillRect(0, 0, w, Y(H - 0.42))
    ctx.fillStyle = 'rgba(140,110,70,0.3)'
    for (let x = 4; x < w; x += 19) ctx.fillRect(x, Y(H - 0.29), 10, 12)
    ctx.fillStyle = '#c9a463'; ctx.fillRect(0, Y(H - 0.42) - 3, w, 3)
    // dado rail
    ctx.fillStyle = 'rgba(255,253,246,0.95)'; ctx.fillRect(0, Y(1.02), w, 6)
    ctx.fillStyle = 'rgba(150,122,86,0.35)'; ctx.fillRect(0, Y(1.02) + 6, w, 4)
    mould(60, Y(0.88), w - 120, Y(0.4) - Y(0.88), false)
    if (!plain) mould(60, Y(H - 0.7), w - 120, Y(1.3) - Y(H - 0.7), true)
    ctx.fillStyle = '#d5c19f'; ctx.fillRect(0, Y(0.32), w, h - Y(0.32))
  }, { repeat: true })
}

function slatTexture() { // warm oak slats, 1 m square (Evans Hall classroom cladding)
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7a5532'; ctx.fillRect(0, 0, w, h)
    for (let x = 0, i = 0; x < w; x += 16, i++) {
      const tone = 178 + ((i * 37) % 23)
      ctx.fillStyle = `rgb(${tone},${tone - 50},${tone - 98})`
      ctx.fillRect(x + 1.5, 0, 13, h)
      ctx.fillStyle = 'rgba(255,230,190,0.12)'; ctx.fillRect(x + 2, 0, 3, h)
    }
  }, { repeat: true })
}

function stoneTexture() { // pale limestone tiles: 4 × 0.9 m per 3.6 m tile
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#cdbb9a'; ctx.fillRect(0, 0, w, h)
    const rr = rng(5)
    for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) {
      const t = rr()
      ctx.fillStyle = `rgb(${(234 + t * 10) | 0},${(224 + t * 9) | 0},${(202 + t * 8) | 0})`
      ctx.fillRect(x + 1.5, y + 1.5, 125, 125)
      for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(160,140,110,${rr() * 0.12})`; ctx.fillRect(x + rr() * 124, y + rr() * 124, 2, 2) }
    }
  }, { repeat: true })
}

function deckTexture() { // teak boards along u, 1.2 m per tile
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6d4a2c'; ctx.fillRect(0, 0, w, h)
    const rr = rng(9)
    for (let y = 0; y < h; y += 32) {
      const t = rr()
      ctx.fillStyle = `rgb(${(176 + t * 26) | 0},${(126 + t * 20) | 0},${(82 + t * 14) | 0})`
      ctx.fillRect(0, y + 1.5, w, 29)
      for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(90,55,25,0.12)'; ctx.fillRect(0, y + 5 + i * 7, w, 1) }
    }
  }, { repeat: true })
}

function sandTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ecdcb8'; ctx.fillRect(0, 0, w, h)
    const rr = rng(13)
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = rr() > 0.5 ? 'rgba(255,250,235,0.5)' : 'rgba(190,165,120,0.35)'; ctx.fillRect(rr() * w, rr() * h, 1.5, 1.5) }
  }, { repeat: true })
}

function waterTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b9e3ea'; ctx.fillRect(0, 0, w, h)
    const rr = rng(21)
    ctx.lineWidth = 2
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + rr() * 0.35})`
      const x = rr() * w, y = rr() * h, l = 20 + rr() * 40
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.quadraticCurveTo(x + ox + l / 2, y + oy - 6, x + ox + l, y + oy); ctx.stroke() }
    }
  }, { repeat: true })
}

function windowTexture() { // daylight through sheer curtains, white glazing bars
  return canvasTexture(256, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#e2f3fa'); g.addColorStop(0.45, '#f4fafb'); g.addColorStop(1, '#fff9ee')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 18) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, 0, 8, h) }
    ctx.fillStyle = 'rgba(214,232,238,0.5)'; ctx.fillRect(0, h * 0.86, w, h * 0.14)
    ctx.fillStyle = '#ffffff'
    for (const x of [w / 3, (2 * w) / 3]) ctx.fillRect(x - 3, w / 2, 6, h)
    for (let y = w / 2; y < h; y += 70) ctx.fillRect(0, y - 3, w, 6)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6
    for (let i = 1; i < 6; i++) { const a = Math.PI + (i * Math.PI) / 6; ctx.beginPath(); ctx.moveTo(w / 2, w / 2); ctx.lineTo(w / 2 + Math.cos(a) * w, w / 2 + Math.sin(a) * w); ctx.stroke() }
    ctx.beginPath(); ctx.arc(w / 2, w / 2, w * 0.16, Math.PI, 0); ctx.stroke()
  })
}

function clerestoryTexture() { // Evans Hall-style glazing: pale glass between white mullions, 2.4 m per tile
  return canvasTexture(256, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#d6eef5'); g.addColorStop(0.5, '#f4fbfc'); g.addColorStop(1, '#cfe8f0')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    for (let x = -40; x < w; x += 90) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 30, h); ctx.lineTo(x + 70, 0); ctx.lineTo(x + 40, 0); ctx.fill() }
    ctx.fillStyle = '#fbfaf6'
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 5, h)
  }, { repeat: true })
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w)
  })
}

function shaftTexture() { // window light on the floor: bright at the wall, fading into the room
  return canvasTexture(64, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    const s = ctx.createLinearGradient(0, 0, w, 0)
    s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.2, 'rgba(0,0,0,0)'); s.addColorStop(0.8, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = s; ctx.fillRect(0, 0, w, h)
  })
}

function arrowTexture(fill = 'rgba(232,203,152,0.95)') { // a chevron pointing to +u (maple; navy in the grand hall)
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = fill
    ctx.beginPath(); ctx.moveTo(18, 30); ctx.lineTo(70, 30); ctx.lineTo(112, 64); ctx.lineTo(70, 98); ctx.lineTo(18, 98); ctx.lineTo(60, 64); ctx.closePath(); ctx.fill()
  })
}

// Lobby medallion: a compass rose ringed by "LINE OF DANCE" arrows running counter-clockwise (seen from above).
function medallionTexture() {
  return canvasTexture(1024, 1024, (ctx, w) => {
    const c = w / 2
    ctx.fillStyle = '#f1e6d1'; ctx.fillRect(0, 0, w, w)
    const ring = (r, lw, col) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke() }
    ctx.fillStyle = '#1b7f9c'; ctx.beginPath(); ctx.arc(c, c, 492, 0, Math.PI * 2); ctx.arc(c, c, 398, 0, Math.PI * 2, true); ctx.fill()
    ring(500, 8, '#c9a35c'); ring(392, 6, '#c9a35c')
    ctx.fillStyle = '#fffaf0'; ctx.font = '600 50px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const arcText = (text, mid, bottom) => {
      const chars = [...text], step = 0.083, span = step * (chars.length - 1)
      chars.forEach((ch, i) => {
        const a = bottom ? mid + span / 2 - i * step : mid - span / 2 + i * step
        ctx.save(); ctx.translate(c + Math.cos(a) * 445, c + Math.sin(a) * 445); ctx.rotate(bottom ? a - Math.PI / 2 : a + Math.PI / 2)
        ctx.fillText(ch, 0, 0); ctx.restore()
      })
    }
    arcText('LINE OF DANCE', Math.PI / 2, true) // nearest the camera, reading the way couples travel
    arcText('EVANS HALL BALLROOM', -Math.PI / 2, false)
    ctx.fillStyle = '#f3d9a6'
    for (const a of [-0.32, 0, 0.32, Math.PI - 0.32, Math.PI, Math.PI + 0.32]) { // counter-clockwise tangent = (sin a, -cos a)
      const px = c + Math.cos(a) * 445, py = c + Math.sin(a) * 445, tx = Math.sin(a), ty = -Math.cos(a), nx = Math.cos(a), ny = Math.sin(a)
      ctx.beginPath(); ctx.moveTo(px + tx * 30, py + ty * 30); ctx.lineTo(px - tx * 18 + nx * 22, py - ty * 18 + ny * 22); ctx.lineTo(px - tx * 18 - nx * 22, py - ty * 18 - ny * 22); ctx.closePath(); ctx.fill()
    }
    const star = (n, R, r, rot, fill) => {
      ctx.beginPath()
      for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R; ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr) }
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill()
    }
    star(4, 300, 70, -Math.PI / 4, '#d9b26a')
    star(4, 372, 78, -Math.PI / 2, '#0d3b52')
    ctx.fillStyle = '#e98a6b'; ctx.beginPath(); ctx.arc(c, c, 62, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(c, c, 26, 0, Math.PI * 2); ctx.fill()
  })
}

function corkTexture() { // Ross Library team drill board
  return canvasTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#c69c6d'; ctx.fillRect(0, 0, w, h)
    const rr = rng(31)
    for (let i = 0; i < 900; i++) { ctx.fillStyle = rr() > 0.5 ? 'rgba(120,80,40,0.35)' : 'rgba(240,210,160,0.35)'; ctx.fillRect(rr() * w, rr() * h, 2, 2) }
    ctx.fillStyle = '#1b7f9c'; ctx.fillRect(0, 0, w, 52)
    ctx.fillStyle = '#fffaf0'; ctx.font = '600 32px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('TEAM DRILL BOARD', w / 2, 37)
    const cards = ['Rise & fall', 'Natural turn', 'Cuban motion', 'Spot turns', 'Frame & hold', 'Timing: S Q Q']
    cards.forEach((t, i) => {
      const x = 22 + (i % 3) * 162, y = 70 + Math.floor(i / 3) * 122
      ctx.save(); ctx.translate(x + 70, y + 50); ctx.rotate((rr() - 0.5) * 0.08); ctx.translate(-70, -50)
      ctx.fillStyle = ['#fffaf0', '#d8f1f7', '#ffe3d6'][i % 3]; ctx.fillRect(0, 0, 140, 100)
      ctx.fillStyle = '#0d3b52'; ctx.font = '600 17px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillText(t, 10, 26)
      ctx.fillStyle = 'rgba(13,59,82,0.35)'; for (let l = 0; l < 4; l++) ctx.fillRect(10, 42 + l * 13, 80 + rr() * 40, 3)
      ctx.fillStyle = '#e98a6b'; ctx.beginPath(); ctx.arc(70, 6, 6, 0, 7); ctx.fill()
      ctx.restore()
    })
  })
}

function calendarTexture() { // Beinecke Terrace competition planner
  return canvasTexture(512, 384, (ctx, w, h) => {
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#1b7f9c'; ctx.fillRect(0, 0, w, 70)
    ctx.fillStyle = '#fff'; ctx.font = '600 44px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('DECEMBER', w / 2, 50)
    ctx.font = '26px Georgia, serif'
    for (let d = 0; d < 31; d++) {
      const cx = 44 + (d % 7) * 70, cy = 112 + Math.floor(d / 7) * 56
      if (d === 4 || d === 12) { ctx.fillStyle = '#e98a6b'; ctx.beginPath(); ctx.arc(cx, cy - 9, 22, 0, 7); ctx.fill(); ctx.fillStyle = '#fff' } else ctx.fillStyle = '#0d3b52'
      ctx.fillText(String(d + 1), cx, cy)
    }
  })
}

function clubWallTexture() { // dark acoustic panels, 2 m wide × wall height
  return canvasTexture(256, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#1d2736'); g.addColorStop(1, '#121822')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 32) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, 0, 3, h); ctx.fillStyle = 'rgba(120,160,200,0.06)'; ctx.fillRect(x + 3, 0, 2, h) }
  }, { repeat: true })
}

function clubFloorTexture() { // dark glossy tiles, 0.6 m, 2.4 m per tile
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#0a0e14'; ctx.fillRect(0, 0, w, h)
    const rr = rng(41)
    for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) {
      const t = rr()
      ctx.fillStyle = `rgb(${(20 + t * 10) | 0},${(26 + t * 12) | 0},${(36 + t * 14) | 0})`
      ctx.fillRect(x + 2, y + 2, 124, 124)
    }
  }, { repeat: true })
}

function neonTexture() {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.font = 'italic 600 74px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.shadowColor = '#ff7a5c'; ctx.shadowBlur = 24
    ctx.fillStyle = '#ffb59f'; ctx.fillText('Social Club', w / 2, h / 2 + 4)
    ctx.shadowColor = '#3fd0e0'; ctx.shadowBlur = 14; ctx.lineWidth = 2; ctx.strokeStyle = '#9ff0f7'; ctx.strokeText('Social Club', w / 2, h / 2 + 4)
  })
}

function eqTexture() { // DJ booth front: an equaliser in sea-blue to coral
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0b1018'; ctx.fillRect(0, 0, w, h)
    const rr = rng(51)
    for (let i = 0; i < 32; i++) {
      const bh = 20 + rr() * (h - 34)
      const g = ctx.createLinearGradient(0, h, 0, h - bh)
      g.addColorStop(0, '#2ec4d6'); g.addColorStop(1, '#ff7a5c')
      ctx.fillStyle = g; ctx.fillRect(8 + i * 15.7, h - 8 - bh, 10, bh)
    }
  })
}

function ballTexture() { // mirror-ball facets
  return canvasTexture(256, 128, (ctx, w, h) => {
    const rr = rng(61)
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { const t = 140 + rr() * 115; ctx.fillStyle = `rgb(${t},${t},${t + 8})`; ctx.fillRect(x, y, 7, 7) }
  })
}

function dotsTexture() { // light flecks thrown by the mirror ball
  return canvasTexture(512, 512, (ctx, w) => {
    const rr = rng(71), c = w / 2
    for (let i = 0; i < 150; i++) {
      const a = rr() * Math.PI * 2, r = Math.sqrt(rr()) * (c - 12), x = c + Math.cos(a) * r, y = c + Math.sin(a) * r
      const g = ctx.createRadialGradient(x, y, 0, x, y, 7)
      const col = ['255,255,255', '120,230,240', '255,170,140'][i % 3]
      g.addColorStop(0, `rgba(${col},0.95)`); g.addColorStop(1, `rgba(${col},0)`)
      ctx.fillStyle = g; ctx.fillRect(x - 7, y - 7, 14, 14)
    }
  })
}

function beamTexture() { // spotlight cone: bright at the lamp (v = 1), fading to the floor
  return canvasTexture(8, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0.03)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  })
}

// ---------- the grand competition hall ----------
function marbleTexture() { // polished black marble: 4 × 4 tiles of 0.9 m with pale veins (3.6 m per texture tile)
  const S = 1024, n = 4, ts = S / n
  return canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#0c1016'; ctx.fillRect(0, 0, S, S)
    const rr = rng(404)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x0 = i * ts, y0 = j * ts, t = rr()
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, ts, ts); ctx.clip()
      ctx.fillStyle = `rgb(${(16 + t * 9) | 0},${(20 + t * 10) | 0},${(27 + t * 12) | 0})`; ctx.fillRect(x0, y0, ts, ts)
      for (let k = 0; k < 8; k++) { // cloudy depth
        const cx = x0 + rr() * ts, cy = y0 + rr() * ts, cr = 30 + rr() * 100
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr)
        g.addColorStop(0, `rgba(${rr() < 0.55 ? '72,86,104' : '36,42,54'},${0.16 + rr() * 0.16})`); g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g; ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2)
      }
      const ang = rr() * Math.PI, veins = 1 + Math.floor(rr() * 3)
      for (let v = 0; v < veins; v++) { // wandering veins along the tile's grain, a few with hairline branches
        const off = (rr() - 0.5) * ts, warm = rr() < 0.22, pts = []
        let px = x0 + ts / 2 - Math.cos(ang) * ts * 0.75 - Math.sin(ang) * off, py = y0 + ts / 2 - Math.sin(ang) * ts * 0.75 + Math.cos(ang) * off, a = ang
        for (let s = 0; s < 44; s++) { pts.push([px, py]); a += (rr() - 0.5) * 0.55; px += Math.cos(a) * 9; py += Math.sin(a) * 9 }
        const stroke = (p, lw, col) => { ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath(); p.forEach(([x, y], q) => (q ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke() }
        stroke(pts, 9, warm ? 'rgba(190,160,110,0.04)' : 'rgba(200,212,224,0.04)')
        stroke(pts, 3, warm ? 'rgba(205,172,120,0.08)' : 'rgba(214,222,232,0.08)')
        stroke(pts, 1, warm ? 'rgba(228,196,140,0.3)' : 'rgba(236,241,246,0.3)')
        const at = Math.floor(rr() * 30), br = [pts[at]]
        let bx = pts[at][0], by = pts[at][1], ba = ang + (rr() < 0.5 ? 0.7 : -0.7)
        for (let s = 0; s < 12; s++) { ba += (rr() - 0.5) * 0.6; bx += Math.cos(ba) * 7; by += Math.sin(ba) * 7; br.push([bx, by]) }
        stroke(br, 0.7, 'rgba(225,232,240,0.2)')
      }
      ctx.restore()
    }
    ctx.fillStyle = 'rgba(78,86,98,0.9)' // joints (1 px at each texture edge: 2 px where tiles meet)
    for (let i = 0; i <= n; i++) { ctx.fillRect(i * ts - 1, 0, 2, S); ctx.fillRect(0, i * ts - 1, S, 2) }
  }, { repeat: true })
}

function inlayTexture() { // the dance-floor border: sand marble, brass stringing, navy lozenges (512 px = 8 × its width)
  return canvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#d6c29b'; ctx.fillRect(0, 0, w, h)
    const rr = rng(17)
    for (let i = 0; i < 26; i++) {
      const y = rr() * h
      ctx.strokeStyle = `rgba(${rr() < 0.5 ? '255,250,235' : '150,122,84'},0.2)`; ctx.lineWidth = 1 + rr() * 2
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.33, y + (rr() - 0.5) * 30, w * 0.66, y + (rr() - 0.5) * 30, w, y); ctx.stroke()
    }
    ctx.fillStyle = '#b48c48'; ctx.fillRect(0, 5, w, 3); ctx.fillRect(0, h - 8, w, 3)
    for (let x = 32; x < w; x += 64) {
      ctx.beginPath(); ctx.moveTo(x - 18, h / 2); ctx.lineTo(x, h / 2 - 12); ctx.lineTo(x + 18, h / 2); ctx.lineTo(x, h / 2 + 12); ctx.closePath()
      ctx.fillStyle = '#1d4a63'; ctx.fill(); ctx.strokeStyle = '#c9a35c'; ctx.lineWidth = 2; ctx.stroke()
    }
  }, { repeat: true })
}

// Deep blue venetian plaster for one 3.5 m bay over the full 7.6 m height: gilt panel mouldings at both storeys,
// a dado rail and skirting, the string course under the balcony, and a dentil frieze under the cornice.
function grandBayTexture() {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    const Y = (m) => h * (1 - m / H_GRAND)
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#356a85'); g.addColorStop(0.5, '#2d5f79'); g.addColorStop(1, '#27536b')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    const rr = rng(23)
    for (let i = 0; i < 300; i++) {
      const x = rr() * w, y = rr() * h, a = 10 + rr() * 50, b = 6 + rr() * 30, rot = rr() * 3
      ctx.fillStyle = `rgba(${rr() > 0.5 ? '130,180,200' : '10,30,45'},${0.03 + rr() * 0.04})`
      for (const ox of [-w, 0, w]) { ctx.beginPath(); ctx.ellipse(x + ox, y, a, b, rot, 0, 7); ctx.fill() }
    }
    const gilt = (x, y, ww, hh) => {
      ctx.lineWidth = 6; ctx.strokeStyle = '#c9a35c'; ctx.strokeRect(x, y, ww, hh)
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,236,190,0.6)'; ctx.strokeRect(x + 11, y + 11, ww - 22, hh - 22)
      ctx.fillStyle = '#c9a35c'
      for (const [cx, cy] of [[x, y], [x + ww, y], [x, y + hh], [x + ww, y + hh]]) { ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 7); ctx.fill() }
    }
    gilt(64, Y(3.3), w - 128, Y(1.2) - Y(3.3))
    gilt(64, Y(5.3), w - 128, Y(4.25) - Y(5.3))
    ctx.fillStyle = '#d8c39b'; ctx.fillRect(0, Y(1.0), w, 7); ctx.fillStyle = '#c9a35c'; ctx.fillRect(0, Y(1.0) + 7, w, 2)
    ctx.fillStyle = '#d8c6a2'; ctx.fillRect(0, Y(0.32), w, h - Y(0.32)); ctx.fillStyle = '#b48c48'; ctx.fillRect(0, Y(0.32), w, 3)
    ctx.fillStyle = '#dcc9a3'; ctx.fillRect(0, Y(3.98), w, Y(3.6) - Y(3.98))
    ctx.fillStyle = '#e3d2ae'; ctx.fillRect(0, 0, w, Y(H_GRAND - 0.42))
    ctx.fillStyle = 'rgba(140,110,70,0.35)'; for (let x = 4; x < w; x += 19) ctx.fillRect(x, Y(H_GRAND - 0.27), 10, 11)
    ctx.fillStyle = '#c9a35c'; ctx.fillRect(0, Y(H_GRAND - 0.42) - 3, w, 3)
  }, { repeat: true })
}

function friezeTexture() { // the balcony fascia: a gilt running scroll on sand (1.4 m per tile)
  return canvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#dcc9a3'; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(120,95,60,0.25)'; ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h - 4, w, 4)
    ctx.fillStyle = '#c9a35c'; ctx.fillRect(0, 6, w, 2); ctx.fillRect(0, h - 8, w, 2)
    ctx.strokeStyle = '#b48c48'; ctx.lineWidth = 3
    ctx.beginPath()
    for (let x = 0; x <= w; x += 2) { const y = h / 2 + Math.sin((x / w) * Math.PI * 8) * 11; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
    ctx.stroke()
    for (let k = 0; k < 8; k++) { // a curl tucked inside every half wave
      const x = ((k + 0.5) * w) / 8, y = h / 2 + (k % 2 ? 7 : -7)
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 1.6); ctx.stroke()
      ctx.fillStyle = '#c9a35c'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill()
    }
  }, { repeat: true })
}

function cofferTexture() { // coffered ceiling: 2 × 2 sand coffers with gilt mouldings and rosettes (3.6 m per tile)
  return canvasTexture(512, 512, (ctx, w) => {
    ctx.fillStyle = '#e6d5b2'; ctx.fillRect(0, 0, w, w)
    const c = w / 2
    for (const [x0, y0] of [[0, 0], [c, 0], [0, c], [c, c]]) {
      const g = ctx.createLinearGradient(x0, y0, x0 + c, y0 + c)
      g.addColorStop(0, '#d5bf94'); g.addColorStop(1, '#efe3c6')
      ctx.fillStyle = g; ctx.fillRect(x0 + 22, y0 + 22, c - 44, c - 44)
      ctx.strokeStyle = '#c9a35c'; ctx.lineWidth = 4; ctx.strokeRect(x0 + 30, y0 + 30, c - 60, c - 60)
      ctx.strokeStyle = 'rgba(150,120,80,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(x0 + 44, y0 + 44, c - 88, c - 88)
      ctx.fillStyle = '#c9a35c'
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; ctx.beginPath(); ctx.ellipse(x0 + c / 2 + Math.cos(a) * 16, y0 + c / 2 + Math.sin(a) * 16, 14, 6, a, 0, 7); ctx.fill() }
      ctx.beginPath(); ctx.arc(x0 + c / 2, y0 + c / 2, 8, 0, 7); ctx.fill()
    }
  }, { repeat: true })
}

function doorLightTexture() { // daylight beyond the hall's great doorway
  return canvasTexture(256, 512, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.62, 10, w / 2, h * 0.62, h * 0.72)
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#fffaf0'); g.addColorStop(1, '#f0e1c0')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(214,196,160,0.3)'; ctx.fillRect(0, h * 0.95, w, h * 0.05)
  })
}

// The two scoreboards: navy boards with a gilt frame, a title and up to 8 lines. A tab in a line splits it into a
// left part and a right-aligned part (e.g. "1. Evans Hall Stars\t48.5").
const BOARD_PX = { w: 1024, h: 640 }
function drawScoreboard(canvas, data = {}) {
  const ctx = canvas.getContext('2d'), w = BOARD_PX.w, h = BOARD_PX.h
  const fit = (s, max) => {
    if (ctx.measureText(s).width <= max) return s
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1)
    return s + '…'
  }
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#103549'); g.addColorStop(1, '#0a2433')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#d9b26a'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10)
  ctx.lineWidth = 2; ctx.strokeRect(22, 22, w - 44, h - 44)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f0d491'; ctx.font = '700 64px Georgia, serif'; ctx.textAlign = 'center'
  ctx.fillText(fit(String(data.title ?? ''), w - 120), w / 2, 80)
  ctx.fillRect(w * 0.2, 124, w * 0.6, 3)
  const lines = (Array.isArray(data.lines) ? data.lines : []).slice(0, 8), top = 146, lh = (h - top - 34) / 8
  ctx.font = '500 40px Georgia, serif'
  lines.forEach((ln, i) => {
    const y = top + lh * (i + 0.5), [left = '', right] = String(ln ?? '').split('\t')
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(40, y - lh / 2 + 3, w - 80, lh - 6) }
    ctx.fillStyle = '#f5ecd9'; ctx.textAlign = 'left'; ctx.fillText(fit(left, right ? w - 330 : w - 112), 56, y)
    if (right) { ctx.fillStyle = '#f0d491'; ctx.textAlign = 'right'; ctx.fillText(fit(right, 240), w - 56, y) }
  })
}
const BOARD_DEFAULT = {
  left: { title: 'ON THE FLOOR', lines: ['Heat 1\tWaltz', 'Heat 2\tTango', 'Heat 3\tViennese Waltz', 'Heat 4\tFoxtrot', 'Heat 5\tQuickstep'] },
  right: { title: 'LEADERBOARD', lines: ['Dance a routine', 'to post your first score'] },
}

// A warm ballroom (or a dark club, or the blue-and-gold grand hall) as an equirectangular environment,
// for glossy floors, gilt and crystal.
function envTexture(kind = 'classic') {
  const club = kind === 'club'
  const t = canvasTexture(512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    if (kind === 'grand') {
      g.addColorStop(0, '#8f7c5e'); g.addColorStop(0.22, '#b29c74'); g.addColorStop(0.26, '#30627b'); g.addColorStop(0.6, '#24495e'); g.addColorStop(0.63, '#11161e'); g.addColorStop(1, '#07090d')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      // (grazing reflections on the marble sample just above the horizon (y ≈ 0.42–0.5 h): keep that band deep blue)
      const hz = ctx.createLinearGradient(0, h * 0.4, 0, h * 0.6)
      hz.addColorStop(0, 'rgba(18,40,54,0)'); hz.addColorStop(0.35, 'rgba(18,40,54,0.55)'); hz.addColorStop(1, 'rgba(18,40,54,0.2)')
      ctx.fillStyle = hz; ctx.fillRect(0, h * 0.4, w, h * 0.2)
      for (let i = 0; i < 16; i++) { ctx.fillStyle = 'rgba(232,220,194,0.22)'; ctx.fillRect((i * w) / 16, h * 0.27, 5, h * 0.3) } // columns
      ctx.fillStyle = 'rgba(216,195,155,0.7)'; ctx.fillRect(0, h * 0.36, w, 5) // the balcony line
      for (const [x, ww, top] of [[w * 0.25, 40, 0.3], [w * 0.75, 24, 0.38], [w * 0.5, 18, 0.4], [0, 18, 0.4], [w, 18, 0.4]]) {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - ww / 2, h * top, ww, h * (0.6 - top)) // the doorway and the windows
        ctx.beginPath(); ctx.arc(x, h * top, ww / 2, Math.PI, 0); ctx.fill()
      }
      for (let i = 0; i < 16; i++) {
        const x = ((i + 0.5) * w) / 16, y = h * (i % 2 ? 0.35 : 0.5), gg = ctx.createRadialGradient(x, y, 0, x, y, 9)
        gg.addColorStop(0, 'rgba(255,230,170,1)'); gg.addColorStop(1, 'rgba(255,230,170,0)')
        ctx.fillStyle = gg; ctx.fillRect(x - 9, y - 9, 18, 18)
      }
      for (const x of [w * 0.1, w * 0.6]) {
        const gg = ctx.createRadialGradient(x, h * 0.08, 0, x, h * 0.08, 30)
        gg.addColorStop(0, 'rgba(255,240,205,1)'); gg.addColorStop(1, 'rgba(255,240,205,0)')
        ctx.fillStyle = gg; ctx.fillRect(x - 30, h * 0.08 - 30, 60, 60)
      }
    } else if (club) {
      g.addColorStop(0, '#0d121b'); g.addColorStop(0.5, '#151c28'); g.addColorStop(1, '#07090d')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      const rr = rng(81)
      for (let i = 0; i < 14; i++) {
        const x = rr() * w, y = h * (0.15 + rr() * 0.4), r = 12 + rr() * 30
        const gg = ctx.createRadialGradient(x, y, 0, x, y, r)
        gg.addColorStop(0, i % 2 ? 'rgba(63,208,224,0.9)' : 'rgba(255,122,92,0.9)'); gg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = gg; ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
      for (let i = 0; i < 60; i++) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(rr() * w, rr() * h * 0.6, 1.5, 1.5) }
    } else {
      g.addColorStop(0, '#fff8ec'); g.addColorStop(0.3, '#f6ead6'); g.addColorStop(0.62, '#e8dac1'); g.addColorStop(0.66, '#7d5536'); g.addColorStop(1, '#4f331f')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 12; i++) {
        const x = (i * w) / 12 + 10
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, h * 0.3, 18, h * 0.31)
        ctx.fillStyle = '#6d8b9e'; ctx.fillRect(x - 7, h * 0.27, 6, h * 0.36); ctx.fillRect(x + 19, h * 0.27, 6, h * 0.36)
      }
      for (const x of [w * 0.25, w * 0.75]) {
        const gg = ctx.createRadialGradient(x, h * 0.1, 0, x, h * 0.1, 26)
        gg.addColorStop(0, 'rgba(255,240,200,1)'); gg.addColorStop(1, 'rgba(255,240,200,0)')
        ctx.fillStyle = gg; ctx.fillRect(x - 26, h * 0.1 - 26, 52, 52)
      }
    }
  })
  t.mapping = THREE.EquirectangularReflectionMapping
  return t
}

// ====================================================================================================
// Shared geometry builders
// ====================================================================================================
const drapeCache = new Map()
// A pleated drape from the floor to `height`, gathered by a tie-back toward its outer edge.
// side = +1: the drape right of a window (outer edge at +x); -1: left of it. Centred on x = 0.
function drapeGeom(side, height) {
  const key = `${side}:${height.toFixed(2)}`
  if (!drapeCache.has(key)) {
    const wTop = 0.62, g = new THREE.PlaneGeometry(1, 1, 14, 20), p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5 // u: 0 = inner (window) edge, 1 = outer edge
      const y = v * height
      const tie = Math.exp(-(((y - 1.05) / 0.5) ** 2))
      const width = wTop * (1 - 0.5 * tie) * (y < 0.3 ? 1 + (0.3 - y) * 0.7 : 1)
      const x = side * (wTop / 2 - (1 - u) * width)
      const z = 0.045 * Math.sin(u * Math.PI * 7) * (1 - 0.4 * tie) + 0.05 * tie + (y < 0.3 ? (0.3 - y) * 0.2 : 0)
      p.setXYZ(i, x, y, z)
    }
    g.computeVertexNormals()
    drapeCache.set(key, g)
  }
  return drapeCache.get(key).clone()
}

// A palm/kentia leaf growing along +z, arching up then drooping. len/width in metres.
function leafGeom(len, width, droop, fold = 0.3) {
  const g = new THREE.PlaneGeometry(1, 1, 2, 10), p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), s = p.getY(i) + 0.5
    const taper = Math.sin(Math.PI * Math.min(1, s * 1.02)) ** 0.6
    p.setXYZ(i, u * width * taper, Math.sin(s * Math.PI * 0.5) * len * 0.3 - s * s * droop * len + Math.abs(u) * width * fold, s * len)
  }
  g.computeVertexNormals()
  return g
}

// One chandelier's geometry, built once and shared (each chandelier gets its own materials to fade).
// dy raises the whole chandelier; its rod reaches up to `top`.
function chandelierGeoms(dy = 0, top0 = H + 0.45) {
  const gold = [], beads = [], candles = [], flames = []
  const top = top0 - dy
  gold.push(cyl(0.016, 0.016, top - 4.95, 0, (top + 4.95) / 2, 0, 6))
  gold.push(cyl(0.07, 0.15, 0.12, 0, 4.92, 0, 14))
  gold.push(xf(new THREE.TorusGeometry(0.15, 0.02, 6, 20), 0, 4.85, 0, 0, Math.PI / 2))
  gold.push(xf(new THREE.TorusGeometry(0.58, 0.022, 6, 40), 0, 4.3, 0, 0, Math.PI / 2))
  gold.push(xf(new THREE.TorusGeometry(0.34, 0.016, 6, 32), 0, 3.98, 0, 0, Math.PI / 2))
  gold.push(cyl(0.014, 0.014, 1.0, 0, 4.4, 0, 6))
  const nC = 12
  for (let i = 0; i < nC; i++) {
    const a = (i / nC) * Math.PI * 2, x = Math.cos(a) * 0.58, z = Math.sin(a) * 0.58
    gold.push(cyl(0.032, 0.02, 0.05, x, 4.34, z, 8))
    gold.push(rod(new THREE.Vector3(0, 4.12, 0), new THREE.Vector3(x * 0.97, 4.3, z * 0.97), 0.01))
    candles.push(cyl(0.016, 0.016, 0.13, x, 4.43, z, 8))
    flames.push(xf(new THREE.ConeGeometry(0.017, 0.065, 6), x, 4.53, z))
  }
  const bead = (x, y, z, r = 0.022) => beads.push(xf(new THREE.OctahedronGeometry(r, 0), x, y, z))
  for (let i = 0; i < 18; i++) { // the tent: strands from the crown down to the candle ring
    const a = (i / 18) * Math.PI * 2
    for (let j = 1; j <= 8; j++) { const t = j / 9, r = 0.15 + 0.41 * t; bead(Math.cos(a) * r, 4.85 - 0.53 * t - Math.sin(t * Math.PI) * 0.05, Math.sin(a) * r, 0.018) }
  }
  for (let i = 0; i < 7; i++) { // the basket: rings shrinking downward
    const t = (i + 1) / 8, r = 0.6 * Math.sqrt(1 - t * t), y = 4.24 - t * 0.62, n = Math.max(6, Math.round((Math.PI * 2 * r) / 0.055))
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + i * 0.2; bead(Math.cos(a) * r, y, Math.sin(a) * r, 0.021) }
  }
  for (let i = 0; i < 16; i++) { // drops under the candle ring
    const a = ((i + 0.5) / 16) * Math.PI * 2
    for (let j = 0; j < 4; j++) bead(Math.cos(a) * 0.62, 4.22 - j * 0.07, Math.sin(a) * 0.62, 0.017)
  }
  bead(0, 3.58, 0, 0.06); bead(0, 3.48, 0, 0.035)
  const out = { gold: mergeGeoms(gold), beads: mergeGeoms(beads), candles: mergeGeoms(candles), flames: mergeGeoms(flames) }
  for (const g of Object.values(out)) { g.translate(0, dy, 0); g.computeBoundingSphere() }
  return out
}

// The grand hall's centrepiece: a huge tiered ("wedding cake") crystal chandelier hanging from the ceiling at `ceil`:
// a crown of candles on gilt arms, a tent of crystal strands, five shrinking tiers of festooned crystal curtains
// with lamps inside, a crystal bowl and a final drop (lowest point ≈ 4.08 m).
function grandChandelierGeoms(ceil) {
  const gold = [], beads = [], candles = [], flames = [], bulbs = []
  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  const bead = (x, y, z, r = 0.022) => beads.push(xf(new THREE.OctahedronGeometry(r, 0), x, y, z, 0, 0, 0, 1, 1.5, 1))
  gold.push(cyl(0.42, 0.5, 0.05, 0, ceil - 0.025, 0, 24), xf(new THREE.TorusGeometry(0.46, 0.025, 6, 32), 0, ceil - 0.05, 0, 0, Math.PI / 2))
  gold.push(cyl(0.028, 0.028, ceil - 6.95, 0, (ceil + 6.95) / 2, 0, 8), cyl(0.12, 0.3, 0.16, 0, 6.9, 0, 18), cyl(0.045, 0.045, 2.1, 0, 5.85, 0, 8))
  // the candle crown: 16 arms out to a ring at 1.2 m, 8 more to a raised inner ring
  for (const [n, R, y, from, ph] of [[16, 1.2, 6.42, 6.32, 0], [8, 0.62, 6.74, 6.66, 0.5]]) {
    gold.push(xf(new THREE.TorusGeometry(R, 0.024, 6, 64), 0, y, 0, 0, Math.PI / 2))
    for (let i = 0; i < n; i++) {
      const a = ((i + ph) / n) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R
      gold.push(rod(V(0, from, 0), V(x * 0.55, from - 0.07, z * 0.55), 0.011), rod(V(x * 0.55, from - 0.07, z * 0.55), V(x, y, z), 0.011))
      gold.push(cyl(0.038, 0.024, 0.05, x, y + 0.03, z, 8))
      candles.push(cyl(0.018, 0.018, 0.17, x, y + 0.14, z, 8))
      flames.push(xf(new THREE.ConeGeometry(0.02, 0.075, 6), x, y + 0.265, z))
    }
  }
  for (let i = 0; i < 32; i++) { // the tent: strands from the crown down to the widest tier
    const a = (i / 32) * Math.PI * 2
    for (let j = 1; j <= 9; j++) { const t = j / 10, r = 0.3 + 1.0 * t; bead(Math.cos(a) * r, 6.86 - 0.52 * t - Math.sin(t * Math.PI) * 0.06, Math.sin(a) * r, 0.019) }
  }
  const tiers = [[1.32, 6.3], [1.12, 5.92], [0.92, 5.54], [0.72, 5.16], [0.52, 4.8]]
  for (const [R, y] of tiers) {
    gold.push(xf(new THREE.TorusGeometry(R, 0.022, 6, 64), 0, y, 0, 0, Math.PI / 2))
    for (let s = 0; s < 4; s++) { const a = (s / 4) * Math.PI * 2 + 0.4; gold.push(rod(V(0, y + 0.1, 0), V(Math.cos(a) * R, y, Math.sin(a) * R), 0.009)) }
    const n = Math.round((Math.PI * 2 * R) / 0.07)
    for (let k = 0; k < n; k++) { // a curtain of strands, longer in festoons
      const a = (k / n) * Math.PI * 2, len = 0.32 + 0.09 * Math.abs(Math.sin(a * 6)), m = Math.round(len / 0.058)
      for (let q = 0; q < m; q++) bead(Math.cos(a) * R, y - 0.04 - q * 0.058, Math.sin(a) * R, 0.02)
    }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + y; bulbs.push(sph(0.045, Math.cos(a) * R * 0.55, y - 0.16, Math.sin(a) * R * 0.55, 8, 6)) }
  }
  for (let i = 0; i < 5; i++) { // the bowl
    const t = (i + 1) / 6, r = 0.48 * Math.sqrt(1 - t * t), y = 4.76 - t * 0.4, n = Math.max(6, Math.round((Math.PI * 2 * r) / 0.06))
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + i * 0.3; bead(Math.cos(a) * r, y, Math.sin(a) * r, 0.021) }
  }
  bead(0, 4.3, 0, 0.07); bead(0, 4.18, 0, 0.045); bead(0, 4.11, 0, 0.03)
  return { gold: mergeGeoms(gold), beads: mergeGeoms(beads), candles: mergeGeoms(candles), flames: mergeGeoms(flames), bulbs: mergeGeoms(bulbs) }
}

// A free-standing column of the grand hall (centred on x = z = 0): plinth, moulded base, a shaft with a slight
// entasis, and a gilt Corinthian-style capital (necking, bell, two rows of leaves, corner volutes, abacus) whose top
// is BAL.spring.
function columnGeoms() {
  const stone = [], gold = []
  stone.push(box(0.48, 0.22, 0.48, 0, 0.11, 0))
  const prof = [[0, 0.22], [0.215, 0.22], [0.215, 0.26], [0.19, 0.29], [0.2, 0.32], [0.175, 0.36], [0.16, 0.42], [0.163, 1.2], [0.156, 2.0], [0.145, 2.37], [0, 2.37]]
  stone.push(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 16))
  gold.push(xf(new THREE.TorusGeometry(0.15, 0.022, 6, 20), 0, 2.38, 0, 0, Math.PI / 2))
  gold.push(cyl(0.25, 0.15, 0.25, 0, 2.505, 0, 16))
  for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) {
    const a = ((i + row * 0.5) * Math.PI) / 4, R = 0.17 + row * 0.04
    gold.push(xf(new THREE.SphereGeometry(1, 6, 4), Math.cos(a) * R, 2.46 + row * 0.08, Math.sin(a) * R, Math.atan2(Math.cos(a), Math.sin(a)), 0.4, 0, 0.055, 0.1, 0.028))
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    gold.push(xf(new THREE.TorusGeometry(0.045, 0.015, 6, 12), Math.cos(a) * 0.24, 2.59, Math.sin(a) * 0.24, Math.atan2(Math.cos(a), Math.sin(a))))
  }
  gold.push(box(0.52, 0.08, 0.52, 0, BAL.spring - 0.04, 0))
  return { stone: mergeGeoms(stone), gold: mergeGeoms(gold) }
}
// A turned baluster, 0.68 m tall, standing on y = 0.
function balusterGeom() {
  const prof = [[0, 0], [0.058, 0], [0.058, 0.05], [0.042, 0.08], [0.038, 0.12], [0.062, 0.24], [0.066, 0.3], [0.048, 0.4], [0.03, 0.5], [0.034, 0.56], [0.05, 0.6], [0.058, 0.62], [0.058, 0.68], [0, 0.68]]
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 8)
}

// Seated spectator parts in a person's frame (facing +z, seat top at y ≈ 0.53, chair back at -z).
function crowdGeoms() {
  const m = (...g) => mergeGeoms(g)
  const leg = ([sx, sz]) => cyl(0.016, 0.014, 0.445, sx * 0.19, 0.2225, sz * 0.18, 4)
  return {
    chair: m(box(0.44, 0.045, 0.42, 0, 0.445, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(leg),
      cyl(0.016, 0.016, 0.56, -0.19, 0.72, -0.19, 4), cyl(0.016, 0.016, 0.56, 0.19, 0.72, -0.19, 4),
      box(0.4, 0.022, 0.022, 0, 0.64, -0.19), box(0.4, 0.022, 0.022, 0, 0.76, -0.19), box(0.4, 0.022, 0.022, 0, 0.88, -0.19), box(0.44, 0.05, 0.035, 0, 0.99, -0.19)),
    cushion: m(box(0.42, 0.06, 0.4, 0, 0.5, 0.005)),
    stool: m(cyl(0.2, 0.19, 0.07, 0, 0.775, 0, 16), cyl(0.028, 0.028, 0.74, 0, 0.4, 0, 8),
      xf(new THREE.TorusGeometry(0.17, 0.012, 6, 20), 0, 0.3, 0, 0, Math.PI / 2), cyl(0.2, 0.22, 0.03, 0, 0.015, 0, 16)),
    sofa: m(box(0.72, 0.45, 0.66, 0, 0.225, -0.02), box(0.72, 0.5, 0.16, 0, 0.58, -0.3)),
    torso: m(xf(new THREE.CylinderGeometry(0.165, 0.145, 0.5, 10), 0, 0.9, -0.06, 0, -0.08, 0, 1, 1, 0.62),
      xf(new THREE.SphereGeometry(1, 10, 4), 0, 1.13, -0.08, 0, 0, 0, 0.19, 0.075, 0.11)),
    thighs: m(box(0.36, 0.15, 0.46, 0, 0.6, 0.1)),
    shins: m(box(0.11, 0.48, 0.12, -0.1, 0.3, 0.33), box(0.11, 0.48, 0.12, 0.1, 0.3, 0.33)),
    shoes: m(box(0.1, 0.07, 0.25, -0.1, 0.035, 0.4), box(0.1, 0.07, 0.25, 0.1, 0.035, 0.4)),
    skirt: m(xf(new THREE.CylinderGeometry(0.22, 0.3, 0.56, 10), 0, 0.3, 0.24, 0, 0, 0, 1, 1, 0.85)),
    arms: m(box(0.075, 0.3, 0.085, -0.205, 0.98, -0.06, 0, 0, 0.08), box(0.075, 0.3, 0.085, 0.205, 0.98, -0.06, 0, 0, -0.08),
      box(0.07, 0.07, 0.3, -0.16, 0.77, 0.08, 0, 0.42), box(0.07, 0.07, 0.3, 0.16, 0.77, 0.08, 0, 0.42)),
    skin: m(cyl(0.045, 0.05, 0.1, 0, 1.2, -0.06, 6), sph(0.042, -0.14, 0.7, 0.24, 6, 4), sph(0.042, 0.14, 0.7, 0.24, 6, 4)),
    head: m(xf(new THREE.SphereGeometry(0.1, 12, 8), 0, 1.33, -0.05, 0, 0, 0, 1, 1.15, 1.05)),
    hair: m(xf(new THREE.SphereGeometry(0.108, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 1.35, -0.065, 0, -0.35)),
    bun: m(sph(0.058, 0, 1.4, -0.16, 8, 5)),
    shirt: m(box(0.1, 0.26, 0.012, 0, 1.0, 0.045, 0, -0.08)),
  }
}

const SUITS = [0x1f2d44, 0x2b2f36, 0x15171c, 0x47607a, 0xb8a07a, 0x3b3f4a]
const GOWNS = [0xc98b8b, 0xe3cfa5, 0x3a7fa0, 0x6e2537, 0x2f7d74, 0x23365a, 0xe0876a, 0x9a88b8, 0xd8c3b0, 0x1b7f9c]
const SKINS = [0xf1c6a5, 0xe8b894, 0xd9a77f, 0xc68a5e, 0x8d5f3f, 0x5e3b26]
const HAIR_F = [0x2b1d14, 0x161616, 0x6b4a2b, 0xb98a4e, 0x8a3b1f, 0xd9d4cc]
const HAIR_M = [0x2b1d14, 0x161616, 0x4a3426, 0xa9a49c, 0xd9d4cc]
function person(rand, opts = {}) {
  const pick = (a) => a[Math.floor(rand() * a.length)]
  const female = opts.female ?? rand() < 0.52
  const outfit = opts.outfit ?? (female ? pick(GOWNS) : pick(SUITS))
  return {
    female, outfit, skin: pick(SKINS), hair: pick(female ? HAIR_F : HAIR_M), bare: female && rand() < 0.6,
    shoe: female ? pick([0x1b1b1b, 0xd9b26a, 0x8a2f3a]) : 0x141414, scale: 0.94 + rand() * 0.1,
    yawJ: (rand() - 0.5) * 0.24, head: (rand() - 0.5) * 0.9, bun: female && rand() < 0.65,
  }
}

// ====================================================================================================
// The world
// ====================================================================================================
export function buildWorld(scene) {
  const env = envTexture('classic'), clubEnv = envTexture('club'), grandEnv = envTexture('grand')
  scene.background = new THREE.Color(0xcfeaf3)
  scene.fog = new THREE.Fog(0xcfeaf3, 70, 170)
  scene.environment = env
  scene.environmentIntensity = 0.4

  // ---------- lights (4 real lights in total) ----------
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0xc9a77c, 0.85))
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.9)
  const SUN_OFFSET = new THREE.Vector3(9, 34, 12)
  sun.position.copy(SUN_OFFSET)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  scene.add(sun, sun.target)

  // ---------- textures + materials ----------
  const tex = {
    herring: herringboneTexture(), border: borderTexture(), panel: panelTexture(false), plain: panelTexture(true),
    slat: slatTexture(), stone: stoneTexture(), deck: deckTexture(), sand: sandTexture(), water: waterTexture(),
    window: windowTexture(), glow: glowTexture(), clerestory: clerestoryTexture(), shaft: shaftTexture(), arrow: arrowTexture(), medallion: medallionTexture(),
    cork: corkTexture(), calendar: calendarTexture(), clubWall: clubWallTexture(), clubFloor: clubFloorTexture(),
    neon: neonTexture(), eq: eqTexture(), ball: ballTexture(), dots: dotsTexture(), beam: beamTexture(),
    marble: marbleTexture(), inlay: inlayTexture(), grandBay: grandBayTexture(), frieze: friezeTexture(), coffer: cofferTexture(),
    doorLight: doorLightTexture(), arrowNavy: arrowTexture('rgba(29,74,99,0.92)'),
  }
  // the scoreboards: one canvas texture each, redrawn by setScoreboards()
  const boards = {}
  for (const side of ['left', 'right']) {
    const canvas = makeCanvas(BOARD_PX.w, BOARD_PX.h, () => {})
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
    boards[side] = { canvas, tex: t, mat: new THREE.MeshBasicMaterial({ map: t, toneMapped: false }) }
    drawScoreboard(canvas, BOARD_DEFAULT[side]); t.needsUpdate = true
  }
  // setScoreboards({ left: { title, lines: [string] }, right: { ... } }): redraw either or both boards (≤ 8 lines each)
  function setScoreboards({ left, right } = {}) {
    for (const [side, data] of [['left', left], ['right', right]]) {
      if (!data) continue
      drawScoreboard(boards[side].canvas, data)
      boards[side].tex.needsUpdate = true
    }
  }
  const std = (o) => new THREE.MeshStandardMaterial(o)
  const basic = (o) => new THREE.MeshBasicMaterial(o)
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }
  const M = {
    core: std({ color: 0xeee4d2, roughness: 0.9 }),
    cap: std({ color: 0xf6efe2, roughness: 0.85 }),
    stub: std({ color: 0xd9c7a6, roughness: 0.7 }),
    stubClub: std({ color: 0x1a2230, roughness: 0.6 }),
    stubWhite: std({ color: 0xf2f2ee, roughness: 0.5 }),
    wallPanel: std({ map: tex.panel, roughness: 0.85 }),
    wallPlain: std({ map: tex.plain, roughness: 0.85 }),
    clubWall: std({ map: tex.clubWall, roughness: 0.7 }),
    slat: std({ map: tex.slat, roughness: 0.72 }),
    trim: std({ color: 0xf7f0e2, roughness: 0.55 }),
    gold: std({ color: 0xcfa75e, metalness: 0.85, roughness: 0.32, envMap: env, envMapIntensity: 1.1 }),
    drape: std({ color: 0x6d8b9e, roughness: 0.92, side: THREE.DoubleSide }),
    window: basic({ map: tex.window, toneMapped: false }),
    clerestory: basic({ map: tex.clerestory, color: 0xf2f8f8 }),
    mirror: std({ color: 0xe4ecef, metalness: 1, roughness: 0.06, envMap: env, envMapIntensity: 1.0 }),
    candle: std({ color: 0xfbf6ea, roughness: 0.5 }),
    bulb: basic({ color: 0xfff2cf, toneMapped: false }),
    glow: basic({ map: tex.glow, color: 0xffd9a0, opacity: 0.5, ...additive }),
    glass: std({ color: 0xcfeaf3, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    mullion: std({ color: 0xf4f6f6, roughness: 0.4, metalness: 0.3 }),
    parquet: std({ map: tex.herring, roughness: 0.3, envMap: env, envMapIntensity: 0.85 }),
    parquetDim: std({ map: tex.herring, color: 0xa8845f, roughness: 0.5, envMap: env, envMapIntensity: 0.35 }),
    border: std({ map: tex.border, roughness: 0.3, envMap: env, envMapIntensity: 0.8 }),
    arrow: basic({ map: tex.arrow, transparent: true, depthWrite: false, opacity: 0.8 }),
    pool: basic({ map: tex.glow, color: 0xffe2ad, opacity: 0.2, ...additive }),
    shaft: basic({ map: tex.shaft, color: 0xfff4dc, opacity: 0.16, ...additive }),
    threshold: std({ color: 0xefe6d6, roughness: 0.35 }),
    stone: std({ map: tex.stone, roughness: 0.6 }),
    deck: std({ map: tex.deck, roughness: 0.7 }),
    oak: std({ map: tex.deck, color: 0xc29a72, roughness: 0.65 }),
    oakDark: std({ color: 0x6b4a2e, roughness: 0.6 }),
    medallion: std({ map: tex.medallion, roughness: 0.35, envMap: env, envMapIntensity: 0.5 }),
    white: std({ color: 0xffffff, roughness: 0.45 }),
    pot: std({ color: 0xf1e6d2, roughness: 0.6 }),
    soil: std({ color: 0x4a3626, roughness: 1 }),
    leaf: std({ color: 0x4f8a5b, roughness: 0.8, side: THREE.DoubleSide }),
    palmLeaf: std({ color: 0x3e8c55, roughness: 0.8, side: THREE.DoubleSide }),
    trunk: std({ color: 0x9a7a55, roughness: 0.95 }),
    sand: std({ map: tex.sand, roughness: 1 }),
    lagoon: std({ map: tex.water, color: 0x3fb2c9, roughness: 0.15, metalness: 0.05 }),
    shallows: std({ map: tex.water, color: 0x8edfe3, roughness: 0.2 }),
    poolWater: std({ map: tex.water, color: 0x7fd8e6, roughness: 0.08, metalness: 0.05, envMap: env, envMapIntensity: 0.6 }),
    poolRim: std({ color: 0xe9dcc2, roughness: 0.7 }),
    rug: std({ color: 0x8fb6c4, roughness: 1 }),
    books: std({ vertexColors: true, roughness: 0.8 }),
    cork: std({ map: tex.cork, roughness: 0.9 }),
    calendar: std({ map: tex.calendar, roughness: 0.7 }),
    shade: std({ color: 0x1b7f9c, emissive: 0x1b7f9c, emissiveIntensity: 0.35, roughness: 0.4 }),
    cushionBlue: std({ color: 0x3a7fa0, roughness: 0.9 }),
    // nightclub
    clubTile: std({ map: tex.clubFloor, roughness: 0.35, envMap: clubEnv, envMapIntensity: 0.6 }),
    clubDance: std({ map: tex.clubFloor, color: 0xc8d4e6, roughness: 0.1, metalness: 0.2, envMap: clubEnv, envMapIntensity: 1.5 }),
    neonBlue: basic({ color: 0x3fd0e0, toneMapped: false }),
    neonCoral: basic({ color: 0xff8a6a, toneMapped: false }),
    neonSign: basic({ map: tex.neon, ...additive }),
    eq: basic({ map: tex.eq, toneMapped: false }),
    gunmetal: std({ color: 0x2b2f36, metalness: 0.7, roughness: 0.4 }),
    barWood: std({ color: 0x3a2a22, roughness: 0.5 }),
    marble: std({ color: 0xece3d3, roughness: 0.2, envMap: clubEnv, envMapIntensity: 0.8 }),
    bottles: std({ vertexColors: true, roughness: 0.15, emissive: 0x222222 }),
    ball: std({ map: tex.ball, metalness: 1, roughness: 0.22, envMap: clubEnv, envMapIntensity: 1.8, flatShading: true }),
    dots: basic({ map: tex.dots, opacity: 0.55, ...additive }),
    // ceilings (unlit: a lit plane seen from below renders dark)
    ceil: basic({ color: 0xe6dcc6 }),
    ceilGrand: basic({ map: tex.coffer, color: 0xf2e6cc }),
    // the grand hall
    grandWall: std({ map: tex.grandBay, roughness: 0.85, emissive: 0xffffff, emissiveMap: tex.grandBay, emissiveIntensity: 0.08 }),
    stoneG: std({ color: 0xeee3cc, roughness: 0.5, envMap: grandEnv, envMapIntensity: 0.45 }),
    sandG: std({ color: 0xdcc8a0, roughness: 0.6 }),
    goldG: std({ color: 0xd8b064, metalness: 0.9, roughness: 0.28, envMap: grandEnv, envMapIntensity: 1.4 }),
    marbleFloor: std({ map: tex.marble, roughness: 0.12, envMap: grandEnv, envMapIntensity: 1.45 }),
    inlay: std({ map: tex.inlay, roughness: 0.16, envMap: grandEnv, envMapIntensity: 1.0 }),
    arrowG: basic({ map: tex.arrowNavy, transparent: true, depthWrite: false, opacity: 0.85 }),
    frieze: std({ map: tex.frieze, roughness: 0.45, metalness: 0.25, envMap: grandEnv, envMapIntensity: 0.6 }),
    carpet: std({ color: 0x1f4560, roughness: 1 }),
    drapeG: std({ color: 0x4f86a6, roughness: 0.9, side: THREE.DoubleSide }),
    doorLight: basic({ map: tex.doorLight, toneMapped: false }),
    spill: basic({ map: tex.shaft, color: 0xfff3dc, opacity: 0.3, ...additive }),
    poolG: basic({ map: tex.glow, color: 0xffe6b8, opacity: 0.15, ...additive }),
    boardBack: std({ color: 0x0c2230, roughness: 0.5 }),
    stubG: std({ color: 0xd8c6a2, roughness: 0.4 }),
    mirrorG: std({ color: 0xdfe8ec, metalness: 1, roughness: 0.06, envMap: grandEnv, envMapIntensity: 1.0 }),
  }

  // The marble mirrors the hall for real (a planar reflection under the veined stone, see planarReflection) while
  // the camera or the focus is in the grand hall; elsewhere, and as a faint sheen on top, the static environment
  // map stands in. No sun glint: an indoor floor has none. During the mirror pass:
  // - the grand hall's ceiling shows even when the camera is above the cornice (the dollhouse views hide it), so
  //   the mirror never shows the sky colour, and it is dimmed: unlit, it would glare in the dark stone;
  // - the world's own objects that do not touch the grand hall are hidden (the hall's walls hide them anyway), so
  //   the extra pass draws little more than the hall itself (mirrorSkip, filled once the world is built);
  // - so is whatever the game added to the scene afterwards (dancers in other rooms, the coach, name tags) while it
  //   stands wholly outside the hall: tested every pass, as those move (mirrorCullDynamic).
  const GRAND_KEY = Object.keys(ROOMS).find((k) => ROOMS[k].theme === 'grand')
  const MARBLE_ENV = [1.45, 0.5] // envMapIntensity without / with the real reflection
  let grandCeiling = null
  const mirrorSkip = []
  const worldOwn = new Set() // the scene's top-level objects built here (the rest is the game's: dancers, tags)
  const hallBox = new THREE.Box3() // the grand hall's walls, set once the world is built
  const ceilMirror = basic({ map: tex.coffer, color: new THREE.Color(0xf2e6cc).multiplyScalar(0.3) })
  const mirrorWas = { skip: [], extra: [], ceilVisible: false } // visibility before the pass (reused every frame)
  const _bs = new THREE.Sphere()
  // Is this drawable wholly outside the grand hall? Bounds as three's own frustum test takes them (the object's
  // sphere for skinned and instanced meshes, else the geometry's), in world space; an object that is never
  // frustum-culled (its bounds may not follow its vertices) counts by its origin with a 2 m margin.
  const outsideHall = (o) => {
    const g = o.geometry
    if (!g) return false
    if (o.frustumCulled === false) { _bs.center.setFromMatrixPosition(o.matrixWorld); _bs.radius = 2 }
    else {
      if (o.boundingSphere !== undefined && o.boundingSphere === null) o.computeBoundingSphere?.()
      if (!o.boundingSphere && !g.boundingSphere) g.computeBoundingSphere()
      _bs.copy(o.boundingSphere || g.boundingSphere).applyMatrix4(o.matrixWorld)
    }
    return !_bs.intersectsBox(hallBox)
  }
  function mirrorCullDynamic(scene) {
    mirrorWas.extra.length = 0
    if (hallBox.isEmpty()) return
    for (const top of scene.children) {
      if (worldOwn.has(top) || !top.visible) continue
      top.traverseVisible((o) => {
        if ((o.isMesh || o.isSprite || o.isLine || o.isPoints) && outsideHall(o)) { o.visible = false; mirrorWas.extra.push(o) }
      })
    }
  }
  const refl = planarReflection(0.006, {
    during: (scene) => {
      mirrorWas.skip.length = 0
      for (const o of mirrorSkip) { mirrorWas.skip.push(o.visible); o.visible = false }
      mirrorCullDynamic(scene)
      if (grandCeiling) { mirrorWas.ceilVisible = grandCeiling.visible; grandCeiling.visible = true; grandCeiling.material = ceilMirror }
    },
    after: () => {
      mirrorSkip.forEach((o, i) => { o.visible = mirrorWas.skip[i] })
      for (const o of mirrorWas.extra) o.visible = true
      mirrorWas.extra.length = 0
      if (grandCeiling) { grandCeiling.visible = mirrorWas.ceilVisible; grandCeiling.material = M.ceilGrand }
    },
  })
  M.marbleFloor.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.directSpecular *= 0.0;')
    reflectionShader(sh, refl.uniforms)
  }
  M.marbleFloor.customProgramCacheKey = () => 'marble-reflect-gloss-no-sun-glint'

  const floor = new Batch() // world-space floors (receive shadows, cast none)
  const decal = new Batch() // world-space transparent floor decals
  const decor = new Batch() // world-space furniture and architecture
  const stubs = new Batch() // what stays of every wall when it drops
  const seats = [] // spectators
  const chandeliers = []
  const spots = []
  let crowdKit = null // shared spectator geometry and materials (made on first use)
  const balconies = [] // the grand hall's mezzanines (sink with their wall, or on their own when in the way)
  const rigs = [] // the nightclub's truss, spot housings and mirror ball (fade when the camera is above them)
  const ceilings = []
  const accents = new Map()
  const accentFor = (hex) => { if (!accents.has(hex)) accents.set(hex, std({ color: hex, roughness: 0.55 })); return accents.get(hex) }

  // ---------- walls ----------
  const walls = WALLS.map((w) => buildWall(w))
  function buildWall(w) {
    const root = new THREE.Group()
    root.position.set(w.ox, 0, w.oz); root.rotation.y = w.phi
    const high = new THREE.Group(); root.add(high)
    const b = new Batch()
    const zi = T / 2 + 0.004, zo = -T / 2 - 0.004, h = w.h
    const da = w.door == null ? null : w.door - DOOR_W / 2, db = w.door == null ? null : w.door + DOOR_W / 2
    const iA = w.ns ? T : 0, iB = w.len - iA, L = iB - iA, mid = (iA + iB) / 2
    const stubMat = w.kind === 'glass' ? M.stubWhite : w.kind === 'club' ? M.stubClub : w.kind === 'grand' ? M.stubG : M.stub
    for (const [a, c] of solidSpans(w)) stubs.add(stubMat, toWorld(box(c - a, STUB + 0.05, T + 0.03, (a + c) / 2, (STUB - 0.05) / 2, 0), w))
    if (w.door != null) floor.add(M.threshold, toWorld(xf(new THREE.PlaneGeometry(DOOR_W, T + 0.04), w.door, 0.009, 0, 0, -Math.PI / 2), w))

    if (w.kind === 'glass') {
      b.add(M.glass, xf(new THREE.PlaneGeometry(L, h - STUB), mid, (h + STUB) / 2, 0))
      const n = Math.max(1, Math.round(L / 1.5))
      for (let i = 0; i <= n; i++) b.add(M.mullion, box(0.07, h - STUB, 0.12, iA + (L * i) / n, (h + STUB) / 2, 0))
      b.add(M.mullion, box(w.len, 0.14, 0.16, w.len / 2, h - 0.07, 0), box(w.len, 0.05, 0.1, w.len / 2, 2.7, 0))
      b.build(high)
      return { ...w, root, high, k: 1, target: 1 }
    }
    // core, top cap and outer cladding
    for (const [a, c] of solidSpans(w)) b.add(M.core, box(c - a, h - STUB, T, (a + c) / 2, (h + STUB) / 2, 0))
    if (w.door != null) b.add(M.core, box(DOOR_W, h - DOOR_H, T, w.door, (h + DOOR_H) / 2, 0))
    b.add(M.cap, xf(new THREE.PlaneGeometry(w.len, T + 0.02), w.len / 2, h + 0.003, 0, 0, -Math.PI / 2))
    for (const [x0, x1, y0, y1] of holeSpans(0, w.len, da, db, h)) b.add(M.slat, faceRect(x0, x1, y0, y1, zo, true, 0, 1, 1))
    const room = ROOMS[w.owner]
    if (room && !w.exterior) b.add(accentFor(room.color), box(w.len - 0.02, 0.26, 0.02, w.len / 2, h - 0.32, zo - 0.012))
    // walls facing the hall or courtyard get a band of clerestory glass (Evans Hall's glazed classrooms); the
    // grand hall's taller walls get a second band
    const ox = w.cx - w.nx * 1.5, oz = w.cz - w.nz * 1.5
    if (room && !w.exterior && regionDist('lobby', ox, oz) === 0) {
      const runs = w.door == null ? [[0.4, w.len - 0.4]] : [[0.4, w.door - 1.55], [w.door + 1.55, w.len - 0.4]]
      for (const y0 of h > H + 1 ? [3.75, 5.75] : [3.75]) for (const [a, c] of runs) {
        b.add(M.clerestory, faceRect(a, c, y0, y0 + 0.95, zo - 0.008, true, 0, 2.4, 0.95 / 1))
        b.add(M.trim, box(c - a, 0.06, 0.04, (a + c) / 2, y0 - 0.03, zo - 0.02), box(c - a, 0.06, 0.04, (a + c) / 2, y0 + 0.98, zo - 0.02))
      }
    }

    if (w.kind === 'classic') classicWall(w, b, { zi, zo, da, db, iA, iB, L, mid })
    else if (w.kind === 'grand') grandWall(w, b, { zi, zo, da, db, iA, iB, L, mid })
    else if (w.kind === 'club') clubWall(w, b, { zi, da, db, iA, iB, L, mid })
    else hallWall(w, b, { zi, iA, iB, L, mid })
    b.build(high)
    return { ...w, root, high, k: 1, target: 1 }
  }

  function classicWall(w, b, { zi, zo, da, db, iA, iB, L, mid }) {
    const bays = Math.max(1, Math.round(L / 3)), bw = L / bays
    for (let i = 0; i < bays; i++) {
      const c = iA + (i + 0.5) * bw
      const inner = bays <= 2 || (i > 0 && i < bays - 1)
      let feat = null
      if (w.door == null && inner) feat = w.exterior ? 'window' : 'mirror'
      for (const [x0, x1, y0, y1] of holeSpans(iA + i * bw, iA + (i + 1) * bw, da, db)) b.add(feat ? M.wallPlain : M.wallPanel, faceRect(x0, x1, y0, y1, zi, false, iA, bw, H))
      if (feat === 'window') addWindow(w, b, c, zi)
      else if (feat === 'mirror') addMirror(b, c, zi)
    }
    for (let j = 1; j < bays; j++) {
      const c = iA + j * bw
      if (w.door != null && Math.abs(c - w.door) < DOOR_W / 2 + 0.6) continue
      addSconce(b, c, zi)
    }
    // cornice
    b.add(M.trim, box(L, 0.12, 0.07, mid, H - 0.06, zi + 0.035), box(L, 0.07, 0.15, mid, H - 0.15, zi + 0.075), box(L, 0.05, 0.06, mid, H - 0.23, zi + 0.03))
    b.add(M.gold, box(L, 0.02, 0.02, mid, H - 0.27, zi + 0.045))
    if (w.door != null) {
      for (const z of [zi + 0.03, zo - 0.03]) { // architrave on both faces
        b.add(M.trim, box(0.16, DOOR_H + 0.16, 0.06, da - 0.08, (DOOR_H + 0.16) / 2, z), box(0.16, DOOR_H + 0.16, 0.06, db + 0.08, (DOOR_H + 0.16) / 2, z),
          box(DOOR_W + 0.32, 0.16, 0.06, w.door, DOOR_H + 0.08, z))
      }
      const fr = DOOR_W / 2 - 0.15
      b.add(M.window, xf(new THREE.CircleGeometry(fr, 20, 0, Math.PI), w.door, DOOR_H + 0.22, zi + 0.01), xf(new THREE.CircleGeometry(fr, 20, 0, Math.PI), w.door, DOOR_H + 0.22, zo - 0.01, Math.PI))
      b.add(M.gold, xf(new THREE.TorusGeometry(fr + 0.03, 0.035, 6, 24, Math.PI), w.door, DOOR_H + 0.22, zi + 0.02), xf(new THREE.TorusGeometry(fr + 0.03, 0.035, 6, 24, Math.PI), w.door, DOOR_H + 0.22, zo - 0.02))
      b.add(M.trim, box(DOOR_W + 0.8, 0.12, 0.18, w.door, DOOR_H + 0.22 + fr + 0.2, zi + 0.09), box(0.24, 0.3, 0.1, w.door, DOOR_H + 0.22 + fr + 0.02, zi + 0.05))
    }
  }

  function addWindow(w, b, c, zi, { ww = 1.4, hs = 3.4, y0 = 0.5, trim = M.trim, drape = M.drape, gold = M.gold, shaftLen = 3.2 } = {}) {
    const top = y0 + hs + ww / 2
    b.add(M.window, xf(fitUV(new THREE.ShapeGeometry(archShape(ww, hs), 16), -ww / 2, 0, ww, hs + ww / 2), c, y0, zi + 0.012))
    b.add(trim, xf(new THREE.ExtrudeGeometry(archFrame(ww, hs), { depth: 0.05, bevelEnabled: false, curveSegments: 16 }), c, y0, zi))
    b.add(trim, box(ww + 0.42, 0.07, 0.16, c, y0 - 0.16, zi + 0.08), box(0.18, 0.26, 0.08, c, top + 0.06, zi + 0.04))
    const dh = top + 0.28
    b.add(drape, xf(drapeGeom(1, dh), c + ww / 2 + 0.13, 0, zi + 0.14), xf(drapeGeom(-1, dh), c - ww / 2 - 0.13, 0, zi + 0.14))
    const swag = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-ww / 2 - 0.5, 0, 0), new THREE.Vector3(0, -0.75, 0.1), new THREE.Vector3(ww / 2 + 0.5, 0, 0))
    b.add(drape, xf(new THREE.TubeGeometry(swag, 20, 0.085, 7), c, dh - 0.06, zi + 0.2, 0, 0, 0, 1, 1, 0.6))
    b.add(gold, box(ww + 1.25, 0.09, 0.09, c, dh, zi + 0.16))
    // daylight through the window on the floor (world space, stays when the wall drops)
    decal.add(M.shaft, toWorld(xf(new THREE.PlaneGeometry(ww + 0.1, shaftLen), c, 0.016, zi + shaftLen / 2 + 0.05, 0, -Math.PI / 2), w))
  }

  function addMirror(b, c, zi, { ww = 1.3, hs = 3.0, y0 = 0.55, gold = M.gold, mirror = M.mirror } = {}) {
    b.add(mirror, xf(fitUV(new THREE.ShapeGeometry(archShape(ww, hs), 16), -ww / 2, 0, ww, hs + ww / 2), c, y0, zi + 0.012))
    b.add(gold, xf(new THREE.ExtrudeGeometry(archFrame(ww, hs, 0.1), { depth: 0.05, bevelEnabled: false, curveSegments: 16 }), c, y0, zi))
    b.add(gold, box(0.34, 0.2, 0.07, c, y0 + hs + ww / 2 + 0.12, zi + 0.035))
  }

  function addSconce(b, c, zi, y = 2.7, gold = M.gold) {
    b.add(gold, box(0.13, 0.36, 0.03, c, y + 0.05, zi + 0.015), box(0.03, 0.03, 0.14, c, y - 0.08, zi + 0.08), box(0.52, 0.03, 0.03, c, y - 0.08, zi + 0.15))
    for (const dx of [-0.24, 0, 0.24]) {
      const yy = y + (dx ? -0.02 : 0.06)
      b.add(gold, cyl(0.035, 0.02, 0.04, c + dx, yy - 0.04, zi + 0.15, 8))
      b.add(M.candle, cyl(0.015, 0.015, 0.13, c + dx, yy + 0.04, zi + 0.15, 8))
      b.add(M.bulb, sph(0.032, c + dx, yy + 0.13, zi + 0.15, 8, 6))
    }
    b.add(M.glow, xf(new THREE.PlaneGeometry(1.5, 1.5), c, y + 0.1, zi + 0.03))
  }

  // ---------- the grand competition hall's walls ----------
  // Long walls (5 bays): the upper storey has pilasters over the columns, a round arch in every bay and a sconce in
  // its lunette; below the balcony the north wall has two windows, the two scoreboards and the great doorway, and
  // the south wall the door to the hall between four sconces. The end walls (3 bays) carry a two-storey arched window
  // (or a mirror on the inner wall), the balcony line as a string course, and sconces at both storeys.
  function grandWall(w, b, { zi, zo, da, db, iA, iB, L, mid }) {
    const h = w.h, long = w.ns, bays = long ? BAL.bays : 3, bw = L / bays
    for (const [x0, x1, y0, y1] of holeSpans(iA, iB, da, db, h)) b.add(M.grandWall, faceRect(x0, x1, y0, y1, zi, false, iA, bw, h))
    b.add(M.stoneG, box(L, 0.14, 0.09, mid, h - 0.07, zi + 0.045), box(L, 0.08, 0.2, mid, h - 0.19, zi + 0.1), box(L, 0.06, 0.08, mid, h - 0.27, zi + 0.04))
    b.add(M.goldG, box(L, 0.025, 0.03, mid, h - 0.315, zi + 0.05))
    if (!long) {
      for (let j = 1; j < bays; j++) {
        const x = iA + j * bw
        b.add(M.stoneG, box(0.42, h - 0.33 - STUB, 0.08, x, (STUB + h - 0.33) / 2, zi + 0.04))
        b.add(M.goldG, box(0.5, 0.14, 0.12, x, 5.5, zi + 0.06), box(0.5, 0.14, 0.12, x, 2.64, zi + 0.06))
      }
      const ww = 1.9
      if (w.exterior) addWindow(w, b, mid, zi, { ww, hs: 4.75, y0: 0.5, trim: M.stoneG, drape: M.drapeG, gold: M.goldG, shaftLen: 4.5 })
      else addMirror(b, mid, zi, { ww: 1.7, hs: 4.65, y0: 0.55, gold: M.goldG, mirror: M.mirrorG })
      for (const [a, c] of [[iA, mid - ww / 2 - 0.55], [mid + ww / 2 + 0.55, iB]]) {
        b.add(M.sandG, box(c - a, 0.36, 0.08, (a + c) / 2, (BAL.slab + BAL.floor) / 2, zi + 0.04))
        b.add(M.goldG, box(c - a, 0.025, 0.03, (a + c) / 2, BAL.slab, zi + 0.085), box(c - a, 0.025, 0.03, (a + c) / 2, BAL.floor, zi + 0.085))
      }
      for (const c of [iA + bw / 2, iB - bw / 2]) { addSconce(b, c, zi, 2.3, M.goldG); addSconce(b, c, zi, 5.7, M.goldG) }
      return
    }
    const north = w.nz > 0 // the north wall's inner face looks south (+z)
    for (let j = 0; j <= bays; j++) {
      const x = Math.min(iB - 0.18, Math.max(iA + 0.18, iA + j * bw))
      b.add(M.stoneG, box(0.36, h - 0.33 - BAL.floor, 0.08, x, (BAL.floor + h - 0.33) / 2, zi + 0.04))
      b.add(M.goldG, box(0.44, 0.12, 0.12, x, 5.5, zi + 0.06))
    }
    const ar = (bw - 0.36) / 2 - 0.04, spring = 5.56
    for (let i = 0; i < bays; i++) {
      const c = iA + (i + 0.5) * bw
      b.add(M.stoneG, xf(arcBand(ar, 0.12, 0.07), c, spring, zi))
      b.add(M.goldG, xf(new THREE.TorusGeometry(ar - 0.05, 0.018, 6, 32, Math.PI), c, spring, zi + 0.02), box(0.18, 0.24, 0.1, c, spring + ar + 0.07, zi + 0.06))
      if (north && i === 2) { // a gilt cartouche over the great doorway
        b.add(M.goldG, xf(new THREE.TorusGeometry(0.34, 0.035, 8, 32), c, 6.66, zi + 0.05), xf(new THREE.OctahedronGeometry(0.22, 0), c, 6.66, zi + 0.05, 0, 0, Math.PI / 4, 1, 1, 0.2))
        b.add(M.boardBack, xf(new THREE.CircleGeometry(0.33, 32), c, 6.66, zi + 0.03))
      } else addSconce(b, c, zi, 6.3, M.goldG)
      if (north) {
        if (i === 0 || i === bays - 1) addWindow(w, b, c, zi, { ww: 1.5, hs: 1.95, y0: 0.55, trim: M.stoneG, drape: M.drapeG, gold: M.goldG, shaftLen: 2.6 })
        else if (i === 2) grandDoorway(w, b, c, zi)
        else scoreboard(b, i === 1 ? boards.left : boards.right, c, zi) // left = west, as seen from the hall
      } else if (i !== 2) addSconce(b, c, zi, 2.2, M.goldG)
    }
    if (w.door != null) {
      // inside: a gilt architrave under the balcony; outside (the hall): the classic surround with its fanlight
      b.add(M.stoneG, box(0.18, DOOR_H + 0.18, 0.07, da - 0.09, (DOOR_H + 0.18) / 2, zi + 0.035), box(0.18, DOOR_H + 0.18, 0.07, db + 0.09, (DOOR_H + 0.18) / 2, zi + 0.035),
        box(DOOR_W + 0.36, 0.18, 0.07, w.door, DOOR_H + 0.09, zi + 0.035))
      b.add(M.goldG, box(DOOR_W + 0.56, 0.06, 0.14, w.door, DOOR_H + 0.21, zi + 0.07), box(0.26, 0.2, 0.08, w.door, DOOR_H + 0.08, zi + 0.08))
      b.add(M.trim, box(0.16, DOOR_H + 0.16, 0.06, da - 0.08, (DOOR_H + 0.16) / 2, zo - 0.03), box(0.16, DOOR_H + 0.16, 0.06, db + 0.08, (DOOR_H + 0.16) / 2, zo - 0.03),
        box(DOOR_W + 0.32, 0.16, 0.06, w.door, DOOR_H + 0.08, zo - 0.03))
      const fr = DOOR_W / 2 - 0.15
      b.add(M.window, xf(new THREE.CircleGeometry(fr, 20, 0, Math.PI), w.door, DOOR_H + 0.22, zo - 0.01, Math.PI))
      b.add(M.goldG, xf(new THREE.TorusGeometry(fr + 0.03, 0.035, 6, 24, Math.PI), w.door, DOOR_H + 0.22, zo - 0.02))
    }
  }

  // The great doorway in the middle of the north wall: an arch full of daylight that spills across the marble.
  function grandDoorway(w, b, c, zi) {
    const ww = 2.5, hs = 4.55, y0 = STUB, top = y0 + hs + ww / 2
    b.add(M.doorLight, xf(fitUV(new THREE.ShapeGeometry(archShape(ww, hs), 24), -ww / 2, 0, ww, hs + ww / 2), c, y0, zi + 0.012))
    b.add(M.stoneG, xf(new THREE.ExtrudeGeometry(archFrame(ww, hs, 0.2), { depth: 0.12, bevelEnabled: false, curveSegments: 24 }), c, y0, zi))
    b.add(M.goldG, xf(new THREE.TorusGeometry(ww / 2 + 0.04, 0.03, 6, 32, Math.PI), c, y0 + hs, zi + 0.125), box(0.3, 0.38, 0.14, c, top + 0.1, zi + 0.07))
    for (const s of [-1, 1]) b.add(M.goldG, box(0.03, hs, 0.03, c + s * (ww / 2 + 0.04), y0 + hs / 2, zi + 0.125))
    b.add(M.glow, xf(new THREE.PlaneGeometry(4.4, 5.6), c, y0 + hs * 0.62, zi + 0.2))
    decal.add(M.spill, toWorld(xf(new THREE.PlaneGeometry(2.9, 7), c, 0.017, zi + 3.55, 0, -Math.PI / 2), w))
  }

  // A scoreboard (2.5 × 1.56 m) on the wall under the balcony: navy backing, the live canvas, a gilt frame.
  function scoreboard(b, board, c, zi) {
    const bw = 2.5, bh = (bw * BOARD_PX.h) / BOARD_PX.w, y = 2.12
    b.add(M.boardBack, box(bw + 0.16, bh + 0.16, 0.05, c, y, zi + 0.025))
    b.add(board.mat, xf(new THREE.PlaneGeometry(bw, bh), c, y, zi + 0.052))
    b.add(M.goldG, box(bw + 0.22, 0.07, 0.07, c, y + bh / 2 + 0.065, zi + 0.06), box(bw + 0.22, 0.07, 0.07, c, y - bh / 2 - 0.065, zi + 0.06),
      box(0.07, bh + 0.06, 0.07, c - bw / 2 - 0.075, y, zi + 0.06), box(0.07, bh + 0.06, 0.07, c + bw / 2 + 0.075, y, zi + 0.06))
  }

  function clubWall(w, b, { zi, da, db, iA, iB, L, mid }) {
    for (const [x0, x1, y0, y1] of holeSpans(iA, iB, da, db)) b.add(M.clubWall, faceRect(x0, x1, y0, y1, zi, false, iA, 2, H))
    b.add(M.neonBlue, box(L, 0.05, 0.03, mid, H - 0.35, zi + 0.02))
    const lows = w.door == null ? [[iA, iB]] : [[iA, da - 0.2], [db + 0.2, iB]]
    for (const [a, c] of lows) b.add(M.neonCoral, box(c - a, 0.035, 0.03, (a + c) / 2, 0.42, zi + 0.02))
    if (w.door != null) {
      b.add(M.neonCoral, box(0.05, DOOR_H + 0.1, 0.04, da - 0.1, (DOOR_H + 0.1) / 2, zi + 0.03), box(0.05, DOOR_H + 0.1, 0.04, db + 0.1, (DOOR_H + 0.1) / 2, zi + 0.03),
        box(DOOR_W + 0.25, 0.05, 0.04, w.door, DOOR_H + 0.1, zi + 0.03))
      b.add(M.neonSign, xf(new THREE.PlaneGeometry(3.6, 0.9), w.door, DOOR_H + 0.95, zi + 0.04))
    } else if (!w.ns) {
      const n = Math.max(2, Math.round(L / 3))
      for (let j = 1; j < n; j++) b.add(M.neonBlue, box(0.05, 3.2, 0.03, iA + (L * j) / n, 2.3, zi + 0.02))
    }
  }

  function hallWall(w, b, { zi, iA, iB, L, mid }) { // Ross Library: oak panelling and the drill board
    for (const [x0, x1, y0, y1] of holeSpans(iA, iB, null, null)) b.add(M.slat, faceRect(x0, x1, y0, y1, zi, false, iA, 1, 1))
    b.add(M.oakDark, box(L, 0.12, 0.08, mid, H - 0.06, zi + 0.04))
    const c = w.len / 2
    b.add(M.oakDark, box(3.5, 2.15, 0.06, c, 1.95, zi + 0.03))
    b.add(M.cork, xf(new THREE.PlaneGeometry(3.3, 1.95), c, 1.95, zi + 0.065))
    b.add(M.bulb, box(2.6, 0.04, 0.04, c, 3.12, zi + 0.12))
    b.add(M.glow, xf(new THREE.PlaneGeometry(3.4, 1.4), c, 2.9, zi + 0.07))
  }

  for (const w of walls) scene.add(w.root)

  // ---------- the grand hall's mezzanines ----------
  // One balcony per long wall, in its own world-space group so update() can sink it with its wall, or on its own when
  // it would hide the focus or crowd the camera: columns with gilt capitals, elliptical arches with gilt archivolts,
  // the slab with a carved gilt fascia, a carpet, a turned balustrade between posts with gilt finials, and spectators.
  // The north balcony stops at the great doorway's bay; there the balustrade turns back to the wall.
  const COL = columnGeoms(), BALUSTER = balusterGeom()
  for (const w of walls) if (w.kind === 'grand' && w.ns) grandBalcony(w)
  function grandBalcony(w) {
    const bb = new Batch(), people = [], rand = rng(w.nz > 0 ? 515 : 616)
    const zi = T / 2 + 0.004, iA = T, iB = w.len - T, L = iB - iA, bw = L / BAL.bays
    const D = BAL.depth, zc = zi + BAL.col, zr = zi + D - 0.12 // column line, balustrade line
    const north = w.nz > 0, W = (g) => toWorld(g, w)
    const cols = []
    for (let j = 1; j < BAL.bays; j++) cols.push(iA + j * bw)
    const isCol = (x) => cols.some((c) => Math.abs(c - x) < 1e-6)
    for (const c of cols) { bb.add(M.stoneG, W(COL.stone.clone().translate(c, 0, zc))); bb.add(M.goldG, W(COL.gold.clone().translate(c, 0, zc))) }
    const balustrade = (len, along) => { // a run of balusters between two posts, in a local frame (x along the run)
      const n = Math.max(1, Math.round(len / 0.17)), out = []
      for (let q = 0; q < n; q++) out.push(BALUSTER.clone().translate(-len / 2 + ((q + 0.5) * len) / n, BAL.floor + 0.1, 0))
      return out.map(along)
    }
    const runs = north ? [[iA, iA + 2 * bw], [iA + 3 * bw, iB]] : [[iA, iB]]
    for (const [a, c] of runs) {
      const m = (a + c) / 2, len = c - a
      bb.add(M.sandG, W(box(len, BAL.floor - BAL.slab, D, m, (BAL.floor + BAL.slab) / 2, zi + D / 2)))
      bb.add(M.frieze, W(xf(fitUV(new THREE.PlaneGeometry(len, 0.3), -len / 2, -0.15, 1.4, 0.3), m, (BAL.floor + BAL.slab) / 2, zi + D + 0.004)))
      bb.add(M.goldG, W(box(len + 0.02, 0.03, 0.03, m, BAL.slab + 0.015, zi + D + 0.01)), W(box(len + 0.06, 0.05, 0.08, m, BAL.floor, zi + D - 0.01)))
      bb.add(M.carpet, W(xf(new THREE.PlaneGeometry(len, D - 0.24), m, BAL.floor + 0.004, zi + (D - 0.24) / 2, 0, -Math.PI / 2)))
      // balustrade: plinth, handrail with a gilt line, posts over the columns and at the ends
      bb.add(M.stoneG, W(box(len, 0.1, 0.22, m, BAL.floor + 0.05, zr)), W(box(len, 0.1, 0.2, m, BAL.rail - 0.05, zr)))
      bb.add(M.goldG, W(box(len, 0.02, 0.05, m, BAL.rail + 0.01, zr)))
      const posts = [a + 0.13, ...cols.filter((x) => x > a + 0.3 && x < c - 0.3), c - 0.13]
      for (const x of posts) {
        bb.add(M.stoneG, W(box(0.26, BAL.top - BAL.floor - 0.08, 0.26, x, (BAL.top + BAL.floor - 0.08) / 2, zr)))
        bb.add(M.goldG, W(sph(0.065, x, BAL.top + 0.02, zr, 10, 8)))
      }
      for (let i = 0; i < posts.length - 1; i++) {
        const p0 = posts[i] + 0.13, p1 = posts[i + 1] - 0.13
        bb.add(M.stoneG, ...balustrade(p1 - p0, (g) => W(g.translate((p0 + p1) / 2, 0, zr))))
      }
      // where a run ends at the doorway bay, the balustrade turns back to the wall
      for (const x of [a, c]) {
        if (!isCol(x)) continue
        const s = x === a ? 1 : -1, xr = x + s * 0.13, zl = zr - 0.13 - zi
        bb.add(M.stoneG, W(box(0.22, 0.1, zl, xr, BAL.floor + 0.05, zi + zl / 2)), W(box(0.2, 0.1, zl, xr, BAL.rail - 0.05, zi + zl / 2)))
        bb.add(M.goldG, W(box(0.05, 0.02, zl, xr, BAL.rail + 0.01, zi + zl / 2)))
        bb.add(M.stoneG, ...balustrade(zl - 0.1, (g) => W(g.rotateY(Math.PI / 2).translate(xr, 0, zi + zl / 2 - 0.05))))
      }
      // the arcade below: elliptical arches between the supports (columns, or responds against the end walls)
      const sup = [a, ...cols.filter((x) => x > a + 0.3 && x < c - 0.3), c]
      for (let i = 0; i < sup.length - 1; i++) {
        const x0 = sup[i] + (isCol(sup[i]) ? 0.24 : 0.3), x1 = sup[i + 1] - (isCol(sup[i + 1]) ? 0.24 : 0.3)
        bb.add(M.sandG, W(spandrelGeom(x1 - x0, BAL.rise, BAL.slab - BAL.spring).translate((x0 + x1) / 2, BAL.spring, zc)))
        bb.add(M.goldG, W(archivoltGeom(x1 - x0, BAL.rise).translate((x0 + x1) / 2, BAL.spring, zc + 0.12)))
      }
      for (const [x, s] of [[a, 1], [c, -1]]) {
        if (isCol(x)) continue
        const xr = x + s * 0.15, dz = BAL.col + 0.21
        bb.add(M.stoneG, W(box(0.3, BAL.spring, dz, xr, BAL.spring / 2, zi + dz / 2)))
        bb.add(M.goldG, W(box(0.36, 0.1, dz + 0.06, xr, BAL.spring - 0.05, zi + dz / 2)))
      }
      // spectators on the balcony, backs to the wall
      for (let x = a + 0.75; x <= c - 0.75 + 1e-6; x += 0.7) {
        if (rand() > 0.55) continue
        const lz = zi + 0.36
        people.push({ x: w.ox + w.dx * x + w.nx * lz, z: w.oz + w.dz * x + w.nz * lz, y: BAL.floor, yaw: w.phi, type: 'chair', frame: 0xd4ad62, cushion: 0x1d4a63, p: person(rand) })
      }
    }
    const group = new THREE.Group()
    bb.build(group)
    buildCrowd(people, group, { cast: false }) // (up there they would only shadow the balcony floor)
    scene.add(group)
    const zs = [w.oz + w.nz * zi, w.oz + w.nz * (zi + D)], xs = [w.ox + w.dx * iA, w.ox + w.dx * iB]
    balconies.push({
      owner: w.owner, side: north ? 'N' : 'S', group, wall: w, k: 1, top: BAL.top,
      x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs),
    })
  }

  // ---------- the ballrooms ----------
  const CH = chandelierGeoms()
  const labels = []
  for (const [k, r] of Object.entries(ROOMS)) {
    if (r.theme === 'classic') classicRoom(k, r)
    else if (r.theme === 'grand') grandRoom(k, r)
    else clubRoom(k, r)
    // the room's name over its door, on the hall side
    const hex = '#' + r.color.toString(16).padStart(6, '0')
    const label = textSprite(r.label, { size: 72, color: '#ffffff', bg: hex + 'ee', scale: 1.4 })
    label.position.set(r.door.x, H + 0.75, r.door.z + r.door.nz * 0.4)
    scene.add(label)
    labels.push({ key: k, sprite: label })
    // ceilings face down: eye-level views see a closed room, the dollhouse cameras above look through them, and
    // update() hides them whenever the camera is above the cornice
    if (r.theme !== 'nightclub') {
      const g = new THREE.PlaneGeometry(r.w - 2 * T, r.d - 2 * T), p = g.attributes.position, uv = g.attributes.uv
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3.6, p.getY(i) / 3.6)
      const c = new THREE.Mesh(g, r.theme === 'grand' ? M.ceilGrand : M.ceil)
      c.rotation.x = Math.PI / 2; c.position.set(r.x, r.h, r.z)
      scene.add(c)
      ceilings.push({ mesh: c, h: r.h })
      if (r.theme === 'grand') grandCeiling = c
    }
  }

  function classicRoom(k, r) {
    const f = FLOORS[k], rand = rng(hash(r.x * 10, r.z * 10, 3) * 1e9)
    const ix0 = r.x - r.w / 2 + T, ix1 = r.x + r.w / 2 - T, iz0 = r.z - r.d / 2 + T, iz1 = r.z + r.d / 2 - T
    floor.add(M.parquetDim, planar(rectXZ(ix0, iz0, ix1, iz1, 0.004), TEX_FLOOR))
    floor.add(M.parquet, planar(rectXZ(f.x - f.w / 2, f.z - f.d / 2, f.x + f.w / 2, f.z + f.d / 2, 0.008), TEX_FLOOR))
    borderStrips(f, 0.011, 0.3)
    if (k === 'standard' || k === 'smooth') lodArrows(f, 0.013, 0.3) // travelling styles: line of dance inlays
    for (const dx of [-4.2, 4.2]) {
      chandeliers.push(makeChandelier(r.x + dx, r.z))
      decal.add(M.pool, xf(new THREE.CircleGeometry(3.0, 40), r.x + dx, 0.014, r.z, 0, -Math.PI / 2))
    }
    for (const [x, z] of [[ix0 + 0.5, iz0 + 0.5], [ix1 - 0.5, iz0 + 0.5], [ix0 + 0.5, iz1 - 0.5], [ix1 - 0.5, iz1 - 0.5]]) plant(x, z, 1.1, rand)
    // spectators along both long walls, facing the floor; a gap at the door
    for (const north of [true, false]) {
      const z = north ? iz0 + 0.36 : iz1 - 0.36, yaw = north ? 0 : Math.PI
      const doorHere = north === r.z > 0
      for (let x = ix0 + 1.0; x <= ix1 - 1.0 + 1e-6; x += 0.64) {
        if (doorHere && Math.abs(x - r.door.x) < 1.8) continue
        seats.push({ x, z, yaw, type: 'chair', frame: 0xc9a35c, cushion: rand() < 0.5 ? 0xf2e8d5 : 0x6f8fa3, p: rand() < 0.76 ? person(rand) : null })
      }
    }
  }

  function borderStrips(f, y, bw, mat = M.border) {
    const z0 = f.z - f.d / 2, z1 = f.z + f.d / 2, x0 = f.x - f.w / 2, x1 = f.x + f.w / 2
    const strip = (len, cx, cz, ry) => {
      const g = new THREE.PlaneGeometry(len, bw), uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / (bw * 8))
      return xf(g, cx, y, cz, ry, -Math.PI / 2)
    }
    floor.add(mat, strip(f.w + 2 * bw, f.x, z0 - bw / 2, 0), strip(f.w + 2 * bw, f.x, z1 + bw / 2, 0), strip(f.d, x0 - bw / 2, f.z, Math.PI / 2), strip(f.d, x1 + bw / 2, f.z, Math.PI / 2))
  }

  // Chevrons in the border, pointing along the line of dance (counter-clockwise seen from above).
  function lodArrows(f, y, bw, mat = M.arrow) {
    const z0 = f.z - f.d / 2 - bw / 2, z1 = f.z + f.d / 2 + bw / 2, x0 = f.x - f.w / 2 - bw / 2, x1 = f.x + f.w / 2 + bw / 2
    const place = (x, z, ry) => decal.add(mat, xf(new THREE.PlaneGeometry(0.3, 0.3), x, y, z, ry, -Math.PI / 2))
    for (let i = -2; i <= 2; i++) { place(f.x + i * 3, z1, 0); place(f.x - i * 3, z0, Math.PI) } // near side → +x, far side → -x
    for (let i = -1; i <= 1; i++) { place(x1, f.z + i * 3, Math.PI / 2); place(x0, f.z - i * 3, -Math.PI / 2) } // east → north, west → south
  }

  // A chandelier with its own (fadable) materials. y0..y1 and r bound it for the line-of-sight test; near = how close
  // (beyond r) the camera may come at the chandelier's height before it fades.
  function makeChandelier(x, z, G = CH, { y0 = 3.45, y1 = 5.0, r = 0.75, near = 1.0, halos = [[4.15, 2.6]], envMap = env, gold = M.gold } = {}) {
    const mats = {
      gold: gold.clone(), bead: std({ color: 0xfffaf0, emissive: 0xffe2b0, emissiveIntensity: 0.6, roughness: 0.06, metalness: 0.2, envMap, envMapIntensity: 2.0, flatShading: true }),
      candle: M.candle.clone(), flame: M.bulb.clone(),
      halo: new THREE.SpriteMaterial({ map: tex.glow, color: 0xffe6b8, opacity: 0.55, ...additive }),
    }
    if (G.bulbs) mats.bulb = M.bulb.clone()
    for (const m of Object.values(mats)) { m.transparent = true; m.userData.base = m.opacity }
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.add(new THREE.Mesh(G.gold, mats.gold), new THREE.Mesh(G.beads, mats.bead), new THREE.Mesh(G.candles, mats.candle), new THREE.Mesh(G.flames, mats.flame))
    if (G.bulbs) g.add(new THREE.Mesh(G.bulbs, mats.bulb))
    for (const [hy, hs] of halos) {
      const halo = new THREE.Sprite(mats.halo)
      halo.position.y = hy; halo.scale.set(hs, hs, 1)
      g.add(halo)
    }
    scene.add(g)
    return { group: g, mats, x, z, y0, y1, r, near, k: 1 }
  }

  // ---------- the grand competition hall ----------
  function grandRoom(k, r) {
    const f = FLOORS[k], rand = rng(4242)
    const ix0 = r.x - r.w / 2 + T, ix1 = r.x + r.w / 2 - T, iz0 = r.z - r.d / 2 + T, iz1 = r.z + r.d / 2 - T
    floor.add(M.marbleFloor, planar(rectXZ(ix0, iz0, ix1, iz1, 0.006), 3.6))
    borderStrips(f, 0.011, 0.34, M.inlay)
    if (k === 'standard' || k === 'smooth') lodArrows(f, 0.013, 0.34, M.arrowG)
    // one huge tiered chandelier over the centre, a small one over each end of the floor; their glow on the marble
    chandeliers.push(makeChandelier(r.x, r.z, grandChandelierGeoms(r.h), { y0: 4.05, y1: r.h, r: 1.4, near: 1.8, halos: [[5.55, 4.6], [6.5, 3.2]], envMap: grandEnv, gold: M.goldG }))
    decal.add(M.poolG, xf(new THREE.CircleGeometry(3.4, 48), r.x, 0.014, r.z, 0, -Math.PI / 2))
    const small = chandelierGeoms(1.25, r.h)
    for (const dx of [-5.6, 5.6]) {
      chandeliers.push(makeChandelier(r.x + dx, r.z, small, { y0: 4.7, y1: 6.25, halos: [[5.4, 2.6]], envMap: grandEnv, gold: M.goldG }))
      decal.add(M.poolG, xf(new THREE.CircleGeometry(2.2, 40), r.x + dx, 0.014, r.z, 0, -Math.PI / 2))
    }
    // spectators under both balconies (gaps at the door, the great doorway and the columns)
    const bw = (r.w - 2 * T) / BAL.bays
    for (const north of [true, false]) {
      const z = north ? iz0 + 0.36 : iz1 - 0.36, yaw = north ? 0 : Math.PI
      for (let x = ix0 + 0.75; x <= ix1 - 0.75 + 1e-6; x += 0.62) {
        if (north === r.z > 0 && Math.abs(x - r.door.x) < 1.8) continue
        if (north !== r.z > 0 && Math.abs(x - r.x) < bw / 2 - 0.1) continue
        if (GRAND_COLS.some((c) => Math.abs(x - c.x) < 0.42)) continue
        seats.push({ x, z, yaw, type: 'chair', frame: 0xd4ad62, cushion: rand() < 0.5 ? 0x1d4a63 : 0xf2e8d5, p: rand() < 0.8 ? person(rand) : null })
      }
    }
  }

  function plant(x, z, s, rand) {
    decor.add(M.pot, cyl(0.26 * s, 0.2 * s, 0.5 * s, x, 0.25 * s, z, 16))
    decor.add(M.soil, cyl(0.24 * s, 0.24 * s, 0.02, x, 0.49 * s, z, 16))
    const a0 = rand() * 6
    for (let i = 0; i < 9; i++) decor.add(M.leaf, xf(leafGeom(1.0 * s, 0.22 * s, 0.9), x, 0.48 * s, z, a0 + i * 2.4, -0.45 - (i % 3) * 0.28))
  }

  // ---------- the nightclub ----------
  function clubRoom(k, r) {
    const f = FLOORS[k], rand = rng(777)
    const ix0 = r.x - r.w / 2 + T, ix1 = r.x + r.w / 2 - T, iz0 = r.z - r.d / 2 + T, iz1 = r.z + r.d / 2 - T
    floor.add(M.clubTile, planar(rectXZ(ix0, iz0, ix1, iz1, 0.004), 2.4))
    floor.add(M.clubDance, planar(rectXZ(f.x - f.w / 2, f.z - f.d / 2, f.x + f.w / 2, f.z + f.d / 2, 0.008), 2.4))
    borderStrips(f, 0.011, 0.07, M.neonBlue)
    // the mirror ball throws flecks of light on the floor (rotated in update)
    const dots = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48).rotateX(-Math.PI / 2), M.dots)
    dots.position.set(f.x, 0.018, f.z); scene.add(dots)
    // truss across the floor with the two spotlights and the mirror ball: one group with its own materials, faded by
    // update() when the camera is up among it (e.g. the Footwork camera above a couple) or it hides the focus
    const rigMats = { metal: M.gunmetal.clone(), ball: M.ball.clone() }
    for (const m of Object.values(rigMats)) { m.transparent = true; m.userData.base = 1 }
    const rig = new THREE.Group(), rb = new Batch()
    rb.add(rigMats.metal, box(f.w + 1.0, 0.16, 0.16, f.x, 4.95, f.z), box(f.w + 1.0, 0.04, 0.04, f.x, 4.8, f.z + 0.12), box(f.w + 1.0, 0.04, 0.04, f.x, 4.8, f.z - 0.12))
    rb.add(rigMats.metal, cyl(0.012, 0.012, 0.45, f.x, 4.65, f.z, 6))
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), rigMats.ball)
    ball.position.set(f.x, 4.3, f.z); rig.add(ball)
    const beamGeo = new THREE.ConeGeometry(1, 1, 28, 1, true).translate(0, -0.5, 0)
    for (const [color, dx, phase] of [[0x34c6d9, -5.6, 0], [0xff7a5c, 5.6, Math.PI]]) {
      const light = new THREE.SpotLight(color, 90, 18, 0.42, 0.55, 2)
      light.position.set(f.x + dx, 4.75, f.z)
      light.target.position.set(f.x + dx * 0.4, 0, f.z)
      scene.add(light, light.target)
      rb.add(rigMats.metal, cyl(0.11, 0.14, 0.3, f.x + dx, 4.8, f.z, 12))
      const beam = new THREE.Mesh(beamGeo, basic({ color, map: tex.beam, opacity: 0.12, side: THREE.DoubleSide, ...additive }))
      beam.position.copy(light.position); beam.renderOrder = 2
      scene.add(beam)
      spots.push({ light, beam, phase, home: { x: f.x + dx * 0.35, z: f.z } })
    }
    rb.build(rig)
    scene.add(rig)
    rigs.push({ group: rig, mats: rigMats, k: 1, f, y0: 3.95, y1: 5.05, x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2 })
    // bar along the north wall, west of the door
    const B = CLUB.bar, bx = (B.x0 + B.x1) / 2, bl = B.x1 - B.x0
    decor.add(M.barWood, box(bl, 1.08, 0.6, bx, 0.54, B.z1 - 0.35), box(bl, 0.9, 0.32, bx, 0.45, B.z0 + 0.17))
    decor.add(M.marble, box(bl + 0.1, 0.05, 0.7, bx, 1.105, B.z1 - 0.35), box(bl, 0.03, 0.26, bx, 1.55, B.z0 + 0.14), box(bl, 0.03, 0.26, bx, 1.95, B.z0 + 0.14))
    decor.add(M.neonCoral, box(bl, 0.03, 0.02, bx, 0.08, B.z1 - 0.04))
    const bottles = []
    for (const y of [0.92, 1.58, 1.98]) for (let x = B.x0 + 0.15; x < B.x1 - 0.1; x += 0.13 + rand() * 0.08) {
      const h = 0.22 + rand() * 0.12
      bottles.push(tint(cyl(0.035, 0.035, h, x, y + h / 2, B.z0 + 0.14, 8), [0x2f7d74, 0xd9a441, 0x8edfe3, 0x6e2537, 0xf2e8d5][Math.floor(rand() * 5)]))
    }
    decor.add(M.bottles, ...bottles)
    for (let x = B.x0 + 0.5; x < B.x1 - 0.3; x += 0.75) seats.push({ x, z: B.z1 + 0.42, yaw: 0, type: 'stool', frame: 0x23262c, p: rand() < 0.7 ? person(rand) : null })
    // DJ booth east of the door
    const D = CLUB.dj, dxm = (D.x0 + D.x1) / 2, dl = D.x1 - D.x0
    decor.add(M.gunmetal, box(dl, 1.1, 0.75, dxm, 0.55, D.z1 - 0.4), box(dl + 0.1, 0.04, 0.8, dxm, 1.12, D.z1 - 0.4))
    decor.add(M.eq, xf(new THREE.PlaneGeometry(dl - 0.2, 0.7), dxm, 0.6, D.z1 - 0.02))
    decor.add(M.barWood, cyl(0.17, 0.17, 0.03, dxm - 0.75, 1.155, D.z1 - 0.4, 20), cyl(0.17, 0.17, 0.03, dxm + 0.75, 1.155, D.z1 - 0.4, 20), box(0.4, 0.05, 0.3, dxm, 1.165, D.z1 - 0.4))
    seats.push({ x: dxm, z: D.z0 + 0.3, yaw: 0, type: 'stool', frame: 0x23262c, p: person(rand, { female: false, outfit: 0x1b7f9c }) })
    // lounge along the south wall
    const Lg = CLUB.lounge
    for (let x = Lg.x0 + 0.4, i = 0; x < Lg.x1 - 0.3; x += 0.78, i++) {
      seats.push({ x, z: Lg.z1 - 0.42, yaw: Math.PI, type: 'sofa', frame: Math.floor(i / 3) % 2 ? 0x1f6f7a : 0xc8644f, p: rand() < 0.65 ? person(rand) : null })
      if (i % 3 === 1) { decor.add(M.marble, cyl(0.26, 0.26, 0.04, x, 0.46, Lg.z0 + 0.3, 20)); decor.add(M.gunmetal, cyl(0.04, 0.04, 0.44, x, 0.22, Lg.z0 + 0.3, 8)); decor.add(M.bulb, sph(0.04, x, 0.52, Lg.z0 + 0.3, 8, 6)) }
    }
    scene.userData.clubFx = { dots, ball }
  }

  // ---------- the hall, Ross Library, Beinecke Terrace and the courtyard ----------
  floor.add(M.stone, planar(rectXZ(HALL.x0 + T, HALL.z0, HALL.x1 - T, HALL.z1, 0.005), 3.6))
  floor.add(M.stone, planar(rectXZ(COURT.x0, COURT.z0, COURT.x1, COURT.z1 - T, 0.005), 3.6))
  floor.add(M.oak, planar(rectXZ(HALL.x0 + T, HALL.z0, -21, HALL.z1, 0.007), 1.2))
  floor.add(M.deck, planar(rectXZ(21, HALL.z0, HALL.x1 - T, HALL.z1, 0.007), 1.2))
  floor.add(M.medallion, xf(new THREE.CircleGeometry(2.8, 64), 0, 0.009, -1, 0, -Math.PI / 2))
  const prand = rng(99)
  for (const p of PLANTERS) plant(p.x, p.z, 1, prand)
  // Ross Library: shelves of books, a reading table with lamps, two readers
  const books = []
  const brand = rng(123)
  for (const [z0, z1] of LIB.shelves) {
    const x0 = LIB.x0, d = LIB.depth, zc = (z0 + z1) / 2, lz = z1 - z0
    decor.add(M.oakDark, box(0.04, 2.9, lz, x0 + 0.02, 1.45, zc), box(d, 2.9, 0.05, x0 + d / 2, 1.45, z0 + 0.025), box(d, 2.9, 0.05, x0 + d / 2, 1.45, z1 - 0.025), box(d + 0.04, 0.06, lz + 0.04, x0 + d / 2, 2.93, zc))
    for (let s = 0; s < 6; s++) {
      const y = 0.06 + s * 0.47
      decor.add(M.oakDark, box(d, 0.03, lz - 0.1, x0 + d / 2, y, zc))
      for (let z = z0 + 0.06; z < z1 - 0.1;) {
        const bw = 0.025 + brand() * 0.04, bh = 0.24 + brand() * 0.14, bd = 0.22 + brand() * 0.07
        if (brand() < 0.06) { z += 0.08; continue }
        books.push(tint(box(bd, bh, bw, x0 + 0.04 + bd / 2, y + 0.015 + bh / 2, z + bw / 2), [0x1b7f9c, 0x0d3b52, 0xe98a6b, 0xe8d3ac, 0xf3e6cf, 0x2f7d74, 0x6e2537, 0xc9a35c][Math.floor(brand() * 8)]))
        z += bw + 0.004
      }
    }
  }
  decor.add(M.books, ...books)
  const tb = LIB.table, tx = (tb.x0 + tb.x1) / 2, tz = (tb.z0 + tb.z1) / 2
  floor.add(M.rug, rectXZ(tb.x0 - 0.6, tb.z0 - 0.5, tb.x1 + 0.6, tb.z1 + 0.5, 0.01))
  decor.add(M.oakDark, box(1.1, 0.05, 3.0, tx, 0.76, tz), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => box(0.06, 0.74, 0.06, tx + a * 0.48, 0.37, tz + c * 1.4)))
  for (const dz of [-0.8, 0.8]) {
    decor.add(M.gold, cyl(0.07, 0.08, 0.03, tx, 0.795, tz + dz, 12), cyl(0.012, 0.012, 0.3, tx, 0.95, tz + dz, 6))
    decor.add(M.shade, xf(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 12, 1, false, 0, Math.PI), tx, 1.1, tz + dz, 0, 0, Math.PI / 2))
    decor.add(M.bulb, sph(0.03, tx, 1.06, tz + dz, 8, 6))
  }
  for (const [dz, side] of [[-0.75, -1], [0.75, -1], [-0.75, 1], [0.75, 1]]) {
    seats.push({ x: tx + side * 0.95, z: tz + dz, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, type: 'chair', frame: 0x6b4a2e, cushion: 0x3a7fa0, p: (dz < 0) === (side < 0) ? person(brand) : null })
  }
  const lib = textSprite('Ross Library · Drill Board', { size: 48, scale: 0.95 })
  lib.position.set(-24.6, 3.9, 0); scene.add(lib)
  labels.push({ key: null, sprite: lib })
  // Beinecke Terrace: the planner board, benches, palms, and an outdoor deck over the lagoon
  const pb = PLANNER_BOARD
  const onBoard = (g) => xf(g, pb.x, 0, pb.z, pb.ry) // board frame: local x along the board, +z = its face
  decor.add(M.oakDark, onBoard(cyl(0.04, 0.04, 2.7, -pb.w / 2 + 0.1, 1.35, 0, 8)), onBoard(cyl(0.04, 0.04, 2.7, pb.w / 2 - 0.1, 1.35, 0, 8)), onBoard(box(pb.w, 1.95, 0.06, 0, 1.8, 0)))
  decor.add(M.calendar, onBoard(xf(new THREE.PlaneGeometry(pb.w - 0.2, 1.75), 0, 1.8, 0.035)))
  for (const b of BENCHES) decor.add(M.deck, box(0.5, 0.06, 2.2, b.x, 0.45, b.z)).add(M.white, box(0.4, 0.42, 0.1, b.x, 0.21, b.z - 0.9), box(0.4, 0.42, 0.1, b.x, 0.21, b.z + 0.9))
  const ter = textSprite('Beinecke Terrace · Competition Planner', { size: 48, scale: 0.95 })
  ter.position.set(24.4, 3.9, 0); scene.add(ter)
  labels.push({ key: null, sprite: ter })
  floor.add(M.deck, planar(rectXZ(BX, -8, BX + 4.5, 8, 0.004), 1.2))
  for (let z = -8; z <= 8; z += 1) decor.add(M.white, cyl(0.03, 0.03, 1.0, BX + 4.4, 0.5, z, 6))
  decor.add(M.white, box(0.08, 0.05, 16, BX + 4.4, 1.0, 0))
  for (const z of [-3, 3]) {
    decor.add(M.white, box(0.7, 0.3, 1.9, BX + 2.6, 0.15, z), box(0.7, 0.5, 0.12, BX + 2.6, 0.45, z - 0.92, 0, -0.5))
    decor.add(M.cushionBlue, box(0.62, 0.06, 1.6, BX + 2.6, 0.33, z + 0.1))
  }
  // courtyard: a reflecting pool, benches, and the hall's sign
  const P = POOL
  decor.add(M.poolRim, box(P.x1 - P.x0, 0.4, 0.3, (P.x0 + P.x1) / 2, 0.2, P.z0 + 0.15), box(P.x1 - P.x0, 0.4, 0.3, (P.x0 + P.x1) / 2, 0.2, P.z1 - 0.15),
    box(0.3, 0.4, P.z1 - P.z0 - 0.6, P.x0 + 0.15, 0.2, (P.z0 + P.z1) / 2), box(0.3, 0.4, P.z1 - P.z0 - 0.6, P.x1 - 0.15, 0.2, (P.z0 + P.z1) / 2))
  const poolWater = planar(rectXZ(P.x0 + 0.3, P.z0 + 0.3, P.x1 - 0.3, P.z1 - 0.3, 0.3), 2.5)
  floor.add(M.poolWater, poolWater)

  // ---------- outside: a sandy island in a lagoon, palms, a path to the courtyard ----------
  floor.add(M.sand, planar(xf(new THREE.CircleGeometry(1, 96), 0, -0.03, 0, 0, -Math.PI / 2, 0, 74, 62), 6))
  floor.add(M.shallows, planar(xf(new THREE.RingGeometry(1, 1.2, 96), 0, -0.08, 0, 0, -Math.PI / 2, 0, 74, 62), 10))
  floor.add(M.lagoon, planar(xf(new THREE.PlaneGeometry(600, 600), 0, -0.15, 0, 0, -Math.PI / 2), 14))
  floor.add(M.stone, planar(rectXZ(-3, BZ, 3, BZ + 14, 0.002), 3.6))
  const palmR = rng(2026)
  // the four south palms stand beyond the farthest explore camera (z ≤ 29.5), so they never hide the walker
  for (const [x, z] of [[-14, 31], [-5.5, 33], [6, 32.5], [15, 31], [30, 22.5], [-31, 21], [-31.5, -3], [-32, 9], [34, 11.5], [-40, 26], [40, 28]]) {
    const h = 5.2 + palmR() * 2.2, lean = 0.8 + palmR() * 1.2, dir = palmR() * Math.PI * 2
    const pt = (t) => new THREE.Vector3(x + Math.cos(dir) * lean * t * t, h * t, z + Math.sin(dir) * lean * t * t)
    for (let i = 0; i < 7; i++) decor.add(M.trunk, rod(pt(i / 7), pt((i + 1) / 7), 0.19 - i * 0.012, 0.18 - (i + 1) * 0.012, 8))
    const top = pt(1)
    for (let i = 0; i < 10; i++) decor.add(M.palmLeaf, xf(leafGeom(2.6, 0.5, 1.2, 0.2), top.x, top.y, top.z, (i / 10) * Math.PI * 2 + palmR(), -0.25 + palmR() * 0.3))
    decor.add(M.trunk, sph(0.12, top.x + 0.12, top.y - 0.15, top.z), sph(0.12, top.x - 0.1, top.y - 0.18, top.z + 0.08))
  }

  // ---------- spectators (instanced) ----------
  buildCrowd(seats, scene)
  // seats: { x, z, y?, yaw, type: chair | stool | sofa, frame, cushion?, p: person | null } in world space
  function buildCrowd(list0, parent, { cast = true } = {}) {
    crowdKit ??= {
      G: crowdGeoms(), skinMat: std({ color: 0xffffff, roughness: 0.75 }),
      frameMat: std({ color: 0xffffff, metalness: 0.7, roughness: 0.35, envMap: env, envMapIntensity: 1 }),
    }
    const { G, skinMat, frameMat } = crowdKit
    const seats = list0
    const people = seats.filter((s) => s.p)
    const make = (geo, mat, list) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length))
      im.count = list.length
      im.castShadow = cast; im.receiveShadow = true
      parent.add(im)
      return im
    }
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
    const base = new THREE.Matrix4(), headM = new THREE.Matrix4(), tmp = new THREE.Matrix4(), col = new THREE.Color()
    const LIFT = { chair: 0, stool: 0.28, sofa: -0.07 }
    for (const type of ['chair', 'stool', 'sofa']) {
      const list = seats.filter((s) => s.type === type)
      if (!list.length) continue
      const im = make(G[type], frameMat, list)
      const cu = type === 'chair' ? make(G.cushion, skinMat, list) : null
      if (type === 'sofa') im.material = skinMat
      list.forEach((s, i) => {
        _e.set(0, s.yaw, 0, 'YXZ'); _q.setFromEuler(_e)
        base.compose(_p.set(s.x, s.y || 0, s.z), _q, _s.set(1, 1, 1))
        im.setMatrixAt(i, base); im.setColorAt(i, col.setHex(s.frame))
        if (cu) { cu.setMatrixAt(i, base); cu.setColorAt(i, col.setHex(s.cushion)) }
      })
    }
    if (!people.length) return
    const parts = ['torso', 'thighs', 'shins', 'shoes', 'skirt', 'arms', 'skin', 'head', 'hair', 'bun', 'shirt']
    const ims = Object.fromEntries(parts.map((p) => [p, make(G[p], skinMat, people)]))
    people.forEach((s, i) => {
      const p = s.p
      _e.set(0, s.yaw + p.yawJ, 0, 'YXZ'); _q.setFromEuler(_e)
      base.compose(_p.set(s.x, (s.y || 0) + (LIFT[s.type] || 0), s.z), _q, _s.setScalar(p.scale))
      _e.set(0, p.head, 0, 'YXZ'); _q.setFromEuler(_e)
      headM.makeTranslation(0, 1.25, -0.06).multiply(tmp.makeRotationFromQuaternion(_q)).multiply(tmp.makeTranslation(0, -1.25, 0.06)).premultiply(base)
      const set = (part, m, hex) => { ims[part].setMatrixAt(i, m); ims[part].setColorAt(i, col.setHex(hex)) }
      set('torso', base, p.outfit)
      set('thighs', base, p.outfit)
      set('shins', base, p.female ? p.skin : p.outfit)
      set('shoes', base, p.shoe)
      set('skirt', p.female ? base : ZERO, p.outfit)
      set('arms', base, p.bare ? p.skin : p.outfit)
      set('skin', base, p.skin)
      set('head', headM, p.skin)
      set('hair', headM, p.hair)
      set('bun', p.bun ? headM : ZERO, p.hair)
      set('shirt', p.female ? ZERO : base, 0xf7f3ea)
    })
    for (const im of Object.values(ims)) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere() }
  }

  // ---------- assemble the batches ----------
  floor.build(scene, { cast: false, receive: true })
  const marbleMesh = scene.children.find((o) => o.isMesh && o.material === M.marbleFloor)
  if (marbleMesh) refl.attach(marbleMesh)
  decal.build(scene, { cast: false, receive: false })
  decor.build(scene, { cast: true, receive: true })
  stubs.build(scene, { cast: true, receive: true })
  for (const m of scene.children) if (m.isMesh && m.material?.blending === THREE.AdditiveBlending) m.renderOrder = 1

  // station rings (opacity driven by the game)
  const rings = {}
  for (const s of STATIONS) {
    const m = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.12, s.r, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }))
    m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.03, s.z)
    scene.add(m); rings[s.id] = m
  }

  // what the grand hall's mirror can skip: every drawable of the world's own whose bounds stay clear of the hall
  // (all of it is static in x/z; walls only sink and chandeliers only fade, and lights are never touched)
  if (GRAND_KEY) {
    const r = ROOMS[GRAND_KEY], b = new THREE.Box3()
    const hall = new THREE.Box3(new THREE.Vector3(r.x - r.w / 2 - 0.1, -1, r.z - r.d / 2 - 0.1), new THREE.Vector3(r.x + r.w / 2 + 0.1, r.h + 1, r.z + r.d / 2 + 0.1))
    scene.updateMatrixWorld(true)
    scene.traverse((o) => {
      if (o === refl.mesh || !(o.isMesh || o.isSprite || o.isLine || o.isPoints)) return
      b.setFromObject(o)
      if (!b.isEmpty() && !b.intersectsBox(hall)) mirrorSkip.push(o)
    })
    hallBox.copy(hall)
    for (const o of scene.children) worldOwn.add(o)
  }

  // ====================================================================================================
  // Per-frame: cutaway, chandelier fading, shadow follow, nightclub lights, flicker
  // ====================================================================================================
  let last = null
  const DOWN = new THREE.Vector3(0, -1, 0), dir = new THREE.Vector3()
  const flameBase = M.bulb.color.clone()
  const fx = scene.userData.clubFx
  delete scene.userData.clubFx

  // Does this wall stand between the camera and the focus (seen from above)? Even when the line to the focus
  // clears the wall top, the wall still hides the floor in front of the focus, so height is not tested.
  function blocksSight(w, cam, fx0, fz) {
    const ddx = cam.x - fx0, ddz = cam.z - fz, len = Math.hypot(ddx, ddz)
    if (len < 0.05) return false
    const n = Math.ceil(len / 0.3), t0 = Math.min(0.5, 0.35 / len)
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((1 - t0) * i) / n
      const px = fx0 + ddx * t - w.ox, pz = fz + ddz * t - w.oz
      const along = px * w.dx + pz * w.dz, across = px * w.nx + pz * w.nz
      if (along > -0.2 && along < w.len + 0.2 && Math.abs(across) < T / 2 + 0.45) return true
    }
    return false
  }
  function blocksSightPoint(c, cam, fx0, fy, fz) {
    const ddx = cam.x - fx0, ddz = cam.z - fz, len = Math.hypot(ddx, ddz)
    const n = Math.max(2, Math.ceil(len / 0.3))
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = fy + (cam.y - fy) * t
      if (y < c.y0 - 0.4 || y > c.y1 + 0.3) continue
      if (Math.hypot(fx0 + ddx * t - c.x, fz + ddz * t - c.z) < c.r + 0.35) return true
    }
    return false
  }
  // Does the line from the camera to the focus (at any of the heights ys) pass through the box b
  // ({ x0, x1, z0, z1 } from b.bottom (default: the floor) up to b.top)?
  function lineHitsBox(b, cam, fx0, fz, ys) {
    for (const fy of ys) {
      const ddx = cam.x - fx0, ddy = cam.y - fy, ddz = cam.z - fz
      const n = Math.max(4, Math.ceil(Math.hypot(ddx, ddy, ddz) / 0.25))
      for (let i = 1; i <= n; i++) {
        const t = i / n, x = fx0 + ddx * t, y = fy + ddy * t, z = fz + ddz * t
        if (y < b.top + 0.1 && y > (b.bottom ?? -1) - 0.1 && x > b.x0 - 0.1 && x < b.x1 + 0.1 && z > b.z0 - 0.1 && z < b.z1 + 0.1) return true
      }
    }
    return false
  }
  const fade = (o, target, ease) => {
    o.k += (target - o.k) * ease
    if (Math.abs(o.k - target) < 0.003) o.k = target
  }

  // update(cameraPos, focus = {x, z, y?}, dt?) — call once per frame; dt (seconds) is optional (measured if absent).
  function update(cam, focus, dtIn) {
    const now = performance.now() / 1000
    const dt = dtIn ?? (last == null ? 1 : Math.min(0.1, now - last)) // the first call snaps into place
    last = now
    const fx0 = focus?.x ?? cam.x, fz = focus?.z ?? cam.z, fy = focus?.y ?? 1.0
    const ease = Math.min(1, dt * 7)
    // cutaway: a wall drops when it stands between the camera and the focus, or when the focus is in (or
    // next to) its room and the camera is on the wall's outer side (the room's camera-facing walls)
    for (const w of walls) {
      const outside = (cam.x - w.cx) * -w.nx + (cam.z - w.cz) * -w.nz > T
      const near = regionDist(w.owner, fx0, fz) < (w.target === 0 ? 2.6 : 2.0)
      const drop = (outside && near) || blocksSight(w, cam, fx0, fz)
      w.target = drop ? 0 : 1
      fade(w, w.target, ease)
      w.high.position.y = -(1 - w.k) * (w.h - STUB + 0.05)
      w.high.visible = w.k > 0.003
    }
    // the grand hall's balconies sink with their wall, and on their own while the camera is among them (or right
    // over/under them) or they stand between the camera and the focus's head or feet
    for (const b of balconies) {
      const crowd = cam.x > b.x0 - 0.6 && cam.x < b.x1 + 0.6 && cam.z > b.z0 - 0.6 && cam.z < b.z1 + 0.6 && cam.y < b.top + 1.6
      fade(b, crowd || lineHitsBox(b, cam, fx0, fz, [fy, 0.15]) ? 0 : 1, ease)
      b.group.position.y = b.wall.high.position.y - (1 - b.k) * (b.top + 0.3)
      b.group.visible = b.wall.high.visible && b.k > 0.003
    }
    // chandeliers fade when they hang in the line of sight, or the camera comes close at their height
    const flick = 0.88 + 0.07 * Math.sin(now * 13.1) * Math.sin(now * 7.3) + 0.05 * Math.sin(now * 3.7)
    for (const c of chandeliers) {
      const close = Math.hypot(cam.x - c.x, cam.z - c.z) < c.r + c.near && cam.y > c.y0 - 0.8 && cam.y < c.y1 + 0.5
      fade(c, close || blocksSightPoint(c, cam, fx0, fy, fz) ? 0 : 1, ease)
      for (const m of Object.values(c.mats)) m.opacity = m.userData.base * c.k
      c.mats.flame.color.copy(flameBase).multiplyScalar(flick)
      c.group.visible = c.k > 0.01
    }
    // the nightclub's rig fades while the camera is inside the club above its lowest point (the ball), or when it
    // hangs between the camera and the focus
    for (const g of rigs) {
      const above = cam.x > g.x0 - 0.3 && cam.x < g.x1 + 0.3 && cam.z > g.z0 - 0.3 && cam.z < g.z1 + 0.3 && cam.y > g.y0
      const hit = !above && lineHitsBox({ x0: g.f.x - g.f.w / 2 - 0.6, x1: g.f.x + g.f.w / 2 + 0.6, z0: g.f.z - 0.4, z1: g.f.z + 0.4, bottom: g.y0, top: g.y1 }, cam, fx0, fz, [fy, 0.15])
      fade(g, above || hit ? 0 : 1, ease)
      for (const m of Object.values(g.mats)) m.opacity = m.userData.base * g.k
      g.group.visible = g.k > 0.01
    }
    // ceilings show only from below the cornice (eye-level views); the overhead cameras look into an open room
    for (const c of ceilings) c.mesh.visible = cam.y < c.h - 0.35
    // the grand hall's mirror pass runs only while the camera is in the hall, or the focus is in it or near its
    // door (the cutaway then opens the floor to view); it fades in over the stone's static sheen
    fade(refl, GRAND_KEY && (roomAt(cam.x, cam.z) === GRAND_KEY || regionDist(GRAND_KEY, fx0, fz) < 2.6) ? 1 : 0, ease)
    M.marbleFloor.envMapIntensity = MARBLE_ENV[0] + (MARBLE_ENV[1] - MARBLE_ENV[0]) * refl.k
    M.bulb.color.copy(flameBase).multiplyScalar(0.96 + 0.04 * flick)
    // the sun's shadow box follows the focus (crisp dancer shadows on a 2048 map)
    const sx = Math.round(fx0 / 0.5) * 0.5, sz = Math.round((fz - 3) / 0.5) * 0.5
    sun.target.position.set(sx, 0, sz)
    sun.position.set(sx + SUN_OFFSET.x, SUN_OFFSET.y, sz + SUN_OFFSET.z)
    // nightclub: sweeping spotlights with visible beams, the mirror ball and its flecks
    for (const sp of spots) {
      const t = now * 0.45 + sp.phase
      sp.light.target.position.set(sp.home.x + Math.cos(t) * 3.2, 0, sp.home.z + Math.sin(t * 1.3) * 2.2)
      dir.subVectors(sp.light.target.position, sp.light.position)
      const len = dir.length()
      dir.normalize()
      sp.beam.quaternion.setFromUnitVectors(DOWN, dir)
      const rad = len * Math.tan(sp.light.angle) * 0.9
      sp.beam.scale.set(rad, len, rad)
    }
    if (fx) { fx.ball.rotation.y += dt * 0.6; fx.dots.rotation.y -= dt * 0.25 }
    // signs: none in your face inside a room, and none between the camera and the walker's body (0 to 1.9 m)
    const dzf = cam.z - fz
    for (const l of labels) {
      const s = l.sprite.position, sc = l.sprite.scale
      const t = Math.abs(dzf) > 1e-6 ? (cam.z - s.z) / dzf : -1 // where the camera-to-focus line crosses the sign (0 = camera, 1 = focus)
      const y0 = cam.y * (1 - t), y1 = y0 + 1.9 * t // the walker's feet and head lines at that depth
      const covers = t > 0 && t < 1 && Math.abs(cam.x + (fx0 - cam.x) * t - s.x) < sc.x / 2 + 0.4 && y0 < s.y + sc.y / 2 + 0.2 && y1 > s.y - sc.y / 2 - 0.2
      l.sprite.visible = !covers && (!l.key || regionDist(l.key, fx0, fz) > 0.5)
    }
    tex.water.offset.set((now * 0.01) % 1, (now * 0.006) % 1)
  }
  sun.target.position.set(0, 0, -3)
  sun.position.set(SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z - 3)

  // setScoreboards({ left: { title, lines }, right: { title, lines } }) redraws the grand hall's two scoreboards
  // reflection: the grand hall's planar floor reflection ({ k, mesh, target, camera, uniforms, passes })
  return { rings, update, walls, chandeliers, balconies, rigs, ceilings, labels, setScoreboards, reflection: refl }
}

// ====================================================================================================
// Minimap (north up)
// ====================================================================================================
export function drawMinimap(canvas, me, near) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width, h = canvas.height, pad = 6
  const s = Math.min((w - pad * 2) / ROOM.w, (h - pad * 2) / ROOM.d)
  const X = (x) => w / 2 + x * s, Z = (z) => h / 2 + z * s
  const fillR = (x0, z0, x1, z1) => ctx.fillRect(X(x0), Z(z0), (x1 - x0) * s, (z1 - z0) * s)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(216,241,247,0.96)'; ctx.fillRect(0, 0, w, h)
  // lobby: hall + courtyard, library and terrace zones, the pool
  ctx.fillStyle = '#f3e6cf'; fillR(HALL.x0, HALL.z0, HALL.x1, HALL.z1); fillR(COURT.x0, COURT.z0, COURT.x1, COURT.z1)
  ctx.fillStyle = '#dcc39b'; fillR(HALL.x0, HALL.z0, -21, HALL.z1)
  ctx.fillStyle = '#e6cfa6'; fillR(21, HALL.z0, HALL.x1, HALL.z1)
  ctx.fillStyle = '#8fd6e3'; fillR(POOL.x0, POOL.z0, POOL.x1, POOL.z1)
  ctx.strokeStyle = '#7fb9c9'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(X(HALL.x1), Z(HALL.z0)); ctx.lineTo(X(HALL.x1), Z(HALL.z1)); ctx.moveTo(X(COURT.x0), Z(COURT.z1)); ctx.lineTo(X(COURT.x1), Z(COURT.z1)); ctx.stroke()
  ctx.strokeStyle = '#0d3b52'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(X(HALL.x0), Z(HALL.z0)); ctx.lineTo(X(HALL.x0), Z(HALL.z1)); ctx.stroke()
  // rooms: floor in the style colour, walls with the door gap, name
  for (const [k, r] of Object.entries(ROOMS)) {
    const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2
    const hex = '#' + r.color.toString(16).padStart(6, '0'), on = near === k
    ctx.fillStyle = r.theme === 'nightclub' ? '#2a3445' : '#fbf6ec'; fillR(x0, z0, x1, z1)
    const f = FLOORS[k]
    ctx.fillStyle = hex + (on ? 'f0' : '99'); fillR(f.x - f.w / 2, f.z - f.d / 2, f.x + f.w / 2, f.z + f.d / 2)
    ctx.strokeStyle = on ? '#e98a6b' : '#0d3b52'; ctx.lineWidth = on ? 2.4 : 1.2
    const dz = r.door.z < r.z ? z0 : z1, gx0 = r.door.x - DOOR_W / 2, gx1 = r.door.x + DOOR_W / 2
    const oz = dz === z0 ? z1 : z0
    ctx.beginPath()
    ctx.moveTo(X(gx0), Z(dz)); ctx.lineTo(X(x0), Z(dz)); ctx.lineTo(X(x0), Z(oz)); ctx.lineTo(X(x1), Z(oz)); ctx.lineTo(X(x1), Z(dz)); ctx.lineTo(X(gx1), Z(dz))
    ctx.stroke()
    ctx.font = '700 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(13,59,82,0.75)'; ctx.strokeText(r.label, X(f.x), Z(f.z))
    ctx.fillStyle = '#ffffff'; ctx.fillText(r.label, X(f.x), Z(f.z))
  }
  // the other stations
  ctx.font = '600 8px system-ui, sans-serif'
  for (const st of STATIONS) {
    if (ROOMS[st.id]) continue
    const on = near === st.id
    ctx.fillStyle = on ? '#e98a6b' : '#1b7f9c'
    ctx.beginPath(); ctx.arc(X(st.x), Z(st.z), on ? 4 : 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#0d3b52'
    ctx.fillText({ coach: 'Coach', drills: 'Drills', planner: 'Planner' }[st.id] || st.label, X(st.x), Z(st.z) + 9)
  }
  // you
  ctx.save(); ctx.translate(X(me.x), Z(me.z)); ctx.rotate(-me.yaw + Math.PI)
  ctx.fillStyle = '#e98a6b'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(4.8, 5); ctx.lineTo(-4.8, 5); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.restore()
  ctx.strokeStyle = '#0d3b52'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
}
