// Ghost footprints: where the player's own feet land on the next three steps.
// Each print is a shoe sole seen from above, with a separate ball/toe pad and heel pad, so it is clear which end
// is the toe. The pad that lands first is solid with a letter on it (H = heel lead: forward steps in Standard and
// Smooth, or 'H…' footwork; T = toe/ball lead: back, side and closing steps, Latin ball steps, 'T…'/'B…'
// footwork, taps); the other pad is pale. Prints lie in the direction the foot lands (Latin turnout included), are
// numbered 1, 2, 3 in step order, and get a curved arrow round the toe when the foot then swivels more than 30°
// while it stands. Colours are chosen to read on the black marble, the orange herringbone and the club floor: the
// left foot is azure and the right foot gold, each pad ringed white inside a navy edge, on a soft white halo. The
// next print is drawn over everything (no depth test), so the leader sees it through his partner's skirt.
import * as THREE from 'three'
import { shoePrint } from './body.js'

const TAU = Math.PI * 2
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const NAVY = '#0b2a3c'
export const PRINT_COLOURS = {
  L: { fill: '#1e90e6', ring: '#ffffff', text: '#ffffff', hex: 0x1e90e6 },
  R: { fill: '#ffc21a', ring: '#fff7df', text: NAVY, hex: 0xffc21a },
}
const OPACITY = [1, 0.82, 0.64] // the next step, then the two after it

// Which part of the foot lands first on step s for a role: 'heel' | 'toe' | 'flat'. Mirrors the footwork engine
// (dancer.js landPitch: Standard/Smooth heel leads, everything else lands on the ball), checked against the
// engine's foot pitch at landing over the whole syllabus.
const FWDISH = new Set(['fwd', 'diag_fwd_l', 'diag_fwd_r', 'cross_fwd', 'slip_fwd'])
const BACKISH = new Set(['back', 'diag_back_l', 'diag_back_r', 'cross_back', 'cross_behind', 'slip_back'])
const classOf = (dir) => (FWDISH.has(dir) ? 'fwd' : BACKISH.has(dir) ? 'back' : dir === 'side_l' || dir === 'side_r' ? 'side' : dir === 'close' ? 'close' : 'none')
export function landingLead(role, s, danceStyle, danceKey) {
  const lead = role === 'leader'
  const dir = lead ? s.dir : s.follow?.dir
  const weight = lead ? s.weight !== false : (s.follow?.weight ?? s.weight) !== false
  if (!weight) return 'toe' // a tap or point
  const cls = classOf(dir)
  const heelStyle = (danceStyle === 'standard' || danceStyle === 'smooth') && !/samba|paso/i.test(danceKey || '')
  if (heelStyle) {
    const code = lead ? String(s.fw || '').trim().toUpperCase() : ''
    if (code) {
      if (code.startsWith('H')) return 'heel'
      if (/^(T|B|IE|INSIDE|TOE|BALL)/.test(code)) return 'toe'
      if (/WHOLE|FLAT/.test(code)) return 'flat'
    }
    return cls === 'fwd' ? 'heel' : cls === 'none' ? 'flat' : 'toe'
  }
  return cls === 'none' ? 'flat' : 'toe'
}

