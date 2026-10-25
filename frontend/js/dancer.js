// The footwork engine: turns syllabus steps into smooth motion for a leader and a follower (pure math, no
// rendering; the bodies in body.js draw whatever pose this produces).
//   startFor(dance, floor)            where the couple stands before a routine on a FLOORS rectangle
//   buildTimeline(figs, dance, start) step states for both partners, steered to stay on start.floor
//                                     (line of dance: as written while it fits, each corner turned once,
//                                     to the left; slot; spot)
//   poseAt(tl, beat, dance)           smooth poses: body path and yaw are C1 through the steps, Standard
//                                     body flight with heel/toe leads, Latin weight arriving late (2-beat
//                                     steps land on their count and hold), swing bounce and kicks, rise and
//                                     fall and sway from the figures' charts, head spots in spins
//   restPose(dance, start, routine)   the standing couple, exactly frame 0 of the routine's run
//   partnerOf, targetFor, followerStep, floorKind, KEY_FOR_DIR, KEY_LABEL
// Both dancers step from their own standing foot, which never slides (it may swivel). She keeps her place in
// the hold by where her stepping foot lands and a little give in her body, and turns as her follow_turns say;
// where her steps cannot carry her round a turn, his landing goes round her and his body turns toward her (the
// leader keeps facing his partner), so in a closed or promenade hold she stays in front of him. Partners' shoes
// keep clear of each other (plan view), and her closes bring her feet together.
import * as THREE from 'three'

const OTHER = { L: 'R', R: 'L' }
const TAU = Math.PI * 2
const deg = (d) => THREE.MathUtils.degToRad(d || 0)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const clamp01 = (t) => clamp(t, 0, 1)
const ease = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const ramp = (p, a, b) => ease(clamp01((p - a) / Math.max(1e-6, b - a)))

// Frame (three.js, +y up): a dancer with yaw θ faces F = (sin θ, 0, cos θ) and their RIGHT is
// R = (-cos θ, 0, sin θ). Positive yaw is a left (counter-clockwise from above) turn.
const fwdOf = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) })
const rightOf = (yaw) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) })
// p moved ox metres to the dancer's right and oz metres forward
function local(p, yaw, ox, oz) {
  const f = fwdOf(yaw), r = rightOf(yaw)
  return { x: p.x + r.x * ox + f.x * oz, z: p.z + r.z * ox + f.z * oz }
}
// rotate a ground vector by a yaw angle (+ = left)
const spin = (v, a) => ({ x: v.x * Math.cos(a) + v.z * Math.sin(a), z: -v.x * Math.sin(a) + v.z * Math.cos(a) })

// ---------- footwork engine ----------
// Offsets of the stepping foot relative to the supporting foot, in the dancer's frame ([right, forward], metres).
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
    case 'close': return [foot === 'L' ? -0.14 : 0.14, 0] // feet together (a small gap between them)
    default: return null // replace / in place: foot stays
  }
}

// Where the moving foot lands, or null when it stays put. Steps are measured from the supporting foot;
// slips (slip_back / slip_fwd) move the foot about half a stride from its OWN spot.
function place(feet, foot, dir, yaw, s) {
  if (dir === 'slip_back' || dir === 'slip_fwd') return local(feet[foot], yaw, 0, (dir === 'slip_back' ? -0.5 : 0.5) * s)
  const off = offset(foot, dir, s)
  return off ? local(feet[OTHER[foot]], yaw, off[0], off[1]) : null
}

const MIRROR_DIR = {
  fwd: 'back', back: 'fwd', side_l: 'side_r', side_r: 'side_l', close: 'close', replace: 'replace',
  diag_fwd_r: 'diag_back_l', diag_fwd_l: 'diag_back_r', diag_back_r: 'diag_fwd_l', diag_back_l: 'diag_fwd_r',
  cross_fwd: 'cross_fwd', cross_back: 'cross_back', cross_behind: 'cross_behind', in_place: 'in_place',
  slip_back: 'slip_fwd', slip_fwd: 'slip_back',
}

export const KEY_FOR_DIR = {
  fwd: 'ArrowUp', cross_fwd: 'ArrowUp', diag_fwd_r: 'ArrowUp', diag_fwd_l: 'ArrowUp', slip_fwd: 'ArrowUp',
  back: 'ArrowDown', cross_back: 'ArrowDown', cross_behind: 'ArrowDown', diag_back_r: 'ArrowDown', diag_back_l: 'ArrowDown', slip_back: 'ArrowDown',
  side_l: 'ArrowLeft', side_r: 'ArrowRight', close: 'Space', replace: 'Space', in_place: 'Space',
}
export const KEY_LABEL = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: '␣' }

// Step classes used for foot articulation and floor steering.
const FWDISH = new Set(['fwd', 'diag_fwd_l', 'diag_fwd_r', 'cross_fwd', 'slip_fwd'])
const BACKISH = new Set(['back', 'diag_back_l', 'diag_back_r', 'cross_back', 'cross_behind', 'slip_back'])
const classOf = (dir) => (FWDISH.has(dir) ? 'fwd' : BACKISH.has(dir) ? 'back' : dir === 'side_l' || dir === 'side_r' ? 'side' : dir === 'close' ? 'close' : 'none')
// steps whose landing may be nudged a few centimetres to keep the couple on its floor
const DRIFTABLE = new Set(['fwd', 'back', 'side_l', 'side_r', 'diag_fwd_l', 'diag_fwd_r', 'diag_back_l', 'diag_back_r', 'cross_fwd', 'cross_back'])

// follow_steps: sparse { "<leader step index>": [foot, dir, ...] }; extra elements are ignored.
function followOverride(fig, idx) {
  const o = fig?.follow_steps?.[idx]
  return Array.isArray(o) && OTHER[o[0]] && KEY_FOR_DIR[o[1]] ? { foot: o[0], dir: o[1], ...(typeof o[2] === 'boolean' ? { weight: o[2] } : {}) } : null
}

// What the follower does on the same count. A figure's follow_steps entry for this step wins; otherwise she
// mirrors him: other foot, forward<->back, left<->right. Beats and counts always come from his step.
// Without the figure, a timeline step's own resolved .follow is used.
export function followerStep(step, fig) {
  if (fig) { const o = followOverride(fig, step.idx); if (o) return o }
  else if (step.follow) return { ...step.follow }
  return { foot: OTHER[step.foot], dir: MIRROR_DIR[step.dir] || step.dir }
}

// Where the follower stands in each hold, relative to the leader: gap = ahead of him, side = to his right,
// turn = her yaw beyond facing him (+ = turned to her left). Her body centre may sit off that spot by
// `room`: radially (along the line from his centre to the spot) between -inward and +outward, and
// sideways (tangentially) up to ±tan. Her own steps carry her; when they would leave that room, only her
// moving foot is adjusted (her standing foot never slides).
const HOLD = {
  closed: { gap: 0.58, side: 0.16, turn: 0, room: { inward: 0.06, outward: 0.08, tan: 0.08 } }, // no style given
  // promenade: a V opening about 90° (she faces his left), her left side against his right front
  promenade: { gap: 0.3, side: 0.26, turn: -Math.PI / 2, room: { inward: 0.04, outward: 0.06, tan: 0.1 } },
  // open and fan: about an arm's length apart (joined hands within reach)
  open: { gap: 0.9, side: 0, turn: 0, room: { inward: 0.15, outward: 0.2, tan: 0.3 } },
  fan: { gap: 0.4, side: -0.8, turn: Math.PI / 2, room: { inward: 0.15, outward: 0.2, tan: 0.3 } }, // on his left at right angles, facing across him
}
// Closed hold spacing per style (curriculum notes): Standard/Smooth hold is in light body contact, the body
// centres about 0.36 m apart with her offset to his right (her centre line by his right side); Latin,
// Rhythm and Social closed facing hold is a few inches apart (centres ~0.40 m) with no offset, and a rock
// may carry her a little further away but never into his body.
const CLOSED_BY_STYLE = {
  standard: { gap: 0.32, side: 0.17, room: { inward: 0.015, outward: 0.015, tan: 0.12 } },
  smooth: { gap: 0.32, side: 0.17, room: { inward: 0.015, outward: 0.015, tan: 0.12 } },
  latin: { gap: 0.4, side: 0.02, room: { inward: 0.035, outward: 0.25, tan: 0.12 } },
  rhythm: { gap: 0.4, side: 0.02, room: { inward: 0.035, outward: 0.25, tan: 0.12 } },
  social: { gap: 0.4, side: 0.03, room: { inward: 0.035, outward: 0.25, tan: 0.12 } },
}
const LOOSE = new Set(['latin', 'rhythm', 'social'])
const holdOf = (p, style) => {
  const h = HOLD[p] ?? HOLD.closed
  return (p === 'closed' || !HOLD[p]) && CLOSED_BY_STYLE[style] ? { ...h, ...CLOSED_BY_STYLE[style] } : h
}
const MAX_REACH = 1.12 // body centres never further apart than this (both arms' reach for the joined hands)
// how far (m per beat) her place moves toward a new hold's spot (out, in); the swing dances swing her out and in faster
const HOLD_SHIFT = 0.35, HOLD_SHIFT_IN = 0.6, HOLD_SHIFT_SWING = 0.6
// between two hold places { gap, side }: round him and in or out (polar), never cutting in toward him
function holdLerp(a, b, t) {
  const ra = Math.hypot(a.gap, a.side), rb = Math.hypot(b.gap, b.side), pa = Math.atan2(a.side, a.gap), pb = pa + wrap(Math.atan2(b.side, b.gap) - pa)
  const r = lerp(ra, rb, t), p = lerp(pa, pb, t)
  return { gap: r * Math.cos(p), side: r * Math.sin(p) }
}

// Her hold turn after moving from hold pa to pb: the nearest way round, except that out of the fan into
// open position she turns left under his arm (Hockey Stick).
function nextTurn(turnA, pa, pb) {
  let t = holdOf(pb).turn
  while (t - turnA > Math.PI) t -= 2 * Math.PI
  while (turnA - t > Math.PI) t += 2 * Math.PI
  if (pa === 'fan' && pb === 'open' && t < turnA) t += 2 * Math.PI
  return t
}

// Her body centre and yaw for a leader pose and hold { gap, side, turn }. mo = how far he has turned during
// side-by-side figures (see turnsOpposite): the hold stays where it was and she turns the other way.
function spotFor(lead, h, mo = 0) {
  const frame = lead.yaw - mo
  const f = fwdOf(frame), r = rightOf(frame)
  return { x: lead.x + f.x * h.gap + r.x * h.side, z: lead.z + f.z * h.gap + r.z * h.side, yaw: lead.yaw - 2 * mo + Math.PI + h.turn }
}

// Side-by-side Latin/Rhythm figures (New Yorker, Hand to Hand, Spot Turn, Crossover): he turns a quarter or
// more and ends facing where he started, while she turns the opposite way on her own spot, so they stand
// side by side (or spin apart) instead of her orbiting him. Decided by the data: his turns add up to whole
// turns, and on every step where he turns a quarter or more her follow_turns turn her the other way.
function turnsOpposite(fig) {
  const turns = fig.steps.map((st) => st[3] || 0), ft = fig.follow_turns
  if (!ft || typeof ft !== 'object' || Math.abs(turns.reduce((a, b) => a + b, 0) % 360) > 1e-6) return false
  const big = turns.map((v, k) => [v, k]).filter(([v]) => Math.abs(v) >= 90)
  return big.length > 0 && big.every(([v, k]) => Number.isFinite(+ft[k]) && Math.sign(+ft[k]) === -Math.sign(v))
}

// Her own body turn per step. A figure states it as follow_turns { "<leader step index>": degrees } (+ = right
// / clockwise, like the leader's turns): on such a step her body turns exactly that much (plus any floor
// steering curve, which turns the whole couple), whatever he does and whatever the hold would infer.
// Returns { index: radians (+ = left) } or null when the figure has no follow_turns (an empty {} is data too:
// she simply turns with him).
function followTurns(fig) {
  const ft = fig?.follow_turns
  if (!ft || typeof ft !== 'object' || Array.isArray(ft)) return null
  const n = fig.steps.length, out = {}
  for (const [k, v] of Object.entries(ft)) if (Number.isFinite(+v) && typeof v !== 'boolean' && +k >= 0 && +k < n && Number.isInteger(+k)) out[+k] = -deg(+v)
  return out
}
// Last resort for a figure WITHOUT follow_turns data: the named lady's turns of the Latin, Rhythm and Social
// dances (Underarm Turn, American Spin, Tuck Turn, Right Turn, ... with Turn) get one full turn over about two
// beats, on top of turning with him: to the right, unless the name says left or inside. A swing figure that
// opens with a rock or two walks (counts 1, 2) turns her after them. Per step (radians, + = left).
const SPIN_NAME = /underarm|american spin|tuck|right turn|left turn|with turn|free spin|lady'?s turn/i
// a figure whose cues say she turns under his arm: on the steps where she turns on her own, the joined hands go up over
// her head (pose.follow.underarm, for body.js)
const UNDERARM = /under (his|your|the|her) (arm|hand)|underarm|raised hand|over (her|your) head|inside turn|outside turn|alemana|american spin|tuck|right turn|left turn|whip/i
const NOT_SPIN = /lindy turn|spot turn|natural|reverse|rock turn|box|\((?:reverse|natural)\)/i
function followSpins(fig, style) {
  const n = fig.steps.length
  if (fig.follow_turns && typeof fig.follow_turns === 'object') return null // the data wins, even when empty
  const name = fig.name || ''
  if (!LOOSE.has(style) || !SPIN_NAME.test(name) || NOT_SPIN.test(name) || turnsOpposite(fig)) return null
  let k0 = 0
  if (n >= 6 && fig.steps[0][1] === 'back' && ['replace', 'fwd', 'cross_fwd', 'diag_fwd_r', 'diag_fwd_l'].includes(fig.steps[1][1])) k0 = 2
  const idx = []
  let sum = 0
  for (let k = k0; k < n && (sum < 2 || idx.length < 2); k++) { idx.push(k); sum += fig.steps[k][2] || 0 }
  if (!idx.length || sum <= 0) return null
  const sgn = /left|inside/i.test(name) ? 1 : -1
  return Object.fromEntries(idx.map((k) => [k, (sgn * TAU * (fig.steps[k][2] || 0)) / sum]))
}

// Face-to-face mirror: her feet copy his around her own centre by translation with L/R swapped
// (her R goes where his L goes), turned with her when the hold turns her away from facing him.
function mirrorFeet(lead, spot, turn = 0) {
  const tr = (f) => { const v = spin({ x: f.x - lead.x, z: f.z - lead.z }, turn); return { x: spot.x + v.x, z: spot.z + v.z } }
  return { L: tr(lead.R), R: tr(lead.L) }
}

// Hold in force after step si of a figure that began in hold p0. A figure can say when its hold changes:
// hold_at { "<step index>": position from that step on } (e.g. a swing-out closes on 3 and opens on 5).
function holdAfter(fig, si, p0) {
  const n = fig.steps.length
  const end = !fig.ends || fig.ends === 'same' ? p0 : fig.ends
  const ha = fig.hold_at
  if (ha && typeof ha === 'object' && !Array.isArray(ha) && Object.values(ha).some((v) => HOLD[v])) {
    if (si >= n - 1 && HOLD[end]) return end // the figure always ends in the hold the next one expects
    let p = p0
    for (let k = 0; k <= si; k++) if (HOLD[ha[k]]) p = ha[k]
    return p
  }
  if (end === p0) return p0
  let at
  if (p0 === 'promenade') { const t = fig.steps.findIndex((s) => s[1] === 'cross_fwd'); at = t >= 0 ? t + 1 : n - 1 } // faces him after the step through
  else if (p0 === 'fan') at = Math.ceil(n / 2) // walks across first, then turns under his arm
  else if (end === 'open') at = Math.floor((n - 1) / 2) // lets her go part-way through (not on count 1)
  else if (end === 'fan') at = 1
  else at = n - 1 // into promenade or closed: on the last step
  return si >= Math.min(at, n - 1) ? end : p0
}

// Feet carry { x, z, yaw (where the foot points), pt (1 = pointed, resting without weight) }.
const cloneFoot = (f) => ({ x: f.x, z: f.z, yaw: f.yaw, pt: f.pt || 0 })
const cloneSt = (s) => ({ ...s, L: cloneFoot(s.L), R: cloneFoot(s.R) })

