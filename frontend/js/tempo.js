// Tempo for the Music panel: competition tempo rules, practice presets, in-browser beat analysis of the player's
// song, and the built-in backing patterns. Pure functions only (no DOM, no audio, no network), so node can test it.
//
// Units. A "beat" is the syllabus's beat (dance.bpm counts it): a quarter note, except Tango, whose syllabus counts
// quicks (a slow = 2 beats), so a 2/4 Tango bar has 4 of them. A "bar" is one bar of the dance's music:
// 3 beats in 3/4, 4 in 4/4 and Tango, 2 in Samba and Paso Doble (2/4). backend/choreo.py beats_per_bar() uses the
// same rule, so the Choreographer's bars are these bars.

const log2 = (x) => Math.log(x) / Math.LN2
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d

// ---------- competition tempo + practice presets ----------
export const PRESETS = [
  { id: 'learn', label: 'Learn', pct: 70 },
  { id: 'practise', label: 'Practise', pct: 85 },
  { id: 'competition', label: 'Competition', pct: 100 },
]
// Latin, Rhythm and the social dances lose their character when slowed right down (the player found Cha Cha at
// 60% too slow), so they never default below this.
export const FAST_STYLES = ['latin', 'rhythm', 'social']
export const FAST_MIN_PCT = 80

// Competition tempo in bars per minute: WDSF rules for International Standard and Latin, NDCA for American Smooth
// and Rhythm, a typical social-dance range for West Coast Swing, Lindy Hop and Salsa.
const RULES = {
  std_waltz: [28, 30, 'WDSF'], std_foxtrot: [28, 30, 'WDSF'], std_tango: [31, 33, 'WDSF'], quickstep: [50, 52, 'WDSF'], std_viennese: [58, 60, 'WDSF'],
  waltz: [28, 30, 'NDCA'], tango: [30, 32, 'NDCA'], foxtrot: [30, 32, 'NDCA'], viennese: [53, 54, 'NDCA'],
  chacha: [30, 32, 'WDSF'], rumba: [25, 27, 'WDSF'], jive: [42, 44, 'WDSF'], samba: [50, 52, 'WDSF'], paso: [60, 62, 'WDSF'],
  am_chacha: [30, 32, 'NDCA'], am_rumba: [30, 34, 'NDCA'], swing: [34, 36, 'NDCA'], bolero: [24, 26, 'NDCA'], mambo: [47, 51, 'NDCA'],
  wcs: [22, 30, 'social'], lindy: [32, 45, 'social'], salsa: [42, 55, 'social'],
}

// Beats in one bar of the dance's music (see the units note at the top).
export function musicBpb(key, dance) {
  const t = dance?.time || '4/4'
  if (t === '3/4') return 3
  if (t === '2/4') return /tango/.test(key || '') ? 4 : 2
  return 4
}

// Everything the panel shows about a dance's tempo. lo/hi are the competition range in beats per minute.
export function tempoInfo(key, dance) {
  const bpb = musicBpb(key, dance), r = RULES[key], bpm = dance.bpm
  const lo = r ? r[0] * bpb : Math.round(bpm * 0.97), hi = r ? r[1] * bpb : Math.round(bpm * 1.03)
  return { key, name: dance.name, bpm, bpb, mpm: bpm / bpb, lo, hi, loBar: lo / bpb, hiBar: hi / bpb, body: r?.[2] || 'competition', meter: dance.time === '3/4' ? 3 : 4 }
}

// The practice tempo to suggest: by the player's level (Newcomer learns, Bronze practises, Silver and Gold go to
// competition tempo), one step faster when they already hit this dance's figures on the beat (85%+), one step
// slower when they miss most beats, and never below 80% in Latin, Rhythm and social dances.
export function recommendTempo({ style, level = 'Newcomer', scores = [] } = {}) {
  let i = { Newcomer: 0, Bronze: 1, Silver: 2, Gold: 2 }[level] ?? 0
  const why = [`${level} level`]
  const n = scores.length, avg = n ? scores.reduce((a, b) => a + b, 0) / n : 0
  if (n >= 2 && avg >= 0.85 && i < 2) { i++; why.push(`${Math.round(avg * 100)}% on the beat in this dance`) }
  else if (n >= 2 && avg < 0.5 && i > 0) { i--; why.push(`only ${Math.round(avg * 100)}% on the beat so far`) }
  let pct = PRESETS[i].pct
  if (FAST_STYLES.includes(style) && pct < FAST_MIN_PCT) { pct = FAST_MIN_PCT; why.push('Latin, Rhythm and social dances lose their feel below 80%') }
  return { pct, preset: PRESETS[i].id, why: why.join('; ') }
}

// Beats from the bar's downbeat to the first step of a figure, from its count label ("2" in Cha Cha, Rumba and
// Mambo on 2; "1", "S", "Q", "1-2" start on the downbeat).
export function countOffset(count, bpb) {
  const m = /^\s*(\d+)/.exec(String(count ?? ''))
  return m ? (((+m[1] - 1) % bpb) + bpb) % bpb : 0
}

