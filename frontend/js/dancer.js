// Dancers built from simple shapes, plus the footwork engine that turns syllabus steps into motion.
import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const OTHER = { L: 'R', R: 'L' }

// ---------- character ----------
export class Dancer {
  constructor(scene, kind) {
    this.kind = kind // 'leader' | 'follower' | 'coach'
    const palette = {
      leader: { body: 0x173f5f, accent: 0xf3e6cf, skin: 0xe2b48c, hair: 0x2b1d14, shoe: 0x111111 },
      follower: { body: 0xe98a6b, accent: 0xf6d7a7, skin: 0xc68a5e, hair: 0x4a2a16, shoe: 0xd9b26a },
      coach: { body: 0x2a8fb3, accent: 0xffffff, skin: 0x9a6a46, hair: 0x1a1a1a, shoe: 0x222222 },
    }[kind]
    const mat = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r })
    this.root = new THREE.Group()
    this.body = new THREE.Group()
    this.root.add(this.body)

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.62, 16), mat(palette.body))
    torso.position.y = 1.22
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.02), mat(palette.accent))
    chest.position.set(0, 1.36, 0.17)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 20), mat(palette.skin, 0.5))
    head.position.y = 1.68
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat(palette.hair))
    hair.position.y = 1.7
    const eyeMat = mat(0x1a1a1a)
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), eyeMat)
      eye.position.set(s * 0.045, 1.69, 0.12); this.body.add(eye)
    }
    this.body.add(torso, chest, head, hair)
    if (kind === 'follower') {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.46, 0.75, 24, 1, true), mat(palette.body, 0.5))
      skirt.material.side = THREE.DoubleSide
      skirt.position.y = 0.6
      this.body.add(skirt)
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), mat(palette.hair))
      bun.position.set(0, 1.74, -0.12); this.body.add(bun)
    } else {
      const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.22, 16), mat(palette.body))
      hips.position.y = 0.92; this.body.add(hips)
    }
    // arms in a dance frame
    this.arms = []
    for (const s of [-1, 1]) {
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.34, 10), mat(palette.body))
      upper.position.set(s * 0.33, 1.42, 0.06); upper.rotation.z = s * 1.2; upper.rotation.x = -0.3
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), mat(palette.skin, 0.5))
      hand.position.set(s * 0.5, 1.52, 0.18)
      this.body.add(upper, hand); this.arms.push(upper)
    }
    this.body.traverse((o) => { if (o.isMesh) o.castShadow = true })

    // legs + shoes live in world space
    this.legs = {}; this.shoes = {}
    for (const f of ['L', 'R']) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 1, 10), mat(kind === 'follower' ? palette.skin : palette.body))
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.24), mat(palette.shoe, 0.3))
      leg.castShadow = shoe.castShadow = true
      this.legs[f] = leg; this.shoes[f] = shoe
      scene.add(leg, shoe)
    }
    scene.add(this.root)
    this.pose = { x: 0, z: 0, yaw: 0, L: { x: -0.1, z: 0, y: 0 }, R: { x: 0.1, z: 0, y: 0 }, rise: 0 }
  }

  // See-through body so the player can watch their own feet from behind.
  setGhost(on) {
    if (this._ghost === on) return
    this._ghost = on
    this.body.traverse((o) => { if (o.isMesh) { o.material.transparent = on; o.material.opacity = on ? 0.35 : 1; o.material.depthWrite = !on } })
  }

  setVisible(v) {
    this.root.visible = v
    for (const f of ['L', 'R']) { this.legs[f].visible = v; this.shoes[f].visible = v }
  }

  apply(p) {
    this.pose = p
    this.root.position.set(p.x, p.rise || 0, p.z)
    this.root.rotation.y = p.yaw
    const hipY = 0.88 + (p.rise || 0)
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw))
    for (const f of ['L', 'R']) {
      const side = f === 'L' ? -1 : 1
      const hip = new THREE.Vector3(p.x, hipY, p.z).addScaledVector(right, side * 0.09)
      const foot = new THREE.Vector3(p[f].x, 0.07 + (p[f].y || 0), p[f].z)
      const dir = foot.clone().sub(hip)
      const len = dir.length()
      const leg = this.legs[f]
      leg.position.copy(hip).addScaledVector(dir, 0.5)
      leg.scale.set(1, len, 1)
      leg.quaternion.setFromUnitVectors(UP, dir.normalize())
      const shoe = this.shoes[f]
      shoe.position.set(p[f].x, 0.035 + (p[f].y || 0), p[f].z)
      shoe.rotation.y = p.yaw
    }
  }

  // simple walk cycle for exploring the studio
  walk(x, z, yaw, phase, moving) {
    const fwd = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw))
    const right = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw))
    const swing = moving ? Math.sin(phase) * 0.22 : 0
    const lift = moving ? Math.max(0, Math.cos(phase)) * 0.06 : 0
    const liftR = moving ? Math.max(0, -Math.cos(phase)) * 0.06 : 0
    this.apply({
      x, z, yaw, rise: moving ? Math.abs(Math.sin(phase)) * 0.03 : 0,
      L: { x: x - right.x * 0.1 + fwd.x * swing, z: z - right.y * 0.1 + fwd.y * swing, y: lift },
      R: { x: x + right.x * 0.1 - fwd.x * swing, z: z + right.y * 0.1 - fwd.y * swing, y: liftR },
    })
  }
}

