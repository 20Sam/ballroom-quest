// Ballroom Quest dancers: procedurally modelled, rigged figures styled after a classic ballroom painting.
// The man (1.80 m) wears a black tailsuit: white waistcoat, shirt front and bow tie, satin lapels and trouser
// stripes, patent shoes. The lady (1.66 m + 5.5 cm heels) wears a fitted lace bodice with long sheer sleeves and
// a fluted, feather-trimmed gown for Standard/Smooth, and a short fringed (or ruffled) dress with bare arms for
// Latin/Rhythm/Social; PALETTES[0] is the competition look: a champagne satin gown with a rhinestone bodice,
// bare arms and a full feather hem. Legs and arms are two-bone IK chains: the footwork engine says where the
// feet go; this file works out hips, knees, posture, frame, body contact, head lines, Latin hip action and the
// costume's secondary motion.
// Technique (team curriculum notes): stacked posture, Standard top line and wide frame with light body contact,
// heel leads as the engine sends them, CBM and sway from the figure charts, Latin turnout (~45° between the
// feet), knee-driven Cuban hip action with quiet shoulders, spotting with a whip, weight-forward Latin poise,
// the joined hands' halo over her head in underarm and spot turns, legs reaching through the feet on long stances.
// Outfits (wardrobe.js) swap materials slot by slot (setOutfit); see-through views ghost each body zone (upper,
// lower, shoe) on its own (setGhost), so a leader can look through his own legs and her skirt to his feet.
import * as THREE from 'three'

// Frame (three.js, +y up): a dancer with yaw θ faces (sin θ, 0, cos θ); their RIGHT is (-cos θ, 0, sin θ).
// In the root group's local frame that means: forward = +z, LEFT = +x, RIGHT = -x.
const UP = new THREE.Vector3(0, 1, 0)
const TAU = Math.PI * 2
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const clamp01 = (v) => clamp(v, 0, 1)
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const num = (v, d = 0) => (Number.isFinite(v) ? v : d)
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e
const SIDES = ['L', 'R']
const SX = { L: 1, R: -1 }
const SPOT_LIM = 1.48 // how far the head turns from the chest while spotting (rad, about 85°)

// ---------- proportions (metres, standing tall, shoes on) ----------
// Rows are [height, half-width, half-depth, depth offset] of the body's cross-section at that height.
const BUILD = {
  leader: {
    lady: false,
    hipH: 0.95, hipW: 0.092, thigh: 0.45, shin: 0.43, ankleH: 0.075,
    foot: { len: 0.275, back: 0.05, ball: 0.072, lift: 0.02, width: 0.096 },
    waistY: 1.06, chestY: 1.25, shoulderY: 1.445, shoulderW: 0.178, neckY: 1.52, atlasY: 1.615, headR: 0.097,
    upperArm: 0.3, foreArm: 0.265, hand: [0.185, 0.084, 0.03],
    limb: { thigh: [0.083, 0.06], shin: [0.06, 0.052], upper: [0.052, 0.043], fore: [0.044, 0.036] },
    cap: 0.05, neck: [0.058, 0.05], headUp: 0.055,
    pelvis: [[0.825, 0.03, 0.025, -0.01], [0.85, 0.1, 0.075, -0.012], [0.89, 0.155, 0.106, -0.014], [0.95, 0.17, 0.114, -0.014],
      [1.0, 0.163, 0.11, -0.01], [1.045, 0.148, 0.104, -0.005], [1.075, 0.136, 0.098, 0]],
    torso: [[0.99, 0.152, 0.11, -0.006], [1.03, 0.146, 0.104, -0.001], [1.06, 0.144, 0.102, 0.002], [1.13, 0.15, 0.106, 0.008],
      [1.21, 0.163, 0.114, 0.014], [1.29, 0.177, 0.12, 0.016], [1.36, 0.185, 0.118, 0.01], [1.42, 0.188, 0.106, 0],
      [1.47, 0.178, 0.095, -0.008], [1.49, 0.158, 0.084, -0.01], [1.51, 0.112, 0.07, -0.009], [1.53, 0.064, 0.056, -0.006]],
  },
  follower: {
    lady: true,
    hipH: 0.925, hipW: 0.094, thigh: 0.425, shin: 0.395, ankleH: 0.105,
    foot: { len: 0.235, back: 0.045, ball: 0.06, lift: 0.055, width: 0.08 },
    waistY: 1.04, chestY: 1.2, shoulderY: 1.388, shoulderW: 0.152, neckY: 1.455, atlasY: 1.545, headR: 0.091,
    upperArm: 0.275, foreArm: 0.24, hand: [0.165, 0.07, 0.025],
    limb: { thigh: [0.076, 0.047], shin: [0.048, 0.027], upper: [0.04, 0.031], fore: [0.032, 0.022] },
    cap: 0.038, neck: [0.046, 0.036], headUp: 0.05,
    pelvis: [[0.8, 0.03, 0.025, -0.012], [0.825, 0.1, 0.08, -0.015], [0.875, 0.165, 0.112, -0.02], [0.925, 0.176, 0.118, -0.02],
      [0.975, 0.166, 0.112, -0.012], [1.015, 0.145, 0.102, -0.004], [1.045, 0.117, 0.087, 0]],
    torso: [[0.97, 0.15, 0.108, -0.008], [1.0, 0.132, 0.098, -0.002], [1.04, 0.118, 0.088, 0.004], [1.1, 0.126, 0.092, 0.01],
      [1.16, 0.14, 0.104, 0.02], [1.21, 0.146, 0.108, 0.026], [1.26, 0.147, 0.098, 0.016], [1.32, 0.152, 0.088, 0.004],
      [1.375, 0.158, 0.083, -0.004], [1.41, 0.152, 0.078, -0.008], [1.43, 0.126, 0.068, -0.008], [1.45, 0.082, 0.052, -0.006], [1.468, 0.046, 0.041, -0.004]],
  },
}
BUILD.coach = BUILD.follower // Coach Marisol: the lady's build in practice wear

// ---------- palettes (calm blue-and-sand ballroom; background couples use PALETTES) ----------
// Leader fields beyond the tailsuit's suit/satin/shirt (each falls back to it): trousers, sleeve (jacket or shirt
// sleeves), stripe (trouser stripe), tie, sole (sole edge and heel block: a light leather so the shoe and its
// heel read on dark floors), sheen (satin shirt fabric) and look: 'tails' | 'dinner' | 'practice' | 'latin'
// (which pieces show: tails, lapels, bow tie). Follower fields: cut ('latin' | 'practice' | 'gown' | 'social'
// overrides the style's cut; the wardrobe uses it). The satin is a lighter charcoal than the cloth so the lapels
// and trouser stripes catch the light and show the body's line (he also gets a soft rim light, see addRim).
const DEFAULT = {
  leader: { suit: 0x13161d, satin: 0x2f343c, shirt: 0xf6f2ea, skin: 0xd6a57f, hair: 0x1d1611, shoe: 0x0a0a0c, sole: 0xb89c78 },
  follower: { dress: 0x1f5784, lace: 0x86bde0, trim: 0x0d2338, skin: 0xd09a73, hair: 0x2a1910, shoe: 0xd9bc8c,
    lips: 0xae5a58, jewel: 0xe8cf98, hem: 'fringe' },
  coach: { dress: 0x1b7f9c, lace: null, trim: 0x13566a, skin: 0x8d5f3f, hair: 0x161616, shoe: 0x262321,
    lips: 0x8e4a44, jewel: 0xd9c08a, hem: null },
}
// Alternate costumes for background couples: pass one entry as opts.palette to BOTH partners of a couple.
// Optional follower fields: bodice 'sparkle' (rhinestone bodice over a plain skirt), satin (sheen on plain
// fabric), sleeves false (bare arms and shoulders in the Standard gown), boa (feather-hem fullness, 1 = trim).
// PALETTES[0] and PALETTES[2] dress main.js's two background couples.
export const PALETTES = [
  // the competition gown: champagne satin, a rhinestone bodice, bare arms and a full feather hem, with a
  // crisp white-tie tailsuit (black tails, white waistcoat, shirt and tie)
  { name: 'Champagne', leader: { suit: 0x0c0d10, satin: 0x2a2e35, shirt: 0xfdfcf8, skin: 0xd3a17c, hair: 0x15100c, shoe: 0x060607 },
    follower: { dress: 0xd9c091, lace: null, bodice: 'sparkle', satin: true, sleeves: false, trim: 0xe9d6b2, boa: 2.4, // light, full marabou hem (6.jpg)
      skin: 0xf1cfb2, hair: 0xe4d4b0, shoe: 0xc4955a, lips: 0xb8625d, jewel: 0xf6ead0, hem: 'fringe' } },
  { name: 'Sand dune', leader: { suit: 0x111111, satin: 0x050505, skin: 0xa86f4c, hair: 0x120c08 },
    follower: { dress: 0xcdb48c, lace: 0xf3e7cf, trim: 0x8f7652, skin: 0xa36a47, hair: 0x140d09, shoe: 0xc9a86c, lips: 0x8c4a40, hem: 'fringe' } },
  { name: 'Lagoon', leader: { suit: 0x0e1a2b, satin: 0x07101c, skin: 0xf0c8a6, hair: 0x5a3b22 },
    follower: { dress: 0x2a9d9f, lace: 0x9fe0d8, trim: 0x15585c, skin: 0xf1caa8, hair: 0xc9a467, shoe: 0xe2c79a, lips: 0xc46f6a, hem: 'fringe' } },
  { name: 'Evening plum', leader: { suit: 0x16131a, satin: 0x0a080c, skin: 0xc58e66, hair: 0x241912 },
    follower: { dress: 0x5e2741, lace: 0xb06a8a, trim: 0x2e0f1f, skin: 0xcf9870, hair: 0x22140d, shoe: 0xd2b07a, lips: 0x9a4651, hem: 'ruffle' } },
  { name: 'Coral reef', leader: { suit: 0x141d33, satin: 0x0a0f1c, skin: 0xe2b590, hair: 0x3a2618 },
    follower: { dress: 0xe0785f, lace: 0xf7c3ab, trim: 0xf1dcb8, skin: 0xe6b994, hair: 0x6b3a1f, shoe: 0xdcb878, lips: 0xc0605a, hem: 'ruffle' } },
]

function paletteFor(kind, pal) {
  const base = DEFAULT[kind] || DEFAULT.leader
  if (!pal) return base
  if (pal.leader || pal.follower || pal.coach) return { ...base, ...(pal[kind] || {}) }
  return { ...base, ...pal }
}

// ---------- character: how each style and dance carries the body ----------
// knee = extra knee flex (m), lean = forward poise of the upper body (rad), hips = Latin hip action, tilt = pelvis
const CHAR = {
  std: { knee: 0.013, lean: 0, hips: 0, tilt: 0 },
  lat: { knee: 0, lean: 0.035, hips: 1, tilt: 0.02 },
  soc: { knee: 0.03, lean: 0.05, hips: 0.45, tilt: 0.03 },
}
const DANCE_CHAR = {
  std_tango: { knee: 0.035, compact: true }, tango: { knee: 0.035, compact: true },
  paso: { hips: 0.12, lean: -0.01, proud: true }, samba: { hips: 0.8, knee: 0.012 }, jive: { hips: 0.5, knee: 0.025, lean: 0.05 },
  bolero: { hips: 0.8, knee: 0.01 }, swing: { hips: 0.4, knee: 0.035, lean: 0.06 }, wcs: { hips: 0.6, knee: 0.025, lean: 0 },
  lindy: { hips: 0.25, knee: 0.055, lean: 0.1, tilt: 0.06 }, salsa: { hips: 0.95, knee: 0.012, lean: 0.03 },
}
const SOCIAL = new Set(['swing', 'wcs', 'lindy', 'salsa'])
function categoryOf(style, dance, fallback) {
  if (SOCIAL.has(dance) || style === 'social') return 'soc'
  if (style === 'latin' || style === 'rhythm') return 'lat'
  if (style === 'standard' || style === 'smooth') return 'std'
  return fallback || 'std'
}
// Turnout of each foot from the hip (rad): Latin about 23° per foot (45°+ between them), Social a little.
const turnoutOf = (cat, hold) => (!hold || hold === 'none' ? 0.05 : cat === 'lat' ? 0.4 : cat === 'soc' ? 0.16 : 0.04)
// Where a shoe lies on the floor for a footwork foot point p ({ x, z, yaw }: the middle of the foot), drawn the
// way Dancer.apply places it (turned out by the style around a point near the heel). For the ghost footprints:
// { x, z, yaw, len, width } in metres.
export function shoePrint(kind, foot, p, style, dance, hold) {
  const F = (BUILD[kind] || BUILD.leader).foot, t = turnoutOf(categoryOf(style, dance, 'std'), hold)
  const fy0 = num(p.yaw), fy = fy0 + SX[foot] * t, piv = F.len * 0.3
  return { x: p.x + (Math.sin(fy) - Math.sin(fy0)) * piv, z: p.z + (Math.cos(fy) - Math.cos(fy0)) * piv, yaw: fy, len: F.len, width: F.width }
}

// ---------- geometry helpers ----------
// Smooth (Hermite) interpolation of a cross-section table at height y -> [half-width, half-depth, depth offset].
function profileAt(rows, y) {
  const n = rows.length
  if (y <= rows[0][0]) return rows[0].slice(1)
  if (y >= rows[n - 1][0]) return rows[n - 1].slice(1)
  let k = 0
  while (rows[k + 1][0] < y) k++
  const A = rows[k], B = rows[k + 1], h = B[0] - A[0], t = (y - A[0]) / h
  const t2 = t * t, t3 = t2 * t
  const out = []
  for (let c = 1; c < 4; c++) {
    const m = (i) => { const P = rows[Math.max(0, i - 1)], N = rows[Math.min(n - 1, i + 1)]; return (N[c] - P[c]) / (N[0] - P[0]) }
    out.push((2 * t3 - 3 * t2 + 1) * A[c] + (t3 - 2 * t2 + t) * h * m(k) + (-2 * t3 + 3 * t2) * B[c] + (t3 - t2) * h * m(k + 1))
  }
  return out
}
// Point on a body surface at height y and angle a (0 = front, +π/2 = left), pushed out by off. With a second
// table the outer of the two surfaces is used (e.g. waistcoat over jacket and trousers).
function surf(rows, y, a, off, out, rows2) {
  let [rx, rz, zc] = profileAt(rows, y)
  if (rows2 && y >= rows2[0][0] && y <= rows2[rows2.length - 1][0]) {
    const q = profileAt(rows2, y)
    if (q[0] + q[1] > rx + rz) [rx, rz, zc] = q
  }
  out[0] = (rx + off) * spow(Math.sin(a), 0.92)
  out[1] = y
  out[2] = zc + (rz + off) * spow(Math.cos(a), 0.92)
  return out
}