// A free foot that has not stepped for a while is drawn round with the body (no twisted ankles).
function alignFeet(S) {
  for (const f of ['L', 'R']) S[f].yaw = S.yaw + clamp(wrap(S[f].yaw - S.yaw), -1.25, 1.25)
}

// Partners' feet never land on each other: a foot that just stepped within SEP of a partner's foot is moved
// sideways (along its dancer's left-right axis, so a close stays a close and a forward step stays forward)
// until they are SEP apart; hers first, since the hold is his frame. Only a foot that stepped is moved: a
// standing foot never slides.
const SEP = 0.085
// Shoes in plan view: heel-to-toe segments along the foot's yaw, centred on the foot point, with half-widths (body.js
// draws his 0.275 x 0.096 m, hers 0.235 x 0.08 m). Partners' shoes keep SHOE_GAP between their outlines.
const SHOE = { lead: { h: 0.1375, w: 0.048 }, fol: { h: 0.1175, w: 0.04 } }, SHOE_GAP = 0.012
// Closest points of two segments: { d, p (on A), q (on B) }; crossing segments have d = 0 and p = q = their centres.
function segClosest(A0, A1, B0, B1) {
  const near = (p, q0, q1) => {
    const vx = q1.x - q0.x, vz = q1.z - q0.z, L = vx * vx + vz * vz || 1e-12, t = clamp01(((p.x - q0.x) * vx + (p.z - q0.z) * vz) / L)
    return { x: q0.x + vx * t, z: q0.z + vz * t }
  }
  const cr = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  if (cr(A0, A1, B0) * cr(A0, A1, B1) < 0 && cr(B0, B1, A0) * cr(B0, B1, A1) < 0) {
    return { d: 0, p: { x: (A0.x + A1.x) / 2, z: (A0.z + A1.z) / 2 }, q: { x: (B0.x + B1.x) / 2, z: (B0.z + B1.z) / 2 } }
  }
  let best = null
  for (const [p, q] of [[A0, near(A0, B0, B1)], [A1, near(A1, B0, B1)], [near(B0, A0, A1), B0], [near(B1, A0, A1), B1]]) {
    const d = Math.hypot(p.x - q.x, p.z - q.z)
    if (!best || d < best.d) best = { d, p, q }
  }
  return best
}
const shoeSeg = (f, s) => { const v = fwdOf(f.yaw ?? 0); return [{ x: f.x - v.x * s.h, z: f.z - v.z * s.h }, { x: f.x + v.x * s.h, z: f.z + v.z * s.h }] }
// gap between his shoe on foot a and her shoe on foot b (negative = the outlines overlap), and the direction (unit,
// from her shoe toward his) that separates them fastest
function shoeSep(a, b) {
  const [A0, A1] = shoeSeg(a, SHOE.lead), [B0, B1] = shoeSeg(b, SHOE.fol), c = segClosest(A0, A1, B0, B1)
  let nx = c.p.x - c.q.x, nz = c.p.z - c.q.z, L = Math.hypot(nx, nz)
  if (L < 1e-6) { nx = a.x - b.x; nz = a.z - b.z; L = Math.hypot(nx, nz) || 1; if (L < 1e-6) { nx = 1; nz = 0; L = 1 } }
  return { gap: c.d - SHOE.lead.w - SHOE.fol.w, nx: nx / L, nz: nz / L }
}
const shoeGap = (a, b) => shoeSep(a, b).gap
const SHOE_REACH = SHOE.lead.h + SHOE.fol.h + SHOE.lead.w + SHOE.fol.w + SHOE_GAP // foot points further apart never clash
const clashes = (lead, fol, h, g) => { const d = Math.hypot(fol[g].x - lead[h].x, fol[g].z - lead[h].z); return d < SEP || (d < SHOE_REACH && shoeGap(lead[h], fol[g]) < SHOE_GAP) }

// Partners' feet never land on each other: where a foot that just stepped lands on (or within SEP of) a partner's
// foot, or its shoe would overlap the partner's shoe, it is moved the least way that clears both of the partner's
// shoes: sideways first (along its dancer's left-right axis, so a forward step stays forward: his foot goes between
// hers), else along the foot or straight away; hers first, since the hold is his frame, but a close of hers stays a
// close (feet together: his stepping foot gives way instead). A standing foot never slides: where it has swivelled
// onto the partner's shoe, it swivels less (its last yaw, prev, back toward it). Both moved and standing feet keep
// clear of the dancer's own other foot.
// How clearly the stepping foot f of feet S goes the way its step dir is written (metres: forward, back, left or right of
// the standing foot in the dancer's frame at S.yaw); Infinity for steps without a direction to keep (close, cross, slip).
function stepChar(S, f, dir) {
  if (!dir || dir.startsWith('slip')) return Infinity
  const o = S[OTHER[f]], vx = S[f].x - o.x, vz = S[f].z - o.z, F = fwdOf(S.yaw), R = rightOf(S.yaw)
  const vf = vx * F.x + vz * F.z, vr = vx * R.x + vz * R.z
  return FWDISH.has(dir) ? vf : BACKISH.has(dir) ? -vf : dir === 'side_l' ? -vr : dir === 'side_r' ? vr : Infinity
}

function separate(lead, fol, step, prevLead, prevFol) {
  // how clearly a stepping foot still goes the way its step is written (on a big turn of her own the turn decides where
  // her foot goes, as in fitHerStep)
  const charOf = (S, f, who) => {
    const dir = who === 'fol' ? (step.fmoves && step.follow.foot === f ? step.follow.dir : null) : step.moves && step.foot === f ? step.dir : null
    if (who === 'fol' && prevFol && Math.abs(S.yaw - prevFol.yaw) > 1) return Infinity
    return stepChar(S, f, dir)
  }
  const char0 = { lead: { L: charOf(lead, 'L', 'lead'), R: charOf(lead, 'R', 'lead') }, fol: { L: charOf(fol, 'L', 'fol'), R: charOf(fol, 'R', 'fol') } }
  const ownOk = (S, f, who) => {
    const o = S[OTHER[f]], d = Math.hypot(S[f].x - o.x, S[f].z - o.z)
    if (d < 0.07) return false
    // a forward step stays forward, a back step back, a side step to its side
    if (charOf(S, f, who) < Math.min(0.03, char0[who][f])) return false
    // a close stays a close (her feet together; his a small gap)
    const close = who === 'fol' ? step.fmoves && step.follow.foot === f && step.follow.dir === 'close' : step.moves && step.foot === f && step.dir === 'close'
    return !close || d <= (who === 'fol' ? 0.12 : 0.2)
  }
  const tryMove = (S, f, who, other, oth) => {
    const ft = S[f], r = rightOf(S.yaw), v = fwdOf(ft.yaw ?? S.yaw), x0 = ft.x, z0 = ft.z
    const q = other[oth], lat = (ft.x - q.x) * r.x + (ft.z - q.z) * r.z, sg = lat >= 0 ? 1 : -1
    const s2 = who === 'lead' ? shoeSep(ft, q) : shoeSep(q, ft), away = who === 'lead' ? { x: s2.nx, z: s2.nz } : { x: -s2.nx, z: -s2.nz }
    const lr = { x: r.x * sg, z: r.z * sg }, d1 = (a, b, c) => { const L = Math.hypot(a.x * b + v.x * c, a.z * b + v.z * c) || 1; return { x: (a.x * b + v.x * c) / L, z: (a.z * b + v.z * c) / L } }
    const dirs = [[lr, 1], [{ x: -lr.x, z: -lr.z }, 1.3], [away, 1.1], [v, 1.6], [{ x: -v.x, z: -v.z }, 1.6], [d1(lr, 1, 1), 1.3], [d1(lr, 1, -1), 1.3], [d1(lr, -1, 1), 1.6], [d1(lr, -1, -1), 1.6]]
    const okAt = (d, k) => {
      ft.x = x0 + d.x * k; ft.z = z0 + d.z * k
      let ok = ownOk(S, f, who)
      for (const g of ['L', 'R']) if (ok && (who === 'lead' ? clashes(S, other, f, g) : clashes(other, S, g, f))) ok = false
      return ok
    }
    let best = null
    for (const [d, w] of dirs) {
      // the least move along d (centimetre steps, then halved down to a few millimetres), no further than the best so far
      for (let k = 0.01; k <= 0.25 + 1e-9 && (!best || k * w < best.c + 0.01); k += 0.01) {
        if (!okAt(d, k)) continue
        let lo = k - 0.01, hi = k
        for (let it = 0; it < 2; it++) { const m = (lo + hi) / 2; if (m > 0 && okAt(d, m)) hi = m; else lo = m }
        if (!best || hi * w < best.c) best = { c: hi * w, x: x0 + d.x * hi, z: z0 + d.z * hi }
        break
      }
      ft.x = x0; ft.z = z0
    }
    if (best) { ft.x = best.x; ft.z = best.z; return true }
    return false
  }
  const unswivel = (S, f, P, who, other) => {
    if (!P) return false
    const ft = S[f], y1 = ft.yaw, y0 = P[f].yaw ?? y1, dy = wrap(y1 - y0)
    if (Math.abs(dy) < 1e-3 || Math.hypot(ft.x - P[f].x, ft.z - P[f].z) > 1e-6) return false
    const clear = () => ['L', 'R'].every((g) => !(who === 'lead' ? clashes(S, other, f, g) : clashes(other, S, g, f)))
    for (let t = 0.9; t >= -1e-9; t -= 0.1) { ft.yaw = y0 + dy * t; if (clear()) return true }
    ft.yaw = y1
    return false
  }
  for (let pass = 0; pass < 3; pass++) {
    let clear = true
    for (const h of ['L', 'R']) for (const g of ['L', 'R']) {
      if (!clashes(lead, fol, h, g)) continue
      clear = false
      const herMoved = step.fmoves && step.follow.foot === g, hisMoved = step.moves && step.foot === h
      const herClose = herMoved && step.follow.dir === 'close'
      const order = herMoved && !(hisMoved && herClose) ? [['fol', g, h], ['lead', h, g]] : [['lead', h, g], ['fol', g, h]]
      let done = false
      for (const [who, f, oth] of order) {
        if (done) break
        const moved = who === 'fol' ? herMoved : hisMoved
        if (moved) done = tryMove(who === 'fol' ? fol : lead, f, who, who === 'fol' ? lead : fol, oth)
      }
      if (!done) done = unswivel(fol, g, prevFol, 'fol', lead) || unswivel(lead, h, prevLead, 'lead', fol)
    }
    if (clear) break
  }
}

// How an extra steering rotation is spread over a figure: over its first steps (about three beats, at least
// two steps), in proportion to their beats, so a corner reads as a gentle curve, not a pivot.
// A bigger curve takes more steps: no step carries more than about 50° of it.
const MAX_STEER_STEP = 0.87, STILL_DIRS = new Set(['close', 'replace', 'in_place'])
function spreadRotation(fig, rot) {
  const st = fig.steps, n = st.length
  const total = st.reduce((a, s) => a + (s[2] || 0), 0)
  const want = Math.min(3, total * 0.6)
  const minSteps = Math.min(n, Math.max(2, Math.ceil(Math.abs(rot) / MAX_STEER_STEP)))
  const w = new Array(n).fill(0)
  let sum = 0, k = 0
  // (a close or a weight change in place carries little of it: the couple curves on its travelling steps)
  while (k < n && (sum < want || k < minSteps)) { w[k] = Math.max(0.25, st[k][2] || 0) * (STILL_DIRS.has(st[k][1]) ? 0.15 : 1); sum += w[k]; k++ }
  // even out so that no step takes more than its fair share of a large curve
  const cap = Math.max(MAX_STEER_STEP / Math.max(1e-6, Math.abs(rot)), 1 / k)
  const top = cap * sum
  for (let pass = 0; pass < 8; pass++) {
    let over = 0
    for (let j = 0; j < k; j++) if (w[j] > top) { over += w[j] - top; w[j] = top }
    const room = []
    for (let j = 0; j < k; j++) if (w[j] < top - 1e-12) room.push(j)
    if (over <= 1e-12 || !room.length) break
    // (by weight, and evenly in the later passes, so the cap holds even beside a close)
    const fw = room.reduce((a, j) => a + w[j], 0)
    for (const j of room) w[j] += (pass < 3 && fw > 0 ? w[j] / fw : 1 / room.length) * over
  }
  const s2 = w.reduce((a, b) => a + b, 0) || 1
  return w.map((v) => v / s2)
}
// A drift (metres) spread evenly over the figure's travelling steps, at most 30% of a stride per step (45% in
// a slot dance, whose anchors and passes have few travelling steps), so every step still goes the way it is
// written.
function spreadDrift(fig, total, s, k = 0.3) {
  const J = []
  fig.steps.forEach((st, j) => { if (DRIFTABLE.has(st[1])) J.push(j) })
  if (!J.length) return null
  let dx = total.x / J.length, dz = total.z / J.length
  const L = Math.hypot(dx, dz), cap = k * s
  if (L > cap) { dx *= cap / L; dz *= cap / L }
  return Object.fromEntries(J.map((k) => [k, { x: dx, z: dz }]))
}

// ---------- technique charts (figures.json strings, written for the leader) ----------
// Numbers in a chart ("2-3", "2-&-3", "end of 4") name steps by count label when the figure's labels are
// unique, otherwise by position (1 = first step).
function chartIndex(fig) {
  const labels = fig.steps.map((s) => String(s[4] ?? ''))
  const unique = new Set(labels).size === labels.length
  return (num) => {
    if (unique) { const k = labels.indexOf(String(num)); if (k >= 0) return k }
    return num >= 1 && num <= fig.steps.length ? num - 1 : -1
  }
}
// Step indices named by a phrase: "2-3", "2-&-3", "5", "1 and 4", "1, 4 and 5", "the quicks", "the first
// quick", "the last two steps", "2-3 of the corte" (counted from the figure's first back step).
function chartSteps(fig, phrase, idx = chartIndex(fig)) {
  const n = fig.steps.length
  if (/\bquicks?\b/i.test(phrase)) {
    const qs = fig.steps.map((s, k) => (String(s[4]).toUpperCase() === 'Q' ? k : -1)).filter((k) => k >= 0)
    if (/first quick/i.test(phrase)) return qs.slice(0, 1)
    if (/second quick/i.test(phrase)) return qs.slice(1, 2)
    if (/last quick/i.test(phrase)) return qs.slice(-1)
    return qs
  }
  if (/last two/i.test(phrase)) return [n - 2, n - 1].filter((k) => k >= 0)
  let at = idx
  if (/\bof the corte\b/i.test(phrase)) {
    const c0 = fig.steps.findIndex((s, k) => k > 0 && s[1] === 'back')
    if (c0 < 0) return []
    at = (num) => (c0 + num - 1 < n ? c0 + num - 1 : -1)
  } else if (/\bof the\b/i.test(phrase)) return []
  const out = []
  for (const r of phrase.matchAll(/(\d+)(?:\s*-\s*(?:&\s*-\s*)?(\d+))?/g)) {
    const a = at(+r[1]), b = r[2] ? at(+r[2]) : a
    if (a < 0 || b < 0) continue
    for (let k = Math.min(a, b); k <= Math.max(a, b); k++) out.push(k)
  }
  return out
}
// Sway per step: +1 right, -1 left, 0 none; null when the figure has no sway chart.
function swayChart(fig) {
  const txt = typeof fig?.sway === 'string' ? fig.sway.trim() : ''
  if (!txt) return null
  const out = new Array(fig.steps.length).fill(0)
  if (!/\b(left|right)\b/i.test(txt)) return /^(none|level|no sway|nil)\b/i.test(txt) ? out : null
  const idx = chartIndex(fig)
  for (const part of txt.split(/[,;]/)) {
    const m = /\b(left|right)\b\s+on\s+(.*)/i.exec(part)
    if (!m) continue
    const sgn = m[1].toLowerCase() === 'right' ? 1 : -1
    for (const k of chartSteps(fig, m[2], idx)) out[k] = sgn
  }
  return out
}
// CBM (body turn toward the moving leg) and CBMP (foot placed across the body) per step; null without a chart.
function cbmChart(fig) {
  const txt = typeof fig?.cbm === 'string' ? fig.cbm : ''
  if (!/\bon\b/i.test(txt)) return null
  const n = fig.steps.length, cbm = new Array(n).fill(false), cbmp = new Array(n).fill(false)
  const idx = chartIndex(fig)
  for (const part of txt.split(/;|,(?=\s*(?:slight\s+)?(?:on|cbmp)\b)/i)) {
    const m = /\bon\s+(.*)/i.exec(part)
    if (!m) continue
    const into = /cbmp/i.test(part) ? cbmp : cbm
    for (const k of chartSteps(fig, m[1].replace(/the first corte step/i, ''), idx)) into[k] = true
    if (/first corte step/i.test(m[1])) { const k = fig.steps.findIndex((s, j) => j > 0 && s[1] === 'back'); if (k >= 0) into[k] = true }
  }
  return { cbm, cbmp }
}
// Rise at the END of each step (1 = up, 0 = down, between = a slight rise); undefined where the charts say
// nothing. Footwork first (a step that ends on the toe ends up; one that ends on the heel ends down; a heel
// step before a side or close step on the toe rises at its end: body rise without foot rise), then the
// rise_fall text ("rise end of 4", "up 2-3", "lower end of 6", "no rise on 4-6", "normal rise on 1-3", ...).
const fwCode = (s) => String(s || '').toUpperCase().replace(/INSIDE EDGE( OF (TOE|BALL|FOOT))?|IE OF BALL|FLAT|WHOLE FOOT|\(.*?\)|[^HT]/g, '')
function riseChart(fig) {
  const n = fig.steps.length, out = new Array(n).fill(undefined)
  const fw = Array.isArray(fig.footwork) ? fig.footwork : []
  for (let k = 0; k < n; k++) {
    const c = fwCode(fw[k])
    if (!c) continue
    const nc = fwCode(fw[k + 1]), nd = classOf(fig.steps[k + 1]?.[1])
    out[k] = /T$/.test(c) || (k + 1 < n && /^T/.test(nc) && (nd === 'side' || nd === 'close')) ? 1 : 0
  }
  const txt = typeof fig.rise_fall === 'string' ? fig.rise_fall.trim() : ''
  if (/^(none|no rise|nil)\.?$/i.test(txt)) return out.fill(0)
  const idx = chartIndex(fig)
  for (const part of txt.split(/[;,]/)) {
    let m
    if ((m = /no rise on (.*)/i.exec(part))) { for (const k of chartSteps(fig, m[1], idx)) out[k] = 0; continue }
    if ((m = /normal rise on (\d+)\s*-\s*(\d+)/i.exec(part))) {
      const ks = chartSteps(fig, `${m[1]}-${m[2]}`, idx)
      ks.forEach((k, j) => { out[k] = j < ks.length - 1 ? 1 : 0 })
      continue
    }
    if ((m = /slight rise between (\d+) and (\d+)/i.exec(part))) { const k = idx(+m[1]); if (k >= 0) out[k] = 0.4; continue }
    if ((m = /\brise (?:again )?(?:at )?end of (.*)/i.exec(part))) for (const k of chartSteps(fig, m[1].replace(/\(.*?\)/g, ''), idx)) out[k] = 1
    if ((m = /\b(?:up|rising|stay up)\s+(?:on |through )?(.*)/i.exec(part))) {
      const ks = chartSteps(fig, m[1], idx)
      ks.slice(0, -1).forEach((k) => { out[k] = 1 })
    }
    if ((m = /\blower (?:at )?end of (.*)/i.exec(part))) { const ks = chartSteps(fig, m[1], idx); if (ks.length) out[ks[ks.length - 1]] = 0 }
  }
  return out
}
const CHARTS = new WeakMap()
function chartsOf(fig) {
  let c = CHARTS.get(fig)
  if (!c) { c = { sway: swayChart(fig), cbm: cbmChart(fig), rise: riseChart(fig), turns: followTurns(fig) }; CHARTS.set(fig, c) }
  return c
}

