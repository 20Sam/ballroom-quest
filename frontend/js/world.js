// The studio: floor, walls, mirrors, windows onto the ocean, two dance floors and the stations.
import * as THREE from 'three'

export const ROOM = { w: 34, d: 22 }
export const FLOORS = {
  smooth: { x: -8, z: 0, w: 13, d: 13, color: 0x3a9fc4, label: 'SMOOTH' },
  latin: { x: 8, z: 0, w: 13, d: 13, color: 0xe98a6b, label: 'LATIN' },
}
export const STATIONS = [
  { id: 'smooth', label: 'Smooth floor', x: -8, z: 0, r: 3.2 },
  { id: 'latin', label: 'Latin floor', x: 8, z: 0, r: 3.2 },
  { id: 'coach', label: 'Coach Marisol', x: 0, z: -8, r: 2.4 },
  { id: 'drills', label: 'Team Drill Board', x: -12.5, z: -9.4, r: 2.6 },
  { id: 'planner', label: 'Competition Planner', x: 12.5, z: -9.4, r: 2.6 },
]

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
    const r = h / 2
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.fill()
    ctx.font = `600 ${size}px Georgia, serif`
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
    ctx.fillText(text, w / 2, h / 2 + 2)
  })
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.scale.set((w / h) * 0.55 * scale, 0.55 * scale, 1)
  s.renderOrder = 10
  return s
}

function woodTexture() {
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
  t.repeat.set(5, 3.5)
  return t
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

function floorZone(scene, f) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.1, 4),
    new THREE.MeshBasicMaterial({ color: f.color })
  )
  ring.visible = false
  const border = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.55 })
  const t = 0.12
  const pieces = [[f.w, t, 0, -f.d / 2], [f.w, t, 0, f.d / 2], [t, f.d, -f.w / 2, 0], [t, f.d, f.w / 2, 0]]
  for (const [w, d, x, z] of pieces) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
    m.rotation.x = -Math.PI / 2; m.position.set(f.x + x, 0.012, f.z + z); border.add(m)
  }
  const glow = new THREE.Mesh(new THREE.CircleGeometry(f.w * 0.36, 64),
    new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.07 }))
  glow.rotation.x = -Math.PI / 2; glow.position.set(f.x, 0.011, f.z)
  border.add(glow)
  scene.add(border, ring)
  const label = textSprite(f.label, { size: 72, color: '#ffffff', bg: f.color === 0x3a9fc4 ? 'rgba(25,110,150,0.9)' : 'rgba(214,112,82,0.92)', scale: 1.5 })
  label.position.set(f.x, 4.2, f.z - f.d / 2 + 0.3)
  scene.add(label)
}

function stationRing(scene, s) {
  const m = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.12, s.r, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 }))
  m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.02, s.z)
  scene.add(m)
  return m
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0xeaf4f6)
  scene.fog = new THREE.Fog(0xeaf4f6, 40, 80)

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9c29a, 1.15)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6)
  sun.position.set(10, 18, 12)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 14, bottom: -14, near: 1, far: 50 })
  sun.shadow.radius = 4
  scene.add(sun)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d),
    new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.45, metalness: 0.05 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf6ead6, roughness: 0.9 })
  const H = 6
  const walls = [
    [ROOM.w, H, 0, -ROOM.d / 2, 0], [ROOM.w, H, 0, ROOM.d / 2, Math.PI],
    [ROOM.d, H, -ROOM.w / 2, 0, Math.PI / 2], [ROOM.d, H, ROOM.w / 2, 0, -Math.PI / 2],
  ]
  walls.forEach(([w, h, x, z, ry], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat)
    m.position.set(x, h / 2, z); m.rotation.y = ry
    m.receiveShadow = true
    if (i === 1) m.visible = false // the camera side stays open
    scene.add(m)
  })

  // Mirror wall at the back with a barre
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.4),
    new THREE.MeshStandardMaterial({ color: 0xcfe9f2, emissive: 0x9fd0e0, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.15 }))
  mirror.position.set(0, 2.2, -ROOM.d / 2 + 0.03)
  scene.add(mirror)
  const barre = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 20, 12),
    new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.4 }))
  barre.rotation.z = Math.PI / 2; barre.position.set(0, 1.05, -ROOM.d / 2 + 0.3)
  scene.add(barre)

  // Windows onto the lagoon on both side walls
  const sky = skyTexture()
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshBasicMaterial({ map: sky }))
      win.position.set(side * (ROOM.w / 2 - 0.03), 3, i * 6.5)
      win.rotation.y = -side * Math.PI / 2
      scene.add(win)
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 2.9), new THREE.MeshStandardMaterial({ color: 0xffffff }))
      frame.position.copy(win.position).add(new THREE.Vector3(side * 0.01, 0, 0))
      frame.rotation.y = win.rotation.y
      scene.add(frame)
    }
  }

  // Chandeliers
  for (const x of [-8, 8]) {
    const g = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 8, 32), new THREE.MeshStandardMaterial({ color: 0xd9b26a, metalness: 0.8, roughness: 0.3 }))
    ring.rotation.x = Math.PI / 2
    g.add(ring)
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }))
      b.position.set(Math.cos(i / 8 * Math.PI * 2) * 0.7, 0.05, Math.sin(i / 8 * Math.PI * 2) * 0.7)
      g.add(b)
    }
    g.position.set(x, 5.4, 0)
    scene.add(g)
  }

  Object.values(FLOORS).forEach((f) => floorZone(scene, f))

  // Drill board and planner calendar on the back wall
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0xc9a46b }))
  board.position.set(-12.5, 2.1, -ROOM.d / 2 + 0.1)
  scene.add(board)
  for (let i = 0; i < 6; i++) {
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), new THREE.MeshStandardMaterial({ color: [0xfff8e1, 0xd8f1f7, 0xffe0d4][i % 3] }))
    note.position.set(-13.5 + (i % 3) * 1, 2.5 - Math.floor(i / 3) * 0.75, -ROOM.d / 2 + 0.16)
    note.rotation.z = (i % 2 ? 0.06 : -0.05)
    scene.add(note)
  }
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshStandardMaterial({
    map: canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, w, h)
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
  cal.position.set(12.5, 2.3, -ROOM.d / 2 + 0.05)
  scene.add(cal)

  const labels = {}
  const rings = {}
  for (const s of STATIONS) {
    rings[s.id] = stationRing(scene, s)
    if (s.id === 'drills' || s.id === 'planner') {
      const l = textSprite(s.label, { size: 48, scale: 0.9 })
      l.position.set(s.x, 3.75, -ROOM.d / 2 + 0.4)
      scene.add(l); labels[s.id] = l
    }
  }
  return { rings, labels }
}
