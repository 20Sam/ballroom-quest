// Proportioned 3D dancers: a man (1.80 m, about 7.5 heads) and a lady (1.66 m plus ~5 cm heels).
// Legs and arms are two-bone IK chains: the footwork engine says where the feet go; this file works out
// hip height, knees, ankles, hold, head line, Latin hip action and Standard posture from that.
import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
// A dancer with yaw θ faces (sin θ, 0, cos θ); their RIGHT is (-cos θ, 0, sin θ). In the root group's local
// frame that means: forward = +z, LEFT = +x, RIGHT = -x.

const BUILD = {
  leader: {
    hipH: 0.95, hipW: 0.095, thigh: 0.45, shin: 0.43, ankleH: 0.075, footL: 0.27, heel: 0,
    shoulderH: 1.47, shoulderW: 0.195, upperArm: 0.30, foreArm: 0.27, neckH: 1.53, headY: 1.665, headR: 0.104,
    limbR: { thigh: 0.072, shin: 0.055, upper: 0.047, fore: 0.039 },
    torso: [[0.150, -0.10], [0.158, 0.0], [0.143, 0.14], [0.158, 0.27], [0.183, 0.39], [0.188, 0.47], [0.150, 0.535], [0.060, 0.575]],
    depth: 0.64,
  },
  follower: {
    hipH: 0.92, hipW: 0.10, thigh: 0.42, shin: 0.395, ankleH: 0.105, footL: 0.235, heel: 0.055,
    shoulderH: 1.405, shoulderW: 0.168, upperArm: 0.28, foreArm: 0.245, neckH: 1.455, headY: 1.58, headR: 0.097,
    limbR: { thigh: 0.066, shin: 0.047, upper: 0.038, fore: 0.032 },
    torso: [[0.162, -0.07], [0.170, 0.0], [0.122, 0.17], [0.146, 0.31], [0.150, 0.385], [0.120, 0.455], [0.050, 0.49]],
    depth: 0.66,
  },
}
BUILD.coach = { ...BUILD.leader }

const PALETTE = {
  leader: { suit: 0x14283a, shirt: 0xf6f1e7, tie: 0x0b0b0b, skin: 0xd9a77f, hair: 0x2b1d14, shoe: 0x0e0e0e },
  follower: { dress: 0xe07a5f, trim: 0xf6d7a7, skin: 0xc68a5e, hair: 0x3d2314, shoe: 0xd9b26a },
  coach: { suit: 0x1b7f9c, shirt: 0xffffff, tie: 0x0d3b52, skin: 0x8d5f3f, hair: 0x161616, shoe: 0x222222 },
}

// Hand targets in the root's local frame (x = left, y = up, z = forward), per hold. "s" = shoulder height.
function handTargets(kind, hold, latin, b) {
  const s = b.shoulderH, h = b.hipH
  if (kind === 'coach' || hold === 'none') return null
  const lead = kind === 'leader'
  if (hold === 'open' || hold === 'fan') {
    const joined = { x: lead ? 0.10 : -0.10, y: h + 0.14, z: 0.40 }
    const free = { x: lead ? -0.56 : 0.56, y: s - 0.04, z: 0.04 }
    return lead ? { L: joined, R: free } : { L: free, R: joined }
  }
  const pp = hold === 'promenade' ? 0.06 : 0
  if (latin) {
    return lead
      ? { L: { x: 0.29 + pp, y: s - 0.10, z: 0.30 }, R: { x: -0.10, y: s - 0.24, z: 0.36 } }
      : { L: { x: 0.12, y: s - 0.08, z: 0.33 }, R: { x: -0.29 - pp, y: s - 0.08, z: 0.30 } }
  }
  // Standard / Smooth closed hold: his left hand at about her eye level, his right on her left shoulder blade,
  // her left resting on his right upper arm, elbows held up in a wide frame.
  return lead
    ? { L: { x: 0.36 + pp, y: s + 0.06, z: 0.27 }, R: { x: -0.06, y: s - 0.20, z: 0.37 } }
    : { L: { x: 0.11, y: s - 0.02, z: 0.37 }, R: { x: -0.34 - pp, y: s + 0.13, z: 0.27 } }
}

