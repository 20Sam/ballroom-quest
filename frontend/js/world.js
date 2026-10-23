// Evans Hall Ballroom: a Yale SOM–inspired building. A glass curtain wall wraps a central courtyard
// ballroom; four oval "classroom drums" hold one studio per style; a cloister of slim columns rings
// the courtyard; Ross Library (west) holds the Drill Board; the Beinecke Terrace (north) holds the Planner.
import * as THREE from 'three'

export const ROOM = { w: 60, d: 44 }
const H = 5.2 // wall height

// One drum per style. rx/rz = oval radii; door = parametric angle t of the opening's centre, i.e. the wall
// point (x + cos t * rx, z + sin t * rz). drum() draws and blockedByDrum() collides with this same angle.
export const DRUMS = {
  standard: { x: -19, z: -12, rx: 8.5, rz: 6.5, color: 0x7a6bd1, label: 'STANDARD', room: 'Standard Drum' },
  smooth: { x: 19, z: -12, rx: 8.5, rz: 6.5, color: 0x3a9fc4, label: 'SMOOTH', room: 'Smooth Drum' },
  latin: { x: -19, z: 12, rx: 8.5, rz: 6.5, color: 0xe98a6b, label: 'LATIN', room: 'Latin Drum' },
  rhythm: { x: 19, z: 12, rx: 8.5, rz: 6.5, color: 0x2f9e7a, label: 'RHYTHM', room: 'Rhythm Drum' },
}
const DOOR_HALF = 0.42 // radians of opening on each side
const DRUM_SEGS = 64 // wall segments per drum; a segment is left out when its middle is within DOOR_HALF of the door
const DOOR_EDGE = 0.04 // radians kept clear inside each door post, so the walker (a point) doesn't clip the wall
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))
for (const d of Object.values(DRUMS)) {
  d.door = Math.atan2(-d.z, -d.x) // the opening faces the courtyard
  // the opening exactly as drawn (whole segments), as parametric angles relative to the door
  const step = (Math.PI * 2) / DRUM_SEGS
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < DRUM_SEGS; i++) {
    const diff = wrapAngle((i + 0.5) * step - d.door)
    if (Math.abs(diff) < DOOR_HALF) { lo = Math.min(lo, diff - step / 2); hi = Math.max(hi, diff + step / 2) }
  }
  d.gap = [lo, hi]
}

// Where the couple dances in each studio (used by the game).
export const FLOORS = Object.fromEntries(Object.entries(DRUMS).map(([k, d]) => [k, { x: d.x, z: d.z - 1.5, color: d.color, label: d.label }]))

export const STATIONS = [
  ...Object.entries(DRUMS).map(([k, d]) => ({ id: k, label: `${d.room} · ${d.label[0] + d.label.slice(1).toLowerCase()} floor`, x: d.x, z: d.z, r: 4.2 })),
  { id: 'coach', label: 'Coach Marisol', x: 0, z: -2.5, r: 2.6 },
  { id: 'drills', label: 'Ross Library · Team Drill Board', x: -27.3, z: 0, r: 3.2 },
  { id: 'planner', label: 'Beinecke Terrace · Competition Planner', x: 0, z: -19.6, r: 3.4 },
]
export const SPAWN = { x: 0, z: 12, yaw: Math.PI }

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function textSprite(text, { size = 64, color = '#0d3b52', bg = 'rgba(255,250,240,0.92)', scale = 1 } = {}) {
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
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.scale.set((w / h) * 0.55 * scale, 0.55 * scale, 1)
  s.renderOrder = 10
  return s
}

function woodTexture(repeat = [5, 3.5]) {
  const t = canvasTexture(1024, 1024, (ctx, w, h) => {
    const plank = 64
    for (let y = 0; y < h; y += plank) {
      let x = -((y / plank) % 3) * 140
      while (x < w) {
        const len = 260 + ((x * 7 + y * 3) % 200)
        const tone = 205 + ((x + y * 13) % 22)
        ctx.fillStyle = `rgb(${tone}, ${tone - 38}, ${tone - 86})`
        ctx.fillRect(x, y, len, plank)
        ctx.strokeStyle = 'rgba(90,60,30,0.25)'
        ctx.strokeRect(x + 0.5, y + 0.5, len, plank)
        for (let g = 0; g < 5; g++) {
          ctx.strokeStyle = 'rgba(120,80,40,0.08)'
          ctx.beginPath(); ctx.moveTo(x, y + 10 + g * 11); ctx.lineTo(x + len, y + 8 + g * 11 + (g % 2) * 3); ctx.stroke()
        }
        x += len
      }
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  return t
}

function stoneTexture() {
  const t = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#efe4cf'; ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) {
      const tone = 228 + ((x * 3 + y * 7) % 14)
      ctx.fillStyle = `rgb(${tone}, ${tone - 10}, ${tone - 30})`
      ctx.fillRect(x + 2, y + 2, 124, 124)
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(14, 10)
  return t
}

function slatTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b98a55'; ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 16) { ctx.fillStyle = x % 32 ? '#a87a48' : '#c99a63'; ctx.fillRect(x, 0, 10, h) }
  })
}