// ---------- footwork engine ----------
// Offsets of the stepping foot relative to the supporting foot, in the dancer's frame (x = right, z = forward).
function offset(foot, dir, s) {
  const lat = foot === 'L' ? -0.2 : 0.2
  const sgn = foot === 'L' ? -1 : 1
  switch (dir) {
    case 'fwd': return [lat, s]
    case 'back': return [lat, -s]
    case 'side_l': return [foot === 'L' ? -(0.2 + 0.6 * s) : -0.04, 0]
    case 'side_r': return [foot === 'R' ? 0.2 + 0.6 * s : 0.04, 0]
    case 'diag_fwd_r': return [0.2 + 0.4 * s, 0.5 * s]
    case 'diag_fwd_l': return [-(0.2 + 0.4 * s), 0.5 * s]
    case 'diag_back_r': return [0.2 + 0.4 * s, -0.5 * s]
    case 'diag_back_l': return [-(0.2 + 0.4 * s), -0.5 * s]
    case 'cross_fwd': return [-sgn * 0.04, 0.8 * s]
    case 'cross_back': return [-sgn * 0.04, -0.8 * s]
    case 'cross_behind': return [-sgn * 0.06, -0.16]
    case 'close': return [lat, 0]
    default: return null // replace / in place: foot stays
  }
}

const MIRROR_DIR = {
  fwd: 'back', back: 'fwd', side_l: 'side_r', side_r: 'side_l', close: 'close', replace: 'replace',
  diag_fwd_r: 'diag_back_l', diag_fwd_l: 'diag_back_r', diag_back_r: 'diag_fwd_l', diag_back_l: 'diag_fwd_r',
  cross_fwd: 'cross_fwd', cross_back: 'cross_back', cross_behind: 'cross_behind', in_place: 'in_place',
}

// What the follower does on the same count: other foot, mirrored direction.
export function followerStep(step) {
  return { foot: OTHER[step.foot], dir: MIRROR_DIR[step.dir] || step.dir }
}

export const KEY_FOR_DIR = {
  fwd: 'ArrowUp', cross_fwd: 'ArrowUp', diag_fwd_r: 'ArrowUp', diag_fwd_l: 'ArrowUp',
  back: 'ArrowDown', cross_back: 'ArrowDown', cross_behind: 'ArrowDown', diag_back_r: 'ArrowDown', diag_back_l: 'ArrowDown',
  side_l: 'ArrowLeft', side_r: 'ArrowRight', close: 'Space', replace: 'Space', in_place: 'Space',
}
export const KEY_LABEL = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: '␣' }

const COUPLE_GAP = { closed: 0.58, promenade: 0.6, open: 1.1, fan: 1.2 }