// The couple standing ready. The weight starts on the foot that does not step first: his free foot is the
// first step's foot, hers the foot of her first step (the mirror, or her own follow_steps entry).
function initCtx(dance, start, fig0) {
  const yaw0 = start.yaw ?? 0
  const pos0 = HOLD[start.position] ? start.position : 'closed'
  const s0 = fig0?.steps?.[0]
  const hisFree = s0 && OTHER[s0[0]] ? s0[0] : 'L'
  const herFree = s0 && OTHER[s0[0]] ? followerStep({ idx: 0, foot: s0[0], dir: s0[1] }, fig0).foot : 'R'
  const st = {
    x: start.x, z: start.z, yaw: yaw0, weight: OTHER[hisFree], position: pos0,
    L: { ...local(start, yaw0, -0.1, 0), yaw: yaw0, pt: 0 }, R: { ...local(start, yaw0, 0.1, 0), yaw: yaw0, pt: 0 },
  }
  const h0 = holdOf(pos0, dance.style), spot0 = spotFor(st, h0)
  const feet = mirrorFeet(st, spot0, h0.turn)
  const fs = {
    x: spot0.x, z: spot0.z, yaw: spot0.yaw, turn: h0.turn, mo: 0, spun: 0, weight: OTHER[herFree], dx: 0, dz: 0, lag: 0, dr: 0, hg: { gap: h0.gap, side: h0.side },
    L: { ...feet.L, yaw: spot0.yaw, pt: 0 }, R: { ...feet.R, yaw: spot0.yaw, pt: 0 },
  }
  // her feet stand clear of his shoes (in a Standard hold his right foot goes between hers): a foot of hers on his shoe
  // stands the least way further out to her side
  const rr = rightOf(fs.yaw)
  for (const g of ['L', 'R']) {
    const clear = () => ['L', 'R'].every((h) => !clashes(st, fs, h, g))
    if (clear()) continue
    const x0 = fs[g].x, z0 = fs[g].z
    let done = false
    for (let k = 0.005; k <= 0.1 + 1e-9 && !done; k += 0.005) for (const sg of [1, -1]) {
      fs[g].x = x0 + rr.x * k * sg; fs[g].z = z0 + rr.z * k * sg
      if (clear() && Math.hypot(fs[g].x - fs[OTHER[g]].x, fs[g].z - fs[OTHER[g]].z) >= 0.12) { done = true; break }
    }
    if (!done) { fs[g].x = x0; fs[g].z = z0 }
  }
  return { st, fs, beat: 0 }
}

// Her body centre (70% over the weighted foot) for feet F with weight on w.
const centreOn = (F, w) => ({ x: F[w].x * 0.7 + F[OTHER[w]].x * 0.3, z: F[w].z * 0.7 + F[OTHER[w]].z * 0.3 })

// Her body may sit a little off the point over her feet (weight held back or toward him, a slight lean) to
// stay in the hold's room: never more than BODY_SLACK in all, or BODY_SLACK_IN straight away from him when
// that is what keeps the two bodies apart.
const BODY_SLACK = 0.12, BODY_SLACK_IN = 0.3
// Her body for feet whose centre is c: c itself, eased (by at most BODY_SLACK) into the hold's room round her
// spot (radially between -inward and +outward, round him within ±tan, never beyond MAX_REACH).
function settleBody(c, lead, spot, h, pull = 1) {
  const sv = { x: spot.x - lead.x, z: spot.z - lead.z }, D = Math.max(1e-6, Math.hypot(sv.x, sv.z))
  const cv = { x: c.x - lead.x, z: c.z - lead.z }, r0 = Math.hypot(cv.x, cv.z)
  if (r0 < 1e-6) return { x: spot.x, z: spot.z }
  const room = h.room, lag0 = wrap(ang(cv) - ang(sv))
  // first in or out (never through him, never beyond reach), then round toward the spot with what is left
  const r = Math.min(MAX_REACH, D + clamp((r0 - D) * pull, -room.inward, room.outward))
  const dr = clamp(r - r0, r0 > MAX_REACH ? -BODY_SLACK_IN : -BODY_SLACK, r0 < D - room.inward ? BODY_SLACK_IN : BODY_SLACK)
  // round him along the arc (a chord would cut in toward him)
  const lag = clamp(lag0 * pull, -room.tan / D, room.tan / D), rb = r0 + dr, left = Math.max(0, BODY_SLACK - Math.abs(dr))
  const ph = ang(sv) + lag0 + clamp(lag - lag0, -left / rb, left / rb)
  return { x: lead.x + Math.sin(ph) * rb, z: lead.z + Math.cos(ph) * rb }
}

// The point nearest to c within the hold's room round the spot, the room scaled by `fit` (round him on an arc first,
// then in or out; never beyond MAX_REACH). On a pivot (the hold turning more than ~115° on one step) she goes round
// the way the hold turns.
const ang = (v) => Math.atan2(v.x, v.z) // yaw of a ground vector
function holdTarget(c, lead, spot, room, fit = 1, dF = 0) {
  const sv = { x: spot.x - lead.x, z: spot.z - lead.z }, D = Math.max(1e-6, Math.hypot(sv.x, sv.z))
  const cv = { x: c.x - lead.x, z: c.z - lead.z }, r0 = Math.hypot(cv.x, cv.z), phS = ang(sv)
  if (r0 < 1e-6) return { x: spot.x, z: spot.z }
  let dph = wrap(phS - ang(cv))
  if (Math.abs(dF) > 2 && dph * dF < 0) dph += Math.sign(dF) * TAU
  const lag = clamp(-dph, (-fit * room.tan) / D, (fit * room.tan) / D)
  const r = clamp(r0, D - fit * room.inward, Math.min(MAX_REACH, D + fit * room.outward)), ph = phS + lag
  return { x: lead.x + Math.sin(ph) * r, z: lead.z + Math.cos(ph) * r }
}

// The part of the hold's room the step solve aims for (her body then sits within about a tenth of a turn of her
// place round him; the rest of the room is the give in her body), and her closing steps: feet together.
const HOLD_FIT = 0.5, END_FIT = 0.4
const HER_CLOSE = 0.11, HER_CLOSE_MIN = 0.08, HER_CLOSE_MAX = 0.115, HER_CLOSE_FWD = 0.02, HER_SIDE_MAX = 0.6

// Where her stepping foot lands. P0 = her step as written, from her own standing foot (or null for a step in
// place). If that would leave her body outside the hold's room round her spot (scaled by fit), the stepping foot
// (only) is moved: her body goes round him on an arc toward the spot (the way the hold turned, dF), never through
// him, as far as one step of reasonable length can carry it; the step stays what
// it is (a forward step stays forward, a side step goes the same side, a close stays a close: feet together), and
// her legs do not cross. Whatever is left is taken up by her partner's step (see runFigure), her body (BODY_SLACK)
// and her next steps.
function fitHerStep(feet, ff, fw, P0, yaw, spot, lead, h, s, dF, dYaw, dir, fit = 1) {
  const P = P0 || { x: feet[ff].x, z: feet[ff].z }
  const c = centreOn({ ...feet, [ff]: P }, fw)
  const sv = { x: spot.x - lead.x, z: spot.z - lead.z }, D = Math.max(1e-6, Math.hypot(sv.x, sv.z))
  const cv = { x: c.x - lead.x, z: c.z - lead.z }, r0 = Math.hypot(cv.x, cv.z)
  const phS = ang(sv)
  let dph = r0 > 1e-6 ? wrap(phS - ang(cv)) : 0 // her angle round him -> the spot's
  if (Math.abs(dF) > 2 && dph * dF < 0) dph += Math.sign(dF) * TAU // a pivot: go round the way the hold turns
  const room = h.room
  const lag0 = -dph, lagT = clamp(lag0, (-fit * room.tan) / D, (fit * room.tan) / D)
  const rT = Math.min(MAX_REACH, D + clamp(r0 - D, -fit * room.inward, fit * room.outward))
  const at = (l) => { const ph = phS + lerp(lag0, lagT, l), r = lerp(r0, rT, Math.min(1, 3 * l)); return { x: lead.x + Math.sin(ph) * r, z: lead.z + Math.cos(ph) * r } } // in or out first, then round
  const k = fw === ff ? 0.7 : 0.3 // how far her centre moves per metre of the stepping foot
  const o = feet[OTHER[ff]], f = fwdOf(yaw), r = rightOf(yaw)
  const v0 = { x: P.x - o.x, z: P.z - o.z }, v0f = v0.x * f.x + v0.z * f.z, v0r = v0.x * r.x + v0.z * r.z
  const isClose = dir === 'close' && !!P0
  const closeLike = isClose || (!!P0 && Math.abs(v0f) < 0.06 && Math.abs(v0r) < 0.22)
  // on a big turn of her own (over ~60°) the couple's turn decides where her foot goes, not its direction
  const turning = Math.abs(dF) > 0.05, bigTurn = Math.abs(dYaw) > 1
  const rMin = D - room.inward - BODY_SLACK_IN * 0.8, rMax = Math.min(MAX_REACH, D + room.outward) + BODY_SLACK * 0.8
  // her foot for a body target q, kept to the character of the step; when that would take her body into him
  // (or out of his reach), the step is kept only loosely: a little forward is still forward and the step is shorter
  const footFor = (q, strict = true) => {
    const mx = (q.x - c.x) / k, mz = (q.z - c.z) / k
    let vf = v0f + mx * f.x + mz * f.z, vr = v0r + mx * r.x + mz * r.z
    const mf = strict ? 0.05 : 0.01, mr = strict ? 0.12 : 0.04
    if (isClose) { // feet together, whatever the turn: beside the standing foot, a narrow gap between them
      const sg = Math.sign(v0r) || (ff === 'L' ? -1 : 1)
      vr = sg * clamp(sg * vr, HER_CLOSE_MIN, HER_CLOSE_MAX); vf = clamp(vf, -HER_CLOSE_FWD, HER_CLOSE_FWD)
    } else if (closeLike && !bigTurn) { if (strict) vf = v0f } // a closing step stays beside the other foot
    else if (!bigTurn) {
      if (Math.abs(v0f) >= 0.08) {
        const lim = v0f > 0 ? Math.min(mf, 0.5 * v0f) : Math.max(-mf, 0.5 * v0f)
        if (v0f > 0 ? vf < lim : vf > lim) { vf = lim; if (!strict && Math.abs(v0r) < 0.3) vr = clamp(vr, -0.12, 0.12) } // squeezed: a short step, feet nearer together
      }
      if (Math.abs(v0r) >= 0.3) vr = v0r > 0 ? Math.max(vr, Math.min(mr, 0.5 * v0r)) : Math.min(vr, Math.max(-mr, 0.5 * v0r))
    }
    // no crossed legs, unless they already are (after a spin); a forward or back step turning with the hold may come
    // in line or a little across (walking round a circle)
    if (!isClose) {
      const tuck = turning && Math.abs(v0f) >= 0.08 && !closeLike ? (Math.abs(dF) > 0.3 ? 0.1 : 0.04) : -0.06
      if (ff === 'L' && v0r <= -0.06) vr = Math.min(vr, tuck)
      if (ff === 'R' && v0r >= 0.06) vr = Math.max(vr, -tuck)
    }
    const Q = { x: o.x + f.x * vf + r.x * vr, z: o.z + f.z * vf + r.z * vr }
    if (strict && !isClose) {
      const cc = centreOn({ ...feet, [ff]: Q }, fw), rq = Math.hypot(cc.x - lead.x, cc.z - lead.z)
      if (rq < rMin || rq > rMax) return footFor(q, false)
    }
    return Q
  }
  // a step of reasonable length (a side step at most HER_SIDE_MAX, a little more on the outside of a quick turn; the
  // partner's step takes what hers cannot); a step without weight cannot carry the body far
  const side = dir === 'side_l' || dir === 'side_r', L0 = Math.hypot(v0.x, v0.z)
  const maxLen = side ? Math.max(HER_SIDE_MAX + 0.08 * clamp01(Math.abs(dF) - 0.5), L0) : Math.max(0.3 + s, L0)
  const okFoot = (Q) => (fw === ff ? Math.hypot(Q.x - o.x, Q.z - o.z) <= maxLen + 1e-9 : Math.hypot(Q.x - P.x, Q.z - P.z) <= 0.15)
  let Q = footFor(at(1))
  if (!okFoot(Q)) {
    let lo = 0, hi = 1
    for (let it = 0; it < 20; it++) { const m = (lo + hi) / 2; if (okFoot(footFor(at(m)))) lo = m; else hi = m }
    Q = footFor(at(lo))
  }
  return Math.hypot(Q.x - P.x, Q.z - P.z) < 1e-4 ? P0 : Q
}

