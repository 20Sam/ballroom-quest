// Music for the floor. The player asked for "a recommended tempo", to "put actual music on" (choose or upload a
// song, match the routine's tempo to it, see if it goes well) and for an agent that "recommends which parts of the
// music get which figures". Four parts:
//  1. Tempo, in the floor panel: the dance's competition tempo (beats and bars per minute, the official range),
//     practice presets and a recommendation for the player's level. Latin, Rhythm and social dances never default
//     below 80% (Cha Cha at 60% felt too slow).
//  2. The Music panel (U): a built-in backing for each dance (WebAudio, the dance's own step rhythm accented: Cha Cha
//     2, 3, 4-and-1, Rumba 2, 3, 4, waltz in 3...), or the player's own song. The song is decoded and analysed in
//     this browser (tempo.js: tempo, beat 1, bars, sections) and is never uploaded or saved.
//  3. Watch / Play then follow the music: the routine starts on beat 1 and takes its beat from the audio being
//     heard (the audio clock, not the frame clock), so it never drifts. A song at another tempo than the routine is
//     time-stretched with its pitch kept.
//  4. The Choreographer agent (POST /api/choreograph) receives only numbers (tempo, length, bars, sections with
//     energy) and returns figures for each music section; "Load routine" puts them on the floor.
// main.js calls init() once and the hooks renderPanel, defaultTempo, onSpeed, attachRun and detachRun.
import { SESSION } from './api.js'
import {
  PRESETS, tempoInfo, recommendTempo, musicBpb, countOffset, fitVerdict, alsoFits, analyzeAudio, detectTempo,
  barEnergy, musicSections, backingFor, barHits,
} from './tempo.js'

const $ = (s) => document.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmt = (x, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d)
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const MAX_BARS = 64 // bars the Choreographer plans (about a competition heat); backend/choreo.py MAX_BARS
const MAX_FILE_MB = 80

let C = null // what main.js lends us: state, setSpeed, openModal, loadRoutine, startRun, audio()...
let applying = false // a default tempo is being applied, not a choice of the player's
const M = {
  source: localStorage.bq_music_src === 'backing' ? 'backing' : 'click', // click | backing | song
  song: null, // { name, buffer, url, media, F, byDance, adj, manual }
  busy: null, // analysing: a status line
  plan: null, // the last Choreographer answer { dance, plan, usage, sent }
  loaded: null, // the plan (or plan section) last put on the floor { dance, ids, startBar, sections }
  userTempo: {}, // dance -> the tempo % the player chose there this session
  clicks: true, // beat clicks while listening to the song
  live: null, // the music of the run in progress
  preview: null, // the panel's Listen / Hear it playback
  taps: [],
}

// ---------- setup ----------
export function init(ctx) {
  C = ctx
  if (!document.querySelector('link[href$="music.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/static/music.css'; document.head.appendChild(l)
  }
  const sp = $('#speed')
  if (sp) { sp.max = '120'; sp.step = '1' } // a song can be a little faster than competition tempo; 1% steps
  if (!$('#muBar')) document.body.insertAdjacentHTML('beforeend', '<div id="muBar" class="pill hidden"></div>')
  injectPanel()
  window.__bqMusic = M // handy for debugging in the console (like window.__bq)
  addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return
    const modalOpen = !$('#modal')?.classList.contains('hidden')
    if (e.code === 'KeyT' && modalOpen && $('#muPanel') && M.preview?.kind === 'song') { e.preventDefault(); tap(); return }
    if (e.code !== 'KeyU' || modalOpen || !$('#welcome')?.classList.contains('hidden')) return
    if (C.S.mode === 'floor' && !C.S.run) open()
  })
}

const infoFor = (key) => tempoInfo(key, C.S.cat.dances[key])
function recommended(key) {
  const S = C.S, d = S.cat.dances[key]
  const scores = Object.entries(S.prog.figures || {}).filter(([id, p]) => S.figs[id]?.dance === key && p?.plays).map(([, p]) => p.best)
  return recommendTempo({ style: d.style, level: C.level(), scores })
}

// Set the routine tempo (percent of competition tempo, any precision: a song is rarely a whole percent).
function setTempo(pct, user = true) {
  applying = !user
  C.setSpeed(Math.round(pct))
  applying = false
  C.S.speed = pct / 100
  if (user) M.userTempo[C.S.dance] = pct
  renderPanel()
}
// main.js setSpeed hook (slider, [ ] keys, "Try 10% faster")
export function onSpeed() {
  if (!C) return
  if (!applying) M.userTempo[C.S.dance] = C.S.speed * 100
  renderPanel()
}
// main.js enterFloor / switchDance hook: the tempo the player last chose for this dance, else the recommended one
export function defaultTempo() {
  if (!C?.S.cat) return
  const pct = M.userTempo[C.S.dance] ?? recommended(C.S.dance).pct
  setTempo(pct, false)
}

// ---------- the floor panel ----------
function injectPanel() {
  if ($('#tempoBox')) return
  const row = $('#speed')?.closest('.row')
  if (!row) return
  row.insertAdjacentHTML('afterend', `<div id="tempoBox" class="mu-tempo"><div id="tempoLine" class="mu-tline"></div>
    <div id="tempoPresets" class="mu-presets"></div><small id="tempoWhy" class="rec-why"></small></div>
    <div class="row mu-row"><button id="musicBtn" class="ghost" title="Music: backing track, your song, Choreographer (U)">🎶 Music <kbd>U</kbd></button><span id="musicState" class="mu-state"></span></div>`)
  $('#tempoPresets').addEventListener('click', (e) => { const b = e.target.closest('[data-pct]'); if (b && !b.disabled) setTempo(+b.dataset.pct) })
  $('#musicBtn').addEventListener('click', () => { if (!C.S.run) open() })
}