// Grid surface: columns u (0..1) and rows v (0..1); with u running leftward across the front and v upward the
// faces point outward. at(u, v, out) writes the point; at = null leaves positions for a per-frame update.
function grid(U, V, at, { closed = false, uv = [1, 1], weldNormals = true } = {}) {
  const n = (U + 1) * (V + 1)
  const pos = new Float32Array(n * 3), uvs = new Float32Array(n * 2), p = [0, 0, 0]
  for (let j = 0, k = 0; j <= V; j++) {
    for (let i = 0; i <= U; i++, k++) {
      if (at) { at(i / U, j / V, p); pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2] }
      uvs[k * 2] = (i / U) * uv[0]; uvs[k * 2 + 1] = (j / V) * uv[1]
    }
  }
  const idx = new Uint16Array(U * V * 6)
  let q = 0
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < U; i++) {
      const a = j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1
      idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c
    }
  }
  const g = new THREE.BufferGeometry()
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.userData.U = U; g.userData.V = V; g.userData.closed = closed
  if (at) { if (weldNormals) weld(g); else seamNormals(g) }
  return g
}
// Recompute normals and average them across a closed grid's seam (cheap: used every frame for cloth).
function seamNormals(g) {
  g.computeVertexNormals()
  const { U, V, closed } = g.userData
  if (!closed) return
  const N = g.attributes.normal.array
  for (let j = 0; j <= V; j++) {
    const a = j * (U + 1) * 3, b = a + U * 3
    let x = N[a] + N[b], y = N[a + 1] + N[b + 1], z = N[a + 2] + N[b + 2]
    const l = Math.hypot(x, y, z) || 1
    x /= l; y /= l; z /= l
    N[a] = N[b] = x; N[a + 1] = N[b + 1] = y; N[a + 2] = N[b + 2] = z
  }
}
// Recompute normals and share them between vertices at the same spot (seams and poles shade smoothly).
function weld(g) {
  g.computeVertexNormals()
  const P = g.attributes.position.array, N = g.attributes.normal.array, n = P.length / 3
  const map = new Map()
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(P[i * 3] * 2e4)},${Math.round(P[i * 3 + 1] * 2e4)},${Math.round(P[i * 3 + 2] * 2e4)}`
    let e = map.get(key)
    if (!e) map.set(key, (e = [0, 0, 0, []]))
    e[0] += N[i * 3]; e[1] += N[i * 3 + 1]; e[2] += N[i * 3 + 2]; e[3].push(i)
  }
  for (const e of map.values()) {
    if (e[3].length < 2) continue
    const l = Math.hypot(e[0], e[1], e[2]) || 1
    for (const i of e[3]) { N[i * 3] = e[0] / l; N[i * 3 + 1] = e[1] / l; N[i * 3 + 2] = e[2] / l }
  }
  return g
}
// Merge indexed geometries (position, normal, uv) into one.
function merge(list) {
  let nv = 0, ni = 0
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni)
  let ov = 0, oi = 0
  for (const g of list) {
    const c = g.attributes.position.count
    pos.set(g.attributes.position.array, ov * 3)
    nor.set(g.attributes.normal.array, ov * 3)
    if (g.attributes.uv) uv.set(g.attributes.uv.array, ov * 2)
    if (g.index) { const ia = g.index.array; for (let k = 0; k < ia.length; k++) idx[oi + k] = ia[k] + ov; oi += ia.length }
    else { for (let k = 0; k < c; k++) idx[oi + k] = ov + k; oi += c }
    ov += c
  }
  const g = new THREE.BufferGeometry()
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}
// Skin weights by rest height: bones [pelvis, waist, chest, neck], blended across each cut [height, half-width].
function skin(g, cuts) {
  const P = g.attributes.position, n = P.count
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4)
  for (let k = 0; k < n; k++) {
    const y = P.getY(k)
    let bone = 0
    while (bone < cuts.length && y > cuts[bone][0] + cuts[bone][1]) bone++
    if (bone < cuts.length && y > cuts[bone][0] - cuts[bone][1]) {
      const t = smooth(cuts[bone][0] - cuts[bone][1], cuts[bone][0] + cuts[bone][1], y)
      si[k * 4] = bone; si[k * 4 + 1] = bone + 1; sw[k * 4] = 1 - t; sw[k * 4 + 1] = t
    } else { si[k * 4] = bone; sw[k * 4] = 1 }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  return g
}

// Closed body tube between two heights (each may depend on the angle, e.g. a neckline).
function tube(rows, yLo, yHi, off, U, V, uv, rows2) {
  return grid(U, V, (u, v, o) => {
    const a = (u - 0.5) * TAU
    surf(rows, lerp(yLo(a), yHi(a), v), a, off, o, rows2)
  }, { closed: true, uv })
}
// Open patch on a body surface between heights y0..y1 and angles aLo(y)..aHi(y); yBottom(a) shapes the lower edge.
function patch(rows, y0, y1, aLo, aHi, off, U, V, yBottom, rows2) {
  return grid(U, V, (u, v, o) => {
    let y = lerp(y0, y1, v)
    const a = lerp(aLo(y), aHi(y), u)
    if (v === 0 && yBottom) y = yBottom(a)
    surf(rows, y, a, off, o, rows2)
  })
}
// Tapered limb along +y from end A (-L/2, radius rA) to end B (+L/2, radius rB) with rounded ends and an
// optional muscle bulge at fraction `at` from A (z = -1 puts it at the back, e.g. the calf).
function limbRadius(rA, rB, t, at, amt) { return lerp(rA, rB, t) * (1 + amt * Math.exp(-(((t - at) / 0.22) ** 2))) }
function limbGeo(L, rA, rB, { at = 0.5, amt = 0, z = 0, U = 16, uv = [2, 3] } = {}) {
  const prof = []
  for (let k = 0; k <= 4; k++) { const ph = -Math.PI / 2 + (k / 4) * (Math.PI / 2); prof.push([-L / 2 + rA * Math.sin(ph), rA * Math.cos(ph), 0]) }
  for (let k = 1; k < 10; k++) {
    const t = k / 10, r = limbRadius(rA, rB, t, at, amt), base = lerp(rA, rB, t)
    prof.push([lerp(-L / 2, L / 2, t), r, z * (r - base)])
  }
  for (let k = 0; k <= 4; k++) { const ph = (k / 4) * (Math.PI / 2); prof.push([L / 2 + rB * Math.sin(ph), rB * Math.cos(ph), 0]) }
  const V = prof.length - 1
  const g = grid(U, V, (u, v, o) => {
    const [y, r, zo] = prof[Math.round(v * V)]
    const a = (u - 0.5) * TAU
    o[0] = r * Math.sin(a); o[1] = y; o[2] = r * Math.cos(a) + zo
  }, { closed: true, uv })
  g.userData.len = L
  return g
}
// Satin stripe down the outer seam of a trouser leg (side +1 = the limb's +x, -1 = -x).
function stripeGeo(L, rA, rB, side, at, amt) {
  return grid(2, 12, (u, v, o) => {
    const t = lerp(0.04, 0.97, v), r = limbRadius(rA, rB, t, at, amt) + 0.0025
    const a = side * Math.PI / 2 + (u - 0.5) * 0.24 // a little wider than real braid, so the leg's turn reads
    o[0] = r * Math.sin(a); o[1] = lerp(-L / 2, L / 2, t); o[2] = r * Math.cos(a)
  })
}

// Head: an oval with a narrower jaw and chin, rounder back of the skull (unit sphere point -> head point).
function shapeHead(x, y, z, lady) {
  const low = Math.max(0, -y)
  const jaw = 1 - (lady ? 0.3 : 0.22) * low ** 1.6
  const X = x * (lady ? 0.8 : 0.83) * jaw
  const Y = y * 1.13
  let Z = z * (z < 0 ? 1.07 : 0.98)
  if (z > 0 && y < 0) Z += (lady ? 0.04 : 0.06) * low * z
  if (z < 0 && y < -0.3) Z *= 1 - 0.5 * (low - 0.3)
  return [X, Y, Z]
}
function onHead(x, y, R, lady, out = 0) {
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y))
  const p = shapeHead(x, y, z, lady)
  return new THREE.Vector3(p[0], p[1], p[2]).multiplyScalar(R * (1 + out))
}
function headGeo(R, lady) {
  const g = new THREE.SphereGeometry(1, 32, 24), P = g.attributes.position
  for (let i = 0; i < P.count; i++) {
    const p = shapeHead(P.getX(i), P.getY(i), P.getZ(i), lady)
    P.setXYZ(i, p[0] * R, p[1] * R, p[2] * R)
  }
  return weld(g)
}
// Hair cap following the head: his slicked back with a side part on his left, hers sleek into a chignon.
function hairGeo(R, lady) {
  const cap = grid(40, 12, (u, v, o) => {
    const a = (u - 0.5) * TAU
    const back = (1 - Math.cos(a)) / 2
    const edge = (lady ? 0.385 : 0.405) * Math.PI + (lady ? 0.215 : 0.2) * Math.PI * back ** 1.3
    const th = (1 - v) * edge
    const d = shapeHead(Math.sin(th) * Math.sin(a), Math.cos(th), Math.sin(th) * Math.cos(a), lady)
    let thick = (lady ? 0.035 : 0.036) + (lady ? 0.018 : 0.036) * Math.cos(th) ** 2
    thick *= 0.2 + 0.8 * smooth(0, 0.22, v)
    if (!lady) {
      const part = 0.62
      if (Math.cos(a) > -0.3) thick -= 0.026 * Math.exp(-(((a - part) / 0.07) ** 2)) * smooth(0.06, 0.35, v)
      thick += 0.03 * smooth(part, part - 1.0, a) * Math.max(0, Math.cos(a)) * smooth(0.05, 0.4, v) * (1 - 0.5 * v)
    }
    o[0] = d[0] * R * (1 + thick); o[1] = d[1] * R * (1 + thick); o[2] = d[2] * R * (1 + thick)
  }, { closed: true })
  if (!lady) return cap
  const bp = shapeHead(0, -0.12, -0.99, true)
  const at = new THREE.Vector3(bp[0], bp[1], bp[2]).multiplyScalar(R * 1.13)
  const bun = new THREE.SphereGeometry(R * 0.36, 18, 12)
  bun.scale(1.15, 0.9, 0.82); bun.translate(at.x, at.y, at.z - R * 0.04)
  const twist = new THREE.TorusGeometry(R * 0.31, R * 0.085, 8, 22)
  twist.translate(at.x, at.y, at.z - R * 0.05)
  return merge([cap, bun, twist])
}
// Mitten hand: palm and closed fingers along +y from the wrist, palm facing +z, thumb on the `thumb` (+1/-1) x side.
function handGeo(L, W, T, thumb) {
  const end = (v) => (v < 0.78 ? 1 : Math.sqrt(Math.max(0, 1 - ((v - 0.78) / 0.22) ** 2)))
  const palm = grid(14, 12, (u, v, o) => {
    const c = u * TAU
    const w = (W / 2) * (0.7 + 0.3 * smooth(0, 0.32, v)) * end(v)
    const t = (T / 2) * (1 - 0.3 * smooth(0.45, 1, v)) * Math.max(0.25, end(v))
    o[0] = w * Math.sin(c)
    o[1] = L * v - T * 0.3 * smooth(0.6, 1, v)
    o[2] = t * Math.cos(c) + T * 0.55 * smooth(0.5, 1, v) ** 1.5
  }, { closed: true })
  const th = new THREE.CapsuleGeometry(T * 0.32, L * 0.22, 4, 8)
  th.rotateX(0.5); th.rotateZ(-thumb * 0.55); th.translate(thumb * W * 0.42, L * 0.3, T * 0.25)
  return merge([palm, th])
}
// Shoe around the ankle (origin): his patent oxford with a low block heel; her satin court shoe on a slim heel
// with an ankle strap. +z = toes. Split at the ball of the foot so the toes can stay flat while the heel rises:
// { rear, toe (origin at the sole under the ball), ball: [y, z] of that point }.
function shoeGeo(b) {
  const F = b.foot, lady = b.lady, aH = b.ankleH
  const zH = F.back - F.len / 2, zT = F.back + F.len / 2
  const vBall = (F.back + F.ball - zH) / (zT - zH)
  const soleY = (v) => -aH + F.lift * (1 - smooth(lady ? 0.16 : 0.22, vBall - (lady ? 0.04 : 0.2), v))
  const t0 = lady ? -0.034 : -0.022, t1 = lady ? -0.02 : -0.006
  const topY = (v) => (v < 0.3 ? lerp(t0, t1, smooth(0, 0.3, v)) : lerp(t1, soleY(v) + (lady ? 0.026 : 0.032), smooth(0.3, 1, v)))
  const wid = (v) => F.width * (0.66 + 0.34 * smooth(0.05, vBall, v))
    * (v > vBall ? Math.sqrt(Math.max(0, 1 - ((v - vBall) / (1 - vBall)) ** (lady ? 1.6 : 2))) : 1)
    * (v < 0.07 ? Math.sqrt(Math.max(0, 1 - ((0.07 - v) / 0.07) ** 2)) : 1)
  const shell = (v0, v1, V) => grid(18, V, (u, vv, o) => {
    const v = lerp(v0, v1, vv)
    const c = u * TAU, w = wid(v) / 2, ys = soleY(v), yt = Math.max(ys + 0.012, topY(v))
    const yc = (ys + yt) / 2, hh = (yt - ys) / 2
    o[0] = -w * spow(Math.sin(c), 0.77); o[1] = yc + hh * spow(Math.cos(c), 0.77); o[2] = lerp(zH, zT, v)
  }, { closed: true })
  const zB = F.back + F.ball
  const toe = shell(vBall - 0.035, 1, 9).translate(0, aH, -zB)
  const parts = [shell(0, vBall + 0.02, 16)]
  if (lady) {
    const heel = new THREE.CylinderGeometry(0.013, 0.0065, F.lift + 0.006, 10)
    heel.translate(0, -aH + F.lift / 2, zH + 0.024)
    const strap = new THREE.TorusGeometry(0.034, 0.0042, 6, 20)
    strap.rotateX(Math.PI / 2); strap.translate(0, -0.014, 0.004)
    parts.push(heel, strap)
    return { rear: merge(parts), toe, ball: [-aH, zB] }
  }
  // his heel block and a sole edge (welt) in light leather, split at the ball like the shoe: from behind and
  // above they show where his heel and toe are on a dark floor
  const heel = new THREE.BoxGeometry(0.06, F.lift + 0.004, 0.068)
  heel.translate(0, -aH + F.lift / 2, zH + 0.037)
  const welt = (v0, v1, V) => grid(18, V, (u, vv, o) => {
    const v = lerp(v0, v1, vv), c = u * TAU, w = wid(v) / 2 + 0.0045, ys = soleY(v)
    o[0] = -w * spow(Math.sin(c), 0.6); o[1] = ys + 0.004 + 0.0042 * spow(Math.cos(c), 0.6); o[2] = lerp(zH - 0.003, zT + 0.004, v)
  }, { closed: true })
  return { rear: merge(parts), toe, ball: [-aH, zB], heel: merge([heel, welt(0.06, vBall + 0.02, 12)]), weltToe: welt(vBall - 0.035, 0.985, 8).translate(0, aH, -zB) }
}

// ---------- shared geometry (one set per build) ----------
const GEO = new Map()
function geometries(b) {
  if (GEO.has(b)) return GEO.get(b)
  const G = {}, lady = b.lady, T = b.torso, Pv = b.pelvis
  const cuts = [[b.waistY - 0.03, 0.05], [b.chestY - 0.01, 0.08], [b.neckY - 0.012, 0.025]]
  G.pelvis = tube(Pv, () => Pv[0][0], () => Pv[Pv.length - 1][0], 0, 28, 12, [3, 1]).translate(0, -b.hipH, 0)
  const top = T[T.length - 1][0]
  if (!lady) {
    G.jacket = skin(tube(T, () => T[0][0], () => top, 0, 36, 26, [4, 3]), cuts)
    // white waistcoat + shirt front in the open jacket, pointed below the waist
    const w = (y) => lerp(0.44, 0.17, smooth(1.08, 1.53, y)) - 0.05 * smooth(1.3, 1.42, y)
    G.front = skin(patch(T, 1.035, top + 0.002, (y) => -w(y), (y) => w(y), 0.004, 12, 22,
      (a) => 0.995 + 0.042 * Math.abs(a) / w(1.035), Pv), cuts)
    // satin lapels along the opening's edges
    const lw = (y) => 0.34 * smooth(1.09, 1.26, y) * (1 - 0.45 * smooth(1.4, 1.5, y))
    G.lapels = skin(merge([
      patch(T, 1.09, 1.5, (y) => w(y), (y) => w(y) + lw(y), 0.007, 3, 16),
      patch(T, 1.09, 1.5, (y) => -w(y) - lw(y), (y) => -w(y), 0.007, 3, 16),
    ]), cuts)
    G.collar = new THREE.CylinderGeometry(0.061, 0.066, 0.045, 20, 1, true).translate(0, 0.016, 0.004)
    const wing = (s) => { const g = new THREE.ConeGeometry(0.02, 0.045, 8); g.rotateZ(s * Math.PI / 2); g.translate(-s * 0.025, 0, 0); g.scale(1, 1, 0.4); return g }
    const knot = new THREE.SphereGeometry(0.011, 10, 8).scale(1, 1, 0.7)
    G.bow = merge([wing(1), wing(-1), knot]).translate(0, 0.006, 0.068)
    // tailcoat tails: from the back waist to the back of the knee
    G.tails = [1, -1].map((sx) => {
      const ac = Math.PI - sx * 0.34, yTop = b.waistY + 0.015, yBot = b.hipH - b.thigh + 0.035
      const seat = b.hipH - 0.06, o = [0, 0, 0]
      const pt = (y, a, out) => {
        const hang = Math.max(0, seat - y) * 0.08
        surf(T, Math.max(y, seat), a, 0.012 + hang, out, Pv)
        out[1] = y
        return out
      }
      const piv = pt(yTop, ac, [0, 0, 0])
      const g = grid(6, 16, (u, v, out) => {
        const y = lerp(yBot, yTop, v), hw = lerp(0.17, 0.33, v)
        pt(y, ac + (u - 0.5) * 2 * hw, o)
        out[0] = o[0] - piv[0]; out[1] = o[1] - piv[1] + (v === 0 ? 0.05 * ((u - 0.5) * 2) ** 2 : 0); out[2] = o[2] - piv[2]
      }, { uv: [1, 3] })
      return { geo: g, pivot: new THREE.Vector3(piv[0], piv[1] - b.hipH, piv[2]) }
    })
  } else {
    // neckline: sweetheart in front, low back; the bodice is lace, the yoke above it sheer (or skin)
    const nl = (a) => 1.37 - 0.12 * Math.max(0, Math.cos(a)) ** 3 - 0.17 * Math.max(0, -Math.cos(a)) ** 2
    G.bodice = skin(tube(T, () => T[0][0], nl, 0, 36, 20, [4, 2]), cuts)
    G.yoke = skin(tube(T, nl, () => top, 0, 36, 10, [4, 1]), cuts)
  }
  const [nb, nt] = b.neck, nh = b.atlasY - b.neckY + 0.07
  G.neck = new THREE.CylinderGeometry(nt, nb, nh, 18, 1, true).translate(0, nh / 2 - 0.035, 0)
  // head and face (head-bone space: the head bone sits at the top of the neck)
  const R = b.headR, HO = new THREE.Vector3(0, b.headUp, 0.012)
  const place = (g, v) => g.translate(v.x + HO.x, v.y + HO.y, v.z + HO.z)
  G.head = headGeo(R, lady).translate(HO.x, HO.y, HO.z)
  G.hair = hairGeo(R, lady).translate(HO.x, HO.y, HO.z)
  const eye = (sx) => place(new THREE.SphereGeometry(R * 0.125, 10, 8).scale(1.45, 0.72, 0.5), onHead(sx * 0.35, 0.06, R, lady, -0.03))
  G.eyes = merge([eye(1), eye(-1)])
  const brow = (sx) => place(new THREE.CapsuleGeometry(R * (lady ? 0.026 : 0.034), R * (lady ? 0.26 : 0.28), 3, 6).rotateZ(Math.PI / 2 - sx * 0.14),
    onHead(sx * 0.36, lady ? 0.23 : 0.21, R, lady, 0.005))
  G.brows = merge([brow(1), brow(-1)])
  const ns = lady ? 0.85 : 1
  G.nose = merge([
    place(new THREE.SphereGeometry(R * 0.12 * ns, 10, 8).scale(0.75, 1.7, 1), onHead(0, -0.12, R, lady, -0.02)),
    place(new THREE.SphereGeometry(R * 0.1 * ns, 10, 8).scale(1.1, 0.9, 1), onHead(0, -0.26, R, lady, 0.035)),
  ])
  const earAt = (sx) => { const p = shapeHead(sx * 0.985, -0.06, -0.16, lady); return new THREE.Vector3(p[0] * R + sx * 0.004, p[1] * R, p[2] * R) }
  G.ears = merge([1, -1].map((sx) => place(new THREE.SphereGeometry(R * 0.2, 10, 8).scale(0.32, 1, 0.62).rotateY(sx * 0.3), earAt(sx))))
  if (lady) {
    G.lips = merge([
      place(new THREE.SphereGeometry(R * 0.1, 12, 8).scale(1.5, 0.38, 0.55), onHead(0, -0.44, R, true, -0.012)),
      place(new THREE.SphereGeometry(R * 0.1, 12, 8).scale(1.35, 0.44, 0.55), onHead(0, -0.51, R, true, -0.014)),
    ])
    G.earrings = merge([1, -1].flatMap((sx) => {
      const e = earAt(sx)
      return [place(new THREE.SphereGeometry(R * 0.05, 8, 6), e.clone().add(new THREE.Vector3(sx * 0.004, -R * 0.24, 0.004))),
        place(new THREE.SphereGeometry(R * 0.07, 8, 6).scale(0.8, 1.3, 0.8), e.clone().add(new THREE.Vector3(sx * 0.004, -R * 0.38, 0.004)))]
    }))
  }
  // limbs: trousers and jacket sleeves for him; bare (or sheer-sleeved) for her
  const L = b.limb
  const thighB = lady ? [0.4, 0.1, 0] : [0.4, 0.04, 0], shinB = lady ? [0.28, 0.28, -1] : [0.3, 0, 0]
  G.thigh = limbGeo(b.thigh, L.thigh[0], L.thigh[1], { at: thighB[0], amt: thighB[1], z: thighB[2] })
  G.shin = limbGeo(b.shin, L.shin[0], L.shin[1], { at: shinB[0], amt: shinB[1], z: shinB[2] })
  G.upper = limbGeo(b.upperArm, L.upper[0], L.upper[1], { at: 0.45, amt: lady ? 0.06 : 0.04, U: 14 })
  G.fore = limbGeo(b.foreArm, L.fore[0], L.fore[1], { at: 0.25, amt: lady ? 0.16 : 0.05, U: 14 })
  G.knee = new THREE.SphereGeometry(L.thigh[1] * 1.01, 14, 10)
  G.elbow = new THREE.SphereGeometry(L.upper[1] * 1.01, 12, 8)
  G.cap = new THREE.SphereGeometry(b.cap, 16, 12).scale(1, 0.92, 0.95)
  if (!lady) {
    // in the leg's frame x = the dancer's right: the left leg's outer seam is at -x, the right leg's at +x
    G.stripe = {
      thighL: stripeGeo(b.thigh, L.thigh[0], L.thigh[1], -1, thighB[0], thighB[1]),
      thighR: stripeGeo(b.thigh, L.thigh[0], L.thigh[1], 1, thighB[0], thighB[1]),
      shinL: stripeGeo(b.shin, L.shin[0], L.shin[1], -1, shinB[0], shinB[1]),
      shinR: stripeGeo(b.shin, L.shin[0], L.shin[1], 1, shinB[0], shinB[1]),
    }
    G.cuff = new THREE.CylinderGeometry(L.fore[1] + 0.004, L.fore[1] + 0.006, 0.03, 14, 1, true).translate(0, b.foreArm / 2 - 0.012, 0)
  }
  G.handR = handGeo(...b.hand, 1)
  G.handL = handGeo(...b.hand, -1)
  G.shoe = shoeGeo(b)
  GEO.set(b, G)
  return G
}

// ---------- materials and textures (shared per palette; ghosting swaps in cached see-through copies) ----------
const TEX = new Map(), MATS = new Map(), GHOST = new WeakMap()
const EYE = new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.25 })
const css = (hex) => new THREE.Color(hex).getStyle()
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex()
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 } }
function makeCanvas(S) {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = S
  return c
}
// Lace: a fine tulle net with floral motifs, dots and scrolls, drawn on a wrap-around tile.
function laceTexture(bg, ink, seed = 5) {
  const key = `lace:${bg}:${ink}:${seed}`
  if (TEX.has(key)) return TEX.get(key)
  const c = makeCanvas(256)
  let tex = null
  if (c) {
    const g = c.getContext('2d'), S = 256, rnd = rng(seed)
    g.fillStyle = css(bg); g.fillRect(0, 0, S, S)
    g.strokeStyle = css(ink); g.fillStyle = css(ink)
    g.globalAlpha = 0.22; g.lineWidth = 1
    g.beginPath()
    for (let k = -S; k <= S; k += 8) { g.moveTo(k, 0); g.lineTo(k + S, S); g.moveTo(k + S, 0); g.lineTo(k, S) }
    g.stroke()
    const motifs = Array.from({ length: 7 }, () => ({ x: rnd() * S, y: rnd() * S, r: 11 + rnd() * 13, rot: rnd() * TAU, n: 5 + Math.floor(rnd() * 3) }))
    const dots = Array.from({ length: 70 }, () => [rnd() * S, rnd() * S, 0.8 + rnd() * 1.4])
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        for (const m of motifs) if (Math.abs(m.x + ox - S / 2) < S / 2 + m.r * 1.8 && Math.abs(m.y + oy - S / 2) < S / 2 + m.r * 1.8) flower(g, m.x + ox, m.y + oy, m)
        g.globalAlpha = 0.75
        for (const [x, y, r] of dots) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, TAU); g.fill() }
      }
    }
    tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
  }
  TEX.set(key, tex)
  return tex
}
function flower(g, x, y, m) {
  g.save(); g.translate(x, y); g.rotate(m.rot)
  for (let i = 0; i < m.n; i++) {
    g.rotate(TAU / m.n)
    g.globalAlpha = 0.5; g.beginPath(); g.ellipse(m.r * 0.55, 0, m.r * 0.48, m.r * 0.24, 0, 0, TAU); g.fill()
    g.globalAlpha = 0.95; g.lineWidth = 1.5; g.stroke()
  }
  g.globalAlpha = 1; g.beginPath(); g.arc(0, 0, m.r * 0.16, 0, TAU); g.fill()
  g.lineWidth = 1.2; g.globalAlpha = 0.85
  for (let i = 0; i < 3; i++) { g.rotate(TAU / 3 + 0.4); g.beginPath(); g.arc(m.r * 1.35, 0, m.r * 0.38, 0.4, 4.4); g.stroke() }
  g.restore()
}
// Fringe strands as an alpha mask (8 strands per tile, slightly uneven ends).
function fringeTexture() {
  if (TEX.has('fringe')) return TEX.get('fringe')
  const c = makeCanvas(64)
  let tex = null
  if (c) {
    const g = c.getContext('2d'), rnd = rng(11)
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64)
    g.strokeStyle = '#fff'; g.lineWidth = 3.2; g.lineCap = 'round'
    for (let i = 0; i < 8; i++) { const x = i * 8 + 4; g.beginPath(); g.moveTo(x, 66); g.lineTo(x + (rnd() - 0.5) * 2, 2 + rnd() * 12); g.stroke() }
    tex = new THREE.CanvasTexture(c)
    tex.wrapS = THREE.RepeatWrapping
  }
  TEX.set('fringe', tex)
  return tex
}
// Feather trim as an alpha mask: a dense band along the hem (canvas bottom = the attached edge) breaking into
// soft, uneven wisps toward the tips (canvas top). Tiles across u.
function featherTexture() {
  if (TEX.has('feather')) return TEX.get('feather')
  const S = 128, c = makeCanvas(S)
  let tex = null
  if (c) {
    const g = c.getContext('2d'), rnd = rng(23)
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S)
    g.fillStyle = '#fff'; g.fillRect(0, S * 0.5, S, S * 0.5)
    g.strokeStyle = '#fff'; g.lineCap = 'round'
    for (let i = 0; i < 150; i++) {
      // one barb: from inside the band up toward the tips, curling a little sideways
      const x0 = rnd() * S, y0 = S * (0.5 + rnd() * 0.2), len = S * (0.22 + rnd() * 0.32), lean = (rnd() - 0.5) * 0.9
      g.globalAlpha = 0.7 + rnd() * 0.3; g.lineWidth = 1.2 + rnd() * 2.6
      for (const ox of [-S, 0, S]) {
        g.beginPath(); g.moveTo(x0 + ox, y0)
        for (let k = 1; k <= 4; k++) { const t = k / 4; g.lineTo(x0 + ox + lean * len * t * t, y0 - len * t) }
        g.stroke()
      }
    }
    g.globalAlpha = 1
    for (let i = 0; i < 40; i++) { const x = rnd() * S, r = 2 + rnd() * 5; for (const ox of [-S, 0, S]) { g.beginPath(); g.arc(x + ox, S * 0.5, r, 0, TAU); g.fill() } }
    tex = new THREE.CanvasTexture(c)
    tex.wrapS = THREE.RepeatWrapping
  }
  TEX.set('feather', tex)
  return tex
}
// Rhinestone bodice: satin in the dress colour scattered with crystals (most in the jewel colour, some
// catching the light white), denser toward the top of the tile.
function sparkleTexture(base, gem) {
  const key = `sparkle:${base}:${gem}`
  if (TEX.has(key)) return TEX.get(key)
  const S = 256, c = makeCanvas(S)
  let tex = null
  if (c) {
    const g = c.getContext('2d'), rnd = rng(31)
    g.fillStyle = css(base); g.fillRect(0, 0, S, S)
    g.fillStyle = css(mix(base, 0x000000, 0.12)); g.globalAlpha = 0.5
    for (let i = 0; i < 26; i++) { const x = rnd() * S, y = rnd() * S; g.beginPath(); g.ellipse(x, y, 10 + rnd() * 18, 4 + rnd() * 6, rnd() * Math.PI, 0, TAU); g.fill() }
    for (let i = 0; i < 1100; i++) {
      const x = rnd() * S, y = S * Math.pow(rnd(), 1.4), r = 0.8 + rnd() * 1.7
      g.globalAlpha = 0.45 + rnd() * 0.55
      g.fillStyle = rnd() < 0.22 ? '#ffffff' : css(gem)
      for (const ox of [-S, 0, S]) { g.beginPath(); g.arc(x + ox, y, r, 0, TAU); g.fill() }
    }
    g.globalAlpha = 1
    tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
  }
  TEX.set(key, tex)
  return tex
}
function materials(kind, b, pal) {
  const key = `${kind}|${JSON.stringify(pal)}`
  if (MATS.has(key)) return MATS.get(key)
  const std = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra })
  let M
  if (!b.lady) {
    // his cloth gets a soft rim light (addRim) so his silhouette, legs and joints read on black marble and wood
    const cloth = (c) => (pal.sheen ? std(c, 0.32, { metalness: 0.08 }) : std(c, 0.55))
    const satin = (c) => std(c, 0.22, { metalness: 0.15 })
    M = { jacket: addRim(cloth(pal.suit)), trousers: addRim(std(pal.trousers ?? pal.suit, 0.55)), sleeve: addRim(cloth(pal.sleeve ?? pal.suit)),
      satin: satin(pal.satin), stripe: satin(pal.stripe ?? pal.satin), shirt: std(pal.shirt, 0.6), tie: std(pal.tie ?? pal.shirt, 0.45),
      skin: std(pal.skin, 0.55), hair: std(pal.hair, 0.32), shoe: std(pal.shoe, 0.1, { metalness: 0.25 }), sole: std(pal.sole ?? 0xb89c78, 0.6), eye: EYE }
    M.tails = addRim(M.jacket.clone()); M.tails.side = THREE.DoubleSide
  } else {
    const lace = pal.lace != null ? laceTexture(mix(pal.dress, 0x000000, 0.3), pal.lace) : null
    const sheer = pal.lace != null ? laceTexture(mix(pal.skin, pal.dress, 0.5), mix(pal.dress, 0x000000, 0.15), 9) : null
    const sparkle = pal.bodice === 'sparkle' ? sparkleTexture(pal.dress, pal.jewel ?? 0xf3e6c4) : null
    // plain fabric is crepe, or satin with a soft sheen (gold catches the room's light)
    const plain = (side) => (pal.satin ? std(pal.dress, 0.34, { side, metalness: 0.12 }) : std(pal.dress, 0.5, { side }))
    const fabric = (map, side) => (map ? std(0xffffff, 0.62, { map, side }) : plain(side))
    M = {
      dress: sparkle ? std(0xffffff, 0.3, { map: sparkle, metalness: 0.2 }) : fabric(lace, THREE.FrontSide),
      skirt: fabric(lace, THREE.DoubleSide),
      sleeve: sheer ? std(0xffffff, 0.6, { map: sheer }) : std(pal.dress, 0.55),
      trim: std(pal.trim, 0.9, { side: THREE.DoubleSide }),
      feather: std(pal.trim, 0.95, { side: THREE.DoubleSide, alphaMap: featherTexture(), alphaTest: 0.4 }),
      fringe: std(pal.trim, 0.45, { side: THREE.DoubleSide, alphaMap: fringeTexture(), alphaTest: 0.5 }),
      skin: std(pal.skin, 0.55), legs: std(mix(pal.skin, 0xd9b48f, 0.25), 0.42), hair: std(pal.hair, 0.32),
      shoe: std(pal.shoe, 0.3, { metalness: 0.35 }), lips: std(pal.lips, 0.4), jewel: std(pal.jewel, 0.25, { metalness: 0.8 }), eye: EYE,
    }
  }
  MATS.set(key, M)
  return M
}
// See-through copy of a material at an opacity (cached per material and opacity).
// A shoe material lit in its foot's print colour (left blue, right gold: footprints.js), cached per material.
const SHOE_GLOW = { L: 0x1e90e6, R: 0xffc21a }
const GLOW = new WeakMap()
function glowOf(mat, foot) {
  let byFoot = GLOW.get(mat)
  if (!byFoot) GLOW.set(mat, (byFoot = {}))
  if (!byFoot[foot]) {
    const g = mat.clone()
    if (g.emissive) { g.emissive.setHex(SHOE_GLOW[foot]); g.emissiveIntensity = 0.45 }
    if (mat.userData.rim) addRim(g)
    byFoot[foot] = g
  }
  return byFoot[foot]
}
function ghostOf(mat, opacity = 0.35) {
  let byOp = GHOST.get(mat)
  if (!byOp) GHOST.set(mat, (byOp = new Map()))
  let g = byOp.get(opacity)
  if (!g) {
    g = mat.clone(); g.transparent = true; g.opacity = opacity; g.depthWrite = false
    if (mat.userData.rim) addRim(g) // clone() does not carry onBeforeCompile
    byOp.set(opacity, g)
  }
  return g
}
// Rim light: a soft cool edge where the surface turns away from the camera (fresnel), added as emission. Dark
// cloth keeps its colour face-on but its outline, folds and the line of each limb catch the light.
const RIM = { color: new THREE.Color(0xbfe0ee), strength: 0.42, power: 2.6 }
function addRim(mat) {
  mat.userData.rim = true
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: RIM.color.clone().multiplyScalar(RIM.strength) }
    sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float rimF = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        totalEmissiveRadiance += rimColor * pow(rimF, ${RIM.power.toFixed(2)}); }`)
  }
  mat.customProgramCacheKey = () => 'bq-rim'
  return mat
}
// Which slot of a material set a material fills (so an outfit change can swap in the new set's material).
function slotOf(M, mat) { for (const k in M) if (M[k] === mat) return k; return null }
const GHOST_ALL = { upper: 0.35, lower: 0.35, shoe: 0.35 }

