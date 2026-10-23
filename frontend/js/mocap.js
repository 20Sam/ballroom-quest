// Replays motion captured from the team's lesson videos as a pair of 3D "ghost instructor" figures.
// Clip format (data/mocap/<id>.game.json): fps, joint_names (17), dancers[{id, role, frames[{root:[x,z], yaw, joints:[[x,y,z]*17]|null, conf}]}].
import * as THREE from 'three'

const J = ['nose', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
  'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index']
const BONES = [
  ['left_shoulder', 'right_shoulder'], ['left_hip', 'right_hip'], ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'], ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'], ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
  ['left_ankle', 'left_heel'], ['left_heel', 'left_foot_index'], ['left_ankle', 'left_foot_index'],
  ['right_ankle', 'right_heel'], ['right_heel', 'right_foot_index'], ['right_ankle', 'right_foot_index'],
]
const UP = new THREE.Vector3(0, 1, 0)

class Figure {
  constructor(scene, color) {
    this.group = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, transparent: true, opacity: 0.85, emissive: color, emissiveIntensity: 0.25 })
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), mat)
    this.joints = J.map(() => new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mat))
    this.bones = BONES.map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), mat))
    this.group.add(this.head, ...this.joints, ...this.bones)
    scene.add(this.group)
  }

  set(points) { // points: Vector3[] in world space, or null
    this.group.visible = !!points
    if (!points) return
    const idx = (n) => J.indexOf(n)
    points.forEach((p, i) => this.joints[i].position.copy(p))
    this.head.position.copy(points[0]).add(new THREE.Vector3(0, 0.04, 0))
    BONES.forEach(([a, b], i) => {
      const pa = points[idx(a)], pb = points[idx(b)]
      const dir = pb.clone().sub(pa)
      const len = dir.length() || 0.001
      const bone = this.bones[i]
      bone.position.copy(pa).addScaledVector(dir, 0.5)
      bone.scale.set(1, len, 1)
      bone.quaternion.setFromUnitVectors(UP, dir.normalize())
    })
  }
}

export class MocapPlayer {
  constructor(scene) {
    this.scene = scene
    this.figs = [new Figure(scene, 0x7a6bd1), new Figure(scene, 0xd9b26a)]
    this.clip = null
    this.hide()
  }

  // damp < 1 shrinks floor travel toward the clip's centre: phone cameras pan and zoom, so travel is rough;
  // spot dances (cha cha, rumba) look better almost in place. Only the couple's shared path (the midpoint of
  // the two partners) is damped; each partner keeps their real offset from it, so the hold distance between
  // them is unchanged and their bodies don't overlap.
  load(clip, anchor, damp = 1) {
    const ds = clip.dancers
    // work from the original roots every time, so loading the same clip object twice can't damp it twice
    const orig = (clip._roots ??= ds.map((d) => d.frames.map((f) => [f.root[0], f.root[1]])))
    let sx = 0, sz = 0, n = 0
    ds.forEach((d, k) => d.frames.forEach((f, t) => { if (f.conf > 0) { sx += orig[k][t][0]; sz += orig[k][t][1]; n++ } }))
    const cx = n ? sx / n : 0, cz = n ? sz / n : 0
    const pair = orig.slice(0, 2).filter((o) => o.length) // the couple that is drawn
    const len = Math.max(0, ...orig.map((o) => o.length))
    for (let t = 0; t < len; t++) {
      // midpoint of the couple at frame t (a shorter dancer holds their last frame)
      let mx = cx, mz = cz
      if (pair.length) {
        mx = 0; mz = 0
        for (const o of pair) { const r = o[Math.min(t, o.length - 1)]; mx += r[0]; mz += r[1] }
        mx /= pair.length; mz /= pair.length
      }
      const nx = (mx - cx) * damp, nz = (mz - cz) * damp
      ds.forEach((d, k) => {
        const f = d.frames[t]
        if (f) f.root = [nx + (orig[k][t][0] - mx), nz + (orig[k][t][1] - mz)]
      })
    }
    this.clip = clip
    this.anchor = anchor // {x, z, yaw}: where the clip's centre sits in the studio
    this.t0 = performance.now() / 1000
    this.figs.forEach((f) => (f.group.visible = true))
  }

  hide() { this.clip = null; this.figs.forEach((f) => (f.group.visible = false)) }

  get playing() { return !!this.clip }

  update(now, speed = 1) {
    const c = this.clip
    if (!c) return
    const n = Math.max(...c.dancers.map((d) => d.frames.length))
    const i = Math.floor(((now - this.t0) * c.fps * speed) % n)
    const { x: ax, z: az, yaw: ayaw } = this.anchor
    const ca = Math.cos(ayaw), sa = Math.sin(ayaw)
    c.dancers.slice(0, 2).forEach((d, k) => {
      const f = d.frames[Math.min(i, d.frames.length - 1)]
      if (!f || !f.joints) return this.figs[k].set(null)
      const [rx, rz] = f.root
      const cy = Math.cos(f.yaw || 0), sy = Math.sin(f.yaw || 0)
      const pts = f.joints.map(([x, y, z]) => {
        // joint relative to dancer (facing +z at yaw 0) -> clip space -> studio space
        const jx = x * cy + z * sy + rx, jz = -x * sy + z * cy + rz
        return new THREE.Vector3(ax + jx * ca + jz * sa, y, az - jx * sa + jz * ca)
      })
      this.figs[k].set(pts)
    })
  }
}