export function renderPanel() {
  if (!C?.S.cat || !$('#tempoBox')) return
  const S = C.S, info = infoFor(S.dance), rec = recommended(S.dance), pct = S.speed * 100, now = info.bpm * S.speed
  $('#tempoLine').innerHTML = `<span title="${esc(`${info.body === 'social' ? 'Typical social' : info.body} tempo: ${fmt(info.loBar)}–${fmt(info.hiBar)} bars per minute`)}">Competition <b>${info.bpm}</b> bpm · ${fmt(info.mpm)} bars/min <small>(${info.lo}–${info.hi})</small></span>
    <span>Your routine: <b>${Math.round(now)}</b> bpm · ${fmt(now / info.bpb)} bars/min</span>`
  const on = (p) => (Math.abs(pct - p) < 0.6 ? ' on' : '')
  const A = M.song ? analysisFor(S.dance) : null
  const songPct = A ? (A.bpm / info.bpm) * 100 : null
  $('#tempoPresets').innerHTML = PRESETS.map((p) => `<button data-pct="${p.pct}" class="${on(p.pct)}" title="${p.label}: ${Math.round(info.bpm * p.pct / 100)} bpm">${p.label} ${p.pct}%</button>`).join('')
    + `<button data-pct="${rec.pct}" class="rec${on(rec.pct)}" title="${esc(`Recommended: ${rec.why}`)}">★ For you ${rec.pct}%</button>`
    + (A ? `<button data-pct="${fmt(songPct, 2)}" class="song${on(songPct)}" ${songPct < 40 || songPct > 120 ? 'disabled' : ''} title="Dance at your song's tempo">♪ Song ${fmt(A.bpm)} bpm</button>` : '')
  // the recommendation and its reason, on screen while the routine is at the recommended tempo
  const why = $('#tempoWhy')
  if (why) {
    const shown = Math.abs(pct - rec.pct) < 0.6
    why.classList.toggle('hidden', !shown)
    why.textContent = shown ? `Recommended for you: ${rec.pct}% (${Math.round(info.bpm * rec.pct / 100)} bpm). ${rec.why[0].toUpperCase()}${rec.why.slice(1)}. Competition is ${info.bpm} bpm; step up with ] when the timing feels easy.` : ''
  }
  $('#musicState').textContent = stateText()
}

function stateText() {
  const S = C.S
  if (M.source === 'backing') return `${infoFor(S.dance).name} backing`
  if (M.source === 'song' && M.song) {
    const A = analysisFor(S.dance), rate = (infoFor(S.dance).bpm * S.speed) / A.bpm
    return `♪ ${M.song.name.replace(/\.[^.]+$/, '')} · ${Math.abs(rate - 1) < 0.006 ? 'in time' : `played at ${Math.round(rate * 100)}%`}`
  }
  return 'Metronome'
}

// ---------- song analysis (in the browser only) ----------
async function loadFile(file) {
  if (!file) return
  if (file.size > MAX_FILE_MB * 1e6) { M.busy = { error: `That file is over ${MAX_FILE_MB} MB. Try a shorter song or an mp3.` }; renderSong(); return }
  stopPreview()
  M.busy = { text: 'Reading the file…' }
  renderSong()
  try {
    const ac = C.audio()
    const buffer = await ac.decodeAudioData(await file.arrayBuffer())
    M.busy = { text: 'Finding the beat…', pct: 0 }
    renderSong()
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
    const F = await analyzeAudio(channels, buffer.sampleRate, {
      onProgress: (p) => { M.busy = { text: 'Finding the beat…', pct: p }; const b = $('#muProgress'); if (b) b.style.width = `${Math.round(p * 100)}%` },
    })
    if (M.song?.url) URL.revokeObjectURL(M.song.url)
    const url = URL.createObjectURL(file) // a local blob: URL, for time-stretched playback; never leaves the page
    const media = new Audio()
    media.preload = 'auto'; media.src = url
    M.song = { name: file.name, buffer, url, media, F, byDance: {}, adj: {}, manual: {} }
    M.plan = null; M.busy = null
    setSource('song')
  } catch (e) {
    M.busy = { error: `Could not read that file as audio (${e?.message || e}). Try an mp3, m4a, wav or ogg file.` }
  }
  const cards = $('#muPanel .mu-cards')
  if (cards) cards.innerHTML = cardsHtml()
  renderSong(); renderChoreo(); renderPanel()
}

// The song read for a dance: detected once per dance (tempo counted the dance's way), plus the player's tap and
// beat-1 adjustments; bars and sections follow beat 1.
function analysisFor(key) {
  const s = M.song
  if (!s) return null
  const info = infoFor(key)
  const T = (s.byDance[key] ??= detectTempo(s.F, { lo: info.lo, hi: info.hi, bpb: info.bpb }))
  const man = s.manual[key]
  const base = man ? { ...T, bpm: man.bpm, spb: 60 / man.bpm, barDur: info.bpb * 60 / man.bpm, beat1: man.beat1, confidence: 1, tapped: true } : T
  const adj = s.adj[key] || { shift: 0, nudge: 0 }
  let beat1 = base.beat1 + adj.shift * base.spb + adj.nudge
  while (beat1 < -0.05) beat1 += base.barDur
  const bars = Math.max(0, Math.floor((base.end - beat1) / base.barDur + 0.25))
  return { ...base, beat1, bars, info, adj }
}
function energyFor(key) {
  const A = analysisFor(key), id = `${key}|${A.bpm}|${A.beat1}`
  if (M.song.energy?.id !== id) M.song.energy = { id, e: barEnergy(M.song.F, A, A.beat1) }
  return M.song.energy.e
}
function sectionsFor(key) {
  return musicSections(energyFor(key), { bpb: analysisFor(key).bpb, maxBars: MAX_BARS })
}