// His stepping foot moved by d off its written landing P0 (a step measured from his foot O, in his frame at yaw), kept
// to the character of the step: a forward (back) step stays forward (back), a side step goes the same side, his legs
// do not cross, a close stays a close; the landing moves at most `dev`, and the step stays a reasonable length.
function shapeLeadStep(O, P0, d, yaw, foot, dir, dev, s, turning = false) {
  let dx = d.x, dz = d.z
  const L = Math.hypot(dx, dz)
  if (L > dev) { dx *= dev / L; dz *= dev / L }
  const f = fwdOf(yaw), r = rightOf(yaw)
  const v0x = P0.x - O.x, v0z = P0.z - O.z, v0f = v0x * f.x + v0z * f.z, v0r = v0x * r.x + v0z * r.z
  let vf = v0f + dx * f.x + dz * f.z, vr = v0r + dx * r.x + dz * r.z
  const out = foot === 'L' ? -1 : 1 // the side of his standing foot this foot belongs on
  if (dir === 'close') { vr = out * clamp(out * vr, 0.1, 0.18); vf = clamp(vf, -0.05, 0.05) }
  else {
    // still the way it is written: forward (back) by at least a little, to the same side
    // (on a step where the hold turns fast, a walk round the circle: forward or back by only a little)
    const fs = FWDISH.has(dir) ? 1 : BACKISH.has(dir) ? -1 : 0, rs = dir === 'side_r' || dir.endsWith('_r') ? 1 : dir === 'side_l' || dir.endsWith('_l') ? -1 : 0
    if (fs) vf = fs * Math.max(fs * vf, turning === 'fast' ? 0.03 : clamp(0.5 * fs * v0f, 0.03, 0.1))
    if (rs) vr = rs * Math.max(rs * vr, clamp(0.5 * rs * v0r, 0.03, 0.14))
    // legs not crossed (a forward or back step turning with the hold may come a little across: walking round a circle)
    if (dir !== 'cross_fwd' && dir !== 'cross_back' && out * v0r >= 0.06) vr = out * Math.max(out * vr, turning && fs ? -0.1 : 0.04)
  }
  const maxLen = Math.max(Math.hypot(v0f, v0r), 0.3 + s) + 0.15, len = Math.hypot(vf, vr)
  if (len > maxLen) { vf *= maxLen / len; vr *= maxLen / len }
  return { x: O.x + f.x * vf + r.x * vr, z: O.z + f.z * vf + r.z * vr }
}
// how far his landing may move to keep her in the hold: a travelling step most, a close a little
const LEAD_DEV = 0.3, LEAD_DEV_FAST = 0.15, LEAD_DEV_CLOSE = 0.04, LEAD_DEV_IN_PLACE = 0.25, LEAD_DEV_SPEED = 0.35 // m, m/s
// Latin, Rhythm and Social holds turn round the point between the partners (PIVOT_MID); two steps toward each other close
// in at most to the hold's spacing (+ APPROACH_SLACK), each kept to at least APPROACH_MIN of its length and his landing
// APPROACH_FOOT clear of her standing foot; her landing never leaves her body more than BODY_NEAR inside the hold's room
// (moved out at most BODY_NEAR_MAX)
const PIVOT_MID = true, APPROACH_SLACK = 0.03, APPROACH_MIN = 0.3, APPROACH_FOOT = 0.25, BODY_NEAR = 0.02, BODY_NEAR_MAX = 0.3
// how far round him (radians) her feet may leave her on a step before his body turns less on it (DEFER_AT), and how much
// less at most (DEFER_MAX of the step's turn); how far round him from her place her body may be after a step before he
// turns toward her: in a closed or promenade hold, in an open hold, and at the end of a figure
const DEFER_AT = 0.2, DEFER_MAX = 0.6, HOLD_LAG_MAX = deg(20), OPEN_LAG_MAX = deg(45), OPEN_END_LAG = deg(10)
// turn carried over: made at most CARRY_RATE per beat, and at most MAX_CARRY carried on
const CARRY_RATE = deg(30), MAX_CARRY = deg(90)

// His body's turn per step (radians, + = left). On a step where neither partner travels (both close or replace, in a
// closed or promenade hold) the couple can turn only a little round each other (PIVOT_TURN; her body gives the
// rest): the remainder of that step's turn is made on the travelling steps beside it in the figure (half on the step
// before, half on the step after, none taking more than PLAN_MAX_TURN in all), so the couple turns where their feet
// can carry it round each other. What is left on a figure's last step is carried on by the body turning less (see
// runFigure). The figure's whole turn is as written.
const PIVOT_TURN = deg(15), PLAN_MAX_TURN = deg(90), PIVOT_DIRS = new Set(['close', 'replace'])
const PLANS = new WeakMap()
function turnPlan(fig, p0, opp) {
  const key = `${p0}|${opp}`
  let c = PLANS.get(fig)
  if (c?.[key]) return c[key]
  const n = fig.steps.length, t = fig.steps.map((st) => -deg(st[3]))
  const pivot = fig.steps.map((st, k) => {
    const pos = holdAfter(fig, k, p0)
    return !opp && (pos === 'closed' || pos === 'promenade') && PIVOT_DIRS.has(st[1]) && PIVOT_DIRS.has(followerStep({ idx: k, foot: st[0], dir: st[1] }, fig).dir)
  })
  for (let k = 0; k < n; k++) {
    if (!pivot[k] || Math.abs(t[k]) <= PIVOT_TURN) continue
    let a = k - 1, b = k + 1
    while (a >= 0 && pivot[a]) a--
    while (b < n && pivot[b]) b++
    if (b >= n) continue // the last step: carried into the next figure instead
    const sg = Math.sign(t[k]), ex = t[k] - sg * PIVOT_TURN
    const room = (j) => (j >= 0 && j < n ? Math.max(0, PLAN_MAX_TURN - Math.max(0, sg * t[j])) : 0)
    const ea = a >= 0 ? Math.min(room(a), ex * sg / 2 + Math.max(0, ex * sg / 2 - room(b))) : 0
    const eb = Math.min(room(b), ex * sg - ea)
    t[k] -= sg * (ea + eb)
    if (a >= 0) t[a] += sg * ea
    t[b] += sg * eb
  }
  if (!c) PLANS.set(fig, (c = {}))
  c[key] = { t, pivot }
  return c[key]
}

