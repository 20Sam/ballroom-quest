// Dancers built from simple shapes, plus the footwork engine that turns syllabus steps into motion.
import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const OTHER = { L: 'R', R: 'L' }

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
    case 'close': return [lat, 0]
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

// follow_steps: sparse { "<leader step index>": [foot, dir, ...] }; extra elements are ignored.
function followOverride(fig, idx) {
  const o = fig?.follow_steps?.[idx]
  return Array.isArray(o) && OTHER[o[0]] && KEY_FOR_DIR[o[1]] ? { foot: o[0], dir: o[1], ...(typeof o[2] === 'boolean' ? { weight: o[2] } : {}) } : null
}
const hasFollowSteps = (fig) => !!fig?.follow_steps && Object.keys(fig.follow_steps).length > 0

// What the follower does on the same count. A figure's follow_steps entry for this step wins; otherwise she
// mirrors him: other foot, forward<->back, left<->right. Beats and counts always come from his step.
// Without the figure, a timeline step's own resolved .follow is used.
export function followerStep(step, fig) {
  if (fig) { const o = followOverride(fig, step.idx); if (o) return o }
  else if (step.follow) return { ...step.follow }
  return { foot: OTHER[step.foot], dir: MIRROR_DIR[step.dir] || step.dir }
}

// Where the follower stands in each hold, relative to the leader: gap = ahead of him, side = to his right,
// turn = her yaw beyond facing him (+ = turned to her left), slack = how far her own steps may carry her
// from that spot before the hold pulls her back.
const HOLD = {
  closed: { gap: 0.58, side: 0.16, turn: 0, slack: 0.08 },
  promenade: { gap: 0.42, side: 0.36, turn: -0.75 * Math.PI, slack: 0.22 }, // V shape, her left side to his right
  open: { gap: 1.1, side: 0, turn: 0, slack: 0.45 },
  fan: { gap: 0.6, side: -1.0, turn: Math.PI / 2, slack: 0.5 }, // on his left at right angles, facing across him
}
// Closed hold spacing per style (curriculum notes): Standard/Smooth hold has body contact with each partner
// offset to their own left, so she stands close and to his right; Latin/Rhythm closed facing hold is a few
// inches apart with no offset.
const CLOSED_BY_STYLE = {
  standard: { gap: 0.42, side: 0.17 }, smooth: { gap: 0.44, side: 0.16 },
  latin: { gap: 0.5, side: 0.02 }, rhythm: { gap: 0.5, side: 0.02 },
}
const holdOf = (p, style) => {
  const h = HOLD[p] ?? HOLD.closed
  return (p === 'closed' || !HOLD[p]) && CLOSED_BY_STYLE[style] ? { ...h, ...CLOSED_BY_STYLE[style] } : h
}
const LOOSE_CLOSED_SLACK = 0.25

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
// side by side (or spin apart) instead of her orbiting him.
function turnsOpposite(fig) {
  const turns = fig.steps.map((st) => st[3] || 0)
  const net = turns.reduce((a, b) => a + b, 0)
  return Math.abs(net % 360) < 1e-6 && Math.max(0, ...turns.map(Math.abs)) >= 90
}

// Face-to-face mirror: her feet copy his around her own centre by translation with L/R swapped
// (her R goes where his L goes), turned with her when the hold turns her away from facing him.
function mirrorFeet(lead, spot, turn = 0) {
  const tr = (f) => { const v = spin({ x: f.x - lead.x, z: f.z - lead.z }, turn); return { x: spot.x + v.x, z: spot.z + v.z } }
  return { L: tr(lead.R), R: tr(lead.L) }
}