// ---------- audio: voices ----------
let noiseBuf = null
function noise(ac) {
  if (noiseBuf?.sampleRate === ac.sampleRate) return noiseBuf
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}
const hz = (m) => 440 * 2 ** ((m - 69) / 12)
function envGain(ac, dest, t, peak, attack, decay) {
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(dest)
  return g
}
function osc(ac, type, f, t, dur, dest, f2) {
  const o = ac.createOscillator()
  o.type = type; o.frequency.setValueAtTime(f, t)
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + Math.min(0.12, dur))
  o.connect(dest); o.start(t); o.stop(t + dur + 0.02)
}
function noiseHit(ac, t, dur, dest, type, freq, q = 1) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter()
  s.buffer = noise(ac); f.type = type; f.frequency.value = freq; f.Q.value = q
  s.connect(f).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02)
}
function voice(ac, out, kind, t, gain, note) {
  switch (kind) {
    case 'kick': osc(ac, 'sine', 150, t, 0.3, envGain(ac, out, t, gain, 0.002, 0.28), 45); break
    case 'bass': osc(ac, 'triangle', hz(note ?? 43), t, 0.4, envGain(ac, out, t, gain * 0.9, 0.01, 0.34)); break
    case 'chord': {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400
      lp.connect(envGain(ac, out, t, gain * 0.45, 0.008, 0.3))
      for (const n of note || [60, 64, 67]) osc(ac, 'triangle', hz(n), t, 0.34, lp)
      break
    }
    case 'snare':
      noiseHit(ac, t, 0.16, envGain(ac, out, t, gain * 0.8, 0.001, 0.14), 'bandpass', 1800, 0.7)
      osc(ac, 'sine', 190, t, 0.08, envGain(ac, out, t, gain * 0.4, 0.001, 0.06))
      break
    case 'hat': noiseHit(ac, t, 0.05, envGain(ac, out, t, gain, 0.001, 0.035), 'highpass', 7000); break
    case 'shaker': noiseHit(ac, t, 0.08, envGain(ac, out, t, gain, 0.01, 0.06), 'bandpass', 5500, 1.2); break
    case 'step': case 'clave':
      osc(ac, 'sine', kind === 'step' ? 2300 : 2600, t, 0.06, envGain(ac, out, t, gain * 0.7, 0.001, 0.05))
      osc(ac, 'triangle', kind === 'step' ? 1150 : 1300, t, 0.04, envGain(ac, out, t, gain * 0.3, 0.001, 0.03))
      break
    case 'count': osc(ac, 'triangle', gain > 0.6 ? 1600 : 1100, t, 0.05, envGain(ac, out, t, gain * 0.8, 0.001, 0.045)); break
    case 'cowbell': {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 3
      bp.connect(envGain(ac, out, t, gain * 0.7, 0.001, 0.2))
      osc(ac, 'square', 540, t, 0.22, bp); osc(ac, 'square', 800, t, 0.22, bp)
      break
    }
    case 'conga': osc(ac, 'sine', 230, t, 0.22, envGain(ac, out, t, gain, 0.002, 0.18), 190); break
    case 'guiro': {
      const am = ac.createGain(), lfo = ac.createOscillator(), depth = ac.createGain()
      am.gain.value = 0.5; depth.gain.value = 0.5; lfo.type = 'square'; lfo.frequency.value = 45
      lfo.connect(depth).connect(am.gain); am.connect(envGain(ac, out, t, gain * 0.8, 0.005, 0.12))
      lfo.start(t); lfo.stop(t + 0.16)
      noiseHit(ac, t, 0.14, am, 'bandpass', 3200, 2)
      break
    }
  }
}
function master(ac, gain) {
  const g = ac.createGain(), comp = ac.createDynamicsCompressor()
  g.gain.value = gain
  g.connect(comp).connect(ac.destination)
  return g
}
// The audio time being heard now (the scheduled time minus the output latency).
function heard(ac) {
  const ts = ac.getOutputTimestamp?.()
  if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
    const t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000
    if (Math.abs(t - ac.currentTime) < 0.5) return t
  }
  return ac.currentTime - (ac.outputLatency || 0)
}

// A lookahead scheduler: music beat m (0 = bar 1's downbeat) sounds at audio time Tz + m * spb.
class Grid {
  constructor(ac, out, { Tz, spb, events }) { Object.assign(this, { ac, out, Tz, spb, events }) }
  start() { this.next = this.ac.currentTime; this.timer = setInterval(() => this.pump(), 25); this.pump(); return this }
  pump() {
    const now = this.ac.currentTime, until = now + 0.15
    if (until <= this.next) return
    for (const [m, kind, gain, note] of this.events((this.next - this.Tz) / this.spb, (until - this.Tz) / this.spb)) {
      const t = this.Tz + m * this.spb
      if (t >= now - 0.01) voice(this.ac, this.out, kind, Math.max(t, now), gain, note)
    }
    this.next = until
  }
  stop() { clearInterval(this.timer) }
}
// Events of the dance's backing between music beats m0 and m1: count-in bars (negative), the pattern, and one
// closing hit on the downbeat after the routine ends.
function backingEvents(key, bpb, mFirst, mEnd) {
  return (m0, m1) => {
    const out = []
    for (let n = Math.floor(m0 / bpb); n * bpb < m1; n++) {
      if (n * bpb >= mEnd) {
        if (n * bpb === mEnd && mEnd >= m0) {
          const [, , , bass] = barHits(key, n, bpb).find((h) => h[1] === 'bass') || [0, 'bass', 0, 43]
          const [, , , chord] = barHits(key, n, bpb).find((h) => h[1] === 'chord') || [0, 'chord', 0, null]
          out.push([mEnd, 'kick', 0.7], [mEnd, 'bass', 0.8, bass], [mEnd, 'chord', 0.5, chord])
        }
        break
      }
      for (const [pos, kind, gain, note] of barHits(key, n, bpb)) {
        const m = n * bpb + pos
        if (m >= m0 && m < m1 && m >= mFirst) out.push([m, kind, gain, note])
      }
    }
    return out
  }
}
// Clicks on every beat (the downbeat accented) between mFirst and mEnd.
function clickEvents(bpb, mFirst, mEnd) {
  return (m0, m1) => {
    const out = []
    for (let m = Math.max(Math.ceil(m0), Math.ceil(mFirst)); m < m1 && m < mEnd; m++) out.push([m, 'count', ((m % bpb) + bpb) % bpb === 0 ? 0.7 : 0.45])
    return out
  }
}