// ---------- textures (a right sole drawn toe-up; the left one is its mirror image) ----------
const CW = 192, CH = 448, MX = 30, MY = 30 // canvas and the halo's margin (px)
const SW = CW - 2 * MX, SH = CH - 2 * MY
const X = (u) => CW / 2 + (u * SW) / 2 // u: -1 = the big-toe (inner) side of a right foot, +1 = the outer side
const Y = (v) => MY + (1 - v) * SH // v: 0 = back of the heel, 1 = tip of the toe
const BALL_C = [-0.08, 0.72], HEEL_C = [0.1, 0.15]
function ballPad(g) {
  g.beginPath()
  g.moveTo(X(0.9), Y(0.62))
  g.bezierCurveTo(X(1.0), Y(0.86), X(0.55), Y(1.0), X(-0.12), Y(1.0))
  g.bezierCurveTo(X(-0.72), Y(1.0), X(-1.0), Y(0.86), X(-0.97), Y(0.64))
  g.bezierCurveTo(X(-0.95), Y(0.5), X(-0.62), Y(0.43), X(-0.12), Y(0.44))
  g.bezierCurveTo(X(0.42), Y(0.45), X(0.86), Y(0.5), X(0.9), Y(0.62))
  g.closePath()
}
function heelPad(g) {
  g.beginPath()
  g.moveTo(X(-0.56), Y(0.3))
  g.bezierCurveTo(X(-0.68), Y(0.15), X(-0.5), Y(0.0), X(0.1), Y(0.0))
  g.bezierCurveTo(X(0.7), Y(0.0), X(0.86), Y(0.15), X(0.76), Y(0.3))
  g.quadraticCurveTo(X(0.1), Y(0.26), X(-0.56), Y(0.3))
  g.closePath()
}
function sole(g) { // the whole sole: both pads and the waist between them
  g.beginPath()
  g.moveTo(X(0.9), Y(0.62))
  g.bezierCurveTo(X(1.0), Y(0.86), X(0.55), Y(1.0), X(-0.12), Y(1.0))
  g.bezierCurveTo(X(-0.72), Y(1.0), X(-1.0), Y(0.86), X(-0.97), Y(0.64))
  g.bezierCurveTo(X(-0.92), Y(0.5), X(-0.4), Y(0.42), X(-0.52), Y(0.28))
  g.bezierCurveTo(X(-0.68), Y(0.13), X(-0.45), Y(0.0), X(0.1), Y(0.0))
  g.bezierCurveTo(X(0.7), Y(0.0), X(0.86), Y(0.15), X(0.8), Y(0.32))
  g.bezierCurveTo(X(0.78), Y(0.42), X(0.86), Y(0.5), X(0.9), Y(0.62))
  g.closePath()
}
function drawPrint(foot, lead) {
  const c = document.createElement('canvas')
  c.width = CW; c.height = CH
  const g = c.getContext('2d'), col = PRINT_COLOURS[foot]
  g.save()
  if (foot === 'L') { g.translate(CW, 0); g.scale(-1, 1) }
  // a soft white glow (reads on the dark marble and the club floor) round a tight navy shadow (reads on the
  // warm wood), then a pale sole with a thin navy edge
  g.shadowColor = 'rgba(255,255,255,0.95)'; g.shadowBlur = 26
  g.fillStyle = 'rgba(255,255,255,0.55)'; sole(g); g.fill(); g.fill()
  g.shadowColor = 'rgba(11,42,60,0.85)'; g.shadowBlur = 12
  g.fillStyle = 'rgba(11,42,60,0.6)'; sole(g); g.fill()
  g.shadowBlur = 0
  g.fillStyle = 'rgba(236,248,252,0.6)'; sole(g); g.fill()
  g.lineWidth = 8; g.strokeStyle = NAVY; g.stroke() // a bold navy edge: the gold print still reads on the orange wood
  // the pads: navy edge, white ring, colour (pale when the other pad lands first)
  for (const [pad, part] of [[ballPad, 'toe'], [heelPad, 'heel']]) {
    pad(g)
    g.lineJoin = 'round'
    g.lineWidth = 13; g.strokeStyle = NAVY; g.stroke()
    g.lineWidth = 6; g.strokeStyle = col.ring; g.stroke()
    g.fillStyle = '#ffffff'; g.fill()
    const lands = lead === 'flat' || lead === part
    g.globalAlpha = lands ? 1 : 0.6
    g.fillStyle = col.fill; g.fill()
    g.globalAlpha = 1
    // the pad that does not land first: pale with a dashed navy outline, so it stays visible on warm wood
    if (!lands) { g.setLineDash([10, 8]); g.lineWidth = 5; g.strokeStyle = NAVY; g.stroke(); g.setLineDash([]) }
  }
  g.restore()
  // the landing pad's letter (drawn unmirrored so it reads)
  if (lead === 'heel' || lead === 'toe') {
    const [u, v] = lead === 'heel' ? HEEL_C : BALL_C
    const cx = foot === 'L' ? CW - X(u) : X(u), cy = Y(v)
    g.beginPath(); g.arc(cx, cy, 46, 0, TAU)
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 6; g.strokeStyle = NAVY; g.stroke()
    g.fillStyle = NAVY; g.font = 'bold 60px system-ui, -apple-system, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(lead === 'heel' ? 'H' : 'T', cx, cy + 3)
  }
  return c
}
function drawBadge(foot, n) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d'), col = PRINT_COLOURS[foot]
  g.beginPath(); g.arc(32, 32, 27, 0, TAU)
  g.fillStyle = col.fill; g.fill()
  g.lineWidth = 6; g.strokeStyle = NAVY; g.stroke()
  g.lineWidth = 2.5; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 22.5, 0, TAU); g.stroke()
  g.fillStyle = col.text; g.font = 'bold 34px system-ui, -apple-system, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(String(n), 32, 34)
  return c
}
const TEX = new Map()
function tex(key, draw) {
  if (!TEX.has(key)) {
    const canvas = draw()
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
    t.userData.canvas = canvas
    TEX.set(key, t)
  }
  return TEX.get(key)
}
const printTex = (foot, lead) => tex(`p${foot}${lead}`, () => drawPrint(foot, lead))
const badgeTex = (foot, n) => tex(`b${foot}${n}`, () => drawBadge(foot, n))