// One figure from a given state. Both dancers step from their own standing foot, which stays planted (it only
// swivels): the leader exactly as written; the follower her own part (the mirror image of his, or her
// follow_steps entry) in her own frame, facing him in the hold (or turning as her follow_turns say), with her
// stepping foot adjusted when needed to stay within the hold's room round her spot next to him.
// steer = { rot, drift } bends the figure to stay on the floor: rot (radians, + = left) is added to the turn
// of its first steps, drift (metres) is added to the landings of its travelling steps (both partners).
function runFigure(ctx, fig, fi, dance, steer) {
  const s = dance.stride || 0.3
  const style = dance.style
  const loose = LOOSE.has(style)
  let st = ctx.st, fs = ctx.fs, beat = ctx.beat
  const p0 = st.position, figStart = beat, n = fig.steps.length
  const charts = chartsOf(fig)
  const ftData = charts.turns
  const herSpin = ftData ? null : followSpins(fig, style)
  const opp = loose && turnsOpposite(fig)
  const fid = familyOf(dance, danceKeyOf(dance, [fig])).id, swingy = fid === 'swing' || fid === 'wcs'
  const underCue = UNDERARM.test(`${fig.follow_cue || ''} ${fig.lead_cue || ''}`)
  const slotDance = floorKind(dance, danceKeyOf(dance, [fig])) === 'slot'
  const rotW = steer?.rot ? spreadRotation(fig, steer.rot) : null
  const drift = steer?.drift ? spreadDrift(fig, steer.drift, s, steer.k || (steer.slot ? 0.45 : 0.3)) : null
  const states = [], fstates = [], steps = []
  const plan = turnPlan(fig, p0, opp)
  let carry = opp ? 0 : ctx.carry || 0 // turn his body has still to make (body turns less): made on his following steps
  fig.steps.forEach(([foot, dir, beats, turn, count, weight = true], si) => {
    weight = weight !== false
    const dTurn = plan.t[si] // his turn as written (+ turn = to the right = clockwise seen from above), as planned
    const extra = rotW ? steer.rot * rotW[si] : 0
    const dv = drift?.[si]
    // the step for both: his body turns as planned plus `take` (of a turn carried over), his foot is placed for that
    // turn, and then his body faces `post` further round (toward her: see below)
    const solve = (take, post, fixed = null) => {
      // leader
      const tTurn = dTurn + take
      const next = cloneSt(st)
      next.yaw = st.yaw + tTurn + extra
      // A forward or back step turning about a quarter (a pivot aside; in Latin and Social holds from 40°) in a hold
      // where she stays close: the step is taken when the turn is half made rather than at its end if that lets her
      // follow with a shorter step (she goes round the outside of the turn, he does not run away from her).
      let placeYaw = next.yaw
      const cls = classOf(dir), hAfter = holdAfter(fig, si, p0)
      if ((cls === 'fwd' || cls === 'back') && Math.abs(tTurn) >= (loose ? 0.7 : 1.39) && Math.abs(tTurn) < 2.3 && (hAfter === 'closed' || hAfter === 'promenade') && !opp) {
        const h = holdOf(hAfter, style), sv = (y) => { const f = fwdOf(y), r = rightOf(y); return { x: f.x * h.gap + r.x * h.side, z: f.z * h.gap + r.z * h.side } }
        const v0 = sv(st.yaw), v1 = sv(next.yaw), ch = { x: (v1.x - v0.x) / 0.7, z: (v1.z - v0.z) / 0.7 }
        const herLen = (y) => { const L = place(st, foot, dir, y, s); return L ? Math.hypot(L.x - st[OTHER[foot]].x + ch.x, L.z - st[OTHER[foot]].z + ch.z) : Infinity }
        const mid = st.yaw + tTurn / 2 + extra
        if (herLen(mid) < herLen(next.yaw) - 0.05) placeYaw = mid
      }
      const slip = dir === 'slip_back' || dir === 'slip_fwd'
      const land = place(st, foot, dir, placeYaw, s)
      next.yaw += post
      // his step as a ground vector from the foot it is measured from (before any floor drift)
      const vh = land ? { x: land.x - st[slip ? foot : OTHER[foot]].x, z: land.z - st[slip ? foot : OTHER[foot]].z } : null
      if (land && dv) { land.x += dv.x; land.z += dv.z }
      if (weight) next.weight = foot
      // his feet for a landing P of his stepping foot (null: it stays where it is)
      const putLead = (P) => {
        if (P) next[foot] = { x: P.x, z: P.z, yaw: next.yaw, pt: weight ? 0 : 1 }
        else next[foot] = weight ? { ...cloneFoot(st[foot]), yaw: next.yaw, pt: 0 } : cloneFoot(st[foot])
        next[next.weight].yaw = next.yaw // the standing foot swivels with the body
        Object.assign(next, centreOn(next, next.weight))
      }
      putLead(land)
      next.position = hAfter
      const step = {
        fig: fi, figId: fig.id, idx: si, foot, dir, beats, count, weight, startBeat: beat, figStart, moves: !!land,
        turnDeg: turn || 0, extra, fw: Array.isArray(fig.footwork) ? fig.footwork[si] : undefined,
      }
      if (opp) step.sideBySide = true // she turns the other way on her own spot (see turnsOpposite)
      step.follow = followerStep(step, fig)
      if (charts.sway) step.sway = charts.sway[si]
      if (charts.cbm) { step.cbm = charts.cbm.cbm[si]; step.cbmp = charts.cbm.cbmp[si] }
      if (charts.rise[si] !== undefined) step.up = charts.rise[si]

      // follower: her facing. She keeps her relation to him (the hold's turn, the nearest way round); on a step
      // with follow_turns data her body turns exactly that much instead (spun = how far she is turned beyond the
      // hold); a leftover of her own turn unwinds at the start of the next figure (or the end of a data figure).
      const mo = fs.mo + (opp ? dTurn : 0) // only his written turn: a steering curve turns them both
      const baseTurn = nextTurn(fs.turn - fs.spun, st.position, next.position)
      const frameYaw = next.yaw - 2 * mo + Math.PI
      let spun = fs.spun, own = 0 // own = her own turn on this step (not squaring up to him again, not his turning toward her)
      if (ftData && ftData[si] !== undefined) { spun = fs.yaw + ftData[si] + extra - frameYaw - baseTurn; own = spun - fs.spun + post }
      else {
        if (si === 0 || (ftData && si === n - 1)) spun = Math.round(spun / TAU) * TAU
        own = herSpin?.[si] || 0
        spun += own
      }
      const turnB = baseTurn + spun
      // her place in the new hold: when the hold changes (closed to fan or open and back), her spot moves
      // there over her steps (at most HOLD_SHIFT per beat out, HOLD_SHIFT_IN in), not in one jump; out to arm's length
      // only as the turn round each other eases (she is swung out once they have turned)
      const hT = holdOf(next.position, style), hg0 = fs.hg || hT
      const dg = hT.gap - hg0.gap, ds = hT.side - hg0.side, dL = Math.hypot(dg, ds)
      const goesOut = Math.hypot(hT.gap, hT.side) > Math.hypot(hg0.gap, hg0.side) + 1e-6
      const lim = (goesOut ? (swingy ? HOLD_SHIFT_SWING : HOLD_SHIFT) * (opp ? 1 : clamp01((swingy ? 1.6 : 1.2) - Math.abs(tTurn) / Math.max(0.5, beats))) : HOLD_SHIFT_IN) * Math.max(0.5, beats)
      const hgB = holdLerp(hg0, hT, dL > lim ? lim / dL : 1)
      const hb = { ...hT, ...hgB }
      const spotNow = () => spotFor(next, { ...hb, turn: turnB }, mo) // her spot follows his body
      const yawB = spotNow().yaw
      // her step from her own standing foot
      const { foot: ff, dir: fd } = step.follow
      const fwt = step.follow.weight ?? weight // her own weight flag wins (e.g. Reverse Corte)
      const feet = { L: cloneFoot(fs.L), R: cloneFoot(fs.R) }
      const fw = fwt ? ff : fs.weight
      // as written: facing him (closed or open hold), her mirror step is his step seen from her side, i.e. the
      // same ground vector from her matching foot (so a cross or a lock behind becomes hers in front); her own
      // follow_steps entry, or any other hold, is placed in her own frame by its direction. Her close brings her
      // feet together (a narrower gap than his).
      const mirrored = !followOverride(fig, si) && ff === OTHER[foot] && !opp && Math.cos(turnB) > 0.999
      const herSlip = fd === 'slip_back' || fd === 'slip_fwd'
      // (a step taken while she turns with the hold goes the way she faces half-way through the turn; in a spin of her
      // own, or side by side, the way she faces at its end)
      const placeB = !opp && Math.abs(yawB - fs.yaw) < 1.6 ? (fs.yaw + yawB) / 2 : yawB
      let fl0 = fd === 'close' ? local(feet[OTHER[ff]], yawB, ff === 'L' ? -HER_CLOSE : HER_CLOSE, 0)
        : mirrored ? (vh ? { x: feet[herSlip ? ff : OTHER[ff]].x + vh.x, z: feet[herSlip ? ff : OTHER[ff]].z + vh.z } : null) : place(feet, ff, fd, placeB, s)
      if (fl0 && dv && DRIFTABLE.has(fd)) { fl0.x += dv.x; fl0.z += dv.z }
      // Both stepping toward each other in a closed hold, facing (walking round each other in a circle or a
      // swing-out): together the two steps close in no further than the hold allows, each made shorter (from the close
      // beside its standing foot); turning round each other does the rest
      let landA = land
      if (!opp && !slip && !herSlip && land && fl0 && next.position === 'closed' && Math.cos(turnB) > 0.7 && FWDISH.has(dir) && FWDISH.has(fd)) {
        const D0 = Math.hypot(fs.x - st.x, fs.z - st.z) || 1, u = { x: (fs.x - st.x) / D0, z: (fs.z - st.z) / D0 }
        const cS = centreOn({ ...feet, [ff]: fl0 }, fw)
        const aH = (next.x - st.x) * u.x + (next.z - st.z) * u.z, aS = -((cS.x - fs.x) * u.x + (cS.z - fs.z) * u.z)
        const room = Math.max(0, D0 - Math.hypot(hb.gap, hb.side)) + APPROACH_SLACK
        const cl = place(st, foot, 'close', placeYaw, s), cf = local(feet[OTHER[ff]], yawB, ff === 'L' ? -HER_CLOSE : HER_CLOSE, 0)
        if (dv) { cl.x += dv.x; cl.z += dv.z; cf.x += dv.x; cf.z += dv.z }
        const hisAt = (k) => ({ x: cl.x + (land.x - cl.x) * k, z: cl.z + (land.z - cl.z) * k }), herStand = feet[OTHER[ff]]
        const clear = (k) => { const P = hisAt(k); return Math.hypot(P.x - herStand.x, P.z - herStand.z) >= APPROACH_FOOT }
        if (aH > 0 && aS > 0 && (aH + aS > room || !clear(1))) {
          let k = Math.max(APPROACH_MIN, Math.min(1, room / (aH + aS)))
          if (!clear(k)) { let lo = APPROACH_MIN, hi = k; if (clear(lo)) { for (let it = 0; it < 8; it++) { const m = (lo + hi) / 2; if (clear(m)) lo = m; else hi = m } } k = lo }
          landA = hisAt(k)
          putLead(landA)
          fl0 = { x: cf.x + (fl0.x - cf.x) * k, z: cf.z + (fl0.z - cf.z) * k }
        }
      }
      const dF = next.yaw - mo - (st.yaw - fs.mo) // how far the hold frame turned on this step
      // in a closed or promenade hold she keeps well inside its room; in the loose holds, side by side, and while she
      // turns under his arm, anywhere in it
      // (and at the end of a figure she arrives near her place in the hold the next figure starts from)
      const fit = !opp && (next.position === 'closed' || next.position === 'promenade') && Math.abs(spun - fs.spun) < 0.05 ? HOLD_FIT : !opp && si === n - 1 ? END_FIT : 1
      const fitHer = () => fitHerStep(feet, ff, fw, fl0, yawB, spotNow(), next, hb, s, dF, yawB - fs.yaw, fd, fit)

      // Both keep the hold: her place turns round him with his turn, and when her step as written does not carry
      // her there, the two landings share the difference, as a couple turning round a point between them does (the
      // partner on the outside of the turn takes the longer step, the one on the inside the shorter; a close is a
      // pivot that stays a close, so the other partner travels round it). His standing foot stays put: only his
      // landing moves, at most LEAD_DEV and keeping his step what it is. A weight change in place while the hold
      // turns becomes a small step round with the turn (a triple danced turning, not a slide).
      const hisFrom = st[OTHER[foot]]
      let hisP0 = landA, hisDev = 0
      if (!opp && !slip) {
        // (Latin and Social rotations in hold: he goes round her more; Standard and Smooth body flight stays even: a quick
        // step is not made much longer)
        if (land && DRIFTABLE.has(dir)) hisDev = loose ? LEAD_DEV + (Math.abs(dF) > 0.7 ? LEAD_DEV_FAST : 0) : Math.min(LEAD_DEV, (LEAD_DEV_SPEED * beats * 60) / (dance.bpm || 120))
        else if (land && dir === 'close') hisDev = LEAD_DEV_CLOSE
        else if (!land && weight && dir === 'in_place' && st.weight !== foot && Math.abs(dF) > 0.3) { hisP0 = { x: st[foot].x, z: st[foot].z }; hisDev = LEAD_DEV_IN_PLACE }
      }
      const hk = next.weight === foot ? 0.7 : 0.3 // his centre per metre of his landing
      let hisP = hisP0
      const moveLead = (dq) => {
        hisP = shapeLeadStep(hisFrom, hisP0, { x: hisP.x - hisP0.x + dq.x / hk, z: hisP.z - hisP0.z + dq.z / hk }, next.yaw, foot, dir, hisDev, s, Math.abs(dF) > 0.7 ? 'fast' : Math.abs(dF) > 0.3)
        putLead(hisP)
      }
      const herNeed = (P) => { const c = centreOn({ ...feet, [ff]: P || feet[ff] }, fw); const q = holdTarget(c, next, spotNow(), hb.room, fit, dF); return { x: q.x - c.x, z: q.z - c.z } }
      let fl
      if (fixed) { // both landings as already solved (only his body turns further: post)
        hisP = fixed.hisP; fl = fixed.fl
        if (fixed.moves) putLead(hisP); else putLead(land)
        step.moves = fixed.moves
      } else {
      // in a Latin, Rhythm or Social hold the couple turns round the point between them, not round him: his landing
      // first carries his body its half of the way round it (her steps take the other half)
      if (PIVOT_MID && loose && hisDev > 0 && (next.position === 'closed' || next.position === 'promenade') && Math.abs(next.yaw - st.yaw) > 0.2) {
        const hp = { x: (st.x - fs.x) / 2, z: (st.z - fs.z) / 2 }, q = spin(hp, next.yaw - st.yaw)
        moveLead({ x: q.x - hp.x, z: q.z - hp.z })
      }
      if (hisDev > 0) {
        const need = herNeed(fl0)
        if (Math.hypot(need.x, need.z) > 0.01) {
          const kf = fw === ff ? 0.7 : 0.3, wf = fd === 'close' ? 0.1 : fl0 ? 1 : Math.abs(dF) > 0.3 ? 0.6 : 0.1
          const mh = hk * hk * (dir === 'close' ? 0.1 : 1), mf = kf * kf * wf
          moveLead({ x: (-need.x * mh) / (mh + mf), z: (-need.z * mh) / (mh + mf) })
        }
      }
      fl = fitHer()
      if (hisDev > 0) {
        const need = herNeed(fl) // what her step could not make up, his takes (as far as it can, if it helps)
        if (Math.hypot(need.x, need.z) > 0.01) {
          const keep = hisP, keepFl = fl
          moveLead({ x: -need.x, z: -need.z }); fl = fitHer()
          const n2 = herNeed(fl)
          if (Math.hypot(n2.x, n2.z) > Math.hypot(need.x, need.z) - 1e-3) { hisP = keep; putLead(hisP); fl = keepFl }
        }
        if (!land && hisP && Math.hypot(hisP.x - st[foot].x, hisP.z - st[foot].z) < 1e-4) putLead(null)
        else step.moves = !!hisP
      }
      }
      // her feet never end up under him: a landing that would leave the centre over her feet inside his body (closer than
      // the hold's room allows) lands that much further out, straight away from him (a shorter step toward him)
      if (fl && fd !== 'close' && !opp && (next.position === 'closed' || next.position === 'promenade')) {
        const c = centreOn({ ...feet, [ff]: fl }, fw), r = Math.hypot(c.x - next.x, c.z - next.z), Dmin = Math.hypot(hb.gap, hb.side) - hb.room.inward - BODY_NEAR
        if (r < Dmin && r > 1e-6) {
          // (as far as her step still goes the way it is written, unless the turn decides where her foot goes)
          const kf = fw === ff ? 0.7 : 0.3, ux = (c.x - next.x) / r, uz = (c.z - next.z) / r, F0 = fl
          const at = (m) => ({ x: F0.x + ux * m, z: F0.z + uz * m })
          const chr = (P) => (Math.abs(yawB - fs.yaw) > 1 ? Infinity : stepChar({ ...feet, [ff]: P, yaw: yawB }, ff, fd))
          const okC = Math.min(0.03, chr(F0))
          let mv = Math.min(BODY_NEAR_MAX, (Dmin - r) / kf)
          if (chr(at(mv)) < okC) { let lo = 0, hi = mv; for (let it = 0; it < 10; it++) { const m = (lo + hi) / 2; if (chr(at(m)) >= okC) lo = m; else hi = m } mv = lo }
          fl = at(mv)
        }
      }
      alignFeet(next)
      if (fl) feet[ff] = { x: fl.x, z: fl.z, yaw: yawB, pt: fwt ? 0 : 1 }
      else if (fwt) feet[ff] = { ...feet[ff], yaw: yawB, pt: 0 }
      feet[fw].yaw = yawB // her standing foot swivels with her
      const nf = { yaw: yawB, turn: turnB, mo, L: feet.L, R: feet.R, weight: fw, spun, hg: hgB }
      step.fmoves = !!fl
      // her turn on this step beyond the hold's (her own turn, or a bigger squaring up to him: he lets go with his right)
      const dSpun = spun - fs.spun
      if (Math.abs(own) > 0.05 || Math.abs(dSpun) > 0.8) step.herSpin = dSpun
      if (Math.abs(own) > 0.05) { step.ownTurn = true; if (underCue) step.underarm = true }
      alignFeet(nf)
      separate(next, nf, step, st, fs)
      Object.assign(next, centreOn(next, next.weight))
      // her body: over her feet (settled into the hold's room within BODY_SLACK); where it sits round him
      // relative to her spot is kept as an angle (lag) and a radial offset (dr), so between steps she moves
      // round him, never through him (see frameAt)
      const sp = spotFor(next, { ...hb, turn: turnB }, mo), c0 = centreOn(nf, fw), c = settleBody(c0, next, sp, hb)
      nf.x = c.x; nf.z = c.z; nf.dx = c.x - sp.x; nf.dz = c.z - sp.z
      const sv = { x: sp.x - next.x, z: sp.z - next.z }, cv = { x: c.x - next.x, z: c.z - next.z }
      const lg = ang(cv) - ang(sv)
      nf.lag = (fs.lag || 0) + wrap(lg - (fs.lag || 0)) // kept continuous (no jump at ±180°), so she never swings the long way round
      nf.dr = Math.hypot(cv.x, cv.z) - Math.hypot(sv.x, sv.z)
      // where she is round him from her place (her body), and how clearly each step still goes the way it is written
      const charH = step.moves ? stepChar(next, foot, dir) : Infinity
      const charF = step.fmoves && Math.abs(nf.yaw - fs.yaw) <= 1 ? stepChar(nf, ff, fd) : Infinity
      return { next, nf, step, lagNow: wrap(ang({ x: c0.x - next.x, z: c0.z - next.z }) - ang(sv)), lagSet: wrap(lg), charH, charF, hisP: step.moves ? { x: next[foot].x, z: next[foot].z } : null, fl: step.fmoves ? { x: nf[ff].x, z: nf[ff].z } : null, moves: step.moves }
    }
    // His body's turn on this step: as planned, plus part of any turn carried over from earlier steps (at most
    // CARRY_RATE per beat, none on a pivot); his foot is placed for that turn. Then the leader keeps facing his partner:
    // where her steps and the give in her body have not carried her to her place round him (or have carried her past
    // it), his body turns toward her (`post`, he swivels on his standing foot and she with him), so that in a closed or
    // promenade hold she is never more than HOLD_LAG_MAX round him from her place, in an open hold OPEN_LAG_MAX, and at
    // the end of a figure OPEN_END_LAG (the next figure starts from there). Only as far as both steps still go the way
    // they are written. What his body turned less (more) than planned is carried on to his next steps, across figures
    // too (at most MAX_CARRY; at the end of a routine that last bit of turn is left out).
    // (a turn carried over is made only as far as she can follow it: all, half or none of what this step may take)
    const take0 = plan.pivot[si] ? 0 : clamp(carry, -CARRY_RATE * Math.max(0.5, beats), CARRY_RATE * Math.max(0.5, beats))
    const limitOf = (q) => {
      if (opp) return Infinity
      const holdNow = q.next.position === 'closed' || q.next.position === 'promenade'
      // (while she turns on her own she may be anywhere round him, but a figure still ends with her in her place)
      if (q.step.ownTurn) return si === n - 1 ? (holdNow ? HOLD_LAG_MAX : OPEN_END_LAG) : Infinity
      return holdNow ? HOLD_LAG_MAX : si === n - 1 ? OPEN_END_LAG : OPEN_LAG_MAX
    }
    let r = null, take = 0, post = 0
    for (const t of Math.abs(take0) > 0.02 ? [take0, take0 / 2, 0] : [take0]) {
      const r2 = solve(t, 0)
      if (!r || Math.abs(r2.lagSet) < Math.abs(r.lagSet) - 0.01) { r = r2; take = t }
      if (Math.abs(r.lagSet) <= limitOf(r)) break
    }
    const free = !opp && !r.step.ownTurn, inHold = free && (r.next.position === 'closed' || r.next.position === 'promenade')
    // body turns less: in a closed or promenade hold, where her feet cannot follow his turn round him (a close, a pivot),
    // his body turns only as far as keeps her in the hold, at most DEFER_MAX of this step's turn (not into a following
    // pivot, which could not make it either); his foot is then placed for the smaller turn
    const turnNow = dTurn + take
    if (inHold && !plan.pivot[si + 1] && Math.abs(turnNow) > 0.05 && Math.abs(r.lagNow) > DEFER_AT && Math.sign(r.lagNow) === -Math.sign(turnNow)) {
      const a = -Math.sign(turnNow) * Math.min(Math.abs(r.lagNow) - DEFER_AT * 0.7, DEFER_MAX * Math.abs(turnNow))
      const r2 = solve(take + a, 0)
      if (Math.abs(r2.lagNow) < Math.abs(r.lagNow) - 0.02) { r = r2; take += a }
    }
    const limit = limitOf(r)
    if (Math.abs(r.lagSet) > limit) {
      const want = r.lagSet - Math.sign(r.lagSet) * limit * 0.8, okH = Math.min(0.03, r.charH), okF = Math.min(0.03, r.charF)
      for (const k of [1, 0.8, 0.6, 0.4, 0.2]) {
        const r2 = solve(take, want * k, r)
        if (r2.charH >= okH && r2.charF >= okF && Math.abs(r2.lagSet) < Math.abs(r.lagSet) - 1e-3) { r = r2; post = want * k; break }
      }
    }
    // (in an open hold, turning to face her is not turn he still owes, except in a slot dance, where he keeps to the
    // slot's line: a closed or promenade hold carries it on)
    carry = clamp(carry - take - (r.next.position === 'closed' || r.next.position === 'promenade' || slotDance ? post : 0), -MAX_CARRY, MAX_CARRY)
    const { next, nf, step } = r
    steps.push(step)
    beat += beats
    states.push(next); fstates.push(nf)
    st = next; fs = nf
  })
  return { states, fstates, steps, ctx: { st, fs, beat, carry } }
}

// The whole routine, figure by figure; steerFor(ctx0) may return a function choosing each figure's steer.
function simulate(figs, dance, start, steerFor) {
  let ctx = initCtx(dance, start, figs[0])
  const choose = steerFor ? steerFor(ctx) : null
  const tl = { states: [ctx.st], fstates: [ctx.fs], steps: [] }
  figs.forEach((fig, fi) => {
    const steer = choose ? choose(ctx, fig, fi) : null
    const r = runFigure(ctx, fig, fi, dance, steer)
    tl.states.push(...r.states); tl.fstates.push(...r.fstates); tl.steps.push(...r.steps)
    ctx = r.ctx
  })
  tl.totalBeats = ctx.beat
  return tl
}

// ---------- floors: line of dance, slot and spot ----------
// The couple's floor rectangle { x, z, w, d } (long side along x). The older oval drum floor
// { x, z, ex, ez, rx, rz, margin } becomes the rectangle inscribed in it.
function rectOf(floor) {
  if (!floor) return null
  if (floor.w > 0 && floor.d > 0 && Number.isFinite(floor.x) && Number.isFinite(floor.z)) return { x: floor.x, z: floor.z, w: floor.w, d: floor.d }
  if (floor.rx > 0 && floor.rz > 0) {
    const m = floor.margin ?? 1, RX = Math.max(0.5, floor.rx - m), RZ = Math.max(0.5, floor.rz - m)
    return { x: floor.ex ?? floor.x ?? 0, z: floor.ez ?? floor.z ?? 0, w: Math.SQRT2 * RX + 0.9, d: Math.SQRT2 * RZ + 0.9 }
  }
  return null
}

function danceKeyOf(dance, figs) {
  return dance?.key || dance?.id || figs?.find((f) => f?.dance)?.dance || ''
}

// How a dance uses the floor: "lod" travels counter-clockwise round the room, "slot" stays on a strip along
// the floor's long axis, "spot" stays near one place. The dance's own "floor" field wins.
export function floorKind(dance = {}, key = dance?.key) {
  if (dance?.floor === 'lod' || dance?.floor === 'spot' || dance?.floor === 'slot') return dance.floor
  const k = key || '', name = dance?.name || ''
  if (dance?.style === 'standard' || dance?.style === 'smooth' || k === 'samba' || k === 'paso' || /samba|paso/i.test(name)) return 'lod'
  if (k === 'wcs' || /west coast/i.test(name)) return 'slot'
  return 'spot'
}

// The line-of-dance lane: how far from the wall (floor edge) travelling couples dance; and the least headway (m)
// along the line of dance a figure makes once a routine needs steering.
const lodLane = (R) => clamp(R.d * 0.24, 1.0, 2.2)
const LOD_HEADWAY = 0.3