// How a song tempo (in the dance's beats) compares with the dance's competition range.
export function fitVerdict(bpm, info) {
  const range = `competition ${info.lo}–${info.hi}`
  const pct = Math.round((bpm / info.bpm) * 100)
  if (bpm >= info.lo - 0.75 && bpm <= info.hi + 0.75) return { kind: 'fits', pct, text: `fits ${info.name} (${range})` }
  if (bpm < info.lo) {
    return pct >= 65
      ? { kind: 'slow', pct, text: `slower than ${info.name} competition tempo (${range}): good for practice at ${pct}%` }
      : { kind: 'too_slow', pct, text: `too slow for ${info.name} (${range})` }
  }
  return bpm <= info.hi * 1.06
    ? { kind: 'fast', pct, text: `a little fast for ${info.name} (${range})` }
    : { kind: 'too_fast', pct, text: `too fast for ${info.name} (${range})` }
}

// Other dances this tempo suits (at the same beat, or counted in half / double time), keeping to the song's meter
// when it is clear (meter 3 = waltzes only, 4 = everything else).
export function alsoFits(bpm, dances, meter = 0, except = null) {
  const out = []
  for (const [key, d] of Object.entries(dances)) {
    if (key === except || !d?.bpm) continue
    const info = tempoInfo(key, d)
    if (meter && info.meter !== meter) continue
    const at = [bpm, bpm * 2, bpm / 2].find((b) => b >= info.lo - 0.75 && b <= info.hi + 0.75)
    if (at) out.push({ key, name: d.name, style: d.style, bpm: round(at, 1) })
  }
  return out
}

// ---------- beat analysis ----------
// A small radix-2 FFT (in place).
const FFT = new Map()
function fftTables(N) {
  let T = FFT.get(N)
  if (T) return T
  const bits = Math.round(log2(N)), rev = new Uint32Array(N), cos = new Float64Array(N / 2), sin = new Float64Array(N / 2)
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r }
  for (let k = 0; k < N / 2; k++) { cos[k] = Math.cos((2 * Math.PI * k) / N); sin[k] = -Math.sin((2 * Math.PI * k) / N) }
  T = { rev, cos, sin }
  FFT.set(N, T)
  return T
}
function fft(re, im) {
  const N = re.length, T = fftTables(N)
  for (let i = 0; i < N; i++) {
    const j = T.rev[i]
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size
    for (let i = 0; i < N; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half, c = T.cos[k], s = T.sin[k]
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
      }
    }
  }
}

// Onset strength: the curve minus its local mean (about ±60 ms), negative parts dropped.
function onsetStrength(a, w = 6) {
  const n = a.length, pre = new Float64Array(n + 1), out = new Float32Array(n)
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + a[i]
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - w), hi = Math.min(n, i + w + 1)
    out[i] = Math.max(0, a[i] - (pre[hi] - pre[lo]) / (hi - lo))
  }
  return out
}

function autocorr(env, maxLag) {
  const n = env.length
  let mean = 0
  for (let i = 0; i < n; i++) mean += env[i]
  mean /= n || 1
  const e = new Float32Array(n)
  for (let i = 0; i < n; i++) e[i] = env[i] - mean
  const ac = new Float32Array(maxLag + 2)
  for (let L = 0; L < ac.length && L < n; L++) {
    let s = 0
    for (let i = 0, m = n - L; i < m; i++) s += e[i] * e[i + L]
    ac[L] = s / (n - L)
  }
  const z = ac[0] || 1
  for (let L = 0; L < ac.length; L++) ac[L] /= z
  return ac
}
const lerpAt = (a, x) => {
  const i = Math.floor(x), f = x - i
  if (i < 0 || i + 1 >= a.length) return 0
  return a[i] * (1 - f) + a[i + 1] * f
}

