// The complete syllabus in the game (data/syllabus.json, served by /api/syllabus/<dance>):
//   level chips that filter the floor panel's figure list (keys 1-9 and 0 pick from what is shown),
//   a card per figure: what it is, a coaching tip, your part and your partner's step by step, the figures that
//   go well before and after it (click to add), and a link to the full chart on BallroomDancers.com,
//   a browser of the whole syllabus (key Y), including figures the game cannot dance yet, and
//   suggested next figures after the last one in your routine (from the site's Followed By lists).
// main.js passes in what it owns: initSyllabus({ esc, openModal, getState, addFigure, figsOf }).

let ctx = null
const cache = new Map() // dance -> syllabus entry, or null when the server has none
const LS_KEY = 'bq_level_filter_v1'

// Syllabus levels in teaching order (International, American and Social names) and their short chip labels.
const LEVEL_ORDER = ['Newcomer', 'Concepts And Components', 'Beginning Bronze', 'Intermediate Bronze', 'Full Bronze', 'Bronze',
  'Beginning Silver', 'Intermediate Silver', 'Full Silver', 'Silver', 'Gold', 'Open Gold Variations',
  'Level 1', 'Level I', 'Level 2', 'Level II', 'Level 3', 'Level III', 'Level 4', 'Level IV', 'Level 5', 'Level 6']
const SHORT = { Newcomer: 'Starter', 'Concepts And Components': 'Basics', 'Beginning Bronze': 'Beg. Bronze',
  'Intermediate Bronze': 'Int. Bronze', 'Full Bronze': 'Full Bronze', 'Beginning Silver': 'Beg. Silver',
  'Intermediate Silver': 'Int. Silver', 'Full Silver': 'Full Silver', 'Open Gold Variations': 'Gold' }
const rank = (lv) => { const i = LEVEL_ORDER.indexOf(lv); return i < 0 ? 99 : i }
export const levelLabel = (lv) => SHORT[lv] || lv

const OTHER = { L: 'R', R: 'L' }
// The follower's default step is the mirror image of his (shared contract with dancer.js and the validator).
const MIRROR = { fwd: 'back', back: 'fwd', side_l: 'side_r', side_r: 'side_l', diag_fwd_r: 'diag_back_l', diag_back_l: 'diag_fwd_r',
  diag_fwd_l: 'diag_back_r', diag_back_r: 'diag_fwd_l', slip_back: 'slip_fwd', slip_fwd: 'slip_back' }
const DIR_WORDS = { fwd: 'forward', back: 'back', side_l: 'to the side (left)', side_r: 'to the side (right)',
  diag_fwd_l: 'diagonally forward left', diag_fwd_r: 'diagonally forward right', diag_back_l: 'diagonally back left',
  diag_back_r: 'diagonally back right', cross_fwd: 'forward, crossing', cross_back: 'back, crossing',
  cross_behind: 'crossed behind', close: 'close', replace: 'replace weight', in_place: 'in place',
  slip_back: 'slip back', slip_fwd: 'slip forward' }
const FOOT = { L: 'Left foot', R: 'Right foot' }
const HOLD = { closed: 'closed hold', promenade: 'promenade', open: 'open hold', fan: 'fan position', same: 'the same hold' }

function turnWords(deg) {
  if (!deg) return ''
  const eighths = Math.round(Math.abs(deg) / 45)
  const frac = { 1: '⅛', 2: '¼', 3: '⅜', 4: '½', 5: '⅝', 6: '¾', 7: '⅞', 8: 'a full' }[eighths] || `${Math.round(Math.abs(deg))}°`
  return `${frac} turn ${deg > 0 ? 'right' : 'left'}`
}

export function initSyllabus(c) { ctx = c; injectStyle() }

export async function loadSyllabus(dance) {
  if (cache.has(dance)) return cache.get(dance)
  let data = null
  try {
    const r = await fetch(`/api/syllabus/${encodeURIComponent(dance)}`)
    data = r.ok ? await r.json() : null
  } catch { data = null }
  cache.set(dance, data)
  return data
}