// Hold in force after step si of a figure that began in hold p0.
function holdAfter(fig, si, p0) {
  const n = fig.steps.length
  const end = !fig.ends || fig.ends === 'same' ? p0 : fig.ends
  if (end === p0) return p0
  let at
  if (p0 === 'promenade') { const t = fig.steps.findIndex((s) => s[1] === 'cross_fwd'); at = t >= 0 ? t + 1 : n - 1 } // faces him after the step through
  else if (p0 === 'fan') at = Math.ceil(n / 2) // walks across first, then turns under his arm
  else if (end === 'open') at = 0
  else if (end === 'fan') at = 1
  else at = n - 1 // into promenade or closed: on the last step
  return si >= Math.min(at, n - 1) ? end : p0
}

// One pass of the engine from a given start. The leader steps from his supporting foot. The follower mirrors
// him exactly in closed hold (translation with L/R swapped); when a figure has follow_steps, is danced side
// by side, or the couple is not in closed hold, she dances her own steps from her own supporting foot, and
// the hold keeps her within `slack` of her spot next to him.
function simulate(figs, dance, start) {
  const s = dance.stride
  const loose = dance.style === 'latin' || dance.style === 'rhythm' // Latin/Rhythm closed hold lets rocks separate a little
  const yaw0 = start.yaw ?? 0
  const pos0 = HOLD[start.position] ? start.position : 'closed'
  let st = { x: start.x, z: start.z, yaw: yaw0, L: local(start, yaw0, -0.1, 0), R: local(start, yaw0, 0.1, 0), weight: 'R', position: pos0 }
  const h0 = holdOf(pos0, dance.style), spot0 = spotFor(st, h0)
  let fs = { x: spot0.x, z: spot0.z, yaw: spot0.yaw, turn: h0.turn, mo: 0, ...mirrorFeet(st, spot0, h0.turn), weight: 'L', dx: 0, dz: 0 }
  const states = [structuredClone(st)], fstates = [structuredClone(fs)], steps = []
  let beat = 0
  figs.forEach((fig, fi) => {
    const p0 = st.position, figStart = beat, own = hasFollowSteps(fig), opp = loose && turnsOpposite(fig)
    fig.steps.forEach(([foot, dir, beats, turn, count, weight = true], si) => {
      // leader
      const next = structuredClone(st)
      next.yaw = st.yaw - THREE.MathUtils.degToRad(turn || 0) // + turn = to the right = clockwise seen from above
      const land = place(st, foot, dir, next.yaw, s)
      if (land) next[foot] = land
      if (weight) next.weight = foot
      const w = next[next.weight], o = next[OTHER[next.weight]]
      next.x = w.x * 0.7 + o.x * 0.3
      next.z = w.z * 0.7 + o.z * 0.3
      next.position = holdAfter(fig, si, p0)
      const step = { fig: fi, figId: fig.id, idx: si, foot, dir, beats, count, weight, startBeat: beat, figStart, moves: !!land }
      step.follow = followerStep(step, fig)

      // follower
      const turnB = nextTurn(fs.turn, st.position, next.position)
      const hb = { ...holdOf(next.position, dance.style), turn: turnB }
      const mo = fs.mo + (opp ? next.yaw - st.yaw : 0)
      const spot = spotFor(next, hb, mo)
      let nf
      if (!own && !opp && st.position === 'closed' && next.position === 'closed') {
        nf = { x: spot.x, z: spot.z, yaw: spot.yaw, turn: turnB, mo, ...mirrorFeet(next, spot, turnB), weight: OTHER[next.weight], dx: 0, dz: 0 }
        step.fmoves = step.moves
      } else {
        // she swivels with her hold turn, then steps from her own supporting foot in her own frame
        const piv = turnB - fs.turn
        const feet = {}
        for (const f of ['L', 'R']) { const v = spin({ x: fs[f].x - fs.x, z: fs[f].z - fs.z }, piv); feet[f] = { x: fs.x + v.x, z: fs.z + v.z } }
        const { foot: ff, dir: fd } = step.follow
        const fl = place(feet, ff, fd, spot.yaw, s)
        if (fl) feet[ff] = fl
        const fw = (step.follow.weight ?? weight) ? ff : fs.weight // her own weight flag wins (e.g. Reverse Corte)
        let cx = feet[fw].x * 0.7 + feet[OTHER[fw]].x * 0.3, cz = feet[fw].z * 0.7 + feet[OTHER[fw]].z * 0.3
        let dx = cx - spot.x, dz = cz - spot.z
        const d = Math.hypot(dx, dz), slack = next.position === 'closed' && loose ? LOOSE_CLOSED_SLACK : hb.slack
        if (d > slack) { // the hold pulls her back toward her spot
          const k = (d - slack) / d, mx = -dx * k, mz = -dz * k
          for (const f of ['L', 'R']) { feet[f].x += mx; feet[f].z += mz }
          cx += mx; cz += mz; dx += mx; dz += mz
        }
        nf = { x: cx, z: cz, yaw: spot.yaw, turn: turnB, mo, L: feet.L, R: feet.R, weight: fw, dx, dz }
        step.fmoves = !!fl
      }
      steps.push(step)
      beat += beats
      states.push(next); fstates.push(nf)
      st = next; fs = nf
    })
  })
  return { states, fstates, steps, totalBeats: beat }
}