// Step 1, once per song (it does not depend on the dance): mix to mono, decimate to ~11 kHz, and compute a 100 fps
// onset envelope (spectral flux of the log spectrum), a low-band (< 200 Hz: kick, bass) onset envelope, the frame
// loudness, 12 log-spaced band energies (for chord changes) and the envelope's autocorrelation. channels are
// Float32Arrays (an AudioBuffer's getChannelData). Yields to the page now and then when it is long.
export async function analyzeAudio(channels, sampleRate, { maxSeconds = 600, onProgress = null } = {}) {
  const total = channels[0].length
  const n = Math.min(total, Math.floor(maxSeconds * sampleRate))
  const f = Math.max(1, Math.floor(sampleRate / 11025)), sr = sampleRate / f
  const m = Math.floor(n / f), x = new Float32Array(m), C = channels.length
  for (let i = 0; i < m; i++) {
    let s = 0
    for (let c = 0; c < C; c++) { const ch = channels[c]; for (let k = 0, o = i * f; k < f; k++) s += ch[o + k] }
    x[i] = s / (f * C)
  }
  const N = 256, hop = Math.max(1, Math.round(sr / 100)), fps = sr / hop
  const nF = Math.max(0, Math.floor((m - N) / hop) + 1)
  const flux = new Float32Array(nF), low = new Float32Array(nF), rms = new Float32Array(nF)
  const NB = 12, bands = new Float32Array(nF * NB)
  const win = new Float64Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
  const binHz = sr / N, K = N / 2, lowK = Math.max(1, Math.round(200 / binHz))
  const edges = []
  for (let b = 0; b <= NB; b++) edges.push(clamp(Math.round((80 * (Math.min(5000, sr / 2 - binHz) / 80) ** (b / NB)) / binHz), 1, K))
  const re = new Float64Array(N), im = new Float64Array(N)
  let prev = new Float64Array(K + 1), cur = new Float64Array(K + 1)
  for (let fr = 0; fr < nF; fr++) {
    const off = fr * hop
    let e2 = 0
    for (let i = 0; i < N; i++) { const v = x[off + i]; re[i] = v * win[i]; im[i] = 0 }
    for (let i = (N - hop) >> 1, j = i + hop; i < j; i++) e2 += x[off + i] * x[off + i]
    rms[fr] = Math.sqrt(e2 / hop)
    fft(re, im)
    let fl = 0, lo = 0
    for (let k = 1; k <= K; k++) {
      const L = Math.log1p(100 * Math.hypot(re[k], im[k]))
      cur[k] = L
      const d = L - prev[k]
      if (d > 0) { fl += d; if (k <= lowK) lo += d }
    }
    flux[fr] = fr ? fl : 0; low[fr] = fr ? lo : 0
    for (let b = 0; b < NB; b++) {
      let s = 0, c = 0
      for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) { s += cur[k]; c++ }
      bands[fr * NB + b] = c ? s / c : 0
    }
    const t = prev; prev = cur; cur = t
    if (fr % 4000 === 3999) { onProgress?.(fr / nF); await new Promise((r) => setTimeout(r, 0)) }
  }
  const env = onsetStrength(flux), lowEnv = onsetStrength(low)
  const maxLag = Math.ceil((60 * fps) / 40) * 4 + 4 // 4 beats at 40 bpm (the comb looks at 4 multiples)
  const ac = autocorr(env, Math.min(maxLag, Math.max(1, nF - 2)))
  onProgress?.(1)
  // a frame's onset belongs to the middle of its window
  return { fps, frameOffset: N / 2 / sr, duration: total / sampleRate, analysedSeconds: n / sampleRate, env, lowEnv, rms, bands, NB, ac }
}

// Fold the onset envelope at a beat period (frames) and find the phase where onsets pile up.
function fold(env, P, B = 48) {
  const h = new Float64Array(B)
  for (let i = 0, n = env.length; i < n; i++) {
    const v = env[i]
    if (!v) continue
    const ph = ((i % P) / P) * B, b0 = Math.floor(ph), fr = ph - b0
    h[b0 % B] += v * (1 - fr); h[(b0 + 1) % B] += v * fr
  }
  const s = new Float64Array(B)
  let sum = 0, best = 0, bi = 0
  for (let b = 0; b < B; b++) {
    s[b] = 0.25 * h[(b + B - 1) % B] + 0.5 * h[b] + 0.25 * h[(b + 1) % B]
    sum += s[b]
    if (s[b] > best) { best = s[b]; bi = b }
  }
  const a = s[(bi + B - 1) % B], c = s[(bi + 1) % B], den = a - 2 * best + c
  const d = den < 0 ? clamp((0.5 * (a - c)) / den, -0.5, 0.5) : 0
  return { score: sum > 0 ? best / (sum / B) : 0, phase: ((((bi + d) / B) * P) % P + P) % P }
}