function skyTexture() {
  return canvasTexture(512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#8fd3ec'); g.addColorStop(0.55, '#d8f1f7'); g.addColorStop(0.62, '#3fb2c9'); g.addColorStop(1, '#1b7f9c')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(60 + i * 80, 50 + (i % 2) * 20, 40, 10, 0, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = '#f1dfbd'; ctx.fillRect(0, h * 0.9, w, h * 0.1)
  })
}

const glassMat = () => new THREE.MeshStandardMaterial({ color: 0xbfe6f2, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false })
const mullionMat = new THREE.MeshStandardMaterial({ color: 0xe9eef0, roughness: 0.4, metalness: 0.3 })

// A straight glass curtain wall with vertical mullions.
function curtainWall(scene, x1, z1, x2, z2, h = H) {
  const len = Math.hypot(x2 - x1, z2 - z1)
  const ang = Math.atan2(z2 - z1, x2 - x1)
  const g = new THREE.Mesh(new THREE.PlaneGeometry(len, h), glassMat())
  g.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2); g.rotation.y = -ang
  scene.add(g)
  const n = Math.max(1, Math.round(len / 3))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), mullionMat)
    m.position.set(x1 + (x2 - x1) * t, h / 2, z1 + (z2 - z1) * t)
    m.castShadow = true
    scene.add(m)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.2), mullionMat)
  beam.position.set((x1 + x2) / 2, h, (z1 + z2) / 2); beam.rotation.y = -ang
  scene.add(beam)
}