// ---------- geometry ----------
// A unit quad on the floor: toe (texture top) toward +z, the texture's right edge on the dancer's right (-x).
function quad() {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([1, 0, 0, 0, 0, 1, 1, 1], 2))
  g.setIndex([0, 2, 1, 0, 3, 2])
  return g
}
// A curved arrow on the floor round the origin, from just behind the toe line (angle 0 = +z) through d radians
// (+ = toward +x, the dancer's left: a turn to the left); pad thickens it into its own outline.
const ARROWS = new Map()
function arrowGeo(r, w, d, pad = 0) {
  const key = `${r.toFixed(3)}|${w}|${d.toFixed(2)}|${pad}`
  if (ARROWS.has(key)) return ARROWS.get(key)
  const s = Math.sign(d) || 1, head = Math.min(0.6, Math.abs(d) * 0.45)
  const a0 = -s * (0.12 + pad / r), aEnd = d - s * head, ww = w + 2 * pad
  const P = (a, rr) => [Math.sin(a) * rr, 0, Math.cos(a) * rr]
  const n = Math.max(4, Math.ceil(Math.abs(aEnd - a0) / 0.08))
  const pos = [], idx = []
  for (let k = 0; k <= n; k++) { const a = a0 + ((aEnd - a0) * k) / n; pos.push(...P(a, r - ww / 2), ...P(a, r + ww / 2)) }
  for (let k = 0; k < n; k++) { const i = k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2) }
  const b = pos.length / 3, hw = w * 1.7 + pad * 1.6
  pos.push(...P(aEnd, r - hw), ...P(aEnd, r + hw), ...P(d + (s * pad * 2.2) / r, r))
  idx.push(b, b + 1, b + 2)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  ARROWS.set(key, g)
  return g
}

// ---------- the prints ----------
const CANVAS_K = { len: CH / SH, wid: CW / SW }
const SIZE = { len: 1.4, wid: 1.8 } // drawn sole vs the real shoe (larger than life, so heel and toe read from the camera)