// Step 2, per dance: the song's tempo counted the way the dance counts, its beat grid, the first downbeat, bars.
// Tempo: the onset autocorrelation's strongest pulse near the tempo most listeners tap (~120 bpm) is the song's
// beat; the dance then counts it as is, in double or half time (or in thirds for waltzes), whichever lands in or
// nearest its competition range. That resolves half / double time: quarter notes at 64 become 128 for Tango (its
// syllabus counts quicks), eighths at 174 are counted 87 for a Slow Waltz, a 128 song stays 128 (too slow) for
// Quickstep rather than 256. Then the period is refined to ~0.01 bpm by folding the whole song, so the beat grid
// does not drift.
export function detectTempo(F, { lo = 110, hi = 130, bpb = 4 } = {}) {
  const { fps, ac, env } = F
  const A = (L) => Math.max(0, lerpAt(ac, L))
  const general = (c) => Math.exp(-0.5 * (log2(c / 120) / 0.9) ** 2)
  // the pulses: autocorrelation peaks between 40 and 300 bpm at least half as strong as the strongest
  const Lmin = Math.floor((60 * fps) / 300), Lmax = Math.min(ac.length - 2, Math.ceil((60 * fps) / 40))
  let amax = 0
  for (let L = Lmin; L <= Lmax; L++) amax = Math.max(amax, ac[L])
  let T0 = 120, t0score = -1
  for (let L = Math.max(2, Lmin); L <= Lmax; L++) {
    if (!(ac[L] >= ac[L - 1] && ac[L] > ac[L + 1] && ac[L] >= 0.5 * amax)) continue
    const a = ac[L - 1], b = ac[L], c = ac[L + 1], den = a - 2 * b + c
    const Lp = L + (den < 0 ? clamp((0.5 * (a - c)) / den, -0.5, 0.5) : 0), bpmP = (60 * fps) / Lp
    const sc = (0.5 * A(Lp) + 0.25 * A(2 * Lp) + 0.25 * A(4 * Lp)) * general(bpmP)
    if (sc > t0score) { t0score = sc; T0 = bpmP }
  }
  // how the dance counts it
  const center = Math.sqrt(lo * hi), span = Math.max(0.03, log2(hi / lo) / 2)
  const near = (c) => Math.exp(-0.5 * (Math.max(0, Math.abs(log2(c / center)) - span) / 0.12) ** 2)
  const rel = [[1, 1], [2, 0.8], [0.5, 0.8], ...(bpb === 3 ? [[3, 0.6], [1 / 3, 0.6]] : [])]
  let bpm = T0, best = -1
  for (const [m, w] of rel) {
    const c = T0 * m
    if (c < 30 || c > 320) continue
    const sc = general(c) * (1 + 4 * near(c)) * w
    if (sc > best) { best = sc; bpm = c }
  }
  // refine: fold the whole song over ±1.5% around it (coarse, then fine)
  let top = fold(env, (60 * fps) / bpm)
  for (const [w, inc] of [[0.015, 0.001], [0.0015, 0.0001]]) { // ±1.5% in 0.1% steps, then ±0.15% in 0.01% steps
    const c0 = bpm
    for (let c = c0 * (1 - w); c <= c0 * (1 + w); c += c0 * inc) {
      const r = fold(env, (60 * fps) / c)
      if (r.score > top.score) { top = r; bpm = c }
    }
  }
  const P = (60 * fps) / bpm, spb = 60 / bpm
  // the beat grid: beat k at frame phase + kP
  const nF = env.length, beats = []
  for (let p = top.phase; p < nF; p += P) beats.push(p)
  // downbeat: which beat in each bar is loudest, has the strongest kick / bass, the strongest onset and the biggest
  // change of sound (chords change at the bar line)
  const peak = (a, p) => { let v = 0; for (let i = Math.max(0, Math.round(p) - 2); i <= Math.min(a.length - 1, Math.round(p) + 2); i++) v = Math.max(v, a[i]); return v }
  const NB = F.NB, bandMean = (p0, p1) => {
    const v = new Float64Array(NB), i0 = Math.max(0, Math.round(p0)), i1 = Math.min(nF, Math.max(i0 + 1, Math.round(p1)))
    for (let i = i0; i < i1; i++) for (let b = 0; b < NB; b++) v[b] += F.bands[i * NB + b]
    for (let b = 0; b < NB; b++) v[b] /= i1 - i0
    return v
  }
  const onsetBands = (p) => { // the band energies at the strongest onset frame near the beat (what hits there)
    let bi = Math.max(0, Math.min(nF - 1, Math.round(p)))
    for (let i = Math.max(0, Math.round(p) - 2); i <= Math.min(nF - 1, Math.round(p) + 2); i++) if (env[i] > env[bi]) bi = i
    return F.bands.slice(bi * NB, bi * NB + NB)
  }
  const loud = (p) => { let v = 0; for (let i = Math.max(0, Math.round(p) - 1); i <= Math.min(nF - 1, Math.round(p) + 4); i++) v = Math.max(v, F.rms[i]); return 20 * Math.log10(v + 1e-6) }
  const feats = beats.map((p) => { const o = onsetBands(p); return { low: peak(F.lowEnv, p), on: peak(env, p), loud: loud(p), bass: (o[0] + o[1] + o[2]) / 3, v: bandMean(p, p + P), o } })
  feats.forEach((f, k) => { f.chg = k ? feats[k - 1].v.reduce((s, x, b) => s + Math.abs(f.v[b] - x), 0) : 0 })
  const z = (key) => {
    const xs = feats.map((f) => f[key]), m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length || 1)) || 1
    feats.forEach((f) => (f['z' + key] = (f[key] - m) / sd))
  }
  z('low'); z('on'); z('chg'); z('loud'); z('bass')
  // meter: does the sound repeat every 3 beats or every 4 (beat-synchronous self-similarity)?
  const vd = (a, b) => a.v.reduce((s, x, i) => s + Math.abs(x - b.v[i]), 0) + a.o.reduce((s, x, i) => s + Math.abs(x - b.o[i]), 0) + Math.abs(a.zon - b.zon) + Math.abs(a.zlow - b.zlow)
  const lagDiff = (g) => { let s = 0, c = 0; for (let k = g; k < feats.length; k++) { s += vd(feats[k], feats[k - g]); c++ } return c ? s / c : 0 }
  const d3 = lagDiff(3), d4 = lagDiff(4)
  // ... and where the accents fall: how much one beat of every 3 (or 4) stands out (a louder, lower or
  // different-sounding hit); the two votes together decide, and an unclear vote says nothing
  const oMean = new Float64Array(NB)
  feats.forEach((f) => f.o.forEach((x, b) => (oMean[b] += x / feats.length)))
  const acc = feats.map((f) => f.zon + f.zlow + f.o.reduce((s, x, b) => s + Math.abs(x - oMean[b]), 0))
  const contrast = (g) => {
    const sum = new Array(g).fill(0), cnt = new Array(g).fill(0)
    acc.forEach((a, k) => { sum[k % g] += a; cnt[k % g]++ })
    const means = sum.map((x, j) => x / (cnt[j] || 1)), all = acc.reduce((a, b) => a + b, 0) / (acc.length || 1)
    return Math.max(...means) - all
  }
  const c3 = contrast(3), c4 = contrast(4)
  const vote = Math.log((d4 + 1e-6) / (d3 + 1e-6)) + 0.5 * Math.log((c3 + 0.1) / (c4 + 0.1)) // > 0 favours 3
  const meter = feats.length < 16 ? 0 : vote > 0.2 ? 3 : vote < -0.2 ? 4 : 0
  const dscore = new Array(bpb).fill(0), dcount = new Array(bpb).fill(0)
  feats.forEach((f, k) => { if (k) { dscore[k % bpb] += f.zlow + f.zloud + f.zbass + 0.5 * f.zon + 0.5 * f.zchg; dcount[k % bpb]++ } })
  let j = 0
  for (let i = 1; i < bpb; i++) if (dscore[i] / (dcount[i] || 1) > dscore[j] / (dcount[j] || 1)) j = i
  // where the music starts and ends (frames louder than -30 dB below the loudest)
  let rmax = 0
  for (const r of F.rms) rmax = Math.max(rmax, r)
  const thr = Math.max(1e-4, rmax * 0.0316)
  let s0 = 0, s1 = nF - 1
  while (s0 < nF - 1 && F.rms[s0] < thr) s0++
  while (s1 > s0 && F.rms[s1] < thr) s1--
  const tf = (p) => p / fps + F.frameOffset
  const start = tf(s0), end = Math.min(F.duration, tf(s1) + 0.05)
  let k1 = j
  while (k1 + bpb < beats.length && tf(beats[k1]) < start - 0.12) k1 += bpb
  const beat0 = tf(top.phase), beat1 = beats.length ? tf(beats[k1]) : start
  const barDur = bpb * spb
  const bars = Math.max(0, Math.floor((end - beat1) / barDur + 0.25))
  const confidence = clamp((top.score - 1.2) / 2.5, 0, 1)
  return { bpm: round(bpm, 2), spb, bpb, beat0, beat1, downbeatIndex: j, bars, barDur, start, end, meter, confidence, foldScore: round(top.score, 2) }
}

