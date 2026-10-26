// The wardrobe: choose what your couple wears. Player feedback asked for more contrast (a black tailsuit is hard to
// follow on black marble or warm wood) and liked the short dress because both partners' steps stay in view, so:
// the leader has a tailsuit (black or navy), an ivory or sand dinner jacket, practice wear (a light shirt over dark
// trousers: the clearest legs) and a Latin shirt; the follower a short Latin dress, a knee-length practice dress
// or a long ballroom gown (the champagne feather gown included), each in several colours. Any outfit may be worn
// in any room. The choice is kept in localStorage (this device only) and goes onto the player's couple at once
// through Dancer.setOutfit (body.js), which swaps materials in place, so the hold, ghosting and the skirt's
// motion carry on.
// "Room default" keeps the painting's hero couple (white tie and the champagne feather gown) in the grand
// Standard hall, and dresses the couple for practice everywhere else: the high-contrast practice wear for him,
// a short dress for her.
import { ROOMS } from './world.js'

const KEY = 'bq_outfits_v1'
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`

// Every colour set names all the clothes fields, so nothing of the dancer's own costume leaks into a new outfit
// (the dancer keeps their own skin, hair and shoes).
const HIM = (suit, trousers, satin, stripe, shirt, tie, extra = {}) => ({ suit, sleeve: suit, trousers, satin, stripe, shirt, tie, sheen: false, ...extra })
const HER = (dress, lace, trim, extra = {}) => ({ dress, lace, trim, hem: 'fringe', bodice: null, satin: false, sleeves: true, boa: 1, ...extra })

export const OUTFITS = {
  leader: [
    { id: 'tails', name: 'Tailsuit', note: 'White tie, satin lapels and trouser stripes', look: 'tails', colours: [
      { id: 'black', name: 'Black', c: HIM(0x15181f, 0x15181f, 0x353b45, 0x3d444f, 0xfbf8f1, 0xfbf8f1) },
      { id: 'navy', name: 'Midnight navy', c: HIM(0x1d3152, 0x1d3152, 0x5d7597, 0x7088aa, 0xfbf8f1, 0xfbf8f1) },
    ] },
    { id: 'dinner', name: 'Dinner jacket', note: 'Light jacket over black trousers, bow tie', look: 'dinner', colours: [
      { id: 'ivory', name: 'Ivory', c: HIM(0xefe6d2, 0x1a1d24, 0xe0d2b4, 0x3a3f48, 0xffffff, 0x15171c) },
      { id: 'sand', name: 'Sand', c: HIM(0xd9c29a, 0x1f2630, 0xc9b083, 0x3d4652, 0xffffff, 0x0d3b52) },
    ] },
    { id: 'practice', name: 'Practice wear', note: 'Light shirt, dark trousers: the clearest legs', look: 'practice', colours: [
      { id: 'ice', name: 'Ice white', c: HIM(0xeef4f7, 0x232b36, 0x8ea3b5, 0x8ea3b5, 0xffffff, 0xffffff) },
      { id: 'sky', name: 'Sky', c: HIM(0x9fd0e8, 0x1f2a36, 0x8ea3b5, 0x8ea3b5, 0xc9e7f4, 0xc9e7f4) },
      { id: 'sand', name: 'Sand', c: HIM(0xead7b0, 0x26303d, 0x8ea3b5, 0x8ea3b5, 0xf6ead3, 0xf6ead3) },
    ] },
    { id: 'latin', name: 'Latin shirt', note: 'Satin shirt, high-waisted black trousers', look: 'latin', colours: [
      { id: 'ocean', name: 'Ocean', c: HIM(0x1b7f9c, 0x14161b, 0x2c3038, 0x2c3038, 0x1b7f9c, 0x1b7f9c, { sheen: true }) },
      { id: 'ivory', name: 'Ivory', c: HIM(0xf3ead8, 0x14161b, 0x2c3038, 0x2c3038, 0xf3ead8, 0xf3ead8, { sheen: true }) },
      { id: 'coral', name: 'Coral', c: HIM(0xe98a6b, 0x14161b, 0x2c3038, 0x2c3038, 0xe98a6b, 0xe98a6b, { sheen: true }) },
      { id: 'black', name: 'Black', c: HIM(0x1c1d22, 0x14161b, 0x3a3f48, 0x3a3f48, 0x1c1d22, 0x1c1d22, { sheen: true }) },
    ] },
  ],
  follower: [
    { id: 'latin', name: 'Short Latin dress', note: 'Fringe or ruffle above the knee: both partners’ steps in view', cut: 'latin', colours: [
      { id: 'ocean', name: 'Ocean', c: HER(0x1f5784, 0x86bde0, 0x0d2338) },
      { id: 'coral', name: 'Coral', c: HER(0xe0785f, 0xf7c3ab, 0xf1dcb8, { hem: 'ruffle' }) },
      { id: 'lagoon', name: 'Lagoon', c: HER(0x2a9d9f, 0x9fe0d8, 0x15585c) },
      { id: 'gold', name: 'Gold', c: HER(0xd9b25a, null, 0xf3e2b0, { bodice: 'sparkle', satin: true, jewel: 0xfff1c9 }) },
      { id: 'plum', name: 'Plum', c: HER(0x5e2741, 0xb06a8a, 0x2e0f1f, { hem: 'ruffle' }) },
    ] },
    { id: 'practice', name: 'Practice dress', note: 'Knee length, plain', cut: 'practice', colours: [
      { id: 'navy', name: 'Navy', c: HER(0x22395a, null, 0x22395a) },
      { id: 'black', name: 'Black', c: HER(0x1c1c22, null, 0x1c1c22) },
      { id: 'sky', name: 'Sky', c: HER(0x7fbfdc, null, 0x7fbfdc) },
      { id: 'sand', name: 'Sand', c: HER(0xd8c39c, null, 0xd8c39c) },
    ] },
    { id: 'gown', name: 'Ballroom gown', note: 'Floor length with a feather hem', cut: 'gown', colours: [
      { id: 'champagne', name: 'Champagne feathers', c: HER(0xd9c091, null, 0xe9d6b2, { bodice: 'sparkle', satin: true, sleeves: false, boa: 2.4, jewel: 0xf6ead0 }) },
      { id: 'ocean', name: 'Ocean lace', c: HER(0x1f5784, 0x86bde0, 0x0d2338) },
      { id: 'lagoon', name: 'Lagoon lace', c: HER(0x2a9d9f, 0x9fe0d8, 0x15585c) },
      { id: 'plum', name: 'Plum lace', c: HER(0x5e2741, 0xb06a8a, 0x2e0f1f) },
      { id: 'coral', name: 'Coral lace', c: HER(0xe0785f, 0xf7c3ab, 0xf1dcb8) },
    ] },
  ],
}
const PRACTICE_HIM = { look: 'practice', colours: OUTFITS.leader[2].colours[0].c } // his look in every room
const STANDARD_HER = { cut: 'latin', colours: OUTFITS.follower[0].colours[0].c } // her short ocean Latin dress

// ---------- saved choice: { leader: { outfit, colour } | null, follower: ... } (null = room default) ----------
export function loadOutfits() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return { leader: v?.leader ?? null, follower: v?.follower ?? null }
  } catch { return { leader: null, follower: null } }
}
function saveOutfits(v) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode: this session only */ } }

const find = (kind, pick) => {
  const o = OUTFITS[kind].find((x) => x.id === pick?.outfit)
  return o ? { o, c: o.colours.find((x) => x.id === pick.colour) || o.colours[0] } : null
}

// What a dancer of this kind wears in a room (null = the dancer's own palette: the hero couple's costume).
// dancing: a Watch or Play run is on (the grand hall's gown turns into a short dress so both partners' steps show).
export function outfitFor(kind, room, saved = loadOutfits(), dancing = false) {
  // One clear look in every room (Sam's feedback, 26 Oct): the long gown hid the leader's steps, so the player's
  // couple always wears the short ocean Latin dress and his light practice shirt with dark trousers. Saved picks
  // are ignored until new costumes arrive (the Outfit button says "coming soon").
  return kind === 'leader' ? PRACTICE_HIM : STANDARD_HER
}

// Put the saved outfits on the player's couple for this room (room = the floor's key, null in the hall).
export function dressPair(lead, fol, room, dancing = false) {
  const saved = loadOutfits()
  lead?.setOutfit?.(outfitFor('leader', room, saved, dancing))
  fol?.setOutfit?.(outfitFor('follower', room, saved, dancing))
}

// ---------- the picker ----------
function pickerHtml(saved) {
  const col = (kind) => {
    const pick = saved[kind]
    const rows = OUTFITS[kind].map((o) => {
      const on = pick?.outfit === o.id
      const sw = o.colours.map((c) => {
        const sel = on && (pick.colour === c.id || (!o.colours.some((x) => x.id === pick.colour) && c === o.colours[0]))
        const main = kind === 'leader' ? c.c.suit : c.c.dress, accent = kind === 'leader' ? c.c.trousers : c.c.trim
        return `<button class="sw${sel ? ' on' : ''}" data-kind="${kind}" data-outfit="${o.id}" data-colour="${c.id}" title="${c.name}" aria-label="${o.name}, ${c.name}"
          style="--c1:${hex(main)};--c2:${hex(accent)}"></button>`
      }).join('')
      return `<div class="outfit${on ? ' on' : ''}"><div class="o-head"><b>${o.name}</b><small>${o.note}</small></div><div class="swatches">${sw}</div></div>`
    }).join('')
    return `<section><h3>${kind === 'leader' ? 'Leader' : 'Follower'}</h3>
      <button class="outfit auto${pick ? '' : ' on'}" data-kind="${kind}" data-outfit="auto"><b>Room default</b>
        <small>${kind === 'leader' ? 'White tie in the grand hall, practice wear elsewhere' : 'The feather gown in the grand hall (a short dress while you dance), a short dress elsewhere'}</small></button>
      ${rows}</section>`
  }
  return `<h2>Outfits</h2>
    <p class="sub">Dress your couple for contrast. Changes show on the floor at once and are saved on this device.</p>
    <div class="wardrobe">${col('leader')}${col('follower')}</div>
    <p class="wardrobe-tip">Tip: the short dress shows both partners’ steps, in any room.</p>`
}

// Wire the toolbar's Outfit button (#outfitBtn) and the O key. openModal(html) shows the shared modal; apply()
// re-dresses the couple on the floor; canOpen() says whether the picker may open now (not mid-play).
export function initWardrobe({ openModal, apply, canOpen = () => true }) {
  const open = () => openModal(`<div class="wardrobe"><h2>👗 New costumes: coming soon</h2>
    <p>For now every room uses one clear look, so both partners' feet stay easy to see: a short ocean Latin dress for the follower and a light shirt with dark trousers for the leader.</p>
    <p class="muted">Tailsuits, gowns and more colours will come back as options in a later update.</p></div>`)
  // one delegated listener; it only acts while the picker is what the modal shows
  const body = document.getElementById('modalBody')
  body?.addEventListener('click', (e) => {
    const b = e.target.closest?.('.wardrobe [data-kind][data-outfit]')
    if (!b) return
    const saved = loadOutfits()
    saved[b.dataset.kind] = b.dataset.outfit === 'auto' ? null : { outfit: b.dataset.outfit, colour: b.dataset.colour || null }
    saveOutfits(saved)
    apply()
    body.innerHTML = pickerHtml(saved)
  })
  document.getElementById('outfitBtn')?.addEventListener('click', () => { if (canOpen()) open() })
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyO' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.target.closest?.('input, textarea, select')) return
    if (!document.getElementById('modal')?.classList.contains('hidden')) return
    if (document.getElementById('welcome') && !document.getElementById('welcome').classList.contains('hidden')) return
    if (!canOpen()) return
    open()
  })
  apply()
}