// ---------- level filter ----------
function saved() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} } }
export function levelsOf(figs) { return [...new Set(figs.map((f) => f.level))].sort((a, b) => rank(a) - rank(b)) }
export function chosenLevel(dance, figs) {
  const lv = saved()[dance]
  const levels = levelsOf(figs)
  if (lv === 'all' || levels.includes(lv)) return lv
  return levels.length > 1 ? levels[0] : 'all'
}
export function setLevel(dance, level) {
  const s = saved(); s[dance] = level
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* private mode: keep it for this page only */ }
}
export function visibleFigs(dance, figs) {
  const lv = chosenLevel(dance, figs)
  return lv === 'all' ? figs : figs.filter((f) => f.level === lv)
}
export function chipsHtml(dance, figs) {
  const { esc } = ctx
  const levels = levelsOf(figs)
  if (levels.length < 2) return ''
  const lv = chosenLevel(dance, figs)
  const chip = (key, label, n) => `<button data-level="${esc(key)}" class="${key === lv ? 'on' : ''}" title="${esc(key === 'all' ? 'Every figure' : key)}">${esc(label)} <small>${n}</small></button>`
  return chip('all', 'All', figs.length) + levels.map((l) => chip(l, levelLabel(l), figs.filter((f) => f.level === l).length)).join('') +
    `<button data-syllabus="1" class="browse" title="The whole syllabus (Y)">📖 Syllabus</button>`
}

// ---------- suggested next figures ----------
export function nextIds(routine, figsById) {
  const last = figsById[routine[routine.length - 1]]
  return new Set(last?.leads_to || [])
}

// ---------- step tables ----------
function partSteps(f, role) {
  const fs = f.follow_steps || {}, ft = f.follow_turns || {}
  return f.steps.map((st, i) => {
    const [foot, dir, beats, turn, count, weight] = st
    if (role === 'leader') return { count, foot, dir, turn, beats, weight: weight !== false }
    const o = fs[String(i)]
    const her = o ? { foot: o[0], dir: o[1], weight: typeof o[2] === 'boolean' ? o[2] : weight !== false } : { foot: OTHER[foot], dir: MIRROR[dir] || dir, weight: weight !== false }
    return { count, beats, ...her, turn: ft[String(i)] !== undefined ? ft[String(i)] : turn }
  })
}
function stepTable(f, role) {
  const { esc } = ctx
  const rows = partSteps(f, role).map((s, i) => `<tr><td>${esc(s.count)}</td><td class="ft ${s.foot}">${FOOT[s.foot]}</td>
    <td>${esc(DIR_WORDS[s.dir] || s.dir)}${s.weight ? '' : ' <small>(no weight)</small>'}</td><td>${esc(turnWords(s.turn))}</td>
    <td>${role === 'leader' && f.footwork ? esc(f.footwork[i] || '') : ''}</td></tr>`).join('')
  return `<table class="syl-steps"><thead><tr><th>Count</th><th>Foot</th><th>Step</th><th>Turn</th><th>${role === 'leader' && f.footwork ? 'Footwork' : ''}</th></tr></thead><tbody>${rows}</tbody></table>`
}

function entryFor(syl, f) {
  if (!syl || !f?.ref) return null
  return syl.figures.find((e) => e.ref === f.ref) || null
}