// Step 3: loudness + busyness per bar, then coarse sections: 8-bar phrases (16 bars of 2/4) at three energy levels,
// neighbouring phrases at the same level merged (at most 32 bars each). Only the first maxBars bars are planned.
export function barEnergy(F, T, beat1 = T.beat1) {
  const { fps, rms, env } = F, out = []
  for (let b = 0; b < T.bars; b++) {
    const i0 = Math.max(0, Math.round((beat1 + b * T.barDur - F.frameOffset) * fps))
    const i1 = Math.min(rms.length, Math.round((beat1 + (b + 1) * T.barDur - F.frameOffset) * fps))
    let e2 = 0, on = 0
    for (let i = i0; i < i1; i++) { e2 += rms[i] * rms[i]; on += env[i] }
    const k = Math.max(1, i1 - i0)
    out.push({ db: 10 * Math.log10(e2 / k + 1e-12), busy: on / k })
  }
  const maxDb = Math.max(...out.map((o) => o.db), -120), maxBusy = Math.max(...out.map((o) => o.busy), 1e-9)
  return out.map((o) => round(0.75 * clamp(1 + (o.db - maxDb) / 18, 0, 1) + 0.25 * clamp(o.busy / maxBusy, 0, 1), 3))
}

export function musicSections(energy, { bpb = 4, maxBars = 64 } = {}) {
  const phrase = bpb === 2 ? 16 : 8, n = Math.min(energy.length, maxBars)
  if (n < 2) return []
  const ph = []
  for (let s = 0; s < n; s += phrase) ph.push([s, Math.min(n, s + phrase)])
  if (ph.length > 1 && ph[ph.length - 1][1] - ph[ph.length - 1][0] < phrase / 2) { const last = ph.pop(); ph[ph.length - 1][1] = last[1] }
  const mean = (a, b) => energy.slice(a, b).reduce((x, y) => x + y, 0) / (b - a)
  const pe = ph.map(([a, b]) => mean(a, b))
  const lo = Math.min(...pe), hi = Math.max(...pe)
  const level = (e) => (hi - lo < 0.12 ? 1 : e < lo + (hi - lo) / 3 ? 0 : e < lo + (2 * (hi - lo)) / 3 ? 1 : 2)
  const out = []
  ph.forEach(([a, b], i) => {
    const prev = out[out.length - 1]
    if (prev && prev.level === level(pe[i]) && b - prev.a <= 32) prev.b = b
    else out.push({ a, b, level: level(pe[i]) })
  })
  return out.map((s) => ({ start_bar: s.a + 1, end_bar: s.b, energy: round(mean(s.a, s.b), 2) }))
}