function mats(kind) {
  const p = PALETTE[kind]
  const m = (c, r = 0.55, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...extra })
  if (kind === 'follower') {
    return { top: m(p.dress, 0.45), legs: m(p.skin, 0.5), arms: m(p.skin, 0.5), skin: m(p.skin, 0.5), hair: m(p.hair, 0.7),
      shoe: m(p.shoe, 0.25, { metalness: 0.4 }), skirt: m(p.dress, 0.5, { side: THREE.DoubleSide }), trim: m(p.trim, 0.4) }
  }
  return { top: m(p.suit, 0.5), legs: m(p.suit, 0.5), arms: m(p.suit, 0.5), skin: m(p.skin, 0.5), hair: m(p.hair, 0.7),
    shoe: m(p.shoe, 0.2, { metalness: 0.3 }), shirt: m(p.shirt, 0.6), tie: m(p.tie, 0.4) }
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3()

// Place a capsule between two world points (the capsule is built along +y with its true length).
function segment(mesh, a, b) {
  tmpA.subVectors(b, a)
  const len = tmpA.length() || 1e-4
  mesh.position.copy(a).addScaledVector(tmpA, 0.5)
  mesh.scale.set(1, len / mesh.userData.len, 1)
  mesh.quaternion.setFromUnitVectors(UP, tmpA.divideScalar(len))
}

// Two-bone IK: root -> mid -> end with fixed lengths; pole is the direction the middle joint bends toward.
function solve2(root, target, a, b, pole, outMid, outEnd) {
  const d = tmpB.subVectors(target, root)
  let dist = d.length()
  const max = a + b - 1e-3, min = Math.abs(a - b) + 1e-3
  const dir = d.clone().divideScalar(dist || 1)
  dist = Math.min(max, Math.max(min, dist))
  outEnd.copy(root).addScaledVector(dir, dist)
  const x = (a * a - b * b + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, a * a - x * x))
  const side = tmpC.copy(pole).addScaledVector(dir, -pole.dot(dir))
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1)
  side.normalize()
  outMid.copy(root).addScaledVector(dir, x).addScaledVector(side, h)
}