// Where the couple stands before a routine (leader's position and yaw; she stands in closed hold in front).
// lod: on the long side nearest the camera (+z), near its left (-x) end, facing the line of dance (+x) with
// the wall on his right; Standard, Smooth and Paso Doble start diagonal to wall (LOD turned 45° toward the
// wall: the Paso's chasses to his left then travel along the line of dance).
// slot: in the middle of the floor, facing along the slot (+x). spot: in the middle, facing -z.
export function startFor(dance = {}, floor) {
  const R = rectOf(floor) || { x: 0, z: 0, w: 14, d: 9 }
  const kind = floorKind(dance)
  const h = holdOf('closed', dance?.style)
  if (kind === 'lod') {
    const lane = lodLane(R), endIn = clamp(R.w * 0.14, 1.0, 2.2)
    const std = dance?.style === 'standard' || dance?.style === 'smooth' || dance?.key === 'paso' || /paso/i.test(dance?.name || '')
    return { x: R.x - R.w / 2 + endIn, z: R.z + R.d / 2 - lane, yaw: Math.PI / 2 - (std ? Math.PI / 4 : 0), position: 'closed' }
  }
  if (kind === 'slot') return { x: R.x - h.gap / 2, z: R.z, yaw: Math.PI / 2, position: 'closed' }
  return { x: R.x, z: R.z + h.gap / 2, yaw: Math.PI, position: 'closed' }
}

const FIT_MARGIN = 0.45 // bodies and feet stay this far inside the floor's edge at every step
const shrink = (R, m) => ({ x0: R.x - R.w / 2 + m, x1: R.x + R.w / 2 - m, z0: R.z - R.d / 2 + m, z1: R.z + R.d / 2 - m })
const centreOf = (st, fs) => ({ x: (st.x + fs.x) / 2, z: (st.z + fs.z) / 2 })

// How far a dry run of a figure leaves the box, and the translation that would bring it back.
function overflow(r, B) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const arr of [r.states, r.fstates]) for (const S of arr) for (const p of [S, S.L, S.R]) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z
  }
  const over = Math.max(0, B.x0 - x0, x1 - B.x1, B.z0 - z0, z1 - B.z1)
  const fitAxis = (lo, hi, a, b) => (hi - lo > b - a ? (a + b) / 2 - (lo + hi) / 2 : lo < a ? a - lo : hi > b ? b - hi : 0)
  return { ok: over <= 1e-9, over, tx: fitAxis(x0, x1, B.x0, B.x1), tz: fitAxis(z0, z1, B.z0, B.z1) }
}

// Line of dance at a point: counter-clockwise round the rectangle with the nearest wall on the right
// (near +z side: +x; +x end: -z; far -z side: -x; -x end: +z).
function lodDir(R, p) {
  const dS = R.z + R.d / 2 - p.z, dN = p.z - (R.z - R.d / 2), dE = R.x + R.w / 2 - p.x, dW = p.x - (R.x - R.w / 2)
  const m = Math.min(dS, dN, dE, dW)
  return m === dS ? { x: 1, z: 0 } : m === dE ? { x: 0, z: -1 } : m === dN ? { x: -1, z: 0 } : { x: 0, z: 1 }
}
const clearance = (B, p) => Math.max(0, Math.min(p.x - B.x0, B.x1 - p.x, p.z - B.z0, B.z1 - p.z))

const ROTS = {
  slot: [0, 180, -90, 90, 45, -45, 135, -135],
  spot: [0, 90, -90, 180, 45, -45, 135, -135],
}
const LOOK_ROTS = [0, 90, 45, 135, 180, -45, -90].map((d) => (d * Math.PI) / 180)
// the biggest curve a figure can carry (about 50° per step): a 1- or 2-step figure cannot take a big corner
const maxRot = (fig) => MAX_STEER_STEP * fig.steps.length + 1e-6
// corner turns for the line of dance, cheapest first: a left (counter-clockwise) turn, the way the line of
// dance goes round the room, costs less than the same turn to the right
const CORNER_COST = (d) => (d > 0 ? d : -d * 1.6)
const CORNERS = Array.from({ length: 12 }, (_, k) => 15 * (k + 1)).flatMap((d) => (d < 180 ? [d, -d] : [d])).sort((a, b) => CORNER_COST(a) - CORNER_COST(b))

// Line of dance: a routine that fits the floor as written is danced exactly as written. Otherwise every
// figure is danced as written while it fits and the next one can still follow it, only eased back toward
// the wall (a small drift of its steps, never a turn) when the couple wanders in from its lane; where a
// corner is needed, the figure that starts there takes the smallest extra turn (left preferred, spread over
// its first steps) after which the following figures fit as written again, so each corner is turned once;
// a turn that would send the couple against the line of dance costs more. Last resort: the steps are
// nudged back onto the floor.
function lodSteering(dance, R, figs) {
  const B = shrink(R, FIT_MARGIN)
  const lane = lodLane(R)
  // how many of the following figures (up to `upto`) fit as written, one after another
  const ahead = (ctx, fi, upto) => {
    let k = 0, c = ctx
    for (let j = fi + 1; j < figs.length && k < upto; j++) {
      const r = runFigure(c, figs[j], j, dance, null)
      if (!overflow(r, B).ok) break
      k++; c = r.ctx
    }
    return { k, ctx: c }
  }
  // back toward the wall (to the right of the line of dance) when the couple has wandered in from its lane
  const laneDrift = (ctx) => {
    const c = centreOf(ctx.st, ctx.fs), g = lodDir(R, c)
    const wallDist = Math.min(R.z + R.d / 2 - c.z, c.z - (R.z - R.d / 2), R.x + R.w / 2 - c.x, c.x - (R.x - R.w / 2))
    const out = wallDist - (lane + 0.6)
    return out > 0 ? { x: -g.z * Math.min(1, out) * 0.6, z: g.x * Math.min(1, out) * 0.6 } : null
  }
  return (ctx0) => {
    // the whole routine as written: if it fits, nothing is changed at all
    let c = ctx0, whole = true
    for (let j = 0; j < figs.length && whole; j++) { const r = runFigure(c, figs[j], j, dance, null); whole = overflow(r, B).ok; c = r.ctx }
    if (whole) return () => null
    // can the figures after figure j-1 go on from cx, as written or bent (looking `depth` figures ahead)?
    const goOn = (cx, j, depth) => {
      if (j >= figs.length || depth <= 0) return true
      return LOOK_ROTS.some((c2) => {
        if (Math.abs(c2) > maxRot(figs[j])) return false
        const r = runFigure(cx, figs[j], j, dance, c2 ? { rot: c2 } : null)
        return overflow(r, B).ok && goOn(r.ctx, j + 1, depth - 1)
      })
    }
    return (ctx, fig, fi) => {
      const canGoOn = (cx) => goOn(cx, fi + 1, 2)
      // eased toward the wall, and along the line of dance when the figure as written makes no headway along it (a
      // figure that turns the couple round on the spot still travels round the room)
      const rw = runFigure(ctx, fig, fi, dance, null), lane = laneDrift(ctx)
      const cs = centreOf(ctx.st, ctx.fs), g0 = lodDir(R, cs), ew = centreOf(rw.ctx.st, rw.ctx.fs)
      const push = clamp(LOD_HEADWAY - ((ew.x - cs.x) * g0.x + (ew.z - cs.z) * g0.z), 0, LOD_HEADWAY)
      const drift = lane || push > 0.02 ? { x: (lane?.x || 0) + g0.x * push, z: (lane?.z || 0) + g0.z * push } : null
      const r0 = drift ? runFigure(ctx, fig, fi, dance, { drift }) : rw
      const o0 = overflow(r0, B)
      if (o0.ok && canGoOn(r0.ctx)) return drift ? { drift } : null // as written (eased toward the wall and along)
      if (drift && overflow(rw, B).ok && canGoOn(rw.ctx)) return null // as written
      const need = Math.min(2, figs.length - fi - 1)
      const c0 = centreOf(ctx.st, ctx.fs)
      let best = null
      for (const d of CORNERS) {
        const rot = (d * Math.PI) / 180
        if (Math.abs(rot) > maxRot(fig)) continue
        if (best && best.score >= 10000 + need * 1000 - CORNER_COST(d)) break // (cheapest first: nothing later can score more)
        let steer = { rot }, r = runFigure(ctx, fig, fi, dance, steer), o = overflow(r, B), eased = false
        // a left turn (the way the room goes round) that just fails near a wall may also be eased away from it
        if (!o.ok && d > 0 && o.over < 0.6) {
          steer = { rot, drift: { x: o.tx * 1.3, z: o.tz * 1.3 }, k: 0.6 }; r = runFigure(ctx, fig, fi, dance, steer); o = overflow(r, B); eased = true
        }
        if (!o.ok) continue
        const a = ahead(r.ctx, fi, need)
        const goesOn = a.k >= need || canGoOn(r.ctx) // a dead end is taken only when nothing else fits
        // travelling against the line of dance afterwards costs extra
        const e = centreOf(a.ctx.st, a.ctx.fs), net = { x: e.x - c0.x, z: e.z - c0.z }, L = Math.hypot(net.x, net.z)
        const g = lodDir(R, e), against = L > 0.5 && (net.x * g.x + net.z * g.z) / L < -0.3
        const score = (goesOn ? 10000 : 0) + a.k * 1000 - CORNER_COST(d) - (against ? 700 : 0) - (eased ? 40 : 0)
        if (!best || score > best.score) best = { steer, score }
      }
      if (best) return best.steer
      // nothing fits: nudge the least-bad versions' steps back inside (a few of them, the best wins)
      const tries = [{ steer: { rot: 0 }, o: overflow(runFigure(ctx, fig, fi, dance, null), B) }]
      for (const d of CORNERS) {
        const rot = (d * Math.PI) / 180
        if (Math.abs(rot) > maxRot(fig)) continue
        tries.push({ steer: { rot }, o: overflow(runFigure(ctx, fig, fi, dance, { rot }), B) })
      }
      tries.sort((a, b) => a.o.over - b.o.over)
      let fb = null
      for (const t of tries.slice(0, 3)) {
        let steer = t.steer, o = t.o
        for (let it = 0; it < 10 && !o.ok; it++) {
          const s2 = { rot: steer.rot, drift: { x: (steer.drift?.x || 0) + o.tx * 1.3, z: (steer.drift?.z || 0) + o.tz * 1.3 }, k: 0.6 }
          const o2 = overflow(runFigure(ctx, fig, fi, dance, s2), B)
          if (o2.over < o.over) { steer = s2; o = o2 } else break
        }
        if (!fb || o.over < fb.o.over) fb = { steer, o }
        if (o.ok) break
      }
      return fb.steer.rot || fb.steer.drift ? fb.steer : null
    }
  }
}

// Spot and slot dances: each figure is danced as written when it fits (and the next one can still fit
// after it); a travelling figure that would carry the couple away from its spot (or off its slot) curves
// back, otherwise it is bent by a rotation, and as a last resort its steps are nudged back onto the floor.
function floorSteering(dance, R, kind, figs) {
  if (kind === 'lod') return lodSteering(dance, R, figs)
  const B = shrink(R, FIT_MARGIN)
  const rots = ROTS[kind].map((d) => (d * Math.PI) / 180)
  return (ctx0) => {
    const home = centreOf(ctx0.st, ctx0.fs) // the spot (spot dances) or the slot line (slot dances)
    // Travel direction (yaw of the couple's net displacement) of a figure bent by rot, measured by a dry run.
    const travel = (ctx, fig, rot, drift) => {
      const r = runFigure(ctx, fig, -1, dance, rot || drift ? { rot, drift } : null)
      const c = centreOf(ctx.st, ctx.fs), e = centreOf(r.ctx.st, r.ctx.fs)
      return { D: { x: e.x - c.x, z: e.z - c.z }, e }
    }
    // The smallest curve that brings the figure's travel inside the cone [lo, hi] around the yaw `aim`.
    const SOFT = [0, 20, -20, 45, -45, 70, -70, 90, -90].map((d) => (d * Math.PI) / 180)
    const bend = (ctx, fig, drift, aimAt, lo, hi) => {
      let best = null
      for (const r of SOFT) {
        if (Math.abs(r) > maxRot(fig)) continue
        const { D } = travel(ctx, fig, r, drift)
        const psi = wrap(Math.atan2(D.x, D.z) - aimAt), err = psi > hi ? psi - hi : psi < lo ? lo - psi : 0
        const cost = err * 2 + Math.abs(r) * 0.5
        if (!best || cost < best.cost) best = { r, cost }
        if (err === 0) break
      }
      return best ? best.r : 0
    }
    const soft = (ctx, fig) => {
      const c = centreOf(ctx.st, ctx.fs)
      if (kind === 'spot') {
        const off = { x: home.x - c.x, z: home.z - c.z }
        const drift = Math.hypot(off.x, off.z) > 0.4 ? { x: off.x * 0.7, z: off.z * 0.7 } : null
        // a travelling figure (walks) that would carry the couple away from its spot curves back toward it
        const { D, e } = travel(ctx, fig, 0, drift)
        if (Math.hypot(D.x, D.z) < 0.3 || Math.hypot(e.x - home.x, e.z - home.z) < 1.0) return { rot: 0, drift }
        const mid = { x: c.x + D.x / 2, z: c.z + D.z / 2 }
        return { rot: bend(ctx, fig, drift, Math.atan2(home.x - mid.x, home.z - mid.z), -Math.PI / 3, Math.PI / 3), drift }
      }
      // slot
      const yaw = ctx.st.yaw, axis = Math.abs(wrap(yaw - Math.PI / 2)) <= Math.PI / 2 ? Math.PI / 2 : -Math.PI / 2
      const e = wrap(yaw - axis)
      const lim = R.w / 2 - 2.2
      const tgt = { x: clamp(c.x, R.x - lim, R.x + lim), z: home.z }
      const off = { x: tgt.x - c.x, z: tgt.z - c.z }
      const rot = Math.abs(e) > 0.2 && Math.abs(e) <= maxRot(fig) ? -e : 0
      const k = Math.hypot(off.x, off.z) > 0.9 ? 1 : 0.7
      return { rot, drift: Math.hypot(off.x, off.z) > 0.3 ? { x: off.x * k, z: off.z * k } : null, slot: true }
    }
    const fits = (ctx, fig, fi, steer) => overflow(runFigure(ctx, fig, fi, dance, steer), B).ok
    return (ctx, fig, fi) => {
      const base = soft(ctx, fig)
      const nextFig = figs[fi + 1]
      const tries = []
      for (const c of rots) {
        const steer = { rot: wrap(base.rot + c), drift: base.drift, slot: base.slot }
        if (c && Math.abs(steer.rot) > maxRot(fig)) continue // a 1- or 2-step figure cannot carry a big corner
        const r = runFigure(ctx, fig, fi, dance, steer)
        const o = overflow(r, B)
        const t = { c, steer, r, o }
        tries.push(t)
        if (!o.ok) continue
        t.look = !nextFig || LOOK_ROTS.some((c2) => Math.abs(c2) <= maxRot(nextFig) && fits(r.ctx, nextFig, fi + 1, { rot: c2 }))
        if (c === 0 && t.look) return steer // dance it as written
      }
      const score = (t) => {
        const e = centreOf(t.r.ctx.st, t.r.ctx.fs)
        let sc = 0.25 * Math.min(2, clearance(B, e)) - (0.3 * Math.abs(t.c)) / Math.PI
        if (kind === 'slot') sc -= 0.5 * Math.abs(Math.cos(t.r.ctx.st.yaw))
        return sc + (t.look ? 10 : 0)
      }
      const ok = tries.filter((t) => t.o.ok)
      if (ok.length) return ok.reduce((a, b) => (score(b) > score(a) ? b : a)).steer
      // nothing fits as written: nudge the least-bad version's steps back inside
      let best = tries.reduce((a, b) => (b.o.over < a.o.over - 1e-9 ? b : a))
      let steer = best.steer
      for (let it = 0; it < 5 && !best.o.ok; it++) {
        const d = { x: (steer.drift?.x || 0) + best.o.tx * 1.15, z: (steer.drift?.z || 0) + best.o.tz * 1.15 }
        const s2 = { rot: steer.rot, drift: d, slot: steer.slot }
        const r = runFigure(ctx, fig, fi, dance, s2)
        const o = overflow(r, B)
        if (o.over < best.o.over) { best = { c: best.c, steer: s2, r, o }; steer = s2 } else break
      }
      return steer
    }
  }
}