// ---------- small solvers ----------
const _d = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4()
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3()
const C1 = new THREE.Vector3(), C2 = new THREE.Vector3(), C3 = new THREE.Vector3()
const C4 = new THREE.Vector3(), C5 = new THREE.Vector3(), C6 = new THREE.Vector3()

// Two-bone IK: root -> mid -> end with fixed lengths; pole is the direction the middle joint bends toward.
function solve2(root, target, a, b, pole, outMid, outEnd) {
  _d.subVectors(target, root)
  let dist = _d.length()
  if (dist < 1e-6) { _d.set(0, -1, 0); dist = 1e-6 } else _d.divideScalar(dist)
  dist = clamp(dist, Math.abs(a - b) + 1e-3, a + b - 1e-4)
  outEnd.copy(root).addScaledVector(_d, dist)
  const x = (a * a - b * b + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, a * a - x * x))
  _s.copy(pole).addScaledVector(_d, -pole.dot(_d))
  if (_s.lengthSq() < 1e-8) _s.set(0, 0, 1).addScaledVector(_d, -_d.z)
  if (_s.lengthSq() < 1e-8) _s.set(1, 0, 0)
  _s.normalize()
  outMid.copy(root).addScaledVector(_d, x).addScaledVector(_s, h)
}
// Place a limb between two world points (the geometry runs along +y with its rest length in userData.len).
function segment(mesh, a, b) {
  _y.subVectors(b, a)
  const len = _y.length() || 1e-4
  mesh.position.copy(a).addScaledVector(_y, 0.5)
  mesh.scale.set(1, len / mesh.userData.len, 1)
  mesh.quaternion.setFromUnitVectors(UP, _y.divideScalar(len))
}
// Same, with the limb's local z turned toward ref (legs: calves and stripes stay where they belong).
function segmentTwist(mesh, a, b, ref) {
  _y.subVectors(b, a)
  const len = _y.length() || 1e-4
  mesh.position.copy(a).addScaledVector(_y, 0.5)
  mesh.scale.set(1, len / mesh.userData.len, 1)
  _y.divideScalar(len)
  orient(mesh.quaternion, _y, ref)
}
// Quaternion for a basis with y = dir and z as close to ref as possible.
function orient(q, dir, ref) {
  _z.copy(ref).addScaledVector(dir, -ref.dot(dir))
  if (_z.lengthSq() < 1e-6) _z.set(0, 1, 0).addScaledVector(dir, -dir.y)
  if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0).addScaledVector(dir, -dir.x)
  _z.normalize()
  _x.crossVectors(dir, _z)
  _y.copy(dir)
  return q.setFromRotationMatrix(_m.makeBasis(_x, _y, _z))
}
// The highest point within reach r1 of a and r2 of b (two shoulders), written to out; unchanged when the two
// reaches do not meet.
function archTop(a, b, r1, r2, out) {
  _d.subVectors(b, a)
  const d = _d.length()
  if (d < 1e-4 || d > r1 + r2 || d < Math.abs(r1 - r2)) return out
  _d.divideScalar(d)
  const x = (d * d + r1 * r1 - r2 * r2) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - x * x))
  _s.copy(UP).addScaledVector(_d, -_d.y)
  if (_s.lengthSq() < 1e-8) return out
  _s.normalize()
  return out.copy(a).addScaledVector(_d, x).addScaledVector(_s, h)
}
// Where the pelvis may go (plan view, metres from where the posture puts it): inside every disc of FIT.d (one per
// leg: the hip joint within that leg's reach of its ankle, plus the travel cap) and on the near side of the line
// FIT.h (ux*x + uz*z <= m: no closer to a partner than the room between them). nearestFit() writes the point
// nearest the posture's own (the origin) to FIT.x/z and says whether any point fits. The nearest point lies on
// at most two of the boundaries, so the origin, each boundary's nearest point and the boundaries' crossings are
// the only candidates.
const FIT = { d: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], h: [0, 0, Infinity], x: 0, z: 0, q: Infinity }
function fitAt(x, z) {
  for (const [cx, cz, r] of FIT.d) if ((x - cx) ** 2 + (z - cz) ** 2 > (r + 1e-5) ** 2) return
  const [ux, uz, m] = FIT.h
  if (x * ux + z * uz > m + 1e-5) return
  const q = x * x + z * z
  if (q < FIT.q) { FIT.q = q; FIT.x = x; FIT.z = z }
}
function fitCircleLine(cx, cz, r) {
  const [ux, uz, m] = FIT.h, px = ux * m - cx, pz = uz * m - cz // the line: (ux m, uz m) + s (-uz, ux)
  const bq = -px * uz + pz * ux, cq = px * px + pz * pz - r * r, disc = bq * bq - cq
  if (disc < 0) return
  const sq = Math.sqrt(disc)
  for (const s of [-bq - sq, -bq + sq]) fitAt(ux * m - s * uz, uz * m + s * ux)
}
function nearestFit() {
  FIT.q = Infinity
  fitAt(0, 0)
  if (FIT.q === 0) return true
  const D = FIT.d, line = Number.isFinite(FIT.h[2])
  if (line) { fitAt(FIT.h[0] * FIT.h[2], FIT.h[1] * FIT.h[2]); for (const [cx, cz, r] of D) fitCircleLine(cx, cz, r) }
  for (let i = 0; i < D.length; i++) {
    const [cx, cz, r] = D[i], l = Math.hypot(cx, cz)
    if (l > 1e-9) fitAt(cx * (1 - r / l), cz * (1 - r / l))
    for (let j = i + 1; j < D.length; j++) {
      const [ex, ez, s] = D[j], dx = ex - cx, dz = ez - cz, d = Math.hypot(dx, dz)
      if (d < 1e-9 || d > r + s || d < Math.abs(r - s)) continue
      const a = (d * d + r * r - s * s) / (2 * d), h = Math.sqrt(Math.max(0, r * r - a * a))
      const mx = cx + (dx * a) / d, mz = cz + (dz * a) / d
      fitAt(mx - (dz * h) / d, mz + (dx * h) / d); fitAt(mx + (dz * h) / d, mz - (dx * h) / d)
    }
  }
  return FIT.q < Infinity
}
// Damped spring (semi-implicit Euler, sub-stepped): s = { x, v }.
const spr = () => ({ x: 0, v: 0 })
function springTo(s, target, dt, w, z) {
  let t = dt
  while (t > 1e-6) {
    const h = Math.min(t, 1 / 60)
    s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h
    s.x += s.v * h
    t -= h
  }
  return s.x
}