// Render `bars` bars of a dance's backing offline (count-in bar first) at a tempo: an AudioBuffer. Used to check
// the backings (their tempo and downbeat are detected back by tempo.js).
export async function renderBacking(key, bpm, bars = 8, sampleRate = 44100) {
  const bpb = musicBpb(key, C.S.cat.dances[key]), spb = 60 / bpm
  const ac = new OfflineAudioContext(1, Math.ceil(((bars + 1) * bpb + 2) * spb * sampleRate), sampleRate)
  const out = master(ac, 0.6), Tz = 0.05 + bpb * spb
  for (const [m, kind, gain, note] of backingEvents(key, bpb, -bpb, bars * bpb)(-bpb, bars * bpb + 1)) voice(ac, out, kind, Tz + m * spb, gain, note)
  return ac.startRendering()
}

// ---------- runs follow the music ----------
// main.js startRun hook. With a backing or a song, the run's beat comes from R.clock() (the audio being heard)
// and its own metronome stays quiet (R.music).
export function attachRun(R) {
  detachRun()
  if (!C || M.source === 'click' || !R?.tl?.steps?.length) return
  stopPreview()
  const S = C.S, key = S.dance, ac = C.audio()
  ac.resume?.()
  const bpb = musicBpb(key, S.cat.dances[key])
  const offset = countOffset(R.tl.steps[0].count, bpb) // e.g. Cha Cha's first step is on 2
  const countIn = R.countIn
  const loaded = M.loaded && M.loaded.dance === key && M.loaded.ids.join() === S.routine.join() ? M.loaded : null
  const startBar = loaded?.startBar || 1
  const sections = loaded?.sections || null
  const L = { ac, bpb, offset, startBar, sections, lastBar: null }
  if (M.source === 'song' && M.song) {
    const A = analysisFor(key)
    const spbSong = 60 / A.bpm
    let rate = (infoFor(key).bpm * S.speed) / A.bpm
    if (Math.abs(rate - 1) < 0.006) rate = 1
    if (rate < 0.5 || rate > 1.6) {
      C.showJudge?.('Song too far from this tempo: backing instead', '#ffd2c4')
    } else {
      R.spb = spbSong / rate // judge windows in real seconds
      const tBar = A.beat1 + (startBar - 1) * bpb * spbSong // song time of the start bar's downbeat (m = 0)
      const tCount = tBar - countIn * spbSong // song time where the count-in starts
      const T0 = ac.currentTime + 0.25 // audio time of the count-in's first beat
      const out = master(ac, 0.95)
      Object.assign(L, { kind: 'song', out, rate, tBar, tCount, T0, spbSong, corr: 0, synced: false, lastMT: -1 })
      if (rate === 1) {
        const src = ac.createBufferSource()
        src.buffer = M.song.buffer; src.connect(out)
        if (tCount >= 0) src.start(T0, tCount); else src.start(T0 - tCount, 0)
        L.src = src
      } else {
        const media = M.song.media
        media.pause()
        media.preservesPitch = true; media.mozPreservesPitch = true; media.webkitPreservesPitch = true
        media.defaultPlaybackRate = rate; media.playbackRate = rate; media.volume = 0.95
        media.currentTime = Math.max(0, tCount)
        const at = T0 + Math.max(0, -tCount) / rate
        L.media = media
        L.timer = setTimeout(() => { if (M.live === L) media.play().catch(() => {}) }, Math.max(0, (at - ac.currentTime) * 1000 - 40))
      }
      // count-in clicks on the music's beats (with the metronome sound on)
      if (S.sound) L.grid = new Grid(ac, out, { Tz: T0 + (tBar - tCount) / rate, spb: spbSong / rate, events: clickEvents(bpb, -countIn, 0) }).start()
      const songNow = () => {
        const t = heard(ac), model = L.tCount + (t - L.T0) * L.rate
        const m = L.media
        if (m && !m.paused && m.currentTime > 0 && m.currentTime !== L.lastMT) {
          L.lastMT = m.currentTime
          const err = m.currentTime - model
          L.corr = L.synced ? L.corr + (err - L.corr) * 0.08 : err
          L.synced = true
        }
        return model + L.corr
      }
      R.clock = () => tick(L, (songNow() - L.tBar) / L.spbSong)
      R.music = 'song'
      M.live = L
      return
    }
  }
  // the built-in backing at the routine's tempo
  const spb = R.spb, T0 = ac.currentTime + 0.2, Tz = T0 + countIn * spb
  const mEnd = Math.ceil((R.tl.totalBeats + offset) / bpb) * bpb
  const out = master(ac, 0.6)
  Object.assign(L, { kind: 'backing', out, spb, Tz })
  L.grid = new Grid(ac, out, { Tz, spb, events: backingEvents(key, bpb, -countIn, mEnd) }).start()
  R.clock = () => tick(L, (heard(ac) - Tz) / spb)
  R.music = 'backing'
  M.live = L
}
// m = music beats since the start bar's downbeat; the run's beat is m minus the first step's offset in the bar.
// Also keeps the bar / section pill up to date.
function tick(L, m) {
  const bar = Math.floor(m / L.bpb) + L.startBar
  if (bar !== L.lastBar) {
    L.lastBar = bar
    const el = $('#muBar')
    if (el) {
      const sec = L.sections?.find((s) => bar >= s.start_bar && bar <= s.end_bar)
      el.innerHTML = m < 0 ? `♪ ${L.kind === 'song' ? 'Your song' : 'Backing'} · count-in` : `♪ Bar <b>${bar}</b>${sec ? ` · ${esc(sec.label)}` : ''}`
      el.classList.remove('hidden')
    }
  }
  return m - L.offset
}
// main.js stopRun hook: fade the music out
export function detachRun() {
  const L = M.live
  if (!L) return
  M.live = null
  clearTimeout(L.timer)
  L.grid?.stop()
  $('#muBar')?.classList.add('hidden')
  const t = L.ac.currentTime
  try { L.out.gain.cancelScheduledValues(t); L.out.gain.setValueAtTime(L.out.gain.value, t); L.out.gain.linearRampToValueAtTime(0, t + 1.2) } catch { /* closed */ }
  if (L.media) {
    const m = L.media, v0 = m.volume, t0 = performance.now()
    const fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 1200)
      m.volume = Math.max(0, v0 * (1 - k))
      if (k >= 1) { clearInterval(fade); m.pause() }
    }, 50)
  }
  setTimeout(() => { try { L.src?.stop() } catch { /* already stopped */ } try { L.out.disconnect() } catch { /* gone */ } }, 1300)
}