function figChips(ids, figsById) {
  const { esc } = ctx
  return ids.filter((id) => figsById[id]).map((id) => `<button class="syl-chip" data-card="${esc(id)}">${esc(figsById[id].name)} <small>${esc(levelLabel(figsById[id].level))}</small></button>`).join(' ')
}
function siteLinks(list) {
  const { esc } = ctx
  if (!list?.length) return ''
  const seen = new Set()
  return list.filter((l) => { const k = `${l.name}|${l.steps}|${l.this_steps}`; if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, 14).map((l) => `<li>${l.this_steps ? `steps ${esc(l.this_steps)} → ` : ''}${l.steps ? `steps ${esc(l.steps)} of ` : ''}${esc(l.name)}${l.condition ? ` <small>(${esc(l.condition)})</small>` : ''}</li>`).join('')
}

// ---------- the figure card ----------
export async function openCard(figId) {
  const { esc, openModal, getState } = ctx
  const S = getState()
  const f = S.figs[figId]
  if (!f) return
  const syl = await loadSyllabus(f.dance)
  const e = entryFor(syl, f)
  const mine = S.role === 'leader' ? 'leader' : 'follower', theirs = mine === 'leader' ? 'follower' : 'leader'
  const onFloor = S.mode === 'floor' && S.dance === f.dance
  const before = (f.comes_from || []), after = (f.leads_to || [])
  const tech = [f.rise_fall && `<b>Rise and fall:</b> ${esc(f.rise_fall)}`, f.sway && `<b>Sway:</b> ${esc(f.sway)}`, f.cbm && `<b>CBM:</b> ${esc(f.cbm)}`].filter(Boolean).join(' · ')
  openModal(`<div class="syl-card">
    <h2>${esc(f.name)} <span class="tag">${esc(f.level)}</span>${e?.number ? ` <span class="tag">#${esc(e.number)}</span>` : ''}</h2>
    ${e ? `<p>${esc(e.summary)}</p><p class="syl-tip">💡 ${esc(e.tip)}</p>` : f.notes_for_beginners ? `<p>${esc(f.notes_for_beginners)}</p>` : ''}
    <p class="syl-meta">Starts from ${f.accepts.map((p) => HOLD[p] || p).join(' or ')} · ends in ${HOLD[f.ends] || f.ends} · ${esc(f.beats ?? f.steps.reduce((a, s) => a + s[2], 0))} beats · ${esc(f.start_foot ? (mine === 'leader' ? FOOT[f.start_foot] : FOOT[OTHER[f.start_foot]]) : '')} first</p>
    <h3>Your part (${mine})</h3>
    <p class="syl-cue">${esc(mine === 'leader' ? f.lead_cue : f.follow_cue)}</p>
    ${stepTable(f, mine)}
    <details><summary>Your partner's part (${theirs})</summary><p class="syl-cue">${esc(theirs === 'leader' ? f.lead_cue : f.follow_cue)}</p>${stepTable(f, theirs)}</details>
    ${tech ? `<p class="syl-tech">${tech}</p>` : ''}
    <p class="syl-mistake"><b>Watch out:</b> ${esc(f.mistake)}</p>
    ${before.length || after.length ? `<div class="syl-links">
      ${before.length ? `<div><h4>Good figures before it</h4>${figChips(before, S.figs)}</div>` : ''}
      ${after.length ? `<div><h4>Good figures after it</h4>${figChips(after, S.figs)}</div>` : ''}
      <p class="syl-hint">Click a figure to open its card${onFloor ? ' and add it' : ''}.</p>
    </div>` : ''}
    ${e && (e.followed_by?.length || e.preceded_by?.length) ? `<details><summary>The full syllabus lists (including part-figures)</summary>
      <div class="syl-lists"><div><h4>Preceded by</h4><ul>${siteLinks(e.preceded_by)}</ul></div><div><h4>Followed by</h4><ul>${siteLinks(e.followed_by)}</ul></div></div></details>` : ''}
    <div class="syl-actions">
      ${onFloor ? `<button class="primary" data-add-fig="${esc(f.id)}">＋ Add to routine</button>` : ''}
      ${e?.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Full chart on BallroomDancers.com ↗</a>` : ''}
    </div>
  </div>`)
}

// ---------- the whole syllabus ----------
export async function openBrowser(dance) {
  const { esc, openModal, getState } = ctx
  const S = getState()
  const syl = await loadSyllabus(dance)
  const name = S.cat?.dances?.[dance]?.name || dance
  if (!syl) { openModal(`<h2>${esc(name)} syllabus</h2><p>The full syllabus is not available on this server.</p>`); return }
  const byLevel = new Map()
  for (const e of syl.figures) { if (!byLevel.has(e.level)) byLevel.set(e.level, []); byLevel.get(e.level).push(e) }
  const ICON = { playable: '▶', same_as: '▶', chart_only: '◌', no_chart: '·' }
  const sections = [...byLevel.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([lv, list]) => `<h3>${esc(lv)} <small>${list.length}</small></h3><ul class="syl-list">${list.map((e) => {
    const vs = e.variants
    const play = vs.filter((v) => (v.status === 'playable' || v.status === 'same_as') && S.figs[v.game_id])
    const why = vs.find((v) => v.reason)?.reason
    const btns = play.map((v) => `<button data-card="${esc(v.game_id)}">${ICON[v.status]} ${esc(vs.length > 1 ? v.title : 'Open')}</button>`).join('')
    return `<li class="${play.length ? '' : 'off'}" title="${esc(play.length ? e.summary : why || e.summary)}"><span class="num">${esc(e.number || '')}</span>
      <span class="nm">${esc(e.name)}<br><small>${esc(e.summary)}</small>${!play.length && why ? `<br><small class="why">Not in the game yet: ${esc(why)}</small>` : ''}</span>
      <span class="go">${btns || '<small>chart only</small>'}</span></li>`
  }).join('')}</ul>`).join('')
  const playable = syl.figures.filter((e) => e.variants.some((v) => (v.status === 'playable' || v.status === 'same_as') && S.figs[v.game_id])).length
  openModal(`<div class="syl-browser"><h2>${esc(name)} · complete syllabus</h2>
    <p class="syl-meta">${esc(syl.meter)} · ${esc(syl.tempo)} · basic rhythm ${esc(syl.basic_rhythm)} · ${playable} of ${syl.figures.length} figures danceable in the game</p>
    <p>${esc(syl.music)} ${esc(syl.movement_tip)}</p><p>${esc(syl.position_tip)}</p>
    ${sections}
    <p class="syl-src">Figure names, levels and order follow the <a href="${esc(syl.site_url)}" target="_blank" rel="noopener noreferrer">BallroomDancers.com syllabus</a>; descriptions and tips are our own words.</p></div>`)
}

// Clicks inside the modal: open another card, add a figure.
export function handleModalClick(e) {
  const card = e.target.closest?.('[data-card]')
  const add = e.target.closest?.('[data-add-fig]')
  if (add) { ctx.addFigure(add.dataset.addFig); ctx.closeModal?.(); return true }
  if (card) { openCard(card.dataset.card); return true }
  return false
}

function injectStyle() {
  if (document.getElementById('syl-style')) return
  const css = `
#levelChips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 8px; }
#levelChips button { padding: 3px 8px; border-radius: 999px; font-size: 11.5px; background: var(--foam, #d8f1f7); color: var(--ocean, #0d3b52); border: 1px solid transparent; }
#levelChips button.on { background: var(--ocean, #0d3b52); color: #fff; }
#levelChips button small { opacity: .7; }
#levelChips button.browse { background: var(--sand, #f3e6cf); }
#figList li.next button { box-shadow: inset 3px 0 0 var(--gold, #d9a441); }
#figList .nexttag { font-size: 10.5px; color: #8a6414; font-weight: 700; margin-left: 4px; }
#figList .info { border: 0; background: transparent; padding: 0 2px; font-size: 13px; color: var(--sea, #1b7f9c); cursor: pointer; }
#figList li { position: relative; }
.syl-card h2 .tag, .syl-card .tag { font-size: 11px; vertical-align: middle; }
.syl-tip { background: #fff7e6; border-left: 3px solid var(--gold, #d9a441); padding: 6px 10px; border-radius: 6px; }
.syl-meta { color: var(--muted, #5b6f78); font-size: 12.5px; }
.syl-cue { font-style: italic; }
.syl-steps { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 4px 0 10px; }
.syl-steps th, .syl-steps td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #e8eef0; }
.syl-steps td.ft.L { color: #1e6fb8; font-weight: 600; }
.syl-steps td.ft.R { color: #9a6a00; font-weight: 600; }
.syl-links { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
.syl-links h4, .syl-lists h4 { margin: 6px 0 4px; font-size: 12.5px; }
.syl-chip { margin: 2px 2px 2px 0; padding: 3px 8px; border-radius: 999px; font-size: 12px; background: var(--foam, #d8f1f7); }
.syl-chip small { opacity: .65; }
.syl-hint { font-size: 11px; color: var(--muted, #5b6f78); }
.syl-lists { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; }
.syl-lists ul { margin: 0; padding-left: 16px; }
.syl-actions { display: flex; align-items: center; gap: 14px; margin-top: 12px; flex-wrap: wrap; }
.syl-tech, .syl-mistake { font-size: 13px; }
.syl-browser h3 { margin: 14px 0 4px; font-size: 14px; }
.syl-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.syl-list li { display: grid; grid-template-columns: 30px 1fr auto; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 10px; background: #fbf8f2; }
.syl-list li.off { opacity: .6; }
.syl-list .num { font-size: 11px; color: var(--muted, #5b6f78); }
.syl-list .nm small { color: var(--muted, #5b6f78); }
.syl-list .why { color: #9a5a3c; }
.syl-list .go { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.syl-list .go button { font-size: 11.5px; padding: 3px 8px; border-radius: 8px; }
.syl-src { font-size: 11.5px; color: var(--muted, #5b6f78); margin-top: 14px; }
`
  const el = document.createElement('style')
  el.id = 'syl-style'
  el.textContent = css
  document.head.appendChild(el)
}