// Horizontal clearance between two dancers (m, negative = overlapping) for body contact: cross-sections at the
// hips, waist and chest (ellipses from the build's profile tables, in each bone's frame; a skirt adds its fullness
// at the hips) and the heads, compared along the line between section centres.
const SECTIONS = [['bP', 'hipH', 'pelvis', 0], ['bW', 'waistY', 'torso', 0.07], ['bC', 'chestY', 'torso', 0.05]]
const SEC = [0, 1, 2].map(() => ({ c: new THREE.Vector3(), rx: 0, rz: 0, lx: 0, lz: 0, fx: 0, fz: 0 }))
const SEC2 = [0, 1, 2].map(() => ({ c: new THREE.Vector3(), rx: 0, rz: 0, lx: 0, lz: 0, fx: 0, fz: 0 }))
const HEAD1 = { c: new THREE.Vector3(), rx: 0, rz: 0, lx: 0, lz: 0, fx: 0, fz: 0 }, HEAD2 = { ...HEAD1, c: new THREE.Vector3() }
function frameOf(o, s) {
  const e = o.matrixWorld.elements, ll = Math.hypot(e[0], e[2]) || 1, fl = Math.hypot(e[8], e[10]) || 1
  s.lx = e[0] / ll; s.lz = e[2] / ll; s.fx = e[8] / fl; s.fz = e[10] / fl
  return s
}
function sections(d, out, head) {
  const b = d.b
  SECTIONS.forEach(([bone, restKey, rowsKey, dy], i) => {
    const s = out[i], y = b[restKey] + dy, [rx, rz, zc] = profileAt(b[rowsKey], y)
    const skirt = i === 0 && d.skirt && d.skirt.cut ? 0.03 : 0
    s.rx = rx + skirt; s.rz = rz + skirt
    d[bone].localToWorld(s.c.set(0, dy, zc))
    frameOf(d[bone], s)
  })
  const R = b.headR
  head.rx = R * 0.83 + 0.008; head.rz = R * 1.03 + 0.01
  d.bH.localToWorld(head.c.set(0, b.headUp, 0.012))
  frameOf(d.bH, head)
}
function extent(s, ux, uz) {
  const ul = ux * s.lx + uz * s.lz, uf = ux * s.fx + uz * s.fz
  return 1 / Math.sqrt((ul / s.rx) ** 2 + (uf / s.rz) ** 2)
}
function gapOf(A, B) {
  const ux = B.c.x - A.c.x, uz = B.c.z - A.c.z, d = Math.hypot(ux, uz)
  if (d < 1e-5) return -0.3
  return d - extent(A, ux / d, uz / d) - extent(B, -ux / d, -uz / d)
}
function clearance(a, b) {
  sections(a, SEC, HEAD1); sections(b, SEC2, HEAD2)
  let body = 9
  for (let i = 0; i < 3; i++) body = Math.min(body, gapOf(SEC[i], SEC2[i])) // the builds' sections sit at matching heights
  return { body, head: gapOf(HEAD1, HEAD2) }
}

// ---------- arm plan per hold (chest frame: x = left, y = world height at rest, z = forward) ----------
// t = hand target, pole = elbow direction, palm = palm normal, finger = finger direction hint.
const HOLDS = new Set(['closed', 'promenade', 'open', 'fan', 'finish', 'none'])
function armPlan(kind, cat, hold, b, ch, swing) {
  const s = b.shoulderY, h = b.hipH, lead = kind === 'leader'
  const X = (f) => SX[f]
  const hang = (f) => ({ t: [X(f) * (b.shoulderW + (b.lady ? 0.085 : 0.03)), h - (b.lady ? 0 : 0.02), (b.lady ? 0.05 : 0.03) - X(f) * swing], pole: [X(f) * 0.2, 0, -1], palm: [-X(f), 0, 0.2], finger: [0, -1, 0.15] })
  if (kind === 'coach' || hold === 'none' || !hold) return { L: hang('L'), R: hang('R') }
  if (!HOLDS.has(hold)) hold = 'open'
  // a styled free arm: soft rounded elbow, hand continuing the line, palm down and slightly forward
  const styled = (f, y = s - 0.05, out = 0.6, fwd = 0.1) => ({ t: [X(f) * out, y, fwd], pole: [X(f) * 0.3, -0.7, -1], palm: [0, -0.75, 0.65], finger: [X(f) * 0.8, 0.2, 0.25], free: true })
  const relaxed = (f) => ({ t: [X(f) * 0.2, h + 0.16, 0.17], pole: [X(f) * 0.4, -1, -0.5], palm: [-X(f) * 0.6, 0.1, 0.5], finger: [0, -0.1, 1] })
  // one-hand connection: elbow low and in front of the hip, forearm level at the waist, his palm up under hers
  const joined = (f, y = h + 0.1) => ({ t: [X(f) * 0.12, y, 0.4], pole: [X(f) * 0.35, -1, -0.25], palm: lead ? [0, 1, 0.1] : [0, -1, 0.1], finger: [0, 0, 1] })
  if (hold === 'finish' && cat !== 'std') {
    const up = cat === 'lat'
      ? (f) => ({ t: [X(f) * 0.6, s + 0.2, 0.12], pole: [X(f) * 0.25, -0.9, -1], palm: [0, -0.3, 1], finger: [X(f) * 0.7, 0.7, 0.2] })
      : (f) => styled(f, s - 0.03, 0.62, 0.08)
    return lead ? { L: joined('L', h + 0.18), R: up('R') } : { L: up('L'), R: joined('R', h + 0.18) }
  }
  if (hold === 'open' || hold === 'fan') {
    const free = cat === 'soc' ? relaxed : cat === 'std' ? (f) => styled(f, s - 0.02, 0.55, 0.08) : styled
    let F = free(lead ? 'R' : 'L')
    if (hold === 'fan' && !lead && cat !== 'soc') F = { ...F, t: [0.56, s - 0.04, -0.1] } // her free arm out and back
    return lead ? { L: joined('L'), R: F } : { L: F, R: joined('R') }
  }
  // closed, promenade and the Standard finish: the frame
  const pp = hold === 'promenade' ? 0.05 : 0
  if (cat === 'std') {
    // joined hands about his chin height, out to his left; his right hand on her left shoulder blade; her left
    // hand on his upper arm; elbows up and wide
    const c = ch.compact ? 1 : 0
    return lead
      ? { L: { t: [0.5 + pp - 0.07 * c, s + 0.01 - 0.07 * c, 0.2], pole: [1, -0.45, -0.25], palm: [-0.25, 0.1, 1], finger: [0.25, 0.75, 0.6] },
        R: { t: [-0.05, s - 0.17, 0.34], pole: [-1, -0.3, -0.2], palm: [0.35, 0, -1], finger: [1, -0.15, 0.2] } }
      : { L: { t: [0.12, s - 0.02, 0.32], pole: [1, -0.2, -0.3], palm: [0, -1, 0.15], finger: [0.2, -0.3, 1] },
        R: { t: [-0.58 - pp + 0.07 * c, s + 0.08 - 0.07 * c, 0.2], pole: [-1, -0.45, -0.25], palm: [0.25, 0.1, 1], finger: [-0.25, 0.75, 0.6] } }
  }
  // Latin closed facing (and the lower, more relaxed social hold)
  const lo = cat === 'soc' ? 1 : 0
  return lead
    ? { L: { t: [0.3 + pp, s - 0.09 - 0.15 * lo, 0.27], pole: [1, -0.6 - 0.4 * lo, -0.15], palm: [-0.3, 0.1 * lo, 1], finger: [0, 1, 0.1 + 0.2 * lo] },
      R: { t: [-0.08, s - 0.24 - 0.09 * lo, 0.32], pole: [-1, -0.5 - 0.5 * lo, -0.1], palm: [0.4, 0, -1], finger: [1, -0.1, 0.2] } }
    : { L: { t: [0.12, s - 0.07 + 0.03 * lo, 0.3], pole: [1, -0.5, -0.2], palm: [0, -1, 0.15], finger: [0.2, -0.3, 1] },
      R: { t: [-0.3 - pp, s - 0.05 - 0.11 * lo, 0.27], pole: [-1, -0.6 - 0.4 * lo, -0.15], palm: [0.3, 0.1 * lo, 1], finger: [0, 1, 0.1 + 0.2 * lo] } }
}