// Build a timeline for a routine: one state per step for the leader (states) and the follower (fstates).
// start = { x, z, yaw, position, floor? }. With floor = { x, z, w, d } (a FLOORS entry) the couple begins at
// start x/z/yaw (or startFor() when missing) and is steered to stay on that rectangle the way the dance uses
// the floor (floorKind): line-of-dance corners, slot or spot. Without a floor the steps are laid out as
// written from the start.
export function buildTimeline(figs, dance = {}, start = { x: 0, z: 0, yaw: 0 }) {
  figs = (figs || []).filter((f) => f && Array.isArray(f.steps) && f.steps.length)
  const key = danceKeyOf(dance, figs)
  const R = rectOf(start?.floor)
  const s0 = { ...start }
  let kind = null
  if (R) {
    kind = floorKind(dance, key)
    const def = startFor({ ...dance, key }, R)
    if (!Number.isFinite(s0.x) || !Number.isFinite(s0.z)) { s0.x = def.x; s0.z = def.z; if (!Number.isFinite(s0.yaw)) s0.yaw = def.yaw }
    const B = shrink(R, FIT_MARGIN + 0.6)
    s0.x = clamp(s0.x, Math.min(B.x0, R.x), Math.max(B.x1, R.x)); s0.z = clamp(s0.z, Math.min(B.z0, R.z), Math.max(B.z1, R.z))
  }
  if (!Number.isFinite(s0.x)) s0.x = 0
  if (!Number.isFinite(s0.z)) s0.z = 0
  if (!Number.isFinite(s0.yaw)) s0.yaw = 0
  const tl = simulate(figs, dance, s0, R ? floorSteering(dance, R, kind, figs) : null)
  tl.danceKey = key
  if (R) {
    let reach = 0
    for (const S of [...tl.states, ...tl.fstates]) for (const p of [S, S.L, S.R]) reach = Math.max(reach, Math.abs(p.x - R.x) / (R.w / 2), Math.abs(p.z - R.z) / (R.d / 2))
    tl.floor = { ...R, kind }
    const bent = {}
    for (const st of tl.steps) bent[st.fig] = (bent[st.fig] || 0) + st.extra
    const b = Object.values(bent)
    tl.fit = {
      kind, reach, corners: b.filter((r) => Math.abs(r) >= Math.PI / 3).length, bent: b.filter((r) => Math.abs(r) > 1e-9).length,
      turnDeg: Math.round(b.reduce((a, r) => a + Math.abs(r), 0) * 180 / Math.PI),
    }
  }
  return tl
}

// ---------- motion: from step states to a pose at any beat ----------
// Motion character per dance family (technique notes):
//  c      how much body velocity carries through a step boundary (1 = continuous body flight in the swinging
//         dances, low = Latin weight that settles on each step: crisp but eased)
//  smooth beats over which the body's path is averaged, so it flows through chassés and ball changes
//  over   how far over the weighted foot the body is when a step ends (0.5 = between the feet), so the
//         centre keeps travelling evenly through side-close-side and walks; next to a rock (a weight change
//         in place) the body commits over the foot (ROCK_OVER)
//  foot   share of the step the moving foot needs to arrive (the foot first, then the body)
//  w0, w1 where in the step the weight moves onto the new foot (Latin: late, as the hip settles)
//  lift   how high the moving foot clears the floor (Standard feet skim; Tango picks them up and places them)
//  lag    beats the body's turn trails the feet ("body turns less", completed on the next step)
//  heel / toe / ball   foot pitch on arrival: heel lead (-) on forward steps and toe lead (+) on back steps
//         in Standard, ball of the foot (+) in Latin; point = pointed toe of a step without weight
//  peel   pitch of a foot as it releases before stepping (heel peels up behind a forward step)
//  bounce knee pulse into every beat (m), kick = lift of a kick
const FAMILY = {
  std: { over: 0.52, c: 1, smooth: 0.35, foot: 0.75, w0: 0.3, w1: 1, lift: 0.012, lag: 0.3, heel: 0.3, toe: 0.32, ball: 0.25, point: 0.3, peel: 0.28, bounce: 0, kick: 0.05 },
  tango: { over: 0.55, c: 0.7, smooth: 0.2, foot: 0.5, w0: 0.2, w1: 0.75, lift: 0.03, lag: 0.15, heel: 0.2, toe: 0.25, ball: 0.2, point: 0.25, peel: 0.15, bounce: 0, kick: 0.05 },
  latin: { over: 0.52, c: 0.4, smooth: 0.15, foot: 0.55, w0: 0.4, w1: 1, lift: 0.03, lag: 0.12, heel: 0, toe: 0.35, ball: 0.35, point: 0.55, peel: 0.3, bounce: 0, kick: 0.09 },
  travel: { over: 0.52, c: 0.6, smooth: 0.25, foot: 0.55, w0: 0.3, w1: 0.95, lift: 0.035, lag: 0.12, heel: 0, toe: 0.3, ball: 0.3, point: 0.5, peel: 0.3, bounce: 0, kick: 0.09 },
  swing: { over: 0.52, c: 0.5, smooth: 0.2, foot: 0.6, w0: 0.25, w1: 0.9, lift: 0.045, lag: 0.12, heel: 0, toe: 0.3, ball: 0.3, point: 0.55, peel: 0.25, bounce: 0.02, kick: 0.16 },
  wcs: { over: 0.5, c: 0.7, smooth: 0.3, foot: 0.65, w0: 0.2, w1: 0.9, lift: 0.025, lag: 0.15, heel: 0, toe: 0.25, ball: 0.25, point: 0.45, peel: 0.2, bounce: 0.008, kick: 0.1 },
}
const BOUNCE = { swing: 0.018, jive: 0.022, lindy: 0.028, wcs: 0.008 }
const ROCK_OVER = 0.75
function familyOf(dance, key) {
  const name = dance?.name || '', style = dance?.style
  let id
  if (key === 'wcs' || /west coast/i.test(name)) id = 'wcs'
  else if (['swing', 'jive', 'lindy'].includes(key) || /swing|jive|lindy|jitterbug/i.test(name)) id = 'swing'
  else if (key === 'samba' || key === 'paso' || /samba|paso/i.test(name)) id = 'travel'
  else if (LOOSE.has(style)) id = 'latin'
  else if (dance?.rise === 'none' || /tango/i.test(name)) id = style === 'standard' || style === 'smooth' ? 'tango' : 'std'
  else id = 'std'
  return { id, ...FAMILY[id], bounce: BOUNCE[key] ?? FAMILY[id].bounce }
}

// The body glides over quick steps instead of jerking onto every foot: knot positions are averaged with
// their neighbours (Gaussian in time, the family's `smooth` beats and at least a tenth of a second; the
// first and last stay put).
const BODY_SMOOTH_SEC = 0.13
function smoothKnots(T, V, sigma) {
  const n = V.length - 1, out = Float64Array.from(V)
  if (!(sigma > 1e-6)) return out
  for (let k = 1; k < n; k++) {
    let sw = 0, sv = 0
    for (let j = k; j >= 0 && T[k] - T[j] <= 3 * sigma; j--) { const w = Math.exp(-0.5 * ((T[k] - T[j]) / sigma) ** 2); sw += w; sv += w * V[j] }
    for (let j = k + 1; j <= n && T[j] - T[k] <= 3 * sigma; j++) { const w = Math.exp(-0.5 * ((T[j] - T[k]) / sigma) ** 2); sw += w; sv += w * V[j] }
    out[k] = sv / sw
  }
  return out
}

// Monotone cubic (PCHIP) slopes through knots (T, V), scaled by c: C1 everywhere, no overshoot between
// knots, at rest at the start and the end.
function slopes(T, V, c) {
  const n = V.length - 1, m = new Float64Array(n + 1)
  for (let k = 1; k < n; k++) {
    const h0 = T[k] - T[k - 1], h1 = T[k + 1] - T[k]
    if (h0 <= 0 || h1 <= 0) continue
    const d0 = (V[k] - V[k - 1]) / h0, d1 = (V[k + 1] - V[k]) / h1
    if (d0 * d1 <= 0) continue
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0
    m[k] = (c * (w1 + w2)) / (w1 / d0 + w2 / d1)
  }
  return m
}
// cubic Hermite on one interval: value and derivative (per beat)
function herm(p0, p1, m0, m1, h, s) {
  const s2 = s * s, s3 = s2 * s
  const v = (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * h * m1
  const d = h > 0 ? ((6 * s2 - 6 * s) * p0 + (-6 * s2 + 6 * s) * p1) / h + (3 * s2 - 4 * s + 1) * m0 + (3 * s2 - 2 * s) * m1 : 0
  return [v, d]
}
function findStep(T, n, t) {
  let lo = 0, hi = n - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (T[mid] <= t) lo = mid; else hi = mid - 1 }
  return lo
}

// Per-step facts for one role, used for foot articulation.
function roleSteps(tl, role, fam, famId) {
  return tl.steps.map((st) => {
    const f = role === 'leader' ? { foot: st.foot, dir: st.dir, weight: st.weight !== false, mover: st.moves, fw: st.fw }
      : { foot: st.follow.foot, dir: st.follow.dir, weight: (st.follow.weight ?? st.weight) !== false, mover: st.fmoves, fw: undefined }
    f.cls = classOf(f.dir)
    f.kick = (famId === 'swing' || famId === 'wcs') && !f.weight && (f.cls === 'fwd' || f.cls === 'side')
    return f
  })
}
// Pitch the moving foot arrives with (footwork code wins when the figure gives one for the leader).
function landPitch(fam, f) {
  if (!f.weight) return fam.point
  if (fam.heel) {
    const code = String(f.fw || '').trim().toUpperCase()
    if (code) {
      if (code.startsWith('H')) return -fam.heel
      if (/^(T|B|IE|INSIDE|TOE|BALL)/.test(code)) return fam.toe
      if (/WHOLE|FLAT/.test(code)) return 0
    }
    return f.cls === 'fwd' ? -fam.heel : f.cls === 'back' ? fam.toe : f.cls === 'side' ? fam.toe * 0.6 : f.cls === 'close' ? fam.toe * 0.4 : 0
  }
  return f.cls === 'none' ? 0 : fam.ball
}
function midPitch(fam, f) {
  if (f.kick) return fam.point + 0.3
  if (fam.heel) return f.cls === 'fwd' ? -0.06 : f.cls === 'back' ? 0.16 : 0.1
  return fam.point * 0.8
}

// Latin and Social steps that last more than a beat (salsa 3-(4), rumba 4-1, a cha cha or swing slow) land on
// their count: the foot, the weight and the body arrive within the first beat and the rest is the hold (hip
// settle). Bolero keeps its slow, sweeping slows.
const ON_THE_BEAT = new Set(['latin', 'travel', 'swing', 'wcs'])
const landBeats = (fam, key, h) => (ON_THE_BEAT.has(fam.id) && key !== 'bolero' && h > 1 ? 1 : h)
const stepScale = (M, i) => { const h = M.T[i + 1] - M.T[i]; return h > 0 ? M.HL[i] / h : 1 }

// Rise and fall: knots at the end of every step (1 = up), from the figures' footwork and rise_fall charts;
// without a chart, waltz = up after counts 1 and 2 of each bar, swing (Foxtrot, Quickstep) = up through the
// quicks, rising at the end of the slow before them. Tango, Latin, Rhythm and Social stay level.
const RISE_AMP = { waltz: 0.05, swing: 0.04 }
function riseKnots(steps, dance) {
  const n = steps.length, up = new Float64Array(n + 1)
  if (!RISE_AMP[dance?.rise]) return up
  for (let k = 0; k < n; k++) {
    const s = steps[k], nx = steps[k + 1], same = !!nx && nx.fig === s.fig
    const q = (((s.startBeat - s.figStart + s.beats) % 3) + 3) % 3 // where in the waltz bar the step ends
    if (s.up !== undefined) up[k + 1] = s.up
    else if (dance.rise === 'waltz') up[k + 1] = q > 1e-6 && q < 3 - 1e-6 ? 1 : 0
    else up[k + 1] = same && (nx.beats <= 1 || s.beats <= 1) ? 1 : 0
  }
  return up
}
// rise during step i at progress p: up over the second half of a step, lowering at its very end (C1: ramp eases)
function riseAt(M, dance, i, p) {
  const A = RISE_AMP[dance?.rise]
  if (!A) return 0
  const a = M.up[i], b = M.up[i + 1]
  return A * (a === b ? a : a < b ? a + (b - a) * ramp(p, 0.45, 1) : a + (b - a) * ramp(p, 0.65, 1))
}

function prepare(tl, dance) {
  const key = tl.danceKey || dance?.key || ''
  const fam = familyOf(dance, key)
  const sig = `${fam.id}|${fam.bounce}|${dance?.style}|${dance?.name}|${dance?.bpm}|${dance?.rise}|${key}`
  if (tl._m && tl._m.sig === sig) return tl._m
  const { steps, states, fstates } = tl, n = steps.length
  const T = new Float64Array(n + 1), HL = new Float64Array(Math.max(1, n))
  for (let k = 0; k < n; k++) T[k + 1] = Math.max(T[k] + 1e-6, steps[k].startBeat + steps[k].beats)
  for (let k = 0; k < n; k++) HL[k] = landBeats(fam, key, T[k + 1] - T[k])
  const sigma = Math.max(fam.smooth, BODY_SMOOTH_SEC * ((dance?.bpm || 120) / 60))
  const inPlace = (st) => !!st && !st.moves && st.weight !== false
  const om = states.map((_, k) => (inPlace(steps[k - 1]) || inPlace(steps[k]) ? ROCK_OVER : fam.over))
  const over = (S, k, ax) => (k === 0 ? S[ax] : om[k] * S[S.weight][ax] + (1 - om[k]) * S[OTHER[S.weight]][ax]) // the start stays exact
  const X = smoothKnots(T, states.map((S, k) => over(S, k, 'x')), sigma), Z = smoothKnots(T, states.map((S, k) => over(S, k, 'z')), sigma), Y = states.map((s) => s.yaw)
  const TU = fstates.map((s) => s.turn), YF = fstates.map((s) => s.yaw)
  // sway (Standard and Smooth swinging dances; not Tango): from the figure's sway chart where it has one,
  // otherwise into the turn on side and closing steps (the other way when the figure is moving backward)
  const swayStyle = (dance?.style === 'standard' || dance?.style === 'smooth') && fam.id !== 'tango'
  let lastCls = 'fwd'
  const sw = steps.map((st, k) => {
    if (!swayStyle) return 0
    const cls = classOf(st.dir)
    if (st.idx === 0) lastCls = 'fwd'
    if (cls === 'fwd' || cls === 'back') lastCls = cls
    if (st.sway !== undefined) return 0.07 * st.sway
    if (cls === 'fwd' || cls === 'back') return 0
    return clamp(-(Y[k + 1] - Y[k]) * 0.12, -0.09, 0.09) * (lastCls === 'back' ? -1 : 1)
  })
  const swK = Array.from({ length: n + 1 }, (_, k) => (k === 0 || k === n ? 0 : 0.5 * (sw[k - 1] + sw[k])))
  // spins for the head spot: a run of same-way turning steps (each ≥ 35°) adding up to ≥ 150°; Standard heads
  // keep their own lines, so there only in open holds (or her underarm turn, where he lets go with his right)
  const spins = (Yk, own) => {
    const out = []
    let k = 0
    while (k < n) {
      const d = Yk[k + 1] - Yk[k]
      if (Math.abs(d) < 0.6) { k++; continue }
      let j = k, tot = 0
      while (j < n && Math.abs(Yk[j + 1] - Yk[j]) >= 0.6 && Math.sign(Yk[j + 1] - Yk[j]) === Math.sign(d)) { tot += Yk[j + 1] - Yk[j]; j++ }
      const openHold = ['open', 'fan'].includes(states[k].position) || ['open', 'fan'].includes(states[j].position) || (own && steps.slice(k, j).some((st) => st.herSpin))
      if (Math.abs(tot) >= 2.6 && (!fam.heel || openHold)) out.push({ t0: T[k], t1: T[j], yaw: Yk[k] })
      k = j
    }
    return out
  }
  // body slopes; a step that lands early (see landBeats) arrives at rest and holds
  const sl = (V, c) => {
    const m = slopes(T, V, c)
    for (let k = 0; k < n; k++) if (HL[k] < T[k + 1] - T[k] - 1e-9) m[k + 1] = 0
    return m
  }
  tl._m = {
    sig, key, fam, n, T, HL, X, Z, Y, TU,
    mX: sl(X, fam.c), mZ: sl(Z, fam.c), mY: sl(Y, Math.max(0.6, fam.c)), mTU: sl(TU, 1),
    sw, swK, spinsL: spins(Y, false), spinsF: spins(YF, true), up: riseKnots(steps, dance),
    info: { leader: roleSteps(tl, 'leader', fam, fam.id), follower: roleSteps(tl, 'follower', fam, fam.id) },
  }
  return tl._m
}