function shiftTimeline(tl, dx, dz) {
  for (const S of [...tl.states, ...tl.fstates]) {
    S.x += dx; S.z += dz
    for (const f of ['L', 'R']) { S[f].x += dx; S[f].z += dz }
  }
}

// Build a timeline for a routine: one state per step for the leader (states) and the follower (fstates).
// With start.floor = { x, z, ex, ez, rx, rz, margin } the path is moved so its bounding box is centred on
// (x, z) and, if it would run into the oval wall (centre ex/ez, radii rx/rz minus margin), the start is
// turned by 90/180/270 degrees (or centred on the oval itself) to fit best. Nothing is scaled.
export function buildTimeline(figs, dance, start = { x: 0, z: 0, yaw: 0 }) {
  const room = start.floor
  if (!room) return simulate(figs, dance, start)
  const m = room.margin ?? 1
  const RX = Math.max(0.5, room.rx - m), RZ = Math.max(0.5, room.rz - m)
  const ex = room.ex ?? room.x, ez = room.ez ?? room.z
  const centres = [{ x: room.x, z: room.z }, ...(ex !== room.x || ez !== room.z ? [{ x: ex, z: ez }] : [])]
  let best = null
  for (const k of [0, 1, 2, 3]) {
    const tl = simulate(figs, dance, { ...start, yaw: (start.yaw ?? 0) + k * Math.PI / 2 })
    const pts = []
    for (const S of [...tl.states, ...tl.fstates]) pts.push(S, S.L, S.R)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z) }
    for (const c of centres) {
      const dx = c.x - (x0 + x1) / 2, dz = c.z - (z0 + z1) / 2
      let r = 0
      for (const p of pts) r = Math.max(r, Math.hypot((p.x + dx - ex) / RX, (p.z + dz - ez) / RZ))
      if (!best || (best.r > 1 && r < best.r - 1e-9)) best = { k, tl, dx, dz, r }
      if (best.r <= 1) break
    }
    if (best.r <= 1) break
  }
  shiftTimeline(best.tl, best.dx, best.dz)
  best.tl.fit = { turnDeg: best.k * 90, reach: best.r }
  return best.tl
}

const ease = (t) => t * t * (3 - 2 * t)
const clamp01 = (t) => Math.min(1, Math.max(0, t))

// Rise and fall by the dance's "rise" field, measured from the start of the current figure:
// waltz = rise through 1, up on 2-3, lower at the end of 3; swing = up and down over each slow or
// quick-quick (2 beats); none (default) = level, as in tango and all Latin and Rhythm dances.
function riseAt(dance, beat, figStart) {
  const t = Math.max(0, beat - figStart)
  switch (dance?.rise) {
    case 'waltz': { const q = t % 3; return 0.05 * Math.min(ease(clamp01((q - 0.5) / 0.7)), ease(clamp01((3 - q) / 0.45))) }
    case 'swing': return 0.04 * Math.sin(((t % 2) / 2) * Math.PI)
    default: return 0
  }
}