// An oval classroom drum: wood slats below, glass above, an opening toward the courtyard.
function drum(scene, d) {
  const segs = DRUM_SEGS
  const slat = new THREE.MeshStandardMaterial({ map: slatTexture(), roughness: 0.7 })
  const glass = glassMat()
  const band = 1.2
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2
    const mid = (a0 + a1) / 2
    if (Math.abs(wrapAngle(mid - d.door)) < DOOR_HALF) continue // the opening (same test as d.gap)
    const p0 = [d.x + Math.cos(a0) * d.rx, d.z + Math.sin(a0) * d.rz]
    const p1 = [d.x + Math.cos(a1) * d.rx, d.z + Math.sin(a1) * d.rz]
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.02
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    const lower = new THREE.Mesh(new THREE.BoxGeometry(len, band, 0.16), slat)
    lower.position.set((p0[0] + p1[0]) / 2, band / 2, (p0[1] + p1[1]) / 2); lower.rotation.y = -ang
    lower.castShadow = lower.receiveShadow = true
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.4), glass)
    upper.position.set((p0[0] + p1[0]) / 2, band + 1.2, (p0[1] + p1[1]) / 2); upper.rotation.y = -ang
    scene.add(lower, upper)
    if (i % 4 === 0) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.6, 0.08), mullionMat)
      post.position.set(p0[0], 1.8, p0[1]); scene.add(post)
    }
  }
  // wooden dance floor inside, ringed in the style colour
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ map: woodTexture([2.5, 2.5]), roughness: 0.4 }))
  floor.scale.set(d.rx - 0.3, d.rz - 0.3, 1)
  floor.rotation.x = -Math.PI / 2; floor.position.set(d.x, 0.015, d.z); floor.receiveShadow = true
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 0.97, 64), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.7 }))
  ring.scale.set(d.rx - 0.3, d.rz - 0.3, 1)
  ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.02, d.z)
  scene.add(floor, ring)
  const hex = '#' + d.color.toString(16).padStart(6, '0')
  const label = textSprite(d.label, { size: 72, color: '#ffffff', bg: hex + 'ee', scale: 1.4 })
  label.position.set(d.x + Math.cos(d.door) * d.rx, 4.4, d.z + Math.sin(d.door) * d.rz)
  scene.add(label)
  // soft pendant light
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 32), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }))
  lamp.position.set(d.x, 4.6, d.z); scene.add(lamp)
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0xd8f1f7)
  scene.fog = new THREE.Fog(0xd8f1f7, 55, 110)

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c29a, 1.2))
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5)
  sun.position.set(14, 26, 18)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 26, bottom: -26, near: 1, far: 80 })
  scene.add(sun)

  // ground: stone everywhere, a wooden ballroom in the courtyard
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.85 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true
  scene.add(ground)
  const court = new THREE.Mesh(new THREE.PlaneGeometry(20, 15), new THREE.MeshStandardMaterial({ map: woodTexture([4, 3]), roughness: 0.4 }))
  court.rotation.x = -Math.PI / 2; court.position.set(0, 0.01, 1); court.receiveShadow = true
  scene.add(court)
  const courtSign = textSprite('Evans Hall Ballroom · the Courtyard', { size: 56, scale: 1.1 })
  courtSign.position.set(0, 4.6, -6.6); scene.add(courtSign)

  // outer glass curtain wall (the south side stays open toward the camera)
  const W = ROOM.w / 2, D = ROOM.d / 2
  curtainWall(scene, -W, -D, W, -D)
  curtainWall(scene, -W, -D, -W, D)
  curtainWall(scene, W, -D, W, D)

  // the lagoon outside the glass, for the blue-and-sand mood
  const sky = skyTexture()
  for (const [x, z, ry, w] of [[0, -D - 0.6, 0, ROOM.w], [-W - 0.6, 0, Math.PI / 2, ROOM.d], [W + 0.6, 0, -Math.PI / 2, ROOM.d]]) {
    const view = new THREE.Mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshBasicMaterial({ map: sky }))
    view.position.set(x, H / 2, z); view.rotation.y = ry; scene.add(view)
  }

  // cloister: slim white columns around the courtyard
  const colMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  for (let x = -11; x <= 11; x += 3.6666) for (const z of [-7.5]) { // the south side stays open toward the camera
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, H, 12), colMat)
    c.position.set(x, H / 2, z); c.castShadow = true; scene.add(c)
  }
  for (let z = -4; z <= 6; z += 3.5) for (const x of [-11, 11]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, H, 12), colMat)
    c.position.set(x, H / 2, z); c.castShadow = true; scene.add(c)
  }

  Object.values(DRUMS).forEach((d) => drum(scene, d))

  // Ross Library (west): bookshelves + the Drill Board
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.8 })
  const bookColors = [0x1b7f9c, 0xe98a6b, 0xf3e6cf, 0x0d3b52, 0xd9b26a]
  for (const z of [-6, 6]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.6, 4.5), shelfMat)
    shelf.position.set(-W + 0.6, 1.3, z); shelf.castShadow = true; scene.add(shelf)
    for (let r = 0; r < 4; r++) for (let b = 0; b < 12; b++) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.28), new THREE.MeshStandardMaterial({ color: bookColors[(b + r) % 5] }))
      book.position.set(-W + 0.95, 0.4 + r * 0.6, z - 2 + b * 0.35); scene.add(book)
    }
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2, 3.4), new THREE.MeshStandardMaterial({ color: 0xc9a46b }))
  board.position.set(-W + 0.4, 2.1, 0); scene.add(board)
  for (let i = 0; i < 6; i++) {
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), new THREE.MeshStandardMaterial({ color: [0xfff8e1, 0xd8f1f7, 0xffe0d4][i % 3] }))
    note.position.set(-W + 0.48, 2.5 - Math.floor(i / 3) * 0.75, -1 + (i % 3)); note.rotation.y = Math.PI / 2
    scene.add(note)
  }
  const lib = textSprite('Ross Library · Drill Board', { size: 48, scale: 0.95 })
  lib.position.set(-W + 1.5, 3.9, 0); scene.add(lib)

  // Beinecke Terrace (north): calendar wall + terrace benches for the Planner
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({
    map: canvasTexture(512, 512, (ctx, w) => {
      ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, w, w)
      ctx.fillStyle = '#1b7f9c'; ctx.fillRect(0, 0, w, 110)
      ctx.fillStyle = '#fff'; ctx.font = '600 64px Georgia'; ctx.textAlign = 'center'; ctx.fillText('DECEMBER', w / 2, 78)
      ctx.fillStyle = '#0d3b52'; ctx.font = '36px Georgia'
      for (let d = 0; d < 31; d++) {
        const cx = 40 + (d % 7) * 72, cy = 160 + Math.floor(d / 7) * 72
        if (d === 4) { ctx.fillStyle = '#e98a6b'; ctx.beginPath(); ctx.arc(cx + 8, cy - 12, 28, 0, 7); ctx.fill(); ctx.fillStyle = '#fff' }
        ctx.fillText(String(d + 1), cx + 8, cy); ctx.fillStyle = '#0d3b52'
      }
    }),
  }))
  cal.position.set(0, 2.4, -D + 0.1); scene.add(cal)
  const benchMat = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.6 })
  for (const x of [-4, 4]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.45, 0.6), benchMat)
    bench.position.set(x, 0.22, -D + 3); bench.castShadow = true; scene.add(bench)
  }
  const ter = textSprite('Beinecke Terrace · Competition Planner', { size: 48, scale: 0.95 })
  ter.position.set(0, 4.4, -D + 0.6); scene.add(ter)

  // planters (sea-grass green) at the courtyard corners
  for (const [x, z] of [[-10, -6.5], [10, -6.5], [-12, 9.5], [12, 9.5]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0xf3e6cf }))
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 12), new THREE.MeshStandardMaterial({ color: 0x5e9e7e, roughness: 0.9 }))
    pot.position.set(x, 0.3, z); leaf.position.set(x, 1.0, z)
    scene.add(pot, leaf)
  }

  const rings = {}
  for (const s of STATIONS) {
    const m = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.12, s.r, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }))
    m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.03, s.z)
    scene.add(m); rings[s.id] = m
  }
  return { rings }
}