// ---------- the Music panel ----------
function setSource(v) {
  if (v === 'song' && !M.song) return
  M.source = v
  if (v !== 'song') localStorage.bq_music_src = v
  document.querySelectorAll('#muPanel .mu-card').forEach((c) => c.classList.toggle('on', c.dataset.src === v))
  document.querySelectorAll('#muPanel input[name=muSrc]').forEach((i) => (i.checked = i.value === v))
  renderPanel()
}

export function open() {
  if (!C || C.S.mode !== 'floor' || C.S.run) return
  stopPreview()
  const S = C.S, info = infoFor(S.dance)
  C.openModal(`<div id="muPanel">
    <h2>🎶 Music · ${esc(info.name)}</h2>
    <p class="sub">Choose what plays when you Watch or Play. The routine starts on beat 1 and follows the music, so it stays in time.</p>
    <div class="mu-cards" role="radiogroup" aria-label="What plays during Watch and Play">${cardsHtml()}</div>
    <div class="mu-tempo-box"><b>${esc(info.name)}</b>: competition ${info.bpm} bpm = ${fmt(info.mpm)} bars per minute (${info.body === 'social' ? 'social dancing' : info.body}: ${info.lo}–${info.hi} bpm, ${fmt(info.loBar)}–${fmt(info.hiBar)} bars/min). Your routine plays at <b id="muNow">${Math.round(S.speed * 100)}%</b>.</div>
    <h3>Your song</h3>
    <label class="mu-file"><input type="file" id="muFile" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"/><span>📂 Choose a song from this computer</span></label>
    <p class="mu-privacy">🔒 Your song stays on this computer: it is decoded and analysed here in the browser, never uploaded or saved. Only numbers (tempo, length, bars, energy per section) go to the Choreographer.</p>
    <div id="muSong"></div>
    <h3>Choreographer <small>AI agent · gpt-6-luna</small></h3>
    <div id="muChoreoBox"></div>
  </div>`)
  const P = $('#muPanel')
  P.addEventListener('change', (e) => {
    if (e.target.name === 'muSrc') setSource(e.target.value)
    if (e.target.id === 'muFile') loadFile(e.target.files?.[0])
    if (e.target.id === 'muClicks') M.clicks = e.target.checked
  })
  P.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b || b.disabled) return
    e.preventDefault()
    const act = b.id || b.dataset.act
    if (act === 'muHear') hearBacking()
    else if (act === 'muListen') listenSong()
    else if (act === 'muMatch') { const A = analysisFor(C.S.dance); setTempo((A.bpm / infoFor(C.S.dance).bpm) * 100); setSource('song'); renderSong() }
    else if (act === 'muTap') tap()
    else if (act === 'shift') { adjust({ shift: +b.dataset.v }) }
    else if (act === 'nudge') { adjust({ nudge: +b.dataset.v }) }
    else if (act === 'muUntap') { delete M.song.manual[C.S.dance]; M.plan = null; renderSong(); renderChoreo(); renderPanel() }
    else if (act === 'muChoreo') choreograph()
    else if (act === 'load') loadPlan(b.dataset.sec === undefined ? null : +b.dataset.sec, b.dataset.go)
  })
  renderSong(); renderChoreo()
}

function cardsHtml() {
  const info = infoFor(C.S.dance), B = backingFor(C.S.dance)
  const card = (v, title, sub, extra = '', disabled = false) => `<label class="mu-card${M.source === v ? ' on' : ''}${disabled ? ' off' : ''}" data-src="${v}">
    <input type="radio" name="muSrc" value="${v}" ${M.source === v ? 'checked' : ''} ${disabled ? 'disabled' : ''}/><b>${title}</b><small>${sub}</small>${extra}</label>`
  return card('click', '🔔 Metronome', 'A click on every beat.')
    + card('backing', `🥁 ${esc(info.name)} backing`, esc(B.label), `<button class="link" id="muHear">${M.preview?.kind === 'backing' ? '⏹ Stop' : '▶ Hear it'}</button>`)
    + card('song', '🎵 Your song', M.song ? esc(M.song.name) : 'Choose an audio file below.', '', !M.song)
}