// ---------- built-in backings ----------
// One or two bars of each backing: [beat position from the downbeat, voice, gain, bass interval]. The "step"
// voice (a clave) plays the dance's own step rhythm, so the accents fall on the counts the feet do:
// Cha Cha 2, 3, 4-and-1; Rumba 2, 3, 4 (held through 1); Samba 1-a-2; Mambo on 2; Salsa on 1.
const SWING = 2 / 3 // a swung eighth sits two thirds of the way through the beat
const sw8 = (beats, voice, g) => beats.flatMap((b) => [[b, voice, g], [b + SWING, voice, g * 0.6]])
export const BACKINGS = {
  waltz: { label: 'bass on 1, chords on 2 and 3', bars: 1, key: 'major', hits: [[0, 'bass', 0.9], [0, 'step', 0.35], [1, 'chord', 0.42], [2, 'chord', 0.36], [0, 'shaker', 0.1], [1, 'shaker', 0.07], [2, 'shaker', 0.07]] },
  foxtrot: { label: 'walking bass, brushes on 2 and 4', bars: 1, key: 'major', hits: [[0, 'bass', 0.85], [1, 'bass', 0.5, 4], [2, 'bass', 0.7, 7], [3, 'bass', 0.5, 9], [1, 'snare', 0.22], [3, 'snare', 0.22], [1, 'chord', 0.3], [3, 'chord', 0.26], ...sw8([0, 1, 2, 3], 'hat', 0.09)] },
  quickstep: { label: 'bass on 1 and 3, snare on 2 and 4', bars: 1, key: 'major', hits: [[0, 'kick', 0.7], [2, 'kick', 0.5], [0, 'bass', 0.8], [2, 'bass', 0.6, 7], [1, 'snare', 0.4], [3, 'snare', 0.4], [1, 'chord', 0.3], [3, 'chord', 0.3], [0, 'hat', 0.08], [1, 'hat', 0.08], [2, 'hat', 0.08], [3, 'hat', 0.08]] },
  tango: { label: 'staccato marcato on every beat, accents on 1 and 3', bars: 1, key: 'minor', hits: [[0, 'chord', 0.5], [1, 'chord', 0.3], [2, 'chord', 0.42], [3, 'chord', 0.3], [0, 'bass', 0.9], [2, 'bass', 0.6, 7], [3.5, 'snare', 0.28], [0, 'step', 0.3], [2, 'step', 0.22]] },
  chacha: { label: 'cowbell, conga and a clave on 2, 3, 4-and-1', bars: 1, key: 'minor', hits: [[1, 'step', 0.7], [2, 'step', 0.5], [3, 'step', 0.55], [3.5, 'step', 0.55], [0, 'step', 0.75], [0, 'cowbell', 0.32], [1, 'cowbell', 0.22], [2, 'cowbell', 0.26], [3, 'cowbell', 0.22], [3, 'guiro', 0.3], [3.5, 'guiro', 0.3], [0, 'kick', 0.8], [2, 'kick', 0.3], [3, 'conga', 0.4], [3.5, 'conga', 0.45], [0, 'bass', 0.8], [2.5, 'bass', 0.55, 7], [0, 'chord', 0.4]] },
  rumba: { label: 'son clave, conga, accents on 2, 3, 4 (held through 1)', bars: 2, key: 'minor', hits: [[1, 'step', 0.55], [2, 'step', 0.45], [3, 'step', 0.6], [5, 'step', 0.55], [6, 'step', 0.45], [7, 'step', 0.6], [0, 'clave', 0.3], [1.5, 'clave', 0.3], [3, 'clave', 0.3], [5, 'clave', 0.3], [6, 'clave', 0.3], [0, 'kick', 0.8], [4, 'kick', 0.8], [0, 'chord', 0.55], [4, 'chord', 0.5], [3, 'conga', 0.4], [3.5, 'conga', 0.35], [7, 'conga', 0.4], [7.5, 'conga', 0.35], [1.5, 'bass', 0.7], [3, 'bass', 0.6, 7], [5.5, 'bass', 0.7], [7, 'bass', 0.6, 7], [0, 'shaker', 0.07], [1, 'shaker', 0.07], [2, 'shaker', 0.07], [3, 'shaker', 0.07], [4, 'shaker', 0.07], [5, 'shaker', 0.07], [6, 'shaker', 0.07], [7, 'shaker', 0.07]] },
  am_rumba: { label: 'slow on 1, quick 3, quick 4', bars: 1, key: 'minor', hits: [[0, 'step', 0.7], [2, 'step', 0.5], [3, 'step', 0.5], [0, 'kick', 0.6], [2, 'kick', 0.35], [0, 'bass', 0.8], [2, 'bass', 0.6, 7], [3, 'conga', 0.4], [3.5, 'conga', 0.35], [0, 'clave', 0.25], [1.5, 'clave', 0.25], [3, 'clave', 0.25], [1, 'chord', 0.25], [3, 'chord', 0.22]] },
  bolero: { label: 'soft slow on 1, quick 3, quick 4', bars: 1, key: 'minor', hits: [[0, 'step', 0.55], [2, 'step', 0.4], [3, 'step', 0.4], [0, 'bass', 0.8], [2, 'bass', 0.5, 7], [0, 'conga', 0.3], [2, 'conga', 0.25], [2.5, 'conga', 0.25], [3, 'conga', 0.3], [0, 'chord', 0.3], [2, 'chord', 0.22], [0, 'shaker', 0.06], [1, 'shaker', 0.06], [2, 'shaker', 0.06], [3, 'shaker', 0.06]] },
  jive: { label: 'swing shuffle, snare on 2 and 4, triples 1-a-2', bars: 1, key: 'major', hits: [[0, 'kick', 0.65], [2, 'kick', 0.55], [1, 'snare', 0.5], [3, 'snare', 0.5], [0, 'step', 0.4], [SWING, 'step', 0.25], [1, 'step', 0.4], [2, 'step', 0.4], [2 + SWING, 'step', 0.25], [3, 'step', 0.4], [0, 'bass', 0.75], [1, 'bass', 0.5, 4], [2, 'bass', 0.65, 7], [3, 'bass', 0.5, 9], ...sw8([0, 1, 2, 3], 'hat', 0.1)] },
  swing: { label: 'walking bass, backbeat on 2 and 4', bars: 1, key: 'major', hits: [[0, 'kick', 0.55], [2, 'kick', 0.45], [1, 'snare', 0.45], [3, 'snare', 0.45], [0, 'bass', 0.75], [1, 'bass', 0.5, 4], [2, 'bass', 0.65, 7], [3, 'bass', 0.5, 9], [1, 'chord', 0.25], [3, 'chord', 0.25], ...sw8([0, 1, 2, 3], 'hat', 0.1)] },
  lindy: { label: 'swing ride, walking bass, backbeat', bars: 1, key: 'major', hits: [[0, 'bass', 0.75], [1, 'bass', 0.55, 4], [2, 'bass', 0.65, 7], [3, 'bass', 0.55, 9], [1, 'snare', 0.38], [3, 'snare', 0.38], [0, 'kick', 0.4], [2, 'kick', 0.35], ...sw8([0, 1, 2, 3], 'hat', 0.12), [1, 'chord', 0.22], [3, 'chord', 0.22]] },
  wcs: { label: 'heavy backbeat on 2 and 4, straight eighths', bars: 1, key: 'minor', hits: [[0, 'kick', 0.85], [0, 'chord', 0.35], [2, 'kick', 0.55], [2.5, 'kick', 0.35], [1, 'snare', 0.6], [3, 'snare', 0.6], [0, 'bass', 0.8], [1.5, 'bass', 0.45], [2, 'bass', 0.6, 7], [3.5, 'bass', 0.45, 10], ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b) => [b, 'hat', b % 1 ? 0.06 : 0.1]), [1, 'chord', 0.22], [3, 'chord', 0.22]] },
  samba: { label: 'surdo on 2, shaker sixteenths, 1-a-2', bars: 1, key: 'major', hits: [[0, 'step', 0.55], [0.75, 'step', 0.35], [1, 'step', 0.55], [0, 'kick', 0.35], [1, 'kick', 0.8], [1, 'bass', 0.7], [0.5, 'bass', 0.4, 7], [0, 'shaker', 0.14], [0.25, 'shaker', 0.07], [0.5, 'shaker', 0.1], [0.75, 'shaker', 0.14], [1, 'shaker', 0.14], [1.25, 'shaker', 0.07], [1.5, 'shaker', 0.1], [1.75, 'shaker', 0.14], [0.5, 'conga', 0.25]] },
  paso: { label: 'march: bass on 1, snare on 2', bars: 1, key: 'minor', hits: [[0, 'kick', 0.8], [0, 'bass', 0.85], [1, 'snare', 0.5], [1.5, 'snare', 0.25], [0, 'chord', 0.45], [1, 'chord', 0.3], [0, 'step', 0.3], [1, 'step', 0.25], [0.5, 'hat', 0.07], [1.5, 'hat', 0.07]] },
  mambo: { label: 'cowbell, clave, conga, breaks on 2', bars: 2, key: 'minor', hits: [[1, 'step', 0.65], [2, 'step', 0.45], [3, 'step', 0.5], [5, 'step', 0.65], [6, 'step', 0.45], [7, 'step', 0.5], [0, 'cowbell', 0.3], [1, 'cowbell', 0.22], [2, 'cowbell', 0.26], [3, 'cowbell', 0.22], [4, 'cowbell', 0.3], [5, 'cowbell', 0.22], [6, 'cowbell', 0.26], [7, 'cowbell', 0.22], [1, 'clave', 0.28], [2, 'clave', 0.28], [4, 'clave', 0.28], [5.5, 'clave', 0.28], [7, 'clave', 0.28], [3, 'conga', 0.45], [3.5, 'conga', 0.4], [7, 'conga', 0.45], [7.5, 'conga', 0.4], [1.5, 'bass', 0.7], [3, 'bass', 0.6, 7], [5.5, 'bass', 0.7], [7, 'bass', 0.6, 7], [0, 'kick', 0.8], [4, 'kick', 0.8], [0, 'chord', 0.55], [4, 'chord', 0.5]] },
  salsa: { label: 'cowbell, clave, conga tumbao, steps on 1-2-3, 5-6-7', bars: 2, key: 'minor', hits: [[0, 'step', 0.6], [1, 'step', 0.4], [2, 'step', 0.45], [4, 'step', 0.6], [5, 'step', 0.4], [6, 'step', 0.45], [0, 'cowbell', 0.3], [1, 'cowbell', 0.22], [2, 'cowbell', 0.26], [3, 'cowbell', 0.22], [4, 'cowbell', 0.3], [5, 'cowbell', 0.22], [6, 'cowbell', 0.26], [7, 'cowbell', 0.22], [0, 'clave', 0.28], [1.5, 'clave', 0.28], [3, 'clave', 0.28], [5, 'clave', 0.28], [6, 'clave', 0.28], [3, 'conga', 0.45], [3.5, 'conga', 0.4], [7, 'conga', 0.45], [7.5, 'conga', 0.4], [1.5, 'bass', 0.7], [3, 'bass', 0.6, 7], [5.5, 'bass', 0.7], [7, 'bass', 0.6, 7], [0, 'kick', 0.6], [4, 'kick', 0.6], [0, 'chord', 0.4], [4, 'chord', 0.35]] },
}
export const BACKING_FOR = {
  std_waltz: 'waltz', waltz: 'waltz', std_viennese: 'waltz', viennese: 'waltz', std_foxtrot: 'foxtrot', foxtrot: 'foxtrot',
  quickstep: 'quickstep', std_tango: 'tango', tango: 'tango', chacha: 'chacha', am_chacha: 'chacha', rumba: 'rumba',
  am_rumba: 'am_rumba', bolero: 'bolero', jive: 'jive', swing: 'swing', lindy: 'lindy', wcs: 'wcs', samba: 'samba',
  paso: 'paso', mambo: 'mambo', salsa: 'salsa',
}
// Four-bar chord loops: [root (semitones above the key note), chord intervals].
export const PROGRESSIONS = {
  major: [[0, [0, 4, 7]], [9, [0, 3, 7]], [5, [0, 4, 7]], [7, [0, 4, 7]]],
  minor: [[0, [0, 3, 7]], [5, [0, 3, 7]], [7, [0, 4, 7]], [0, [0, 3, 7]]],
}
export const backingFor = (key) => BACKINGS[BACKING_FOR[key]] || BACKINGS.foxtrot

// The backing hits of one bar (index n from bar 1; count-in bars are negative), positions in beats from its
// downbeat, with the bass / chord notes (MIDI) filled in. A count-in bar is a woodblock on every beat.
export function barHits(key, n, bpb) {
  if (n < 0) return Array.from({ length: bpb }, (_, b) => [b, 'count', b ? 0.45 : 0.7])
  const B = backingFor(key), prog = PROGRESSIONS[B.key] || PROGRESSIONS.major
  const tonic = B.key === 'minor' ? 57 : 55 // A minor / G major
  const [root, chord] = prog[Math.floor(n / B.bars) % prog.length]
  const first = (n % B.bars) * bpb
  return B.hits
    .filter(([pos]) => pos >= first && pos < first + bpb)
    .map(([pos, voice, gain, iv = 0]) => {
      const note = voice === 'bass' ? tonic - 24 + root + iv : voice === 'chord' ? chord.map((c) => tonic + root + c) : null
      return [pos - first, voice, gain, note]
    })
}