// Build a timeline for a routine: one state per step for the leader, with partner positions derived.
export function buildTimeline(figs, dance, start = { x: 0, z: 0, yaw: 0 }) {
  const s = dance.stride
  let st = {
    x: start.x, z: start.z, yaw: start.yaw,
    L: { x: start.x - 0.1 * Math.cos(start.yaw), z: start.z + 0.1 * Math.sin(start.yaw) },
    R: { x: start.x + 0.1 * Math.cos(start.yaw), z: start.z - 0.1 * Math.sin(start.yaw) },
    weight: 'R', position: 'closed',
  }
  const states = [structuredClone(st)]
  const steps = []
  let beat = 0
  figs.forEach((fig, fi) => {
    fig.steps.forEach(([foot, dir, beats, turn, count, weight = true], si) => {
      const yaw = st.yaw - THREE.MathUtils.degToRad(turn) // + turn = to the right = clockwise seen from above
      const sup = st[OTHER[foot]]
      const off = offset(foot, dir, s)
      const next = structuredClone(st)
      next.yaw = yaw
      if (off) {
        const [ox, oz] = off
        const rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw)
        next[foot] = { x: sup.x + rx * ox + fx * oz, z: sup.z + rz * ox + fz * oz }
      }
      if (weight) next.weight = foot
      const w = next[next.weight], o = next[OTHER[next.weight]]
      next.x = w.x * 0.7 + o.x * 0.3
      next.z = w.z * 0.7 + o.z * 0.3
      if (si === fig.steps.length - 1) next.position = fig.ends === 'same' ? st.position : fig.ends
      else if (si === 0 && fig.ends !== 'same' && fig.ends !== st.position && fig.ends !== 'closed') next.position = fig.ends
      steps.push({ fig: fi, figId: fig.id, idx: si, foot, dir, beats, count, weight, startBeat: beat, moves: !!off })
      beat += beats
      states.push(next)
      st = next
    })
  })
  return { states, steps, totalBeats: beat }
}

const ease = (t) => t * t * (3 - 2 * t)

// Pose of the leader + follower at a given beat.
export function poseAt(tl, beat, dance) {
  const { steps, states } = tl
  let i = steps.findIndex((s) => beat < s.startBeat + s.beats)
  if (i < 0) i = steps.length - 1
  const step = steps[i]
  const a = states[i], b = states[i + 1]
  const p = Math.min(1, Math.max(0, (beat - step.startBeat) / step.beats))
  const e = ease(p)
  const lerp = (u, v) => u + (v - u) * e
  const lead = { x: lerp(a.x, b.x), z: lerp(a.z, b.z), yaw: lerp(a.yaw, b.yaw), L: { ...a.L }, R: { ...a.R } }
  const mf = step.foot
  lead[mf] = { x: lerp(a[mf].x, b[mf].x), z: lerp(a[mf].z, b[mf].z), y: step.moves ? Math.sin(p * Math.PI) * 0.07 : 0 }
  const smooth = dance.style === 'smooth'
  lead.rise = smooth ? Math.sin(Math.min(1, beat % 3 / 3) * Math.PI) * 0.05 : 0
  const gap = lerp(COUPLE_GAP[a.position] ?? 0.58, COUPLE_GAP[b.position] ?? 0.58)
  return { lead, follow: partnerOf(lead, gap, b.position), step: i, progress: p }
}

// Follower = point reflection of the leader's feet through the middle of the couple.
export function partnerOf(lead, gap, position = 'closed') {
  const fx = Math.sin(lead.yaw), fz = Math.cos(lead.yaw)
  const rx = Math.cos(lead.yaw), rz = -Math.sin(lead.yaw)
  let side = position === 'promenade' ? 0.3 : position === 'fan' ? -0.8 : 0.16
  const cx = lead.x + fx * gap + rx * side, cz = lead.z + fz * gap + rz * side
  const yaw = lead.yaw + Math.PI + (position === 'promenade' ? -0.9 : position === 'fan' ? -1.2 : 0)
  const ref = (f) => ({ x: cx - (f.x - lead.x), z: cz - (f.z - lead.z), y: f.y || 0 })
  return { x: cx, z: cz, yaw, rise: lead.rise, L: ref(lead.R), R: ref(lead.L) }
}

// Where the player's own foot lands on step i (used for ghost footprints).
export function targetFor(tl, i, role) {
  const step = tl.steps[i]
  const b = tl.states[i + 1]
  if (role === 'leader') return { foot: step.foot, x: b[step.foot].x, z: b[step.foot].z, yaw: b.yaw }
  const lead = { x: b.x, z: b.z, yaw: b.yaw, L: b.L, R: b.R }
  const f = partnerOf(lead, COUPLE_GAP[b.position] ?? 0.58, b.position)
  const foot = OTHER[step.foot]
  return { foot, x: f[foot].x, z: f[foot].z, yaw: f.yaw }
}