export function createFootprints(scene, chip = document.getElementById('printKey')) {
  const plane = quad()
  const basic = (o) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, ...o })
  const slots = [0, 1, 2].map((k) => {
    const group = new THREE.Group()
    const print = new THREE.Mesh(plane, basic({ map: printTex('L', 'flat') }))
    print.position.y = 0.014 + (2 - k) * 0.002
    const edge = new THREE.Mesh(arrowGeo(0.2, 0.02, 1), basic({ color: NAVY }))
    const fill = new THREE.Mesh(arrowGeo(0.2, 0.02, 1), basic({ color: 0xffffff }))
    edge.position.y = print.position.y + 0.003; fill.position.y = print.position.y + 0.004
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex('L', k + 1), transparent: true, depthWrite: false, toneMapped: false }))
    badge.scale.setScalar(0.15)
    group.add(print, edge, fill)
    scene.add(group, badge)
    // the next step draws over the dancers; the later ones are hidden by whatever stands on them
    const top = k === 0
    for (const m of [print, edge, fill]) m.material.depthTest = !top
    badge.material.depthTest = !top
    print.renderOrder = top ? 30 : 12 - k; edge.renderOrder = print.renderOrder + 1; fill.renderOrder = print.renderOrder + 2
    badge.renderOrder = top ? 33 : 15
    group.visible = badge.visible = false
    return { group, print, edge, fill, badge }
  })
  const cache = new WeakMap() // timeline -> role -> per-step print info

  // The print for step i of the timeline in the player's role, or null when that step does not move their foot.
  function info(tl, i, role, dance) {
    let byRole = cache.get(tl)
    if (!byRole) cache.set(tl, (byRole = {}))
    const list = (byRole[role] ??= [])
    if (list[i] !== undefined) return list[i]
    const lead = role === 'leader', s = tl.steps[i]
    const moves = lead ? s.moves : s.fmoves
    if (!moves) return (list[i] = null)
    const foot = lead ? s.foot : s.follow.foot, states = lead ? tl.states : tl.fstates
    const at = states[i + 1], F = at[foot]
    const yaw0 = Number.isFinite(F.yaw) ? F.yaw : at.yaw
    const p = shoePrint(lead ? 'leader' : 'follower', foot, { x: F.x, z: F.z, yaw: yaw0 }, dance.style, dance.key, tl.states[i + 1].position)
    // the swivel: how far this foot turns while it stands, up to the step that next lifts it
    let j = i + 1
    while (j < tl.steps.length) {
      const t = tl.steps[j]
      if ((lead ? t.moves : t.fmoves) && (lead ? t.foot : t.follow.foot) === foot) break
      j++
    }
    const E = states[Math.min(j, states.length - 1)], Fe = E[foot]
    const swivel = wrap((Number.isFinite(Fe?.yaw) ? Fe.yaw : E.yaw) - yaw0)
    return (list[i] = { foot, ...p, lead: landingLead(role, s, dance.style, dance.key), swivel })
  }

  function place(slot, P, k, now) {
    const { group, print, edge, fill, badge } = slot
    const Lp = P.len * SIZE.len * CANVAS_K.len, Wp = P.width * SIZE.wid * CANVAS_K.wid
    group.position.set(P.x, 0, P.z); group.rotation.set(0, P.yaw, 0)
    const pulse = k === 0 ? 1 + 0.05 * Math.sin(now * TAU * 1.1) : 1
    print.scale.set(Wp * pulse, 1, Lp * pulse)
    print.material.map = printTex(P.foot, P.lead)
    const op = OPACITY[k]
    print.material.opacity = op
    // the swivel arrow round the toe
    const turn = Math.abs(P.swivel) > Math.PI / 6
    edge.visible = fill.visible = turn
    if (turn) {
      const r = (P.len * SIZE.len) / 2 + 0.035, d = Math.round(Math.max(-5.2, Math.min(5.2, P.swivel)) / 0.05) * 0.05 // (cached per 3°)
      edge.geometry = arrowGeo(r, 0.024, d, 0.009); fill.geometry = arrowGeo(r, 0.024, d)
      fill.material.color.set(PRINT_COLOURS[P.foot].hex)
      edge.material.opacity = fill.material.opacity = op
    }
    // the step number beside the print's outer edge, toward the heel
    const out = P.foot === 'L' ? 1 : -1, lx = Math.cos(P.yaw), lz = -Math.sin(P.yaw), fx = Math.sin(P.yaw), fz = Math.cos(P.yaw)
    const side = Wp / 2 + 0.03, back = -Lp * 0.18
    badge.position.set(P.x + lx * out * side + fx * back, 0.09, P.z + lz * out * side + fz * back)
    badge.material.map = badgeTex(P.foot, k + 1)
    badge.material.opacity = Math.min(1, op + 0.1)
    group.visible = badge.visible = true
  }

  let chipFilled = false
  function showChip(on) {
    if (!chip) return
    if (on && !chipFilled) {
      chipFilled = true
      const img = (t, alt) => { // the print without its halo margin
        const c = document.createElement('canvas'), m = 10
        c.width = SW + 2 * m; c.height = SH + 2 * m
        c.getContext('2d').drawImage(t.userData.canvas, MX - m, MY - m, c.width, c.height, 0, 0, c.width, c.height)
        return `<img src="${c.toDataURL()}" alt="${alt}">`
      }
      chip.innerHTML = `<span class="pk-title">Footprints</span>
        <span>${img(printTex('L', 'flat'), 'blue print')}<b>Left</b><kbd class="pk-key kL">S</kbd></span>
        <span>${img(printTex('R', 'flat'), 'gold print')}<b>Right</b><kbd class="pk-key kR">L</kbd></span>
        <span>${img(printTex('L', 'heel'), 'heel pad solid')}Heel lands first</span>
        <span>${img(printTex('R', 'toe'), 'toe pad solid')}Toe lands first</span>
        <span><i class="pk-num">1</i>next step</span>
        <span><i class="pk-turn">↻</i>foot swivels</span>`
    }
    chip.classList.toggle('hidden', !on)
  }

  return {
    // tl = the run's timeline, pose = poseAt's result (step, progress), role = 'leader' | 'follower', dance = the
    // catalog entry with its key ({ key, style }); returns how many prints are showing
    update(tl, pose, role, dance, now = performance.now() / 1000) {
      let shown = 0
      for (let i = Math.max(0, pose.step); i < tl.steps.length && shown < 3; i++) {
        if (i === pose.step && pose.progress > 0.85) continue
        const P = info(tl, i, role, dance)
        if (!P) continue
        place(slots[shown], P, shown, now)
        shown++
      }
      for (let k = shown; k < 3; k++) slots[k].group.visible = slots[k].badge.visible = false
      showChip(true)
      return shown
    },
    hide() {
      for (const s of slots) s.group.visible = s.badge.visible = false
      showChip(false)
    },
    // where the next print is (for the camera), or null
    next() { const s = slots[0]; return s.group.visible ? s.group.position : null },
  }
}