export class Dancer {
  constructor(scene, kind) {
    this.kind = kind
    const b = (this.b = BUILD[kind])
    const M = (this.M = mats(kind))
    this.root = new THREE.Group() // at the floor under the body, rotated by yaw
    this.pelvis = new THREE.Group()
    this.torso = new THREE.Group()
    this.headG = new THREE.Group()
    this.root.add(this.pelvis)
    this.pelvis.add(this.torso)
    this.limbs = new THREE.Group() // world-space limbs
    const add = (parent, mesh) => { mesh.castShadow = true; parent.add(mesh); return mesh }

    // torso (lathe, oval cross-section), from just below the hip joint to the neck base
    const prof = b.torso.map(([r, y]) => new THREE.Vector2(r, y))
    const torso = add(this.torso, new THREE.Mesh(new THREE.LatheGeometry(prof, 28), M.top))
    torso.scale.z = b.depth
    if (kind !== 'follower') {
      // shirt front + bow tie (a tailsuit look)
      const v = add(this.torso, new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 3, 1, true), M.shirt))
      v.rotation.x = Math.PI; v.position.set(0, 0.43, b.torso[5][0] * b.depth - 0.005); v.scale.z = 0.2
      const tie = add(this.torso, new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.02), M.tie))
      tie.position.set(0, 0.54, 0.075)
      const pelvisM = add(this.pelvis, new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.legs))
      pelvisM.scale.set(1, 0.75, b.depth); pelvisM.position.y = 0.005
    } else {
      const sash = add(this.torso, new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.012, 8, 28), M.trim))
      sash.rotation.x = Math.PI / 2; sash.scale.y = b.depth; sash.position.y = 0.17
      // flared skirt from the waist to just below the knee so the footwork stays visible
      const skirtProf = [[0.13, 0.17], [0.17, 0.02], [0.24, -0.20], [0.33, -0.40], [0.40, -0.52], [0.405, -0.53]].map(([r, y]) => new THREE.Vector2(r, y))
      this.skirt = add(this.pelvis, new THREE.Mesh(new THREE.LatheGeometry(skirtProf, 36), M.skirt))
      this.skirt.scale.z = 0.85
    }
    // neck + head
    const neck = add(this.torso, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.12, 14), M.skin))
    neck.position.y = b.neckH - b.hipH + 0.03
    this.headG.position.y = b.headY - b.hipH
    this.torso.add(this.headG)
    const head = add(this.headG, new THREE.Mesh(new THREE.SphereGeometry(b.headR, 24, 20), M.skin))
    head.scale.set(0.92, 1.12, 1.0)
    const hair = add(this.headG, new THREE.Mesh(new THREE.SphereGeometry(b.headR * 1.04, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair))
    hair.scale.set(0.95, 1.12, 1.05); hair.position.set(0, 0.012, -0.008)
    if (kind === 'follower') {
      const bun = add(this.headG, new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), M.hair))
      bun.position.set(0, 0.04, -0.1)
    }
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), eyeM)
      eye.position.set(sx * 0.034, 0.012, b.headR * 0.93); this.headG.add(eye)
      const ear = add(this.headG, new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), M.skin))
      ear.position.set(sx * b.headR * 0.9, 0, 0); ear.scale.set(0.5, 1, 0.8)
    }
    const nose = add(this.headG, new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 8), M.skin))
    nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.01, b.headR * 1.05)
    // shoulders (deltoid caps)
    this.shoulders = {}
    for (const f of ['L', 'R']) {
      const sx = f === 'L' ? 1 : -1
      const cap = add(this.torso, new THREE.Mesh(new THREE.SphereGeometry(b.limbR.upper * 1.35, 14, 12), M.arms))
      cap.position.set(sx * b.shoulderW, b.shoulderH - b.hipH, 0)
      this.shoulders[f] = cap
    }

    // limbs: capsules + joint spheres, world space
    const cap = (r, len, m) => { const g = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 14), m); g.userData.len = len; return add(this.limbs, g) }
    this.parts = {}
    for (const f of ['L', 'R']) {
      this.parts[f] = {
        thigh: cap(b.limbR.thigh, b.thigh, M.legs), shin: cap(b.limbR.shin, b.shin, M.legs),
        upper: cap(b.limbR.upper, b.upperArm, M.arms), fore: cap(b.limbR.fore, b.foreArm, M.arms),
        hand: add(this.limbs, new THREE.Mesh(new THREE.SphereGeometry(b.limbR.fore * 1.15, 10, 10), M.skin)),
        shoe: this.makeShoe(M.shoe),
      }
    }
    scene.add(this.root, this.limbs)
    this.v = { hipL: new THREE.Vector3(), hipR: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(),
      sh: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(), tgt: new THREE.Vector3(), pole: new THREE.Vector3() }
    this.pose = { x: 0, z: 0, yaw: 0, rise: 0, L: { x: 0.1, z: 0, y: 0 }, R: { x: -0.1, z: 0, y: 0 } }
    this.skirtVel = 0
    this.lastYaw = null
  }

  makeShoe(m) {
    const b = this.b
    const g = new THREE.Group()
    const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, b.footL - 0.084, 4, 10), m)
    sole.rotation.x = Math.PI / 2; sole.scale.set(1, 1, 0.55); sole.position.set(0, 0.022, b.footL * 0.32)
    sole.castShadow = true
    g.add(sole)
    if (b.heel) {
      const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, b.heel, 8), m)
      heel.position.set(0, b.heel / 2, -0.01); g.add(heel)
    }
    this.limbs.add(g)
    return g
  }

  setGhost(on) {
    if (this._ghost === on) return
    this._ghost = on
    const set = (o) => { if (o.isMesh) { o.material.transparent = on; o.material.opacity = on ? 0.35 : 1; o.material.depthWrite = !on } }
    this.root.traverse(set); this.limbs.traverse(set)
  }

  setVisible(v) { this.root.visible = v; this.limbs.visible = v }

  // p: {x, z, yaw, rise, L:{x,z,y}, R:{x,z,y}, hold?, style?, sway?, turn?}
  apply(p) {
    this.pose = p
    const b = this.b, V = this.v
    const yaw = p.yaw
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw)
    const latin = p.style === 'latin' || p.style === 'rhythm'
    const hold = p.hold || 'none'
    const rise = p.rise || 0
    // weight: how close the body is to each foot (1 = all on the left)
    const dL = Math.hypot(p.x - p.L.x, p.z - p.L.z), dR = Math.hypot(p.x - p.R.x, p.z - p.R.z)
    const wL = dR / (dL + dR + 1e-6)
    const side = (wL - 0.5) * 2 // +1 = over the left foot

    // pelvis: Latin hips settle over the standing leg; Standard stays level with soft knees
    const shift = latin ? side * 0.045 : side * 0.012
    const soft = latin ? 0.0 : 0.008 // Standard: knees soft, not bent
    // the highest the hips can be while both feet reach the floor
    let hipY = b.hipH - soft + rise
    for (const f of ['L', 'R']) {
      const sx = f === 'L' ? 1 : -1
      const hx = p.x + (-rx) * (sx * b.hipW + shift), hz = p.z + (-rz) * (sx * b.hipW + shift)
      const horiz = Math.hypot(p[f].x - hx, p[f].z - hz)
      const reach = b.thigh + b.shin - 0.004
      const ankleY = b.ankleH + (p[f].y || 0) + rise * 0.8
      const maxY = Math.sqrt(Math.max(0, reach * reach - horiz * horiz)) + ankleY
      hipY = Math.min(hipY, maxY)
    }
    this.root.position.set(p.x, 0, p.z)
    this.root.rotation.y = yaw
    this.pelvis.position.set(shift, hipY, 0)
    // Cuban motion: standing (straight) leg's hip lifts and draws back; with the left knee bent (weight right)
    // the pelvis turns clockwise from above. Shoulders stay level: the torso counter-rotates.
    const pY = latin ? side * 0.14 : 0, pZ = latin ? side * 0.10 : 0
    this.pelvis.rotation.set(0, pY, pZ)
    // upper body: posture, sway into turns, Latin counter-balance, Standard lady's line
    const lady = this.kind === 'follower'
    const closedStd = !latin && (hold === 'closed' || hold === 'promenade')
    const lean = closedStd ? (lady ? -0.16 : 0.03) : latin ? 0.02 : 0
    this.torso.rotation.set(lean, latin ? -pY * 0.9 : (p.turn || 0) * 0.12, (latin ? -pZ : 0) + (p.sway || 0))
    // head line
    let hy = 0, hx = 0
    if (closedStd) { hy = lady ? 0.55 : 0.15; hx = lady ? -0.12 : 0 }
    if (hold === 'promenade') hy = lady ? -0.6 : 0.6
    if (hold === 'none' || this.kind === 'coach') { hy = 0; hx = 0 }
    this.headG.rotation.set(hx, hy, 0)

    // skirt flows with turning
    if (this.skirt) {
      let dy = this.lastYaw == null ? 0 : Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw))
      if (Math.abs(dy) > 0.4) dy = 0 // a teleport (new routine, new floor), not a spin
      this.skirtVel = this.skirtVel * 0.85 + dy * 0.15
      const flare = Math.min(0.18, Math.abs(this.skirtVel) * 3)
      this.skirt.rotation.set(0, 0, Math.max(-0.12, Math.min(0.12, -this.skirtVel * 2)))
      this.skirt.scale.set(1 + flare, 1 - flare * 0.4, 0.85 + flare)
    }
    this.lastYaw = yaw
    this.root.updateMatrixWorld(true)

    // legs
    const fwd = new THREE.Vector3(fx, 0, fz)
    for (const f of ['L', 'R']) {
      const sx = f === 'L' ? 1 : -1
      const P = this.parts[f]
      const hip = f === 'L' ? V.hipL : V.hipR
      this.pelvis.localToWorld(hip.set(sx * b.hipW, 0, 0))
      const lift = p[f].y || 0
      const weighted = (f === 'L') === (wL >= 0.5)
      const heelUp = rise * 0.8 + (latin && !weighted && !lift ? 0.02 : 0)
      V.tgt.set(p[f].x, b.ankleH + lift + heelUp, p[f].z)
      // knees bend forward, a little outward (turned-out Latin legs)
      V.pole.copy(fwd).multiplyScalar(1).addScaledVector(new THREE.Vector3(-rx, 0, -rz), sx * (latin ? -0.12 : 0.06)) // Latin: bent knee goes inward
      solve2(hip, V.tgt, b.thigh, b.shin, V.pole, V.knee, V.ankle)
      segment(P.thigh, hip, V.knee)
      segment(P.shin, V.knee, V.ankle)
      // shoe: points along the body (Latin feet slightly turned out); toe down when lifted, heel up on rise
      const turnout = latin ? sx * 0.33 : sx * 0.03 // Latin: ~45-65° total turnout from the ankle; Standard parallel
      P.shoe.position.set(V.ankle.x, Math.max(0, V.ankle.y - b.ankleH), V.ankle.z)
      P.shoe.rotation.set(0, 0, 0)
      P.shoe.rotation.y = yaw + turnout
      const pitch = Math.min(0.9, lift * 5 + heelUp * 4)
      P.shoe.rotateX(pitch)
    }

    // arms
    const T = handTargets(this.kind, hold, latin, b)
    for (const f of ['L', 'R']) {
      const sx = f === 'L' ? 1 : -1
      const P = this.parts[f]
      this.torso.localToWorld(V.sh.set(sx * b.shoulderW, b.shoulderH - b.hipH, 0))
      if (T) {
        this.root.localToWorld(V.tgt.set(T[f].x, T[f].y - (b.hipH - hipY) * 0.5, T[f].z))
        // elbows out to the side and slightly down: the frame
        this.root.localToWorld(V.pole.set(sx * 1.0, -0.35, -0.2)).sub(this.root.localToWorld(tmpA.set(0, 0, 0)))
      } else {
        const swing = this.walkSwing ? this.walkSwing * (f === 'L' ? -1 : 1) : 0
        this.root.localToWorld(V.tgt.set(sx * (b.shoulderW + 0.03), hipY - 0.06, 0.04 + swing))
        this.root.localToWorld(V.pole.set(sx * 0.2, 0, -1)).sub(this.root.localToWorld(tmpA.set(0, 0, 0)))
      }
      solve2(V.sh, V.tgt, b.upperArm, b.foreArm, V.pole, V.elbow, V.wrist)
      segment(P.upper, V.sh, V.elbow)
      segment(P.fore, V.elbow, V.wrist)
      P.hand.position.copy(V.wrist)
    }
  }

  // relaxed walk for exploring the building
  walk(x, z, yaw, phase, moving) {
    const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) }, right = { x: -Math.cos(yaw), z: Math.sin(yaw) }
    const swing = moving ? Math.sin(phase) * 0.24 : 0
    const liftL = moving ? Math.max(0, Math.cos(phase)) * 0.07 : 0
    const liftR = moving ? Math.max(0, -Math.cos(phase)) * 0.07 : 0
    this.walkSwing = -swing * 0.5
    this.apply({
      x, z, yaw, rise: 0, hold: 'none',
      L: { x: x - right.x * 0.1 + fwd.x * swing, z: z - right.z * 0.1 + fwd.z * swing, y: liftL },
      R: { x: x + right.x * 0.1 - fwd.x * swing, z: z + right.z * 0.1 - fwd.z * swing, y: liftR },
    })
  }
}