// ---------- the lady's skirt: cloth rebuilt every frame (flare, swirl, trailing hem, legs pressing through) ----------
const CUTS = {
  gown: { len: 0.84, hip: 0.19, hem: 0.44, flute: 0.055, folds: 9, scallop: 1, band: 'feather', keep: 1, zc: -0.008, uv: [7, 3.4] },
  latin: { len: 0.37, hip: 0.192, hem: 0.27, flute: 0.075, folds: 7, scallop: 0.6, band: 'fringe', keep: 0.9, zc: 0, uv: [6, 1.5] },
  social: { len: 0.47, hip: 0.19, hem: 0.35, flute: 0.06, folds: 8, scallop: 0.8, band: 'ruffle', keep: 0.95, zc: 0, uv: [6, 2] },
  practice: { len: 0.62, hip: 0.188, hem: 0.31, flute: 0.035, folds: 6, scallop: 0.4, band: null, keep: 1, zc: 0, uv: [6, 2.5] },
}
class Skirt {
  constructor(d) {
    this.d = d
    this.NS = 64; this.NR = 14
    this.top = d.b.waistY - d.b.hipH + 0.006
    this.r0 = 0.124
    this.geo = grid(this.NS, this.NR, null, { closed: true })
    this.mesh = d.mesh(this.geo, d.M.skirt, d.bP)
    this.bandGeo = grid(this.NS, 2, null, { closed: true, uv: [16, 1] })
    this.band = d.mesh(this.bandGeo, d.M.trim, d.bP)
    // a full feather hem (palette boa > 1.2) gets a second, outer layer of plumes, offset half a tile (built for
    // every skirt, shown only then: the wardrobe can put any dancer in the feather gown)
    this.band2Geo = grid(this.NS, 2, null, { closed: true, uv: [16, 1] })
    const uv2 = this.band2Geo.attributes.uv.array
    for (let k = 0; k < uv2.length; k += 2) uv2[k] += 0.5
    this.band2 = d.mesh(this.band2Geo, d.M.feather || d.M.trim, d.bP)
    for (const m of [this.mesh, this.band, this.band2].filter(Boolean)) { m.frustumCulled = false; m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.4, 0), 1.6) }
    this.push = new Float32Array(this.NS + 1); this.tmp = new Float32Array(this.NS + 1); this.carry = new Float32Array(this.NS + 1)
    this.Rb = new Float32Array(this.NS + 1)
    this.D = { x: spr(), z: spr() }; this.E = { x: spr(), z: spr() }
    this.F = spr(); this.W = spr(); this.roll = spr(); this.yaw = spr()
    this.hem = { cx: 0, cz: 0 }
    this.legPts = [{ x: 0, z: 0, r: 0 }, { x: 0, z: 0, r: 0 }]
    this.setCut('gown')
  }

  setCut(name, hem) {
    const cut = { ...(CUTS[name] || CUTS.gown) }
    if (name === 'latin' && (hem === 'ruffle' || hem === 'fringe')) cut.band = hem
    cut.boa = cut.band === 'feather' ? clamp(num(this.d.pal.boa, 1), 0.6, 2.2) : 1 // feather-hem fullness
    this.cut = cut
    const uv = this.geo.attributes.uv.array, { NS, NR } = this
    for (let j = 0, k = 0; j <= NR; j++) for (let i = 0; i <= NS; i++, k++) { uv[k * 2] = (i / NS) * cut.uv[0]; uv[k * 2 + 1] = (j / NR) * cut.uv[1] }
    this.geo.attributes.uv.needsUpdate = true
    this.band.visible = !!cut.band
    if (this.band2) this.band2.visible = cut.band === 'feather' && num(this.d.pal.boa, 1) > 1.2
    const M = this.d.M
    this.d.setMat(this.band, cut.band === 'fringe' ? M.fringe : cut.band === 'feather' && M.feather ? M.feather : M.trim)
    this.snap = true
  }

  // Where a leg crosses height y in the pelvis frame (thigh hip->knee, shin knee->ankle), with its radius.
  legAt(L, y, out) {
    const { H, K, A } = L, b = this.d.b.limb
    if (y > H.y + 0.02) return false
    if (y >= K.y) {
      const t = H.y - K.y > 0.02 ? clamp01((H.y - y) / (H.y - K.y)) : 1
      out.x = lerp(H.x, K.x, t); out.z = lerp(H.z, K.z, t); out.r = lerp(b.thigh[0], b.thigh[1], t)
      return true
    }
    if (y >= A.y) {
      const t = K.y - A.y > 0.02 ? clamp01((K.y - y) / (K.y - A.y)) : 1
      out.x = lerp(K.x, A.x, t); out.z = lerp(K.z, A.z, t); out.r = lerp(b.shin[0] * 1.3, b.shin[1], t) // calf included
      return true
    }
    return false
  }

  // c: { snap, vx, vz (pelvis-frame velocity, m/s), spin (rad/s), roll, hipYaw (pelvis rotation), floorY, legs }
  update(dt, c) {
    const cut = this.cut, { NS, NR } = this
    // the cloth lags the body: trailing hem, flare and swirl in turns, a swish after each hip action
    const tDx = clamp(-c.vx * 0.1, -0.15, 0.15), tDz = clamp(-c.vz * 0.1, -0.15, 0.15)
    const tF = clamp(Math.abs(c.spin) * (cut.band === 'fringe' ? 0.085 : 0.07), 0, 0.5)
    const tW = clamp(-c.spin * 0.11, -0.7, 0.7)
    if (c.snap || this.snap) {
      for (const [s, v] of [[this.D.x, tDx], [this.D.z, tDz], [this.E.x, tDx], [this.E.z, tDz], [this.F, tF], [this.W, tW], [this.roll, c.roll], [this.yaw, c.hipYaw]]) { s.x = v; s.v = 0 }
      this.snap = false
    } else if (dt > 0) {
      springTo(this.D.x, tDx, dt, 7, 0.35); springTo(this.D.z, tDz, dt, 7, 0.35)
      springTo(this.F, tF, dt, 5, 0.6); springTo(this.W, tW, dt, 6, 0.4)
      springTo(this.roll, c.roll, dt, 9, 0.3); springTo(this.yaw, c.hipYaw, dt, 9, 0.3)
      springTo(this.E.x, tDx * 1.6 - (this.roll.x - c.roll) * 0.25, dt, 6, 0.22); springTo(this.E.z, tDz * 1.6, dt, 6, 0.22)
    }
    const F = Math.max(0, this.F.x), sw = this.W.x, rollLag = this.roll.x - c.roll, yawLag = this.yaw.x - c.hipYaw
    const P = this.geo.attributes.position.array, push = this.push, carry = this.carry, Rb = this.Rb, legs = this.legPts
    carry.fill(0)
    for (let j = NR; j >= 0; j--) { // from the waist down, so a leg's push carries on below it
      const t = 1 - j / NR, d = t * cut.len, y0 = this.top - d, t2 = t * t
      const r = d < 0.12 ? lerp(this.r0, cut.hip, smooth(0, 0.125, d)) : cut.hip + (cut.hem - cut.hip) * ((d - 0.12) / (cut.len - 0.12)) ** 1.15
      const rzK = lerp(0.74, 1, smooth(0.08, 0.5, d))
      const cx = (this.D.x.x + rollLag * cut.len * 0.8) * t2, cz = cut.zc + this.D.z.x * t2
      const lift = F * 0.42 * cut.len * t2, fl = 1 + F * t ** 1.5
      const ph = cut.folds * (sw * t ** 1.5 + yawLag * t) + 0.7, ft = cut.flute * t ** 1.6
      let nl = 0
      for (const f of SIDES) if (c.legs && this.legAt(c.legs[f], y0, legs[nl])) nl++
      for (let i = 0; i <= NS; i++) {
        const a = (i / NS - 0.5) * TAU
        const R = r * fl * (1 + ft * Math.cos(cut.folds * a + ph))
        Rb[i] = R
        let p = 0
        for (let n = 0; n < nl; n++) {
          const Lp = legs[n], lx = Lp.x - cx, lz = (Lp.z - cz) / rzK
          const ld = Math.hypot(lx, lz), dd = wrap(a - Math.atan2(lx, lz)), cs = Math.cos(dd)
          if (cs <= 0) continue
          const sn = ld * Math.sin(dd), rr = (Lp.r + 0.038) / rzK // the leg is round in the unscaled frame
          if (Math.abs(sn) < rr) p = Math.max(p, ld * cs + Math.sqrt(rr * rr - sn * sn) - R)
        }
        push[i] = p
      }
      // the cloth tents over a leg (the bulge widens sideways, never below what the leg needs), then hangs from it
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < NS; i++) this.tmp[i] = Math.max(push[i], 0.3 * push[(i + NS - 1) % NS] + 0.4 * push[i] + 0.3 * push[(i + 1) % NS])
        for (let i = 0; i < NS; i++) push[i] = this.tmp[i]
        push[NS] = push[0]
      }
      for (let i = 0; i <= NS; i++) {
        const pi = Math.max(push[i], carry[i] * cut.keep)
        carry[i] = pi
        const a = (i / NS - 0.5) * TAU, wv = Math.cos(cut.folds * a + ph)
        const R = Rb[i] + pi, k = (j * (NS + 1) + i) * 3
        P[k] = cx + R * Math.sin(a)
        P[k + 1] = Math.max(c.floorY + 0.012, y0 + lift + cut.scallop * 0.022 * t ** 4 * wv)
        P[k + 2] = cz + R * rzK * Math.cos(a)
      }
      if (j === 0) { this.hem.cx = cx; this.hem.cz = cz }
    }
    this.geo.attributes.position.needsUpdate = true
    seamNormals(this.geo)
    if (this.band.visible) this.updateBand(c, F)
  }

  // Hem trim from the hem ring and the fabric's slope: feathers (gown), fringe (Latin) or a ruffle (social).
  updateBand(c, F) {
    const mode = this.cut.band, NS = this.NS
    const P = this.geo.attributes.position.array, B = this.bandGeo.attributes.position.array
    const { cx, cz } = this.hem, fy = c.floorY + 0.006
    const Ex = this.E.x.x - this.D.x.x, Ez = this.E.z.x - this.D.z.x, Ff = clamp(F * 1.5, 0, 0.85)
    const set = (row, i, x, y, z) => { const k = (row * (NS + 1) + i) * 3; B[k] = x; B[k + 1] = Math.max(fy, y); B[k + 2] = z }
    const B2 = mode === 'feather' && this.band2?.visible ? this.band2Geo.attributes.position.array : null
    const set2 = (row, i, x, y, z) => { const k = (row * (NS + 1) + i) * 3; B2[k] = x; B2[k + 1] = Math.max(fy, y); B2[k + 2] = z }
    for (let i = 0; i <= NS; i++) {
      const k0 = i * 3, k1 = (NS + 1 + i) * 3
      const hx = P[k0], hy = P[k0 + 1], hz = P[k0 + 2]
      let ux = P[k1] - hx, uy = P[k1 + 1] - hy, uz = P[k1 + 2] - hz
      const ul = Math.hypot(ux, uy, uz) || 1
      ux /= ul; uy /= ul; uz /= ul
      let ox = hx - cx, oz = hz - cz
      const ol = Math.hypot(ox, oz) || 1
      ox /= ol; oz /= ol
      const zig = i % 2 ? 1 : -1
      if (mode === 'fringe') {
        let dx = ox * Ff * 1.3 + Ex * 2, dy = -(1 - Ff * 0.6), dz = oz * Ff * 1.3 + Ez * 2
        const dl = Math.hypot(dx, dy, dz) || 1
        dx /= dl; dy /= dl; dz /= dl
        set(0, i, hx + ux * 0.01 + ox * 0.004, hy + uy * 0.01, hz + uz * 0.01 + oz * 0.004)
        set(1, i, hx + dx * 0.065 + ox * 0.006, hy + dy * 0.065, hz + dz * 0.065 + oz * 0.006)
        set(2, i, hx + dx * 0.135 + ox * 0.01, hy + dy * 0.135, hz + dz * 0.135 + oz * 0.01)
      } else if (mode === 'feather') {
        // a fluffy band round the hem: up over the cloth, out at the hem, the tips curling out and down (they
        // lift a little more when the skirt flares); boa scales the whole trim
        const s = this.cut.boa, o2 = (0.045 + 0.016 * zig) * s + Ff * 0.02, dn = ((zig > 0 ? 0.012 : 0) - Ff * 0.012) * s
        set(0, i, hx + ux * 0.035 * s + ox * 0.006 * s, hy + uy * 0.035 * s, hz + uz * 0.035 * s + oz * 0.006 * s)
        set(1, i, hx + ox * 0.022 * s, hy - 0.004 * s, hz + oz * 0.022 * s)
        set(2, i, hx - ux * 0.03 * s + ox * o2, hy - uy * 0.03 * s - dn, hz - uz * 0.03 * s + oz * o2)
        if (B2) { // the outer layer: from just above the hem, further out and a little lower, plumes out of step
          const q2 = (0.06 - 0.014 * zig) * s + Ff * 0.025, dn2 = ((zig < 0 ? 0.012 : 0) - Ff * 0.012) * s
          set2(0, i, hx + ux * 0.012 * s + ox * 0.014 * s, hy + uy * 0.012 * s, hz + uz * 0.012 * s + oz * 0.014 * s)
          set2(1, i, hx - ux * 0.012 * s + ox * 0.036 * s, hy - uy * 0.012 * s - 0.006 * s, hz - uz * 0.012 * s + oz * 0.036 * s)
          set2(2, i, hx - ux * 0.045 * s + ox * q2, hy - uy * 0.045 * s - dn2, hz - uz * 0.045 * s + oz * q2)
        }
      } else {
        const o1 = 0.028 + 0.008 * zig, o2 = 0.072 + 0.02 * zig
        set(0, i, hx + ux * 0.01 + ox * 0.004, hy + uy * 0.01, hz + uz * 0.01 + oz * 0.004)
        set(1, i, hx - ux * 0.035 + ox * o1, hy - uy * 0.035, hz - uz * 0.035 + oz * o1)
        set(2, i, hx - ux * 0.075 + ox * o2, hy - uy * 0.075, hz - uz * 0.075 + oz * o2)
      }
    }
    this.bandGeo.attributes.position.needsUpdate = true
    seamNormals(this.bandGeo)
    if (B2) { this.band2Geo.attributes.position.needsUpdate = true; seamNormals(this.band2Geo) }
  }
}

// ---------- the dancer ----------
export class Dancer {
  // kind: 'leader' | 'follower' | 'coach'; opts.palette: a PALETTES entry (or a flat colour override for this kind)
  constructor(scene, kind = 'leader', opts = {}) {
    this.kind = kind
    const b = (this.b = BUILD[kind] || BUILD.leader)
    this.pal = paletteFor(kind, opts.palette)
    const M = (this.M = materials(kind, b, this.pal))
    const G = (this.G = geometries(b))
    this.meshCount = 0
    this.partner = null
    this.root = new THREE.Group() // at the floor under the body, rotated by yaw
    this.root.name = `dancer-${kind}`
    this.limbs = new THREE.Group() // world-space limbs (IK)
    // skeleton: pelvis -> waist -> chest -> neck -> head; the torso cloth is skinned to the first four
    const bone = (parent, y) => { const o = new THREE.Bone(); o.position.set(0, y, 0); parent.add(o); return o }
    this.bP = bone(this.root, b.hipH)
    this.bW = bone(this.bP, b.waistY - b.hipH)
    this.bC = bone(this.bW, b.chestY - b.waistY)
    this.bN = bone(this.bC, b.neckY - b.chestY)
    this.bH = bone(this.bN, b.atlasY - b.neckY)
    this.root.updateMatrixWorld(true)
    this.skeleton = new THREE.Skeleton([this.bP, this.bW, this.bC, this.bN])
    // aliases kept from the earlier rig
    this.pelvis = this.bP; this.torso = this.bW; this.headG = this.bH

    // torso and costume; every mesh records its body zone (upper / lower / shoe: see setGhost) and its material
    // slot (see setOutfit)
    this._zone = 'upper'
    if (!b.lady) {
      this._zone = 'lower'; this.mesh(G.pelvis, M.trousers, this.bP); this._zone = 'upper'
      this.mesh(G.jacket, M.jacket, this.root, true)
      this.front = this.mesh(G.front, M.shirt, this.root, true)
      this.lapels = this.mesh(G.lapels, M.satin, this.root, true)
      this.collar = this.mesh(G.collar, M.shirt, this.bN)
      this.bow = this.mesh(G.bow, M.tie, this.bN)
      this._zone = 'lower'
      this.tails = kind === 'leader' ? G.tails.map((t, i) => {
        const piv = new THREE.Group()
        piv.position.copy(t.pivot)
        this.bP.add(piv)
        this.mesh(t.geo, M.tails, piv)
        piv.userData = { sx: i === 0 ? 1 : -1, sw: spr(), lat: spr() }
        return piv
      }) : null
      this._zone = 'upper'
    } else {
      this._zone = 'lower'; this.mesh(G.pelvis, M.dress, this.bP); this._zone = 'upper'
      this.mesh(G.bodice, M.dress, this.root, true)
      this.yoke = this.mesh(G.yoke, M.sleeve, this.root, true)
      this._zone = 'lower'; this.skirt = new Skirt(this); this._zone = 'upper'
    }
    // neck, head, face, hair
    this.mesh(G.neck, M.skin, this.bN)
    this.mesh(G.head, M.skin, this.bH)
    this.mesh(G.hair, M.hair, this.bH)
    this.mesh(G.ears, M.skin, this.bH)
    this.mesh(G.nose, M.skin, this.bH)
    this.mesh(G.eyes, M.eye, this.bH, false, false)
    this.mesh(G.brows, M.hair, this.bH, false, false)
    if (b.lady) { this.mesh(G.lips, M.lips, this.bH, false, false); this.mesh(G.earrings, M.jewel, this.bH, false, false) }

    // limbs (his legs in the trousers, his arms in the jacket's or the shirt's sleeves)
    this.parts = {}; this.caps = {}; this.arm = {}; this.feet = {}; this.legLocal = {}
    this.armMeshes = []
    const legMat = b.lady ? M.legs : M.trousers, armMat = M.sleeve
    for (const f of SIDES) {
      this._zone = 'lower'
      const thigh = this.limb(G.thigh, legMat), shin = this.limb(G.shin, legMat), knee = this.mesh(G.knee, legMat, this.limbs)
      if (!b.lady) {
        this.mesh(G.stripe[`thigh${f}`], M.stripe, thigh, false, false)
        this.mesh(G.stripe[`shin${f}`], M.stripe, shin, false, false)
      }
      this._zone = 'upper'
      const P = (this.parts[f] = {
        thigh, shin, knee,
        upper: this.limb(G.upper, armMat), fore: this.limb(G.fore, armMat), elbow: this.mesh(G.elbow, armMat, this.limbs),
        hand: this.mesh(f === 'L' ? G.handL : G.handR, M.skin, this.limbs), shoe: new THREE.Group(),
      })
      P.shoe.rotation.order = 'YXZ'
      this.limbs.add(P.shoe)
      this._zone = 'shoe'
      this.mesh(G.shoe.rear, M.shoe, P.shoe).userData.foot = f
      P.toe = this.mesh(G.shoe.toe, M.shoe, P.shoe)
      P.toe.userData.foot = f // the shoe uppers glow in their print colour in the feet views (setShoeGlow)
      P.toe.position.set(0, G.shoe.ball[0], G.shoe.ball[1])
      if (G.shoe.heel) { this.mesh(G.shoe.heel, M.sole, P.shoe, false, false); this.mesh(G.shoe.weltToe, M.sole, P.toe, false, false) }
      this._zone = 'upper'
      if (!b.lady) this.mesh(G.cuff, M.shirt, P.fore, false, false)
      this.armMeshes.push(P.upper, P.fore, P.elbow)
      this.caps[f] = this.mesh(G.cap, M.sleeve, this.bC)
      this.caps[f].position.set(SX[f] * b.shoulderW, b.shoulderY - b.chestY, 0)
      const V3 = () => new THREE.Vector3()
      this.arm[f] = { goal: V3(), local: V3(), pole: V3(), palmGoal: V3(), palm: V3(), finger: V3(), hasFinger: false,
        sticky: false, wasSticky: false, lim: 0, ready: false, sh: V3(), el: V3(), wrist: V3() }
      this.feet[f] = { ankle: V3(), yaw: 0, pitch: 0, w: 0.5, lift: 0 }
      this.legLocal[f] = { H: V3(), K: V3(), A: V3() }
    }
    this.v = {}
    for (const n of ['hip', 'knee', 'ankle', 'pole', 'ref', 'fwd', 'left', 'sh', 'elbow', 'wrist', 'hand', 'tgt', 'n', 'f']) this.v[n] = new THREE.Vector3()
    this.qChest = new THREE.Quaternion(); this.qRootInv = new THREE.Quaternion()
    this.S = { wx: 0, wy: 0, wz: 0, cx: 0, cy: 0, cz: 0, hx: 0, hy: 0, hz: 0 }
    this.headGoal = { x: 0, y: 0, z: 0 }
    this.vel = { x: 0, z: 0 }; this.spin = 0
    this.k = 1; this.kh = 1; this.kS = 1; this.kSpot = 1
    this._c = 0; this._cT = 0 // hip shift toward the partner for body contact (m; - = away)
    this._lean = 0; this._leanT = 0; this._leanDir = 0 // upper-body incline toward a stretched joined hand
    this._whip = 0 // spotting: the neck limit the head has whipped round to
    this.style = null; this.dance = null; this.cat = 'std'; this.costume = null
    this._ghost = null; this._ghostKey = ''; this._pending = false
    this.basePal = this.pal; this._outfitKey = '' // the dancer's own look (setOutfit)
    this.setCostume(kind === 'coach' ? 'soc' : 'std')
    scene.add(this.root, this.limbs)
    this.walk(0, 0, 0, 0, false) // never show an unposed figure
  }