// Pose of the leader + follower at a given beat.
export function poseAt(tl, beat, dance) {
  const { steps, states, fstates } = tl
  let i = steps.findIndex((s) => beat < s.startBeat + s.beats)
  if (i < 0) i = steps.length - 1
  const step = steps[i]
  const a = states[i], b = states[i + 1]
  const p = step.beats > 0 ? clamp01((beat - step.startBeat) / step.beats) : 1
  const e = ease(p)
  const lerp = (u, v) => u + (v - u) * e
  const lift = Math.sin(p * Math.PI) * 0.07
  const lead = { x: lerp(a.x, b.x), z: lerp(a.z, b.z), yaw: lerp(a.yaw, b.yaw), L: { ...a.L }, R: { ...a.R } }
  const mf = step.foot
  lead[mf] = { x: lerp(a[mf].x, b[mf].x), z: lerp(a[mf].z, b[mf].z), y: step.moves ? lift : 0 }
  lead.rise = riseAt(dance, beat, step.figStart ?? 0)
  if (dance.name === 'Samba') lead.rise -= 0.025 * Math.sin(Math.PI * (beat % 1)) ** 2 // samba bounce: knees flex on every count

  // follower: body at her spot by the leader (plus any slack), feet relative to her body
  const A = fstates[i], B = fstates[i + 1]
  const ha = holdOf(a.position, dance.style), hb = holdOf(b.position, dance.style)
  const turn = lerp(A.turn, B.turn)
  const spot = spotFor(lead, { gap: lerp(ha.gap, hb.gap), side: lerp(ha.side, hb.side), turn }, lerp(A.mo, B.mo))
  const bx = spot.x + lerp(A.dx, B.dx), bz = spot.z + lerp(A.dz, B.dz)
  const follow = { x: bx, z: bz, yaw: spot.yaw, rise: lead.rise }
  const ff = step.follow?.foot
  for (const f of ['L', 'R']) {
    const oa = spin({ x: A[f].x - A.x, z: A[f].z - A.z }, -A.turn), ob = spin({ x: B[f].x - B.x, z: B[f].z - B.z }, -B.turn)
    const v = spin({ x: lerp(oa.x, ob.x), z: lerp(oa.z, ob.z) }, turn)
    follow[f] = { x: bx + v.x, z: bz + v.z, y: f === ff && step.fmoves ? lift : 0 }
  }
  // extras for the bodies: hold for the arms/head, style for posture, turn direction for CBM, and sway
  // (Standard/Smooth: lean toward the inside of the turn on the 2nd and 3rd steps of turning figures)
  const hold = p < 0.5 ? a.position : b.position
  const dyaw = b.yaw - a.yaw
  const sw = dance.style === 'standard' || dance.style === 'smooth'
    ? Math.max(-0.09, Math.min(0.09, -dyaw * 0.12)) * Math.sin(Math.PI * Math.min(1, p + 0.25)) : 0
  Object.assign(lead, { hold, style: dance.style, turn: Math.sign(dyaw) * Math.min(1, Math.abs(dyaw) / 0.8), sway: sw })
  Object.assign(follow, { hold, style: dance.style, turn: lead.turn, sway: -sw })
  return { lead, follow, step: i, progress: p }
}

// Follower placed from a leader pose alone (used before a run starts): her feet copy his by translation with
// L/R swapped, around her spot for the hold.
export function partnerOf(lead, gap, position = 'closed', style) {
  const h = holdOf(position, style)
  const spot = spotFor(lead, gap == null ? h : { ...h, gap })
  const feet = mirrorFeet(lead, spot, h.turn)
  return { x: spot.x, z: spot.z, yaw: spot.yaw, rise: lead.rise || 0, L: { ...feet.L, y: lead.R.y || 0 }, R: { ...feet.R, y: lead.L.y || 0 } }
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