// Both bodies' frames at beat t: his body path and yaw (C1 Hermite through the step states), her body at
// her spot in the hold, turned round him by her lag and moved in or out by her radial offset.
// s = progress through the step; a step that lands early (landBeats) moves the bodies within its first beat.
function frameAt(tl, M, style, t) {
  const n = M.n
  t = clamp(t, 0, M.T[n])
  const i = findStep(M.T, n, t)
  const T0 = M.T[i], h = M.T[i + 1] - T0, hl = M.HL[i]
  const s = h > 0 ? clamp01((t - T0) / h) : 1, sb = hl > 0 ? clamp01((t - T0) / hl) : 1
  const [x, vx] = herm(M.X[i], M.X[i + 1], M.mX[i], M.mX[i + 1], hl, sb)
  const [z, vz] = herm(M.Z[i], M.Z[i + 1], M.mZ[i], M.mZ[i + 1], hl, sb)
  const [yaw, vyaw] = herm(M.Y[i], M.Y[i + 1], M.mY[i], M.mY[i + 1], hl, sb)
  const [turn] = herm(M.TU[i], M.TU[i + 1], M.mTU[i], M.mTU[i + 1], hl, sb)
  const a = tl.states[i], b = tl.states[i + 1], A = tl.fstates[i], B = tl.fstates[i + 1]
  const e = ease(sb)
  const ha = A.hg || holdOf(a.position, style), hb = B.hg || holdOf(b.position, style)
  const dY = b.yaw - a.yaw
  const mo = lerp(A.mo, B.mo, Math.abs(dY) > 1e-9 ? clamp01((yaw - a.yaw) / dY) : e)
  const sp = spotFor({ x, z, yaw }, { ...holdLerp(ha, hb, e), turn }, mo)
  const D = Math.hypot(sp.x - x, sp.z - z), lg = lerp(A.lag || 0, B.lag || 0, e), dr = lerp(A.dr || 0, B.dr || 0, e)
  const u = spin({ x: sp.x - x, z: sp.z - z }, lg), k = D > 1e-9 ? (D + dr) / D : 1
  return { i, s, x, z, yaw, vx, vz, vyaw, mo, turn, fx: x + u.x * k, fz: z + u.z * k, fyaw: sp.yaw }
}

// The moving foot's path: it leaves its spot, brushes past the supporting foot (forward and back steps
// collect under the body, passing ~9 cm from it) and lands; u = 0..1 along the swing.
function swingPath(A, B, S, u) {
  const abx = B.x - A.x, abz = B.z - A.z, L2 = abx * abx + abz * abz
  if (L2 > 0.01) {
    const proj = ((S.x - A.x) * abx + (S.z - A.z) * abz) / L2
    if (proj > 0.2 && proj < 0.8) {
      const px = A.x + abx * proj - S.x, pz = A.z + abz * proj - S.z, d = Math.hypot(px, pz)
      const nx = d > 1e-4 ? px / d : -abz / Math.sqrt(L2), nz = d > 1e-4 ? pz / d : abx / Math.sqrt(L2)
      const Q = { x: S.x + nx * 0.09, z: S.z + nz * 0.09 }
      const C = { x: 2 * Q.x - (A.x + B.x) / 2, z: 2 * Q.z - (A.z + B.z) / 2 }
      const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u
      return { x: a * A.x + b * C.x + c * B.x, z: a * A.z + b * C.z + c * B.z }
    }
  }
  return { x: lerp(A.x, B.x, u), z: lerp(A.z, B.z, u) }
}

// One dancer's feet at step i, progress p. S0/S1 = the dancer's states before/after the step; the moving
// foot swings (arriving within the step's landing time), the others stand still (they may swivel).
function feetAt(M, role, S0, S1, i, p, rise) {
  const fam = M.fam, info = M.info[role], f0 = info[i]
  const n = M.n, footT = fam.foot * stepScale(M, i)
  const pointOf = (S, f) => (S[f].pt ? fam.point : 0)
  // a foot about to step releases: heel peels up behind a forward step, toe lifts before a back slide (Standard)
  const peel = (k, f) => {
    if (k <= 0 || k >= n) return 0
    const g = info[k], S = k === i ? S0 : k === i + 1 ? S1 : null
    if (!S || !g.mover || g.foot !== f || S.weight === f || S[f].pt) return 0
    if (fam.heel) return g.cls === 'fwd' ? fam.peel : g.cls === 'back' ? -0.12 : 0
    return g.cls === 'none' ? 0 : fam.peel
  }
  const riseP = Math.max(0, rise) * 6 // on the balls of the feet when risen
  const out = { swing: {} }
  for (const f of ['L', 'R']) {
    const A = S0[f], B = S1[f]
    let x, z, y = 0, yaw, pitch, u = null
    if (f0.foot === f && f0.mover) {
      u = clamp01(p / footT)
      const ue = ease(u)
      const P = swingPath(A, B, S0[OTHER[f]], ue)
      x = P.x; z = P.z
      y = (f0.kick ? fam.kick : fam.lift * (f0.cls === 'side' ? 1.2 : 1)) * Math.sin(Math.PI * u)
      yaw = lerp(A.yaw, B.yaw, ease(clamp01(u * 1.3)))
      const s0 = pointOf(S0, f) + peel(i, f), land = landPitch(fam, f0), mid = midPitch(fam, f0)
      if (p <= footT) pitch = (1 - u) * (1 - u) * s0 + 2 * u * (1 - u) * mid + u * u * land
      else pitch = f0.weight ? land * (1 - ease((p - footT) / (1 - footT))) : land
      if (p >= 1) pitch = pointOf(S1, f)
    } else if (Math.hypot(B.x - A.x, B.z - A.z) < 1e-6) {
      // a standing foot swivels while the other foot travels, done by the time it arrives (so it never turns its toe into
      // a partner's foot that has just landed)
      x = A.x; z = A.z
      yaw = lerp(A.yaw, B.yaw, ease(clamp01(p / Math.max(0.05, footT))))
      pitch = lerp(pointOf(S0, f), pointOf(S1, f), ease(p))
    } else {
      // (not produced by the engine, which never moves a foot that does not step) a foot that changes place
      // anyway is lifted and placed, never slid
      u = clamp01(p / footT)
      const P = swingPath(A, B, S0[OTHER[f]], ease(u))
      x = P.x; z = P.z
      y = fam.lift * Math.sin(Math.PI * u)
      yaw = lerp(A.yaw, B.yaw, ease(u))
      pitch = lerp(pointOf(S0, f), pointOf(S1, f), ease(p))
    }
    if (!(f0.foot === f && f0.mover)) pitch += peel(i + 1, f) * ramp(p, 0.7, 1)
    out[f] = { x, z, y, yaw, pitch: pitch + riseP }
    out.swing[f] = u == null ? 0 : Math.min(1, 3 * Math.sin(Math.PI * u))
  }
  return out
}

// Knee action on top of rise: samba bounce on every count; the swing dances settle into every beat.
function bounceAt(M, dance, beat) {
  if (M.key === 'samba' || dance?.name === 'Samba') return -0.025 * Math.sin(Math.PI * (beat % 1)) ** 2
  return M.fam.bounce ? -M.fam.bounce * (0.5 + 0.5 * Math.cos(TAU * (beat - 0.15))) : 0
}

// Pose of the leader + follower at a given beat:
// { lead, follow, step, progress }, each dancer { x, z, yaw, rise, L, R, weightL, hold, style, dance, sway,
// turn, speed, spot?, cbm, cbmp, swayChart } with feet { x, z, y, yaw, pitch }. cbm / cbmp: the current step
// has contra body movement / is placed in CBMP by the figure's chart; swayChart: 'L' | 'R' | null, the chart's
// sway for this dancer on the current step (hers is the mirror of his). follow.underarm: she is turning on her own
// under his arm on this step (the figure's cues say so), so the joined hands go up over her head.
export function poseAt(tl, beat, dance = {}) {
  const M = prepare(tl, dance)
  const n = M.n
  if (!n) return restOf(tl, dance, M)
  const style = dance?.style
  const t = clamp(Number.isFinite(beat) ? beat : 0, 0, M.T[n])
  const fr = frameAt(tl, M, style, t)
  const i = fr.i, p = fr.s
  const step = tl.steps[i], a = tl.states[i], b = tl.states[i + 1], A = tl.fstates[i], B = tl.fstates[i + 1]
  // the body completes its turn a little after the feet (and fully by the end of the routine)
  const lagged = frameAt(tl, M, style, t - M.fam.lag * clamp01((M.T[n] - t) / (2 * M.fam.lag)))
  const rise = riseAt(M, dance, i, p) + bounceAt(M, dance, t)
  const hf = feetAt(M, 'leader', a, b, i, p, rise)
  const sf = feetAt(M, 'follower', A, B, i, p, rise)
  // partners' feet: a foot on its way steers round the partner's feet and shoes (only while it swings, fading out as it
  // arrives, so a foot that has landed or stands is never pushed)
  for (let pass = 0; pass < 6; pass++) for (const h of ['L', 'R']) for (const g of ['L', 'R']) {
    const P = hf[h], Q = sf[g], wa = hf.swing[h], wb = sf.swing[g]
    if (wa + wb <= 0) continue
    const d = Math.hypot(P.x - Q.x, P.z - Q.z), sep = shoeSep(P, Q), shoeNeed = SHOE_GAP - sep.gap, need = Math.max(0.1 - d, shoeNeed)
    if (need <= 0) continue
    // along the line between the foot points, or (when it is the shoes that touch) the way that parts the shoes
    const byShoe = shoeNeed >= 0.1 - d
    const ux = byShoe ? sep.nx : d > 1e-6 ? (P.x - Q.x) / d : rightOf(fr.yaw).x, uz = byShoe ? sep.nz : d > 1e-6 ? (P.z - Q.z) / d : rightOf(fr.yaw).z
    const ka = wa / (wa + wb), kb = wb / (wa + wb), push = need * Math.max(wa, wb)
    P.x += ux * push * ka; P.z += uz * push * ka; Q.x -= ux * push * kb; Q.z -= uz * push * kb
  }
  const wL = (S) => (S.weight === 'L' ? 1 : 0)
  const sc = stepScale(M, i), wp = ramp(p, M.fam.w0 * sc, M.fam.w1 * sc)
  const sway = clamp(lerp(M.swK[i], M.swK[i + 1], ease(p)) + 0.35 * M.sw[i] * Math.sin(Math.PI * p), -0.09, 0.09)
  const turn = clamp((fr.vyaw * step.beats) / 0.8, -1, 1)
  let hold = p < 0.5 ? a.position : b.position
  if (step.herSpin && hold === 'closed') hold = 'open' // he lets go with his right hand while she turns
  const bps = (dance?.bpm || 120) / 60
  const ahead = frameAt(tl, M, style, t + 0.01), behind = frameAt(tl, M, style, t - 0.01), dt = Math.max(1e-6, Math.min(t + 0.01, M.T[n]) - Math.max(t - 0.01, 0))
  const spotOf = (segs) => segs.find((g) => t >= g.t0 - 0.05 && t <= g.t1 + M.fam.lag + 0.15)?.yaw
  const common = { rise, hold, style, dance: M.key, cbm: !!step.cbm, cbmp: !!step.cbmp }
  const chart = step.sway > 0 ? 'R' : step.sway < 0 ? 'L' : null
  const lead = {
    x: fr.x, z: fr.z, yaw: lagged.yaw, ...common, L: hf.L, R: hf.R, weightL: lerp(wL(a), wL(b), wp),
    sway, turn, speed: Math.hypot(fr.vx, fr.vz) * bps, swayChart: chart,
  }
  // In a hold with body contact her body keeps its place in his frame as his body turns: his torso trails his feet
  // (lagged), and so does hers, round him (fully at closed-hold spacing, not at all at arm's length). Her own turn
  // within the hold (into or out of promenade, her turns) is not lagged: in a closed hold she faces his body.
  const ox = fr.fx - fr.x, oz = fr.fz - fr.z, conn = clamp01((0.75 - Math.hypot(ox, oz)) / 0.25)
  const turnLag = conn * (lagged.yaw - lagged.mo - (fr.yaw - fr.mo)), off = spin({ x: ox, z: oz }, turnLag)
  const follow = {
    x: fr.x + off.x, z: fr.z + off.z, yaw: lagged.fyaw - lagged.turn + fr.turn, ...common, L: sf.L, R: sf.R, weightL: lerp(wL(A), wL(B), wp),
    sway: -sway, turn: clamp((((ahead.fyaw - behind.fyaw) / dt) * step.beats) / 0.8, -1, 1), underarm: !!step.underarm,
    speed: (Math.hypot(ahead.fx - behind.fx, ahead.fz - behind.fz) / dt) * bps, swayChart: chart && OTHER[chart],
  }
  const sl = spotOf(M.spinsL), sfy = spotOf(M.spinsF)
  if (sl !== undefined) lead.spot = sl
  if (sfy !== undefined) follow.spot = sfy
  return { lead, follow, step: i, progress: p }
}

// A standing couple (no steps): the timeline's first state, with the body placed as on the first frame of a
// routine (so nothing hops when the music starts).
function restOf(tl, dance, M) {
  const a = tl.states[0], A = tl.fstates[0]
  const foot = (f) => ({ x: f.x, z: f.z, y: 0, yaw: f.yaw, pitch: f.pt ? M.fam.point : 0 })
  const sp = spotFor({ x: M.X[0], z: M.Z[0], yaw: a.yaw }, { ...holdOf(a.position, dance?.style), turn: A.turn }, A.mo)
  const common = { rise: 0, hold: a.position, style: dance?.style, dance: M.key, sway: 0, turn: 0, speed: 0, cbm: false, cbmp: false, swayChart: null }
  return {
    lead: { x: M.X[0], z: M.Z[0], yaw: a.yaw, L: foot(a.L), R: foot(a.R), weightL: a.weight === 'L' ? 1 : 0, ...common },
    follow: { x: sp.x + A.dx, z: sp.z + A.dz, yaw: sp.yaw, L: foot(A.L), R: foot(A.R), weightL: A.weight === 'L' ? 1 : 0, ...common },
    step: 0, progress: 0,
  }
}

// The couple standing ready at a start ({ x, z, yaw, position, floor? }), as full poses: { lead, follow }. Give the
// routine (an array of figures) and this is exactly frame 0 of poseAt(buildTimeline(routine, dance, start), 0): the
// same places, facings, feet, hold, and the weight already on the feet that do not step first (his free foot is his
// first step's foot, hers the foot of her first step), so nothing hops or shifts weight when the count-in starts.
// Given only the routine's first figure it stands them the same way (places, facings, feet, weights and hold depend
// only on the first figure; only the velocity hints, speed and turn, may differ by a hair). Without a figure the
// leader's free foot is his L.
export function restPose(dance = {}, start = {}, first = null) {
  const figs = (Array.isArray(first) ? first : [first]).filter((f) => f && Array.isArray(f.steps) && f.steps.length)
  const p = poseAt(buildTimeline(figs, dance, { x: 0, z: 0, yaw: 0, ...start }), 0, dance)
  return { lead: p.lead, follow: p.follow }
}

// Follower placed from a leader pose alone (used before a run starts): her feet copy his by translation with
// L/R swapped, around her spot for the hold.
export function partnerOf(lead, gap, position = 'closed', style) {
  const h = holdOf(position, style)
  const spot = spotFor(lead, gap == null ? h : { ...h, gap })
  const feet = mirrorFeet(lead, spot, h.turn)
  const fy = (f) => (Number.isFinite(f?.yaw) ? f.yaw + spot.yaw - lead.yaw : spot.yaw)
  return {
    x: spot.x, z: spot.z, yaw: spot.yaw, rise: lead.rise || 0,
    L: { ...feet.L, y: lead.R.y || 0, yaw: fy(lead.R), pitch: lead.R.pitch || 0 },
    R: { ...feet.R, y: lead.L.y || 0, yaw: fy(lead.L), pitch: lead.L.pitch || 0 },
    weightL: Number.isFinite(lead.weightL) ? 1 - lead.weightL : 0.5,
  }
}

// Where the player's own foot lands on step i (used for ghost footprints).
export function targetFor(tl, i, role) {
  const step = tl.steps[i]
  if (role === 'leader') {
    const b = tl.states[i + 1]
    return { foot: step.foot, x: b[step.foot].x, z: b[step.foot].z, yaw: b.yaw }
  }
  const B = tl.fstates[i + 1], foot = step.follow.foot
  return { foot, x: B[foot].x, z: B[foot].z, yaw: B.yaw }
}