  // Create a mesh; skinned meshes are bound to the rest pose (the root is still at the origin here).
  mesh(geo, mat, parent, skinned = false, shadow = true) {
    const m = skinned ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat)
    m.castShadow = shadow
    m.userData.base = mat
    m.userData.slot = slotOf(this.M, mat)
    m.userData.zone = this._zone || 'upper'
    parent.add(m)
    if (skinned) { m.frustumCulled = false; m.bind(this.skeleton) }
    this.meshCount++
    return m
  }

  limb(geo, mat) { const m = this.mesh(geo, mat, this.limbs); m.userData.len = geo.userData.len; return m }

  // The material a mesh shows: its own, or a see-through copy at its body zone's ghost opacity.
  shown(m, mat) {
    const op = this._ghost ? num(this._ghost[m.userData.zone || 'upper'], 1) : 1
    const base = this._shoeGlow && m.userData.foot ? glowOf(mat, m.userData.foot) : mat
    return op < 0.999 ? ghostOf(base, op) : base
  }

  // The player's own shoes in the feet views: left blue and right gold like his prints and lane notes, so dark
  // shoes still read on the black marble and the club floor.
  setShoeGlow(on) {
    on = !!on
    if (this._shoeGlow === on) return
    this._shoeGlow = on
    const set = (o) => { if (o.isMesh && o.userData.foot && o.userData.base) o.material = this.shown(o, o.userData.base) }
    this.limbs.traverse(set)
  }

  setMat(m, mat) { m.userData.base = mat; m.userData.slot = slotOf(this.M, mat) ?? m.userData.slot; m.material = this.shown(m, mat) }

  // Costume by category: tails only for Standard/Smooth; her gown + sheer lace sleeves (std), short dress with
  // bare arms (lat, soc); the coach in a plain practice top and skirt. An outfit (setOutfit) may set her cut
  // (pal.cut: the short dress in any room, say) and his look (pal.look: which of tails, lapels and bow tie show).
  setCostume(cat) {
    const key = `${cat}|${this._outfitKey}`
    if (this.costume === key) return
    this.costume = key
    const pal = this.pal
    if (!this.b.lady) {
      const look = pal.look || 'tails', formal = look === 'tails' || look === 'dinner'
      if (this.tails) for (const t of this.tails) t.visible = look === 'tails' && cat === 'std'
      this.lapels.visible = formal; this.bow.visible = formal
      return
    }
    const M = this.M, coach = this.kind === 'coach'
    const cut = coach ? 'practice' : CUTS[pal.cut] ? pal.cut : cat === 'std' ? 'gown' : cat === 'soc' ? 'social' : 'latin'
    const sleeved = !coach && cut === 'gown' && pal.sleeves !== false
    const arms = sleeved ? M.sleeve : M.skin
    const yoke = coach || cut === 'practice' ? M.dress : sleeved ? M.sleeve : M.skin
    for (const m of this.armMeshes) this.setMat(m, arms)
    this.setMat(this.yoke, yoke)
    for (const f of SIDES) this.setMat(this.caps[f], yoke)
    this.skirt.setCut(cut, pal.hem)
  }

  // Dress the dancer in another outfit without rebuilding it (the wardrobe): o.colours = palette fields for this
  // kind (clothes only: the dancer keeps their own skin and hair), o.look (his) / o.cut (her dress); null = the
  // dancer's own palette. Every mesh swaps to the new material set's material for its slot, so ghosting, the
  // hold, body contact and the skirt's motion carry on undisturbed.
  setOutfit(o) {
    const key = o ? JSON.stringify(o) : ''
    if (key === this._outfitKey) return
    this._outfitKey = key
    const pal = { ...this.basePal, ...(o?.colours || {}) }
    if (o?.look) pal.look = o.look
    if (o?.cut) pal.cut = o.cut
    this.pal = pal
    const old = this.M
    this.M = materials(this.kind, this.b, pal)
    const swap = (m) => {
      const slot = m.isMesh ? m.userData.slot ?? slotOf(old, m.userData.base) : null
      if (slot && this.M[slot]) this.setMat(m, this.M[slot])
    }
    this.root.traverse(swap); this.limbs.traverse(swap)
    this.costume = null
    this.setCostume(this.kind === 'coach' ? 'soc' : this.cat)
  }

  // See-through: false (solid), true (all of the dancer at 35%: the background couples), or opacities per body
  // zone { upper, lower, shoe } (1 or missing = solid). The behind and footwork cameras use zones: the player's
  // legs and skirt almost clear and the shoes solid, the partner's skirt and legs see-through where they would
  // hide his feet.
  setGhost(on) {
    const g = !on ? null : on === true ? GHOST_ALL : on
    const key = g ? `${num(g.upper, 1)}|${num(g.lower, 1)}|${num(g.shoe, 1)}` : ''
    if (this._ghostKey === key) return
    this._ghostKey = key
    this._ghost = g
    const set = (o) => { if (o.isMesh && o.userData.base) o.material = this.shown(o, o.userData.base) }
    this.root.traverse(set); this.limbs.traverse(set)
  }

  setVisible(v) { this.root.visible = v; this.limbs.visible = v }

  get goals() { return { L: this.arm.L.goal, R: this.arm.R.goal } }

  // p: {x, z, yaw, rise, L:{x,z,y,yaw,pitch}, R:{...}, weightL, hold, style, dance, sway, turn, speed, spot}
  // Every field except x/z/yaw is optional; older poses (feet as {x,z,y} only) work unchanged.
  apply(p) {
    if (this._pending) this.settle() // couple() was not called after the last apply: finish that frame alone
    this.pose = p
    const b = this.b, V = this.v, S = this.S, F = b.foot
    const now = performance.now() / 1000
    const dt = this.lastT == null ? 0 : Math.min(0.1, Math.max(0, now - this.lastT))
    this.lastT = now
    const x = num(p.x), z = num(p.z), yaw = num(p.yaw)
    // a jump (first frame, new routine, new floor) snaps everything instead of easing or swinging the cloth
    const jump = !this.last || Math.hypot(x - this.last.x, z - this.last.z) > 0.9 || Math.abs(wrap(yaw - this.last.yaw)) > 1.6
    this._snap = jump
    const ease = (rate) => (jump ? 1 : 1 - Math.exp(-dt * rate))
    const k = ease(9)
    this.k = ease(10); this.kS = ease(28); this.kh = ease(6); this.kSpot = ease(30); this.kDown = ease(4.5)
    this.dt = dt
    // the engine may flag her underarm steps (the joined hands go up over her head; couple() also detects them)
    this.underarm = p.underarm === true
    if (jump) { this.vel.x = this.vel.z = 0; this.spin = 0 }
    else if (dt > 1e-4) {
      const kv = ease(10)
      this.vel.x += ((x - this.last.x) / dt - this.vel.x) * kv
      this.vel.z += ((z - this.last.z) / dt - this.vel.z) * kv
      this.spin += (wrap(yaw - this.last.yaw) / dt - this.spin) * kv
    }
    this.last = { x, z, yaw }

    // style, dance character, costume
    if (p.style) this.style = p.style
    if (p.dance) this.dance = p.dance
    const cat = this.kind === 'coach' ? 'soc' : categoryOf(this.style, this.dance, this.cat)
    this.cat = cat
    this.setCostume(this.kind === 'coach' ? 'soc' : cat)
    const ch = this.kind === 'coach' ? CHAR.std : { ...CHAR[cat], ...(DANCE_CHAR[this.dance] || {}) }
    const hold = p.hold || 'none'
    const lat = cat !== 'std'
    const lady = b.lady && this.kind !== 'coach'
    const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw) // forward, left
    const PL = p.L || { x: x + lx * 0.1, z: z + lz * 0.1 }, PR = p.R || { x: x - lx * 0.1, z: z - lz * 0.1 }
    let wL = p.weightL
    if (!Number.isFinite(wL)) {
      const dL = Math.hypot(x - num(PL.x, x), z - num(PL.z, z)), dR = Math.hypot(x - num(PR.x, x), z - num(PR.z, z))
      wL = dR / (dL + dR + 1e-6)
    }
    wL = clamp01(wL)
    const rise = num(p.rise)

    // feet: foot yaw (+ style turnout from the hip) and pitch; the foot pivots on the ball (heel up) or the
    // heel (toe up); the pose's foot point is the middle of the foot. Latin feet turn out about 23° each (45°+
    // between them) around a point near the heel, so closed feet make a V (heels together, toes apart).
    const turnout = turnoutOf(cat, hold)
    const tPiv = F.len * 0.3 // turnout pivot behind the middle of the foot
    for (const f of SIDES) {
      const sx = SX[f], P = f === 'L' ? PL : PR, ft = this.feet[f]
      const w = f === 'L' ? wL : 1 - wL
      const lift = Math.max(0, num(P.y))
      const fy0 = num(P.yaw, yaw), fy = fy0 + sx * turnout
      const mx = num(P.x, x) + (Math.sin(fy) - Math.sin(fy0)) * tPiv, mz = num(P.z, z) + (Math.cos(fy) - Math.cos(fy0)) * tPiv
      // pitch: the engine's own (it already carries its rise; negative = a heel lead, toe up); only poses without
      // a pitch get one here, and only then does rise lift a grounded heel
      const given = Number.isFinite(P.pitch)
      let pitch
      if (given) pitch = P.pitch
      else if (lift > 0.004) pitch = (lat ? 0.55 : 0.3) * smooth(0, 0.04, lift)
      else pitch = lat ? 0.38 * smooth(0.45, 0.08, w) : 0
      if (!given && lift < 0.01 && rise > 0) pitch = Math.max(pitch, Math.asin(clamp((rise * 0.85) / (F.ball + F.back), 0, 0.85)))
      ft.mx = mx; ft.mz = mz; ft.yaw = fy; ft.w = w; ft.lift = lift
      this.pitchFoot(ft, clamp(pitch, -0.55, 1.2))
    }

    // pelvis: Latin hips settle over the standing leg (that hip up and back, pelvis turned toward it), the
    // shoulders stay level above; Standard stays level with soft knees and the hips toward the partner
    const side = (wL - 0.5) * 2, settle = Math.sign(side) * smooth(0, 1, Math.abs(side))
    // sway (+ = toward the dancer's right): the figure's sway chart for this dancer when the engine sends one
    // (Standard and Smooth; the lady's chart is the mirror of the man's, so the couple sways as one): at least a
    // visible 0.06 rad that way, or upright on a step the chart leaves level; else the engine's value
    let swayIn = num(p.sway)
    const chart = p.swayChart
    if (chart !== undefined && cat === 'std') {
      const sg = chart === 'R' ? 1 : chart === 'L' ? -1 : 0
      swayIn = sg * Math.max(0.06, Math.min(0.1, sg * swayIn))
    }
    const sway = clamp(swayIn, -0.3, 0.3)
    const pY = ch.hips * settle * 0.17, pZ = ch.hips * settle * 0.11 + sway * 0.25
    this._settle = settle * ch.hips
    const closed = hold === 'closed' || hold === 'promenade'
    let shiftX = settle * (0.012 + 0.03 * ch.hips)
    let shiftZ = (lat ? 0.012 : 0) + (cat === 'std' && closed ? 0.022 : 0)
    // body contact, measured by couple() on the previous frame: the Standard closed hold rests in light contact
    // through the hips and waist; every other hold only keeps the two bodies from passing through each other.
    // Walking or dancing alone (no couple() call) lets both partner adjustments ease away.
    if (hold === 'none' || !this.partner) this._cT = this._leanT = 0
    this._c = jump || !this.partner ? 0 : this._c + (this._cT - this._c) * (this._cT < this._c ? this.kS : k) // apart quickly, together gently
    if (this._c && this.partner.root) {
      const q = this.partner.root.position, dx = q.x - x, dz = q.z - z, dl = Math.hypot(dx, dz)
      if (dl > 1e-3) { shiftX += (this._c * (dx * lx + dz * lz)) / dl; shiftZ += (this._c * (dx * fx + dz * fz)) / dl }
    }
    const reach = (b.thigh + b.shin) * 0.999
    const hipAt = (sx) => { // world x/z of a hip joint
      const ox = shiftX + sx * b.hipW * Math.cos(pY), oz = shiftZ - sx * b.hipW * Math.sin(pY)
      return [x + lx * ox + fx * oz, z + lz * ox + fz * oz]
    }
    // the hips are as high as the legs allow (soft knees, rise), never more than 17 cm down
    const want = b.hipH - ch.knee + rise
    const legTop = (f) => { // the highest the pelvis can be with this leg straight
      const sx = SX[f], A = this.feet[f].ankle, [hx, hz] = hipAt(sx)
      const horiz = Math.hypot(A.x - hx, A.z - hz)
      return A.y + Math.sqrt(Math.max(0, reach * reach - horiz * horiz)) - sx * b.hipW * Math.sin(pZ)
    }
    // feet out of reach with the hips at height y: the hips travel toward them (body x/z, together at most 12 cm)
    let tx = 0, tz = 0
    const travel = (y) => {
      let ex = 0, ez = 0
      for (const f of SIDES) {
        const sx = SX[f], A = this.feet[f].ankle, [hx, hz] = hipAt(sx)
        const dy = y + sx * b.hipW * Math.sin(pZ) - A.y, avail = Math.sqrt(Math.max(0, reach * reach - dy * dy))
        const dx = A.x - hx, dz = A.z - hz, horiz = Math.hypot(dx, dz)
        if (horiz > avail) { ex += (dx / horiz) * (horiz - avail); ez += (dz / horiz) * (horiz - avail) }
      }
      const ox = clamp(tx + ex * lx + ez * lz, -0.12, 0.12) - tx, oz = clamp(tz + ex * fx + ez * fz, -0.12, 0.12) - tz
      tx += ox; tz += oz; shiftX += ox; shiftZ += oz
    }
    // A long stance (a step landing away from the body, a wide side step, the far end of a long stride): rather
    // than sinking, the dancer reaches through the legs.
    // - A grounded foot rises onto its ball (the ball stays where it is on the floor; a weighted heel lifts up to
    //   ~40°, a free foot points up to ~63°) as far as that leg needs to hold the hips within 2 cm of their height.
    //   Heel leads (toe up) stay as the engine sends them.
    // - Softer clamp: a light foot may stay up to 6 cm short of its spot (the leg at full stretch, the pointed toe
    //   just leaving the floor) instead of pulling the hips down after it; from 30% weight a foot is always reached.
    // - The hips give up to 2 cm through soft knees; for more, the pelvis travels (up to 12 cm) toward where both
    //   legs reach at the greatest height: between the feet, over the weighted one. Next to a partner it never
    //   travels closer than the room between them, and the upper body leans back over the posture's spot (below),
    //   so the frame and the joined hands stay where they were.
    // Only then do the hips go down (at most 17 cm).
    const slackOf = (w) => 0.06 * smooth(0.3, 0.04, w)
    const D = FIT.d, H = FIT.h
    D[2][0] = D[2][1] = 0; D[2][2] = 0.12
    H[2] = Infinity
    const pq = this.partner && hold !== 'none' && this.partner.root ? this.partner.root.position : null
    if (pq) {
      const ux = pq.x - x, uz = pq.z - z, ul = Math.hypot(ux, uz)
      // (in the Standard frame the hips already rest in light contact: up to 2 cm more, into the skirt's fullness)
      if (ul > 1e-3 && ul < 0.8) { H[0] = ux / ul; H[1] = uz / ul; H[2] = clamp(num(this._room) / 2, 0, 0.12) + (cat === 'std' && closed ? 0.02 : 0) }
    }
    const fits = (y) => {
      FIT.q = Infinity
      for (let i = 0; i < 2; i++) {
        const f = SIDES[i], sx = SX[f], ft = this.feet[f], A = ft.ankle, [hx, hz] = hipAt(sx)
        const dy = y + sx * b.hipW * Math.sin(pZ) - A.y, R = reach + slackOf(ft.w)
        if (dy > R) return false // too high for this leg even straight down
        D[i][0] = A.x - hx; D[i][1] = A.z - hz; D[i][2] = Math.sqrt(R * R - dy * dy)
      }
      return nearestFit()
    }
    const solve = () => { // the highest the hips can be (-1: not even 17 cm down); FIT.x/z = the travel (world)
      const soft = want - 0.02
      if (fits(want) && FIT.q === 0) return want
      if (fits(soft) && FIT.q === 0) { // soft knees are enough: as high as the legs reach where the hips are
        let lo = soft, hi = want
        for (let it = 0; it < 8; it++) { const m = (lo + hi) / 2; if (fits(m) && FIT.q === 0) lo = m; else hi = m }
        fits(lo)
        return lo
      }
      if (FIT.q < Infinity) return soft // the travel that keeps them 2 cm down
      let lo = b.hipH - 0.17, hi = soft
      if (!fits(lo)) return -1
      for (let it = 0; it < 10; it++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m }
      fits(lo)
      return lo
    }
    // the balls of the feet first (judged with the hips where the posture puts them)
    for (const f of SIDES) {
      const ft = this.feet[f]
      if (ft.pitch < -0.02 || legTop(f) >= want - 0.02) continue
      const p0 = ft.pitch, pMax = lerp(0.7, 1.1, smooth(0.35, 0.08, ft.w))
      if (p0 >= pMax) continue
      // the least rise that is enough, else the one that helps most (a front foot rising onto its ball moves the
      // ankle away from the hips: there it may not help at all)
      let best = p0, top = legTop(f), lo = p0, hi = -1
      for (let k = 1; k <= 10 && hi < 0; k++) {
        const pk = lerp(p0, pMax, k / 10)
        this.pitchFoot(ft, pk)
        const t = legTop(f)
        if (t >= want - 0.02) hi = pk; else { lo = pk; if (t > top + 0.001) { top = t; best = pk } }
      }
      if (hi >= 0) for (let it = 0; it < 5; it++) { const m = (lo + hi) / 2; this.pitchFoot(ft, m); if (legTop(f) >= want - 0.02) hi = m; else lo = m }
      this.pitchFoot(ft, hi >= 0 ? hi : best)
    }
    // then the travel, eased in and out quickly (rate 25/s) so the hips never jump between solutions
    let gx = 0, gz = 0
    if (solve() >= 0) { gx = FIT.x; gz = FIT.z }
    const TR = this._trv || (this._trv = { x: 0, z: 0 })
    if (jump) { TR.x = gx; TR.z = gz } else { const kt = ease(25); TR.x += (gx - TR.x) * kt; TR.z += (gz - TR.z) * kt }
    const tl = TR.x * lx + TR.z * lz, tf = TR.x * fx + TR.z * fz
    shiftX += tl; shiftZ += tf
    this._tU = Number.isFinite(H[2]) ? TR.x * H[0] + TR.z * H[1] : 0 // toward the partner (couple() allows for it)
    // the hips as high as both legs then reach (a light foot with its slack)
    let hipY = want
    for (const f of SIDES) {
      const sx = SX[f], A = this.feet[f].ankle, [hx, hz] = hipAt(sx), R = reach + slackOf(this.feet[f].w)
      const horiz = Math.hypot(A.x - hx, A.z - hz)
      hipY = Math.min(hipY, horiz >= R ? -1 : A.y + Math.sqrt(R * R - horiz * horiz) - sx * b.hipW * Math.sin(pZ))
    }
    if (hipY < b.hipH - 0.17) { hipY = b.hipH - 0.17; travel(hipY) } // still out of reach at the lowest: toward the feet
    this.root.position.set(x, 0, z)
    this.root.rotation.set(0, yaw, 0)
    this.bP.position.set(shiftX, hipY, shiftZ)
    this.bP.rotation.set(ch.tilt || 0, pY, pZ)

    // upper body: posture, Standard top line, CBM into turns, sway, Latin poise (eased like baked keyframes)
    let wx = ch.lean * 0.5, cx = ch.lean * 0.5, wy = 0, cy = 0, wz = sway * 0.3, cz = sway * 0.45
    let hx = 0, hy = 0, hz = 0
    if (cat === 'std' && (closed || hold === 'finish')) {
      if (lady) { wx -= 0.07; cx -= 0.15; cy += 0.1; cz -= 0.07; hy = 0.55; hx = -0.12; hz = -0.06 } // top line back and left, long neck
      else { wx -= 0.015; cx -= 0.035; cy += 0.02; hy = 0.16; hx = -0.04 } // tall, chest up, head a little left
      if (hold === 'finish') { if (lady) { wx -= 0.05; cx -= 0.12; cz -= 0.06; hy = 0.75; hx = -0.18 } else { cx -= 0.03; hy = 0.25 } }
      if (hold === 'promenade') { hy = lady ? -0.62 : 0.6; if (lady) cy -= 0.12 }
    } else if (hold === 'finish') {
      hy = lady ? 0.5 : -0.5
      if (lady) { cx -= 0.08; hx = -0.08 } else cx -= 0.03
    }
    if (ch.proud && !lady) { cx -= 0.05; hx -= 0.06 }
    const turn = clamp(num(p.turn), -1, 1)
    wy += turn * 0.07; cy += turn * 0.11
    // CBM from the figure's chart (pose.cbm): the opposite side of the body turns toward the moving leg, the way
    // the figure turns; on a straight step it follows the free foot (RF forward or LF back = to the right,
    // LF forward or RF back = to the left)
    if (p.cbm === true) {
      let dir = Math.abs(turn) > 0.08 ? Math.sign(turn) : 0
      if (!dir) {
        const free = wL < 0.5 ? 'L' : 'R', Q = free === 'L' ? PL : PR
        const ahead = (num(Q.x, x) - x) * fx + (num(Q.z, z) - z) * fz
        if (Math.abs(ahead) > 0.04) dir = (free === 'R') === (ahead > 0) ? -1 : 1
      }
      wy += dir * 0.05; cy += dir * 0.08
    }
    // an arm stretched to its partner's hand (measured by couple()): the upper body inclines toward it
    this._lean = jump ? 0 : this._lean + (this._leanT - this._lean) * k
    if (this._lean > 1e-3) {
      const a = this._leanDir
      wx += this._lean * 0.4 * Math.cos(a); cx += this._lean * 0.6 * Math.cos(a)
      wz -= this._lean * 0.4 * Math.sin(a); cz -= this._lean * 0.6 * Math.sin(a)
    }
    if (hold === 'none') cx += Math.sin(now * 1.7 + (lady ? 1 : 0)) * 0.012 // breathing
    S.wx += (wx - S.wx) * k; S.wy += (wy - S.wy) * k; S.wz += (wz - S.wz) * k
    S.cx += (cx - S.cx) * k; S.cy += (cy - S.cy) * k; S.cz += (cz - S.cz) * k
    // isolation: the waist and ribcage counter the pelvis at once, so the shoulder line stays quiet; hips that
    // travelled to reach the feet leave the shoulders (most of the way) over the posture's spot in a hold
    const kTr = closed || hold === 'finish' ? 0.75 : hold === 'none' ? 0 : 0.5, hS = b.shoulderY - b.waistY
    const lwx = -Math.asin(clamp((kTr * tf) / hS, -0.4, 0.4)), lwz = Math.asin(clamp((kTr * tl) / hS, -0.4, 0.4))
    this.bW.rotation.set(S.wx + lwx, S.wy - pY * 0.78, S.wz - pZ * 0.82 + lwz)
    this.bC.rotation.set(S.cx, S.cy - pY * 0.17, S.cz - pZ * 0.13)
    this.chestYaw = yaw + pY * 0.05 + S.wy + S.cy
    // spotting: the head holds a world direction while the body turns under it; it leaves late (lingering at the
    // neck's limit, ~85°) and, while the body keeps turning, whips round ahead of the turn to the other limit,
    // where it waits for the spot to come back into view
    this.spotting = Number.isFinite(p.spot)
    if (this.spotting) {
      const d = wrap(p.spot - this.chestYaw)
      if (this._whip) {
        const back = Math.sign(d) === Math.sign(this._whip) ? Math.abs(d) <= SPOT_LIM : Math.abs(d) < SPOT_LIM - 0.25
        if (back) this._whip = 0 // the spot is in view again (or the body turned back)
      } else if (Math.abs(d) > SPOT_LIM + 0.3 && (Math.abs(d) > 2.6 || (Math.sign(d) === -Math.sign(this.spin) && Math.abs(this.spin) > 1.5))) {
        this._whip = -Math.sign(d) * SPOT_LIM
      }
      hy = this._whip || clamp(d, -SPOT_LIM, SPOT_LIM)
    } else this._whip = 0
    if (hold === 'none' || this.kind === 'coach') { hx = 0; hy = 0; hz = 0 }
    this.headGoal.x = hx; this.headGoal.y = hy; this.headGoal.z = hz
    this.root.updateMatrixWorld(true)

    // legs: IK from the hips to the ankles; Latin bent knees go inward, Standard knees track forward
    V.fwd.set(fx, 0, fz); V.left.set(lx, 0, lz)
    for (const f of SIDES) {
      const sx = SX[f], P = this.parts[f], ft = this.feet[f]
      const hip = this.bP.localToWorld(V.hip.set(sx * b.hipW, 0, 0))
      const bent = lat ? smooth(0.55, 0.15, ft.w) : 0
      V.pole.copy(V.fwd).addScaledVector(V.left, sx * (lat ? -0.28 * bent : 0.05))
      solve2(hip, ft.ankle, b.thigh, b.shin, V.pole, V.knee, V.ankle)
      V.ref.set(Math.sin(ft.yaw) + fx, 0, Math.cos(ft.yaw) + fz)
      segmentTwist(P.thigh, hip, V.knee, V.ref)
      segmentTwist(P.shin, V.knee, V.ankle, V.ref)
      P.knee.position.copy(V.knee)
      P.shoe.position.copy(V.ankle)
      P.shoe.rotation.set(ft.pitch, ft.yaw, 0)
      // toes bend at the ball: flat on the floor while the heel is up, pointed with the foot once it lifts
      P.toe.rotation.x = ft.pitch > 0 ? -ft.pitch * (1 - smooth(0.004, 0.03, ft.lift)) : 0
      const LL = this.legLocal[f]
      LL.H.set(sx * b.hipW, 0, 0)
      this.bP.worldToLocal(LL.K.copy(V.knee))
      this.bP.worldToLocal(LL.A.copy(V.ankle))
    }

    // costume flow: velocity in the pelvis frame (x = left, z = forward)
    const vx = this.vel.x * lx + this.vel.z * lz, vz = this.vel.x * fx + this.vel.z * fz
    if (this.skirt) this.skirt.update(dt, { snap: jump, vx, vz, spin: this.spin, roll: pZ, hipYaw: pY, floorY: -hipY, legs: this.legLocal })
    if (this.tails) this.updateTails(dt, jump, vx, vz, num(p.speed, Math.hypot(vx, vz)), pZ)

    // arms and head: a partnered dancer is finished by couple() so hands can meet
    this.hold = hold
    this.planArms(cat, hold, ch, num(p.armSwing))
    this.planned = true
    if (this.partner && hold !== 'none') this._pending = true
    else this.settle()
  }

  // Ankle of a foot at a pitch: it pivots on the ball (heel up, the ball stays where it is on the floor) or on
  // the heel (toe up); ft.mx/mz is the middle of the foot.
  pitchFoot(ft, pitch) {
    const b = this.b, F = b.foot
    const piv = pitch >= 0 ? F.ball : -(F.len / 2 - 0.015)
    const dzr = -F.back - piv, dyr = b.ankleH, c = Math.cos(pitch), s = Math.sin(pitch)
    const ay = dyr * c - dzr * s, az = dyr * s + dzr * c
    ft.ankle.set(ft.mx + Math.sin(ft.yaw) * (piv + az), ft.lift + ay, ft.mz + Math.cos(ft.yaw) * (piv + az))
    ft.pitch = pitch
  }

  // Coat tails trail with travel and turns, swing on a spring, and clear a leg stepping back.
  updateTails(dt, snap, vx, vz, speed, roll) {
    const fwdV = vz >= 0 ? Math.min(speed, Math.max(vz, 0) + 0.3 * Math.abs(vx)) : vz
    for (const T of this.tails) {
      const u = T.userData, LL = this.legLocal[u.sx > 0 ? 'L' : 'R']
      const clear = Math.max(0, -LL.K.z - 0.05) * 1.6 + Math.max(0, -LL.A.z - 0.12) * 0.6
      const target = Math.max(clear, clamp(fwdV * 0.22, -0.05, 0.45) + Math.abs(this.spin) * 0.04)
      const lat = clamp(-vx * 0.18, -0.25, 0.25) - roll * 0.5
      if (snap) { u.sw.x = target; u.sw.v = 0; u.lat.x = lat; u.lat.v = 0 }
      else { springTo(u.sw, target, dt, 9, 0.4); springTo(u.lat, lat, dt, 8, 0.45) }
      T.rotation.set(Math.max(clear, u.sw.x, -0.05), 0, u.lat.x)
    }
  }

  // Hand targets, elbow poles, palms and finger lines for the hold, converted from the chest frame to world.
  planArms(cat, hold, ch, swing) {
    this._plan = { cat, ch, swing }
    const b = this.b, plan = armPlan(this.kind, cat, hold, b, ch, swing)
    this.bC.getWorldQuaternion(this.qChest)
    for (const f of SIDES) {
      const A = this.arm[f], P = plan[f]
      this.bC.localToWorld(A.goal.set(P.t[0], P.t[1] - b.chestY, P.t[2]))
      A.pole.set(P.pole[0], P.pole[1], P.pole[2]).applyQuaternion(this.qChest)
      A.palmGoal.set(P.palm[0], P.palm[1], P.palm[2]).normalize().applyQuaternion(this.qChest)
      A.hasFinger = !!P.finger
      if (P.finger) A.finger.set(P.finger[0], P.finger[1], P.finger[2]).normalize().applyQuaternion(this.qChest)
      A.sticky = false
      // Latin/Social free arms live with the body: they rise a little as the hip settles to their side
      if (P.free && cat !== 'std') A.goal.y += 0.025 * (this._settle || 0) * SX[f]
    }
  }

  settle() { this._pending = false; this.solveArms(); this.applyHead() }

  shoulder(f, out) { const b = this.b; return this.bC.localToWorld(out.set(SX[f] * b.shoulderW, b.shoulderY - b.chestY, 0)) }

  // Ease each hand toward its goal in the dancer's own frame (travel never drags the hands behind; holds
  // change without snapping), then two-bone IK from the shoulder and orient the hand.
  solveArms() {
    this._pending = false
    const b = this.b, V = this.v
    this.qRootInv.copy(this.root.quaternion).invert()
    for (const f of SIDES) {
      const sx = SX[f], P = this.parts[f], A = this.arm[f]
      this.root.worldToLocal(V.tgt.copy(A.goal))
      V.n.copy(A.palmGoal).applyQuaternion(this.qRootInv)
      if (this._snap || !A.ready || A.local.distanceToSquared(V.tgt) > 2.25) { A.local.copy(V.tgt); A.palm.copy(V.n); A.ready = true }
      else { A.local.lerp(V.tgt, A.sticky ? this.kS : this.k); A.palm.lerp(V.n, this.k).normalize() }
      // a hand in contact with the partner, once it has arrived, never trails its goal by more than a few cm
      // (each dancer eases in their own turning frame, so fast spins would otherwise pull joined hands apart)
      if (A.sticky) {
        const dd = A.local.distanceTo(V.tgt)
        A.lim = A.wasSticky ? Math.max(0.03, A.lim * 0.85) : Math.max(0.03, dd)
        if (dd > A.lim) A.local.lerp(V.tgt, 1 - A.lim / dd)
      }
      A.wasSticky = A.sticky
      const hand = this.root.localToWorld(V.hand.copy(A.local))
      // the shoulder lifts a little when the hand is above it
      this.bC.localToWorld(V.sh.set(sx * b.shoulderW, b.shoulderY - b.chestY, 0))
      const lift = 0.022 * smooth(0, 0.3, hand.y - V.sh.y)
      this.caps[f].position.set(sx * b.shoulderW, b.shoulderY - b.chestY + lift, 0)
      this.bC.localToWorld(V.sh.set(sx * b.shoulderW, b.shoulderY - b.chestY + lift, 0))
      // a hand beyond reach draws the shoulder blade after it (up to 5 cm) before the arm straightens
      _d.subVectors(hand, V.sh)
      const far = _d.length() - (b.upperArm + b.foreArm) * 0.985
      if (far > 0) {
        V.sh.addScaledVector(_d, Math.min(far, 0.05) / _d.length())
        this.bC.worldToLocal(this.caps[f].position.copy(V.sh))
      }
      solve2(V.sh, hand, b.upperArm, b.foreArm, A.pole, V.elbow, V.wrist)
      segment(P.upper, V.sh, V.elbow)
      segment(P.fore, V.elbow, V.wrist)
      P.elbow.position.copy(V.elbow)
      A.sh.copy(V.sh); A.el.copy(V.elbow); A.wrist.copy(V.wrist)
      // hand: fingers continue the forearm, bent toward the styling line; palm toward its goal
      V.f.subVectors(V.wrist, V.elbow).normalize()
      if (A.hasFinger) V.f.multiplyScalar(0.6).addScaledVector(A.finger, 0.4).normalize()
      V.n.copy(A.palm).applyQuaternion(this.root.quaternion)
      P.hand.position.copy(V.wrist)
      orient(P.hand.quaternion, V.f, V.n)
    }
  }

  applyHead() {
    const S = this.S, g = this.headGoal, k = this.spotting ? this.kSpot : this.kh
    S.hx += (g.x - S.hx) * k; S.hy += (g.y - S.hy) * k; S.hz += (g.z - S.hz) * k
    this.bN.rotation.set(S.hx * 0.4, S.hy * 0.35, S.hz * 0.4)
    this.bH.rotation.set(S.hx * 0.6, S.hy * 0.65, S.hz * 0.6)
  }

  // How far the joined hands should be raised for her turn (0..1), from her facing against the line to him
  // (phi: 0 = facing him, + = he is to her right, - = to her left) and the turn rates. Her right hand is joined,
  // so once he is to her left or behind her it can only reach him over her head. On a turn the engine marks (her
  // spot, or its underarm flag) the hands go up when she turns right on her own (faster than him, not the other
  // way) or spins left much faster than him from (or on past) facing him (the lead hand rises as she starts), as
  // soon as she spins away from him spotting him (a spot turn: the engine spots only turns of 150° or more, from
  // where they start, so a New Yorker, spotting along the line of the side-by-side position, does not count), and
  // when her back comes round to him. They stay up while he is to her left or behind her or she is still turning
  // against him, and come down once her turn is done. A side pass to her left, a turn into facing him and the couple
  // turning as one never raise them. When a turn is cued with her facing him, the lead hand already goes most of the
  // way up.
  static turnUnder(lead, fol, on) {
    const lp = lead.root.position, fp = fol.root.position, dx = lp.x - fp.x, dz = lp.z - fp.z
    if (dx * dx + dz * dz < 1e-6) return lead._ua ? 1 : 0
    const phi = wrap(fol.root.rotation.y - Math.atan2(dx, dz)), psi = wrap(lead.root.rotation.y - Math.atan2(-dx, -dz))
    const dt = fol.dt
    if (fol._snap || fol._phi == null || !(dt > 1e-4)) fol._phiW = 0
    else fol._phiW += (wrap(phi - fol._phi) / dt - fol._phiW) * fol.k // how fast phi changes (rad/s)
    fol._phi = phi
    if (fol._snap || fol._phi0 == null || Math.abs(fol._phiW) < 0.3) fol._phi0 = phi // where her current turn began
    if (!on || fol._snap) { lead._ua = lead._uaPrep = lead._uaDone = false; return 0 }
    const w = fol._phiW, wF = fol.spin, wL = lead.spin, aphi = Math.abs(phi)
    const cue = fol.underarm || fol.spotting
    const counter = wF * wL < 0 && Math.abs(wL) > 0.8 * Math.abs(wF) // he turns the other way as fast
    const away = (aphi < 0.35 || Math.sign(w) === Math.sign(phi)) && Math.abs(w) > 0.4 // turning away from him
    const together = Math.abs(wF - wL) < 0.35 * Math.max(Math.abs(wF), Math.abs(wL), 0.5) // the couple turns as one
    if (!lead._ua && cue) {
      const backRound = (aphi > 2.15 || (aphi > 1.75 && away && Math.abs(w) > 1.5 && Math.abs(wF) > 1.5)) && !(together && Math.abs(psi) > 1.6)
      const rightTurn = !counter && wF < -0.8 && wF - wL < -0.4 && phi < 0.35 && w < -0.4
      const ownLeft = wF > 1.2 && wF > 2.5 * Math.abs(wL)
      const leftSpin = ownLeft && ((w > 0.4 && phi > -0.35 && fol._phi0 > -0.75) || (w > 2 && phi > 0.9)) // from facing him, or well past it
      // a spin she starts facing him with her spot on him (the engine spots turns of 150° or more): her back will
      // come round to him, so the hand goes up at once (a spot turn, both turning away from each other)
      const toHim = Math.atan2(dx, dz), onHim = fol.spotting && Math.abs(wrap(num(fol.pose.spot) - toHim)) < 0.6
      const spinOff = onHim && Math.abs(wF) > 1.2 && away && aphi < 1.6
      lead._ua = fol.underarm || backRound || rightTurn || leftSpin || spinOff
    } else if (lead._ua && !fol.underarm && phi > -0.5 && aphi < 1.6 && Math.abs(w) < 1) lead._ua = false // she has come round
    // the early lift (down again if she turns back without turning under); not twice for one cue
    if (lead._ua) lead._uaDone = true
    if (!cue) lead._uaDone = false
    if (!cue || lead._ua || lead._uaDone) lead._uaPrep = false
    else if (!lead._uaPrep) lead._uaPrep = aphi < 0.8 && Math.abs(psi) < 0.9 && Math.abs(wL) < 1.5 && Math.abs(w) < 0.6
    else if (aphi > 0.8 && !away && Math.abs(w) > 0.4) lead._uaPrep = false
    return lead._ua ? 1 : lead._uaPrep ? 0.75 : 0
  }

  // Partner contact (the couple's "IK slots"): joined hands meet halfway (his palm under hers in open holds);
  // in the closed frame his right hand cups her left shoulder blade and her left hand rests on his upper arm.
  // Heads find each other in Latin, Social and open holds; Standard keeps its own head lines.
  static couple(lead, fol) {
    if (!lead || !fol) return
    const hold = lead.hold
    if (!lead.planned || !fol.planned || !hold || hold === 'none' || fol.hold === 'none' || lead.kind === 'coach' || fol.kind === 'coach') {
      lead._cT = fol._cT = lead._leanT = fol._leanT = lead._room = fol._room = 0
      lead._raise = 0; lead._ua = lead._uaPrep = false
      lead.settle(); fol.settle(); return
    }
    const cat = lead.cat, lb = lead.b, fb = fol.b
    let frame = hold === 'closed' || hold === 'promenade' || (hold === 'finish' && cat === 'std')
    // The frame needs her facing him with her back in his reach. Out of reach, his hand slides from her shoulder
    // blade toward her side; side by side (New Yorker, spot turns) or too far apart he lets go, and both free
    // arms style out (with a little hysteresis so the hold does not flicker).
    if (frame) {
      // promenade: the V is the hold, also while she closes the V again just after it (no flicker of the frame)
      if (hold === 'promenade') lead._ppAt = lead.lastT
      const closingV = hold === 'closed' && lead._ppAt != null && lead.lastT - lead._ppAt < 0.6
      // facing: turned toward each other and each in front of the other (back to back in a spot turn is not)
      let face = 1
      if (hold !== 'promenade' && !closingV) {
        const lp = lead.root.position, fp = fol.root.position, bx = fp.x - lp.x, bz = fp.z - lp.z
        face = Math.cos(wrap(fol.chestYaw - lead.chestYaw - Math.PI))
        if (bx * bx + bz * bz > 1e-4) {
          const ahead = Math.min(Math.cos(Math.atan2(bx, bz) - lead.chestYaw), Math.cos(Math.atan2(-bx, -bz) - fol.chestYaw))
          face = Math.min(face, ahead + 0.35)
        }
      }
      const yb = fb.shoulderY + (cat === 'soc' ? -0.2 : cat === 'lat' ? -0.13 : -0.11)
      const [rx, rz, zc] = profileAt(fb.torso, yb)
      const blade = fol.bC.localToWorld(C2.set(0.075, yb - fb.chestY, zc - rz - 0.014))
      const side = fol.bC.localToWorld(C3.set(rx + 0.015, yb - fb.chestY - 0.03, zc - 0.02))
      const sh = lead.shoulder('R', C4), R = (lb.upperArm + lb.foreArm) * 0.97, contact = lead.arm.R.goal
      let s = 0
      if (sh.distanceTo(blade) > R) {
        let lo = 0, hi = 1
        for (let it = 0; it < 8; it++) { const m = (lo + hi) / 2; contact.lerpVectors(blade, side, m); if (sh.distanceTo(contact) > R) lo = m; else hi = m }
        s = hi
      }
      contact.lerpVectors(blade, side, s)
      const d = sh.distanceTo(contact)
      lead._frameOn = lead._frameOn !== false ? face > 0.45 && d < R * 1.05 : face > 0.6 && d < R
      if (!lead._frameOn) {
        frame = false
        for (const a of [lead, fol]) a.planArms(a._plan.cat, 'open', a._plan.ch, a._plan.swing)
      }
    } else lead._frameOn = true
    const open = !frame
    // joined hands (his left, her right) meet between them; in underarm turns they rise over her head
    const jL = lead.arm.L, jR = fol.arm.R
    const S1 = lead.shoulder('L', C2), S2 = fol.shoulder('R', C3)
    // his frame sets the meeting point; in promenade the joined hands extend from HIS left shoulder forward along
    // the travel line and out to his left (her right arm reaches across his front, below his face)
    const P = C1.lerpVectors(jL.goal, jR.goal, frame ? 0.4 : 0.5)
    if (hold === 'promenade' && frame) {
      const ty = lead.chestYaw + 0.6, ly = lead.chestYaw
      P.copy(S1)
      P.x += Math.sin(ty) * 0.34 + Math.cos(ly) * 0.1; P.z += Math.cos(ty) * 0.34 - Math.sin(ly) * 0.1; P.y = S1.y + 0.05
    }
    const off = open ? 0.065 : 0.03
    const R1 = lb.upperArm + lb.foreArm + off - 0.01, R2 = fb.upperArm + fb.foreArm + off - 0.01
    // her underarm and spot turns: the joined hands rise into a halo over her head (his hand goes up as the turn
    // is cued, circles above her while she turns and comes down as she faces him again)
    const turnsUnder = hold === 'open' || hold === 'fan' || (hold === 'closed' && open) || fol.underarm
    const up = Dancer.turnUnder(lead, fol, turnsUnder)
    const snap = lead._snap || fol._snap
    // up as fast as her turn needs (a quick spin gets a quick hand), down gently
    const kUp = 1 - Math.exp(-(lead.dt || 0) * (9 + 1.2 * Math.min(10, Math.abs(fol.spin))))
    let raise = (lead._raise = snap ? up : lerp(lead._raise || 0, up, up > (lead._raise || 0) ? kUp : lead.kDown))
    if (raise > 0.01 || up > 0.01) {
      // over her head, a little toward him and to her right (where her right arm is comfortable), so the hand
      // traces a small circle as she turns under it; nearer him while he could not reach that high over her
      const H = fol.bH.getWorldPosition(C4), a = fol.root.rotation.y
      H.x += -Math.cos(a) * 0.055 + Math.sin(a) * 0.045; H.z += Math.sin(a) * 0.055 + Math.cos(a) * 0.045
      H.y += 0.3
      lead._archY = H.y
      const vy = H.y - S1.y, hMax = Math.sqrt(Math.max(0.0025, (R1 - 0.02) ** 2 - vy * vy))
      const hx = H.x - S1.x, hz = H.z - S1.z, hl = Math.hypot(hx, hz)
      if (hl > hMax) { H.x = S1.x + (hx * hMax) / hl; H.z = S1.z + (hz * hMax) / hl }
      // further apart than that (her arm cannot reach it either): the arch between them, as high as both reach
      if (H.distanceTo(S2) > R2 - 0.02) archTop(S1, S2, R1 - 0.02, R2 - 0.02, H)
      // on the way up the hands never drop first (from the closed frame's height into the open hold's)
      if (up > raise && !snap && lead._joinY != null && H.y > P.y + 0.05) raise = lead._raise = Math.max(raise, Math.min(up, (lead._joinY - P.y) / (H.y - P.y)))
      P.lerp(H, raise)
    }
    // still too far apart for both arms (a wide open hold or the end of an underarm turn): each dancer inclines
    // toward the joined hands on the next frames, on top of the shoulder blades reaching (solveArms)
    const short = S1.distanceTo(S2) - (R1 + R2) + 0.03
    // raised (an arch over her): he also reaches toward her when his arm alone cannot get the hands that high
    let shortUp = -1
    if (raise > 0.01) {
      const up2 = Math.max(0, lead._archY - 0.05 - (S1.y + S2.y) / 2), Rm = (R1 + R2) / 2
      shortUp = (Math.hypot(S2.x - S1.x, S2.z - S1.z) - 2 * Math.sqrt(Math.max(0, Rm * Rm - up2 * up2)) + 0.03) * raise
    }
    for (const [a, S] of [[lead, S1], [fol, S2]]) {
      a._leanT = open && hold !== 'finish' ? clamp(a._lean + Math.max(short, a === lead ? shortUp : -1), 0, 0.2) : 0
      a._leanDir = wrap(Math.atan2(P.x - S.x, P.z - S.z) - a.root.rotation.y)
    }
    // both arms must reach: pull the meeting point toward the line between the two shoulders if needed
    if (P.distanceTo(S1) > R1 || P.distanceTo(S2) > R2) {
      const Q = C5.lerpVectors(S1, S2, R1 / (R1 + R2))
      let lo = 0, hi = 1
      for (let it = 0; it < 8; it++) { const m = (lo + hi) / 2; C6.lerpVectors(P, Q, m); if (C6.distanceTo(S1) > R1 || C6.distanceTo(S2) > R2) lo = m; else hi = m }
      P.lerp(Q, hi)
    }
    lead._joinY = P.y
    // wrists either side of the meeting point (palm to palm in the frame, his palm under hers when open)
    const dir = C6.subVectors(S2, S1)
    dir.y = 0
    if (dir.lengthSq() < 1e-8) dir.set(Math.sin(lead.chestYaw), 0, Math.cos(lead.chestYaw))
    dir.normalize()
    jL.goal.copy(P).addScaledVector(dir, -off)
    jR.goal.copy(P).addScaledVector(dir, off)
    if (open) { jL.goal.y -= 0.015; jR.goal.y += 0.015 }
    if (raise > 0.01) {
      // raised arms: the elbows go out to the side and a little forward instead of down
      const ly = lead.chestYaw, fy = fol.chestYaw
      jL.pole.lerp(C5.set(Math.cos(ly) * 0.8 + Math.sin(ly) * 0.35, -0.35, -Math.sin(ly) * 0.8 + Math.cos(ly) * 0.35), raise)
      jR.pole.lerp(C5.set(-Math.cos(fy) * 0.8 + Math.sin(fy) * 0.35, -0.35, Math.sin(fy) * 0.8 + Math.cos(fy) * 0.35), raise)
    }
    jL.sticky = jR.sticky = true
    if (frame) {
      lead.arm.R.sticky = true
      lead.solveArms()
      // her left hand rests on his upper arm (on his shoulder in the relaxed social hold)
      const R = lead.arm.R, along = cat === 'soc' ? 0.12 : cat === 'lat' ? 0.3 : 0.38
      fol.arm.L.goal.lerpVectors(R.sh, R.el, along)
      fol.arm.L.goal.y += lb.limb.upper[0] + 0.022
      fol.arm.L.sticky = true
      fol.solveArms()
    } else { lead.solveArms(); fol.solveArms() }
    if ((cat !== 'std' || open) && hold !== 'finish') {
      for (const [a, o] of [[lead, fol], [fol, lead]]) {
        if (a.spotting) continue
        const dx = o.root.position.x - a.root.position.x, dz = o.root.position.z - a.root.position.z
        if (dx * dx + dz * dz < 1e-6) continue
        a.headGoal.y = clamp(wrap(Math.atan2(dx, dz) - a.chestYaw), -0.8, 0.8)
        a.headGoal.x = -0.03
      }
    }
    lead.applyHead(); fol.applyHead()
    // body contact, applied through the hips on the next frames: the Standard closed hold settles into light
    // contact (the lady's middle against the man's right front, upper bodies apart); in every other hold the
    // bodies only move apart if they would pass through each other. The heads always keep their distance.
    const { body, head } = clearance(lead, fol)
    const touch = cat === 'std' && frame && hold === 'closed'
    // (+ = room to come closer; judged as if neither pelvis had travelled to reach a long stance, so contact does not
    // chase those few frames; the room also limits how far either may travel toward the other)
    const err = Math.min(body - (touch ? 0.01 : 0.015), head - 0.05) + num(lead._tU) + num(fol._tU)
    for (const a of [lead, fol]) {
      a._cT = touch ? clamp(a._c + err / 2, -0.07, 0.05) : clamp(Math.min(0, a._c + err / 2), -0.08, 0)
      a._room = err
    }
    lead._pending = fol._pending = false
  }

  // Relaxed walk for exploring the building: heel strike, roll through, toe-off, arms swinging opposite.
  walk(x, z, yaw, phase, moving) {
    const f = { x: Math.sin(yaw), z: Math.cos(yaw) }, l = { x: Math.cos(yaw), z: -Math.sin(yaw) }
    const amp = moving ? 0.3 : 0, half = this.b.hipW * 1.05
    const sL = Math.sin(phase) * amp, cL = Math.cos(phase)
    const pitch = (s, c) => {
      if (!moving) return 0
      if (c > 0) return -0.375 * s + 0.125 // swing: toe-off -> heel lead
      return s > 0.6 ? -0.25 * (s - 0.6) / 0.4 : s < -0.3 ? 0.5 * (-0.3 - s) / 0.7 : 0
    }
    this.apply({
      x, z, yaw, rise: moving ? 0.008 * Math.cos(2 * phase) : 0, hold: 'none', speed: moving ? 1.4 : 0,
      weightL: moving ? clamp01(0.5 - cL * 0.9) : 0.5, armSwing: moving ? Math.sin(phase) * 0.14 : 0,
      L: { x: x + l.x * half + f.x * sL, z: z + l.z * half + f.z * sL, y: moving ? Math.max(0, cL) * 0.07 : 0, yaw, pitch: pitch(Math.sin(phase), cL) },
      R: { x: x - l.x * half - f.x * sL, z: z - l.z * half - f.z * sL, y: moving ? Math.max(0, -cL) * 0.07 : 0, yaw, pitch: pitch(-Math.sin(phase), -cL) },
    })
  }
}