// Keep the walker inside the building and out of drum walls (except through the opening).
function blockedByDrum(x, z) {
  for (const d of Object.values(DRUMS)) {
    const nx = (x - d.x) / d.rx, nz = (z - d.z) / d.rz
    const r = Math.hypot(nx, nz)
    if (r > 0.94 && r < 1.08) {
      // parametric angle (from the normalised nx, nz), the same angle drum() draws the wall and opening with
      const diff = wrapAngle(Math.atan2(nz, nx) - d.door)
      if (diff < d.gap[0] + DOOR_EDGE || diff > d.gap[1] - DOOR_EDGE) return true
    }
  }
  return false
}

export function move(from, to) {
  const W = ROOM.w / 2 - 0.7, D = ROOM.d / 2 - 0.7
  const x = THREE.MathUtils.clamp(to.x, -W + 0.6, W), z = THREE.MathUtils.clamp(to.z, -D, D)
  if (!blockedByDrum(x, z)) return { x, z }
  if (!blockedByDrum(x, from.z)) return { x, z: from.z }
  if (!blockedByDrum(from.x, z)) return { x: from.x, z }
  return { x: from.x, z: from.z }
}

// Mini map (top-down) drawn into a canvas element.
export function drawMinimap(canvas, me, near) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width, h = canvas.height
  const sx = w / ROOM.w, sz = h / ROOM.d
  const X = (x) => (x + ROOM.w / 2) * sx, Z = (z) => (z + ROOM.d / 2) * sz
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,250,240,0.95)'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ead7b5'; ctx.fillRect(X(-10), Z(-6.5), 20 * sx, 15 * sz)
  for (const [k, d] of Object.entries(DRUMS)) {
    ctx.beginPath(); ctx.ellipse(X(d.x), Z(d.z), d.rx * sx, d.rz * sz, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#' + d.color.toString(16).padStart(6, '0') + (near === k ? 'cc' : '55'); ctx.fill()
    ctx.fillStyle = '#0d3b52'; ctx.font = '600 9px system-ui'; ctx.textAlign = 'center'
    ctx.fillText(d.label, X(d.x), Z(d.z) + 3)
  }
  ctx.fillStyle = '#8a6a45'; ctx.fillRect(X(-ROOM.w / 2), Z(-8), 3, 16 * sz)
  ctx.fillStyle = '#1b7f9c'; ctx.fillRect(X(-3), Z(-ROOM.d / 2), 6 * sx, 3)
  ctx.save(); ctx.translate(X(me.x), Z(me.z)); ctx.rotate(-me.yaw + Math.PI)
  ctx.fillStyle = '#e98a6b'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill()
  ctx.restore()
  ctx.strokeStyle = '#0d3b52'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
}