function adjust({ shift = 0, nudge = 0 }) {
  const key = C.S.dance, a = (M.song.adj[key] ??= { shift: 0, nudge: 0 })
  a.shift += shift; a.nudge = Math.round((a.nudge + nudge) * 1000) / 1000
  M.plan = null // the plan's bars were counted from the old beat 1
  stopPreview(); renderSong(); renderChoreo()
}

function renderSong() {
  const box = $('#muSong')
  if (!box) return
  if (M.busy?.error) { box.innerHTML = `<p class="err">${esc(M.busy.error)}</p>`; return }
  if (M.busy) { box.innerHTML = `<div class="mu-busy"><span class="spinner"></span>${esc(M.busy.text)}<div class="bar"><i id="muProgress" style="width:${Math.round((M.busy.pct || 0) * 100)}%"></i></div></div>`; return }
  if (!M.song) { box.innerHTML = '<p class="sub">Pick a song you would like to dance to: the app finds its tempo, beat 1 and its sections, tells you whether it suits this dance, and can set your routine to its tempo.</p>'; return }
  const S = C.S, info = infoFor(S.dance), A = analysisFor(S.dance), v = fitVerdict(A.bpm, info)
  const pct = (A.bpm / info.bpm) * 100, matched = Math.abs(S.speed * 100 - pct) < 0.6
  const also = alsoFits(A.bpm, S.cat.dances, A.meter, S.dance).slice(0, 5)
  const meterWarn = A.meter && A.meter !== info.meter
    ? `<p class="mu-warn">This song sounds like ${A.meter === 3 ? '3/4 (waltz time)' : '2/4 or 4/4'}, but ${esc(info.name)} is danced to ${info.meter === 3 ? '3/4' : '2/4 or 4/4'} music.</p>` : ''
  const lowConf = A.confidence < 0.35 && !A.tapped ? '<p class="mu-warn">The beat is hard to hear in this song. Listen with the clicks on and tap along (T) if they do not match.</p>' : ''
  box.innerHTML = `<div class="mu-fit ${v.kind}"><b>Your song: ${fmt(A.bpm)} bpm</b> — ${esc(v.text)}${A.tapped ? ' <small>(tapped)</small>' : ''}</div>
    <div class="mu-facts">${mmss(M.song.F.duration)} · ${fmt(A.bpm / A.bpb)} bars/min · beat 1 at ${fmt(A.beat1, 2)} s · ${A.bars} bars${A.meter ? ` · sounds like ${A.meter === 3 ? '3/4' : '4/4'}` : ''} · beat ${A.confidence > 0.7 ? 'clear' : A.confidence > 0.35 ? 'fairly clear' : 'unclear'}</div>
    ${also.length ? `<div class="mu-facts">Also suits: ${also.map((d) => `${esc(d.name)} (${esc(S.cat.styles[d.style]?.label || d.style)})`).join(', ')}</div>` : ''}
    ${meterWarn}${lowConf}
    <canvas id="muEnergy" height="64" aria-label="Energy of each bar; the sections the Choreographer plans"></canvas>
    <div class="row mu-actions">
      <button class="primary" id="muMatch" ${pct < 40 || pct > 120 ? 'disabled title="Too far from this dance\'s tempo"' : ''}>${matched ? '✓ Routine at the song\'s tempo' : `Dance at the song's tempo · ${Math.round(pct)}%`}</button>
      <button class="ghost" id="muListen">${M.preview?.kind === 'song' ? '⏹ Stop' : '▶ Listen'}</button>
      <label class="mu-check"><input type="checkbox" id="muClicks" ${M.clicks ? 'checked' : ''}/> beat clicks</label>
    </div>
    <div class="row mu-adjust"><span>Beat 1:</span>
      <button class="link" data-act="shift" data-v="-1">◀ a beat earlier</button><button class="link" data-act="shift" data-v="1">a beat later ▶</button>
      <button class="link" data-act="nudge" data-v="-0.02">−20 ms</button><button class="link" data-act="nudge" data-v="0.02">+20 ms</button>
      <button class="link" id="muTap" ${M.preview?.kind === 'song' ? '' : 'disabled title="Listen first, then tap"'}>👆 Tap <kbd>T</kbd></button>
      ${A.tapped ? '<button class="link" id="muUntap">undo tap</button>' : ''}</div>
    <div id="muNowPlaying" class="mu-facts"></div>
    ${M.song && !matched && Math.abs(S.speed * 100 - pct) > 0.6 && M.source === 'song' ? `<p class="mu-facts">At your routine's tempo (${Math.round(S.speed * 100)}%) the song plays at ${Math.round(((info.bpm * S.speed) / A.bpm) * 100)}% speed, pitch kept.</p>` : ''}`
  drawEnergy()
}

// Energy of every bar (columns), the planned sections in turn colours, bars past 64 greyed, and a playhead.
function drawEnergy(head = null) {
  const cv = $('#muEnergy')
  if (!cv || !M.song) return
  const e = energyFor(C.S.dance), secs = sectionsFor(C.S.dance)
  const W = (cv.width = Math.max(300, cv.clientWidth * (devicePixelRatio || 1))), H = (cv.height = 64 * (devicePixelRatio || 1))
  const g = cv.getContext('2d'), n = Math.max(1, e.length), w = W / n, k = devicePixelRatio || 1
  g.clearRect(0, 0, W, H)
  const COL = ['#1b7f9c', '#3a9fc4', '#0d3b52']
  e.forEach((v, i) => {
    const s = secs.findIndex((x) => i + 1 >= x.start_bar && i + 1 <= x.end_bar)
    g.fillStyle = s < 0 ? '#e8d3ac' : COL[s % COL.length]
    const h = Math.max(2 * k, v * (H - 16 * k))
    g.fillRect(i * w + 0.5, H - h, Math.max(1, w - 1), h)
  })
  g.fillStyle = '#5b7380'; g.font = `${10 * k}px system-ui`
  for (const s of secs) g.fillText(String(s.start_bar), (s.start_bar - 1) * w + 2 * k, 10 * k)
  if (head != null && head >= 0) { g.fillStyle = '#e98a6b'; g.fillRect(Math.min(W - 2, head * w), 0, 2 * k, H) }
}

function stopPreview() {
  const P = M.preview
  if (!P) return
  M.preview = null
  P.grid?.stop()
  try { P.src?.stop() } catch { /* not started */ }
  try { P.out?.disconnect() } catch { /* gone */ }
  if (document.getElementById('muListen')) { $('#muListen').textContent = '▶ Listen'; $('#muTap')?.setAttribute('disabled', '') }
  if (document.getElementById('muHear')) $('#muHear').textContent = '▶ Hear it'
}
const panelOpen = () => !!$('#muPanel') && !$('#modal').classList.contains('hidden')

// Hear two bars of count-in and four bars of the backing at the routine's tempo.
function hearBacking() {
  if (M.preview?.kind === 'backing') return stopPreview()
  stopPreview()
  const S = C.S, ac = C.audio()
  ac.resume?.()
  const key = S.dance, bpb = musicBpb(key, S.cat.dances[key]), spb = 60 / (infoFor(key).bpm * S.speed)
  const out = master(ac, 0.6), Tz = ac.currentTime + 0.15 + bpb * spb
  const grid = new Grid(ac, out, { Tz, spb, events: backingEvents(key, bpb, -bpb, 4 * bpb) }).start()
  M.preview = { kind: 'backing', out, grid }
  $('#muHear').textContent = '⏹ Stop'
  const end = Tz + (4 * bpb + 1) * spb
  const watch = () => { if (M.preview?.grid !== grid) return; if (!panelOpen() || ac.currentTime > end) return stopPreview(); requestAnimationFrame(watch) }
  watch()
}

// Play the song from a bar before bar 1, with clicks on the beats it found, a bar / beat readout and a playhead.
function listenSong() {
  if (M.preview?.kind === 'song') return stopPreview()
  stopPreview()
  const ac = C.audio()
  ac.resume?.()
  const A = analysisFor(C.S.dance)
  const out = master(ac, 0.95), src = ac.createBufferSource()
  src.buffer = M.song.buffer; src.connect(out)
  const T0 = ac.currentTime + 0.1, from = Math.max(0, A.beat1 - A.barDur)
  src.start(T0, from)
  const Tz = T0 + (A.beat1 - from)
  const grid = M.clicks ? new Grid(ac, out, { Tz, spb: A.spb, events: clickEvents(A.bpb, -A.bpb, (A.bars + 1) * A.bpb) }).start() : null
  M.preview = { kind: 'song', src, out, grid, T0, from, A }
  M.taps = []
  src.onended = () => { if (M.preview?.src === src) stopPreview() }
  $('#muListen').textContent = '⏹ Stop'; $('#muTap')?.removeAttribute('disabled')
  const loop = () => {
    if (M.preview?.src !== src) return
    if (!panelOpen()) return stopPreview()
    const m = (heard(ac) - Tz) / A.spb, bar = Math.floor(m / A.bpb) + 1, beat = Math.floor(m - (bar - 1) * A.bpb) + 1
    const np = $('#muNowPlaying')
    if (np) np.innerHTML = m < 0 ? 'Listening… bar 1 is coming' : `Listening · bar <b>${bar}</b> of ${A.bars} · beat <b>${beat}</b>${M.taps.length ? ` · ${M.taps.length} taps` : ''}`
    drawEnergy(m / A.bpb)
    requestAnimationFrame(loop)
  }
  loop()
}

// Tap along on every beat, starting on a "1": 8+ steady taps set the tempo and beat 1 for this dance.
function tap() {
  const P = M.preview
  if (P?.kind !== 'song') return
  const t = P.from + (heard(P.src.context) - P.T0) // song time of the tap
  if (M.taps.length && t - M.taps[M.taps.length - 1] > 2.5) M.taps = [] // a pause starts again
  M.taps.push(t)
  const n = M.taps.length, np = $('#muNowPlaying')
  if (n < 8) { if (np) np.innerHTML = `Tapping… ${n} of 8 taps (every beat, starting on a 1)`; return }
  // least-squares line through the taps: period and phase
  const xs = M.taps.map((_, i) => i), mx = (n - 1) / 2, my = M.taps.reduce((a, b) => a + b, 0) / n
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), sxy = xs.reduce((a, x, i) => a + (x - mx) * (M.taps[i] - my), 0)
  const period = sxy / sxx, t0 = my - period * mx
  const resid = Math.sqrt(M.taps.reduce((a, y, i) => a + (y - (t0 + period * i)) ** 2, 0) / n)
  if (!(period > 0.2 && period < 2) || resid > 0.06) { if (np) np.innerHTML = 'Those taps were not steady: try again, one tap per beat.'; M.taps = []; return }
  const key = C.S.dance, info = infoFor(key)
  // count the tapped beat the dance's way (Tango counts quicks: twice the tapped beat)
  let bpm = 60 / period
  for (const m of [2, 0.5]) if (Math.abs(Math.log2((bpm * m) / info.bpm)) < Math.abs(Math.log2(bpm / info.bpm)) - 0.4) bpm *= m
  const spb = 60 / bpm, barDur = info.bpb * spb
  let beat1 = t0 // the first tap is a "1"
  while (beat1 - barDur > (M.song.byDance[key]?.start ?? 0) - 0.1) beat1 -= barDur
  M.song.manual[key] = { bpm: Math.round(bpm * 100) / 100, beat1 }
  delete M.song.adj[key]
  M.plan = null
  stopPreview(); renderSong(); renderChoreo(); renderPanel()
}

// ---------- the Choreographer ----------
function renderChoreo() {
  const box = $('#muChoreoBox')
  if (!box) return
  if (!M.song || M.busy) { box.innerHTML = '<p class="sub">Choose a song first. The Choreographer then plans figures for each part of it: calm figures where the music is quiet, the showy ones where it peaks, every link legal and every section filled to its last bar.</p>'; return }
  const key = C.S.dance, A = analysisFor(key)
  if (A.bars < 2) { box.innerHTML = '<p class="sub">This song is too short to choreograph.</p>'; return }
  const secs = sectionsFor(key), planned = secs.length ? secs[secs.length - 1].end_bar : 0
  const sent = { dance: key, role: C.S.role, bpm: Math.round(A.bpm * 100) / 100, duration_s: Math.round(M.song.F.duration * 10) / 10, bars: A.bars, sections: secs, level: C.level() }
  box.innerHTML = `<p class="sub">Plans ${planned < A.bars ? `the first ${planned} of ${A.bars} bars (${mmss(planned * A.barDur)}, about a competition heat)` : `all ${A.bars} bars`} in ${secs.length} section${secs.length > 1 ? 's' : ''}, for a ${esc(C.level())} ${esc(C.S.role)}.</p>
    <details class="mu-sent"><summary>Exactly what is sent (numbers only)</summary><code>${esc(JSON.stringify(sent))}</code></details>
    <button class="primary" id="muChoreo" ${C.aiOn && !C.aiOn() ? 'disabled title="AI is offline"' : ''}>✨ Choreograph to this song</button>
    <div id="muPlan"></div>`
  M.sent = sent
  if (M.plan && M.plan.dance === key) renderPlan()
}

async function choreograph() {
  const sent = M.sent
  if (!sent) return
  const btn = $('#muChoreo')
  btn.disabled = true
  $('#muPlan').innerHTML = C.spinner('Planning figures for each part of your song…')
  try {
    const r = await fetch('/api/choreograph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: SESSION, ...sent }) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      const d = data.detail
      throw new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : `HTTP ${r.status}`)
    }
    M.plan = { dance: sent.dance, plan: data.plan, usage: data.usage, sent }
    renderPlan(true)
  } catch (e) {
    if ($('#muPlan')) $('#muPlan').innerHTML = `<p class="err">${esc(e.message)}</p>`
  }
  if ($('#muChoreo')) $('#muChoreo').disabled = false
}

// "Basic × 4 → New Yorker × 2": consecutive repeats folded
function figureRun(ids) {
  const out = []
  for (const id of ids) {
    const last = out[out.length - 1]
    if (last && last.id === id) last.n++
    else out.push({ id, n: 1 })
  }
  return out.map((f) => `${esc(C.S.figs[f.id]?.name || f.id)}${f.n > 1 ? ` ×${f.n}` : ''}`).join(' → ')
}

function renderPlan(fresh = false) {
  const box = $('#muPlan'), P = M.plan
  if (!box || !P) return
  const p = P.plan, energy = (i) => P.sent.sections[i]?.energy ?? 0
  const all = p.sections.flatMap((s) => s.figure_ids)
  box.innerHTML = `<div class="box ok"><h4>${esc(p.title)}</h4><p>${esc(p.notes)}</p><small>${all.length} figures · ${fmt(p.total_bars)} bars of figures for ${p.sections[p.sections.length - 1].end_bar} bars of music</small></div>
    <table class="t mu-plan"><tr><th>Bars</th><th>Music</th><th>Figures</th><th></th></tr>
    ${p.sections.map((s, i) => `<tr><td>${s.start_bar}–${s.end_bar}</td>
      <td><b>${esc(s.label)}</b><span class="mu-en" title="energy ${energy(i)}"><i style="width:${Math.round(energy(i) * 100)}%"></i></span></td>
      <td>${figureRun(s.figure_ids)}<br><small>${esc(s.why)}</small></td>
      <td><button class="link" data-act="load" data-sec="${i}" data-go="watch" title="Load this section and watch it from bar ${s.start_bar} of the song">▶ Practise</button></td></tr>`).join('')}
    </table>
    <div class="row"><button class="primary" data-act="load">Load routine</button><button class="ghost" data-act="load" data-go="watch">Load &amp; watch with the song</button></div>
    ${fresh && P.usage ? C.usageLine(P.usage) : ''}`
  if (fresh) box.scrollIntoView?.({ block: 'start', behavior: 'smooth' }) // the plan lands below the fold of the panel
}

// Put the plan (or one section of it) on the floor; "watch" also matches the tempo to the song and starts.
function loadPlan(sec, go) {
  const P = M.plan
  if (!P) return
  const p = P.plan, parts = sec == null ? p.sections : [p.sections[sec]]
  const ids = parts.flatMap((s) => s.figure_ids).filter((id) => C.S.figs[id])
  if (!ids.length) return
  const startBar = parts[0].start_bar
  C.loadRoutine(P.dance, ids)
  M.loaded = { dance: P.dance, ids, startBar, sections: p.sections.map((s) => ({ start_bar: s.start_bar, end_bar: s.end_bar, label: s.label })) }
  if (go === 'watch') {
    const A = analysisFor(P.dance)
    setSource('song')
    setTempo((A.bpm / infoFor(P.dance).bpm) * 100)
    C.closeModal()
    setTimeout(() => C.startRun('watch'), 50)
  } else {
    C.closeModal()
    C.showJudge?.(`Routine loaded: ${ids.length} figures`, '#fff6c9')
  }
}
