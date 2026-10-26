// "Grade my video": film yourself dancing the routine, and the game's own server grades the timing and the feet.
// The video goes only to this game's server (on this laptop when you run it locally), which grades it with a pose
// model and deletes it straight away (backend/grade.py, POST /api/grade). No AI model sees it. The results modal
// shows an overall grade, per-figure bars, a timeline of the routine's steps against yours, and tips.
//
// main.js calls mountGrader(ctx) once. ctx = {
//   state(): { mode, dance, danceName, role, routine: [figure ids], figs: {id: figure}, bpm, compBpm, speedPct },
//   openModal(html), closeModal(), esc(text), aiOn(): bool, onCoach(stats {figure id: 0..1}) }

const MAX_SECONDS = 60
const MAX_FIGURES = 12 // the server's limits (backend/grade.py MAX_SECONDS, MAX_FIGURES)
const MAX_MB = 300
const FOOT_COLOR = { L: 'var(--sky)', R: 'var(--coral)' }

const CSS = `
.grade-row button { flex: 1; padding: 9px; border-radius: 12px; font-weight: 600; font-size: 13px; }
.grade .row button { padding: 9px 16px; border-radius: 12px; font-weight: 600; }
.grade-row button.ready { background: var(--coral); color: #fff; }
.grade .grade-how { padding-left: 20px; line-height: 1.6; font-size: 14px; margin: 8px 0 4px; }
.grade .field small { color: var(--muted); font-size: 11.5px; line-height: 1.35; }
.grade .seg { display: inline-flex; background: var(--sand); border-radius: 10px; padding: 3px; gap: 2px; }
.grade .seg button { padding: 5px 12px; border-radius: 8px; font-size: 13px; color: var(--muted); font-weight: 600; }
.grade .seg button.on { background: var(--ocean); color: #fff; }
.grade-drop { display: grid; gap: 4px; place-items: center; text-align: center; margin: 12px 0; padding: 18px 12px;
  border: 2px dashed var(--sand-2); border-radius: 14px; background: #fff; cursor: pointer; color: var(--ocean); font-weight: 600; }
.grade-drop:hover, .grade-drop.over { border-color: var(--sky); background: var(--foam); }
.grade-drop input { display: none; }
.grade-drop small { font-weight: 400; color: var(--muted); }
.grade-privacy { font-size: 12.5px; color: var(--ocean); background: var(--foam); border-radius: 12px; padding: 9px 12px; line-height: 1.45; }
.grade-progress { margin: 18px 0 8px; }
.grade-progress .gbar { height: 10px; background: var(--sand); border-radius: 99px; overflow: hidden; }
.grade-progress .gbar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--sky), var(--lagoon)); transition: width .2s; }
.grade-progress small { color: var(--muted); }
.grade-head { display: flex; gap: 18px; align-items: center; }
.grade-ring { --p: 0; flex: none; width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center;
  background: conic-gradient(var(--lagoon) calc(var(--p) * 1%), var(--sand) 0); }
.grade-ring > div { width: 72px; height: 72px; border-radius: 50%; background: var(--shell); display: grid; place-items: center; align-content: center; }
.grade-ring b { font: 700 28px Georgia, serif; color: var(--ocean); line-height: 1; }
.grade-ring small { font-size: 10px; color: var(--muted); }
.grade-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0 4px; }
.grade-tile { background: #fff; border: 1px solid var(--sand); border-radius: 12px; padding: 9px 10px; }
.grade-tile b { display: block; font: 700 20px Georgia, serif; color: var(--ocean); }
.grade-tile span { font-size: 12px; font-weight: 600; color: var(--lagoon); }
.grade-tile small { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
.grade-conf { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 99px; margin-right: 6px; }
.grade-conf.high { background: #dff3ea; color: #23775c; } .grade-conf.medium { background: var(--foam); color: var(--ocean); }
.grade-conf.low { background: #ffe0d4; color: #a3472b; }
.grade-figs { display: grid; gap: 6px; }
.grade-fig { display: grid; grid-template-columns: minmax(90px, 30%) 1fr 44px; gap: 8px; align-items: center; font-size: 13px; }
.grade-fig .gb { height: 12px; background: var(--sand); border-radius: 99px; overflow: hidden; }
.grade-fig .gb i { display: block; height: 100%; border-radius: 99px; }
.grade-fig small { grid-column: 1 / -1; color: var(--muted); font-size: 11px; margin-top: -4px; }
.grade-tl { display: grid; grid-template-columns: 52px 1fr; border: 1px solid var(--sand); border-radius: 12px; background: #fff; }
.grade-tl .lab { display: grid; grid-template-rows: 22px 46px 46px; font-size: 11px; font-weight: 700; color: var(--lagoon); padding-left: 8px; }
.grade-tl .lab span { align-self: center; }
.grade-tl .scroll { overflow-x: auto; }
.grade-tl svg { display: block; }
.grade-legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: var(--muted); margin: 6px 2px 0; }
.grade-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: -1px; }
.grade-legend i.line { width: 14px; height: 3px; border-radius: 2px; vertical-align: 2px; }
.grade ul.tips { padding-left: 20px; line-height: 1.55; margin: 6px 0; }
.grade .box ul.tips { font-size: 13.5px; color: var(--ink); }
@media (max-width: 700px) { .grade-tiles { grid-template-columns: repeat(2, 1fr); } }
`

function injectCss() {
  if (document.getElementById('grade-css')) return
  const s = document.createElement('style')
  s.id = 'grade-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

const isLocalHost = () => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname) || location.hostname.endsWith('.localhost')
function privacyNote(esc) {
  const where = isLocalHost() ? "only to this game's own server on this laptop" : `only to this game's server (${esc(location.host)})`
  return `🔒 Your video is sent ${where}, analysed there with a pose model, and deleted as soon as it is graded. It is never saved, logged or shared, and no AI model sees it.`
}

const pct = (x) => `${Math.round((x || 0) * 100)}%`
const ms = (s) => `${s > 0 ? '+' : ''}${Math.round(s * 1000)} ms`

export function mountGrader(ctx) {
  injectCss()
  const esc = ctx.esc
  let busy = null // { xhr, timer } while a video is being graded
  let ready = null // a result that arrived after the modal was closed

  // the button, under the Instructors button in the floor panel (all #floor buttons are disabled during a run)
  const anchor = document.getElementById('mocapBtn')?.closest('.row')
  const row = document.createElement('div')
  row.className = 'row grade-row'
  row.innerHTML = '<button id="gradeBtn" class="ghost" title="Film yourself dancing this routine and get it graded (G)">🎬 Grade my video <kbd>G</kbd></button>'
  if (anchor) anchor.after(row)
  else document.getElementById('floor')?.appendChild(row)
  const btn = row.querySelector('button')
  btn.onclick = () => open()
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyG' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return
    const modalOpen = !document.getElementById('modal')?.classList.contains('hidden')
    const welcome = !document.getElementById('welcome')?.classList.contains('hidden')
    if (modalOpen || welcome || ctx.state().mode !== 'floor') return
    e.preventDefault()
    open()
  })

  const root = () => document.getElementById('gradeRoot')
  const setBtn = (label, cls = '') => { btn.innerHTML = `${label} <kbd>G</kbd>`; btn.className = `ghost ${cls}`.trim() }

  function open() {
    if (ready) { const r = ready; ready = null; setBtn('🎬 Grade my video'); showResult(r.report, r.st); return }
    if (busy) { showBusy(busy.st); return }
    showSetup()
  }

  function routineLine(st) {
    return st.routine.map((id) => esc(st.figs[id]?.name || id)).join(' → ')
  }

  // ---------- 1. setup ----------
  // How much of the routine one graded video can cover: up to MAX_FIGURES figures and MAX_SECONDS at this tempo.
  function gradable(st) {
    let n = 0, t = 0
    for (const id of st.routine) {
      const beats = (st.figs[id]?.steps || []).reduce((sum, x) => sum + (+x[2] || 0), 0) // step = [foot, dir, beats, ...]
      const dt = (beats * 60) / (st.bpm || 120)
      if (n >= MAX_FIGURES || (n > 0 && t + dt > MAX_SECONDS)) break
      n++; t += dt
    }
    return n
  }

  function showSetup() {
    let st = ctx.state()
    if (!st.routine.length) {
      ctx.openModal(`<div id="gradeRoot" class="grade"><h2>Grade my video</h2>
        <p>Build a routine first (number keys add figures), dance it in front of your phone, then bring the video here: I'll grade your timing and your feet against that routine.</p></div>`)
      return
    }
    const n = gradable(st), total = st.routine.length
    if (n < total) st = { ...st, routine: st.routine.slice(0, n) } // a long routine (a Choreographer plan): grade its start
    const cut = n < total ? `<p class="grade-privacy"><b>Grading covers the first ${n} of your ${total} figures</b> (up to ${MAX_FIGURES} figures and ${MAX_SECONDS} s).
      Dance just these, or practise one section of your song and grade that.</p>` : ''
    const role = st.role === 'leader' ? 'Leader' : 'Follower'
    ctx.openModal(`<div id="gradeRoot" class="grade" data-stage="setup">
      <h2>Grade my video</h2>
      <p class="sub">${esc(st.danceName)} · ${role} · ${routineLine(st)}</p>
      <ol class="grade-how">
        <li>Prop your phone so your <b>whole body, head to feet</b>, is in the shot, filmed from the front or the side. Keep the phone still.</li>
        <li>Play your music or the game's metronome <b>out loud</b>, start recording, and dance this routine once (${MAX_SECONDS} s at most). With the beat in the sound, you are graded against the music.</li>
        <li>Choose the video below.</li>
      </ol>
      ${cut}
      <div class="grid2">
        <label class="field">Tempo you danced at (beats per minute)
          <input type="number" id="gBpm" min="20" max="260" step="1" value="${Math.round(st.bpm)}" />
          <small>Competition ${st.compBpm} bpm; your practice tempo ${st.speedPct}% is ${Math.round(st.bpm)} bpm. Danced to a song? Type its bpm.</small></label>
        <label class="field">Your first step, seconds into the video
          <input type="number" id="gFirst" min="0" max="${MAX_SECONDS}" step="0.1" placeholder="auto" />
          <small>Leave it empty and I find the start myself.</small></label>
      </div>
      <div class="field">The camera mostly sees my
        <div class="seg" id="gFacing" role="group" aria-label="Camera view"><button data-v="front" class="on">front</button><button data-v="side">side</button><button data-v="back">back</button></div></div>
      <label class="grade-drop" id="gDrop"><input type="file" id="gFile" accept="video/*,.mov,.mp4,.m4v" />
        <span>🎬 Choose or drop a video</span><small id="gFileInfo">.mp4 or .mov from your phone · up to ${MAX_SECONDS} s and ${MAX_MB} MB</small></label>
      <p class="grade-privacy">${privacyNote(esc)}</p>
      <p class="err" id="gErr"></p>
      <div class="row"><button class="primary" id="gGo" disabled>Grade it</button><button class="ghost" id="gCancel">Not now</button></div>
    </div>`)
    let file = null, facing = 'front'
    const $r = (s) => root()?.querySelector(s)
    $r('#gFacing').onclick = (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return
      facing = b.dataset.v
      root().querySelectorAll('#gFacing button').forEach((x) => x.classList.toggle('on', x === b))
    }
    const err = (t) => { $r('#gErr').textContent = t || '' }
    async function pick(f) {
      file = null; $r('#gGo').disabled = true; err('')
      if (!f) return
      const okType = /^video\//.test(f.type) || /\.(mov|mp4|m4v|webm|mkv|avi|3gp)$/i.test(f.name)
      if (!okType) return err("That doesn't look like a video. Choose an .mp4 or .mov from your phone.")
      if (f.size > MAX_MB * 1024 * 1024) return err(`That video is ${Math.round(f.size / 2 ** 20)} MB; the limit is ${MAX_MB} MB. Trim it to the routine.`)
      const dur = await durationOf(f) // read in the browser from the file itself, nothing is uploaded yet
      if (dur && dur > MAX_SECONDS + 0.5) return err(`That video is ${Math.round(dur)} s long. Trim it to ${MAX_SECONDS} s or less (just the routine).`)
      file = f
      $r('#gFileInfo').textContent = `${f.name} · ${(f.size / 2 ** 20).toFixed(1)} MB${dur ? ` · ${dur.toFixed(1)} s` : ''}`
      $r('#gGo').disabled = false
    }
    $r('#gFile').onchange = (e) => pick(e.target.files[0])
    const drop = $r('#gDrop')
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over') }
    drop.ondragleave = () => drop.classList.remove('over')
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]) }
    $r('#gCancel').onclick = () => ctx.closeModal()
    $r('#gGo').onclick = () => {
      const bpm = +$r('#gBpm').value
      if (!(bpm >= 20 && bpm <= 260)) return err('Type the tempo in beats per minute (20 to 260).')
      const firstRaw = $r('#gFirst').value.trim()
      const first = firstRaw === '' ? null : +firstRaw
      if (first !== null && !(first >= 0 && first <= MAX_SECONDS)) return err(`The first step must be between 0 and ${MAX_SECONDS} seconds.`)
      upload(file, { ...st, bpm, first, facing })
    }
  }

  // the clip's length from its metadata (browser only); null when the browser can't read it (the server checks too)
  function durationOf(f) {
    return new Promise((resolve) => {
      const v = document.createElement('video'), url = URL.createObjectURL(f)
      const done = (d) => { URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(Number.isFinite(d) && d > 0 ? d : null) }
      v.preload = 'metadata'; v.muted = true
      v.onloadedmetadata = () => done(v.duration)
      v.onerror = () => done(null)
      setTimeout(() => done(null), 4000)
      v.src = url
    })
  }

  // ---------- 2. upload + grading ----------
  function upload(file, st) {
    const fd = new FormData()
    fd.append('video', file, file.name)
    fd.append('dance', st.dance)
    fd.append('figure_ids', JSON.stringify(st.routine))
    fd.append('role', st.role)
    fd.append('bpm', String(st.bpm))
    if (st.first !== null) fd.append('first_step', String(st.first))
    fd.append('facing', st.facing)
    const xhr = new XMLHttpRequest()
    busy = { xhr, st, t0: performance.now(), up: 0, phase: 'upload' }
    setBtn('⏳ Grading your video…')
    showBusy(st)
    busy.timer = setInterval(() => updateBusy(), 500)
    xhr.upload.onprogress = (e) => { if (busy && e.lengthComputable) { busy.up = e.loaded / e.total; updateBusy() } }
    xhr.upload.onload = () => { if (busy) { busy.phase = 'pose'; busy.tPose = performance.now(); updateBusy() } }
    xhr.onload = () => {
      let body = {}
      try { body = JSON.parse(xhr.responseText) } catch { body = {} }
      finish()
      if (xhr.status === 200 && body.ok) return deliver(body, st)
      const d = body.detail
      showError(typeof d === 'string' ? d : `The grader answered ${xhr.status}.`, xhr.status)
    }
    xhr.onerror = () => { finish(); showError('Could not reach the game server. Is it still running?', 0) }
    xhr.onabort = () => { finish() }
    xhr.open('POST', '/api/grade')
    xhr.send(fd)
  }

  function finish() {
    if (!busy) return
    clearInterval(busy.timer)
    busy = null
    setBtn('🎬 Grade my video')
  }

  function showBusy(st) {
    ctx.openModal(`<div id="gradeRoot" class="grade" data-stage="busy">
      <h2>Grading your video…</h2>
      <p class="sub">${esc(st.danceName)} · ${st.role === 'leader' ? 'Leader' : 'Follower'} · ${Math.round(st.bpm)} bpm · ${routineLine(st)}</p>
      <div class="grade-progress"><div class="gbar"><i id="gBar"></i></div>
        <p id="gStage"><span class="spinner"></span>Starting…</p>
        <small>Finding your feet takes roughly as long as the video, longer on a busy laptop. You can close this window; the button in the floor panel lights up when your grade is ready.</small></div>
      <p class="grade-privacy">${privacyNote(esc)}</p>
      <div class="row"><button class="ghost" id="gAbort">Cancel</button></div></div>`)
    root().querySelector('#gAbort').onclick = () => { busy?.xhr.abort(); ctx.closeModal() }
    updateBusy()
  }

  function updateBusy() {
    const r = root()
    if (!busy || !r || r.dataset.stage !== 'busy') return
    const bar = r.querySelector('#gBar'), stage = r.querySelector('#gStage')
    if (busy.phase === 'upload') {
      bar.style.width = `${Math.round(busy.up * 30)}%`
      stage.innerHTML = `<span class="spinner"></span>Sending the video to the grader… ${Math.round(busy.up * 100)}%`
    } else {
      const s = (performance.now() - busy.tPose) / 1000
      bar.style.width = `${Math.round(30 + 65 * (1 - Math.exp(-s / 40)))}%` // no server progress: ease towards the end
      stage.innerHTML = `<span class="spinner"></span>Watching your feet and lining your steps up with the routine… ${Math.round(s)} s`
    }
  }

  function showError(msg, status) {
    const extras = status === 501
    ctx.openModal(`<div id="gradeRoot" class="grade" data-stage="error"><h2>Grade my video</h2>
      <p class="err">${esc(msg)}</p>
      ${extras ? `<div class="box"><h4>Turn on video grading</h4><p>Video grading uses optional extras (a pose model and a video decoder) so the base game stays light. In the repo folder run:</p>
        <p><kbd>.venv/bin/pip install -r requirements-video.txt</kbd></p><p>then restart the server.</p></div>` : ''}
      <div class="row"><button class="primary" id="gRetry">Try another video</button></div></div>`)
    root().querySelector('#gRetry').onclick = () => showSetup()
  }

  function deliver(report, st) {
    const r = root()
    const modalOpen = !document.getElementById('modal')?.classList.contains('hidden')
    if (r && r.dataset.stage === 'busy' && modalOpen) return showResult(report, st)
    ready = { report, st } // the player closed the window: keep it for the button
    setBtn('📊 Your video grade is ready', 'ready')
  }

  // ---------- 3. results ----------
  function showResult(rep, st) {
    const m = rep.metrics, music = rep.alignment.music || {}
    const conf = m.confidence_label
    const tiles = [
      ['On the beat', pct(m.on_beat), `within ±0.12 s · ${pct(m.close)} within ±0.25 s`],
      ['Steps', `${m.steps_detected} / ${m.steps_expected}`, `seen / in the routine · ${m.steps_matched} matched`],
      ['Right foot', m.foot_checked ? pct(m.foot_accuracy) : '–', m.foot_checked ? `${Math.round(m.foot_accuracy * m.foot_checked)} of ${m.foot_checked} matched steps` : 'no steps matched'],
      ['Steady rhythm', pct(m.consistency), m.spread_ms !== null ? `steps vary ±${m.spread_ms} ms` : 'too few steps'],
    ].map(([k, v, s]) => `<div class="grade-tile"><span>${k}</span><b>${v}</b><small>${esc(s)}</small></div>`).join('')
    const figs = rep.figures.map((f) => {
      const c = f.score >= 0.85 ? 'var(--ok)' : f.score >= 0.6 ? 'var(--lagoon)' : 'var(--coral)'
      return `<div class="grade-fig"><span>${esc(f.name)}</span><div class="gb"><i style="width:${Math.round(f.score * 100)}%;background:${c}"></i></div><b>${pct(f.score)}</b>
        <small>${f.on_beat}/${f.steps} on the beat · ${f.found}/${f.steps} found · ${f.right_foot}/${f.found || 0} on the right foot</small></div>`
    }).join('')
    const basis = music.used
      ? `graded against the music's beat (${Math.round(music.bpm)} bpm in the sound)`
      : 'graded on your rhythm (no clear beat in the sound)'
    const notes = (rep.quality?.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')
    const q = rep.quality || {}
    ctx.openModal(`<div id="gradeRoot" class="grade" data-stage="result">
      <div class="grade-head">
        <div class="grade-ring" style="--p:${rep.overall}"><div><b>${rep.overall}</b><small>of 100</small></div></div>
        <div><h2>${esc(rep.label)}</h2>
          <p class="sub">${esc(st.danceName)} · ${st.role === 'leader' ? 'Leader' : 'Follower'} · ${Math.round(st.bpm)} bpm · ${esc(basis)}</p>
          <span class="grade-conf ${conf}" title="How clearly the video follows this routine's rhythm, compared with random stepping (${pct(m.chance_on_beat)} on the beat)">Confidence: ${conf}</span>
          ${music.used && Math.abs(m.mean_offset_ms) >= 40 ? `<span class="tag">${m.mean_offset_ms > 0 ? 'late' : 'early'} by ${Math.abs(m.mean_offset_ms)} ms on average</span>` : ''}</div>
      </div>
      <div class="grade-tiles">${tiles}</div>
      <h3>Per figure <small>timing score</small></h3>
      <div class="grade-figs">${figs}</div>
      <h3>Timeline <small>the routine's steps above, yours below</small></h3>
      ${timeline(rep)}
      <div class="grade-legend"><span><i style="background:var(--sky)"></i>left foot</span><span><i style="background:var(--coral)"></i>right foot</span>
        <span><i class="line" style="background:var(--ok)"></i>on the beat</span><span><i class="line" style="background:var(--gold, #c9a227)"></i>within ¼ s</span>
        <span><i class="line" style="background:var(--bad)"></i>off</span><span>○ weight change in place · ✕ missed</span></div>
      <h3>Tips</h3>
      <ul class="tips">${rep.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${notes ? `<div class="box"><h4>About this video</h4><ul class="tips">${notes}</ul></div>` : ''}
      <p class="grade-privacy">🔒 The video has been deleted. ${q.frames ? `I looked at ${q.frames} frames (${q.fps} a second) and could see you in ${pct(q.tracked)} of them` : ''}${rep.seconds ? `, in ${rep.seconds} s` : ''}. Grades: timing ${pct(rep.weights.timing)}, rhythm ${pct(rep.weights.consistency)}, feet ${pct(rep.weights.foot)}, step count ${pct(rep.weights.step_count)}.</p>
      <div class="row"><button class="primary" id="gAgain">Grade another video</button>
        ${ctx.aiOn() ? '<button class="ghost" id="gCoach" title="Sends only the figure names and these timing scores to the AI coach (about $0.001)">🧑‍🏫 Ask Coach Marisol about it</button>' : ''}</div>
    </div>`)
    root().querySelector('#gAgain').onclick = () => showSetup()
    const coach = root().querySelector('#gCoach')
    if (coach) {
      coach.onclick = () => {
        const sums = {}
        for (const f of rep.figures) { const a = (sums[f.id] ??= [0, 0]); a[0] += f.score; a[1] += 1 }
        ctx.onCoach(Object.fromEntries(Object.entries(sums).map(([id, [s, n]]) => [id, s / n])))
      }
    }
  }

  // expected steps (top row) against detected steps (bottom row), joined when matched
  function timeline(rep) {
    const tl = rep.timeline
    const t0 = tl.start, t1 = Math.max(tl.end, t0 + 1)
    const pps = Math.max(70, 600 / (t1 - t0)) // pixels per second
    const W = Math.round((t1 - t0) * pps) + 24, yE = 44, yD = 90, H = 114
    const X = (t) => 12 + (t - t0) * pps
    const parts = []
    // figure bands
    for (const f of rep.figures) {
      const x0 = X(f.t0) - 8, x1 = X(f.t1) + 8
      parts.push(`<rect x="${x0.toFixed(1)}" y="2" width="${Math.max(4, x1 - x0).toFixed(1)}" height="${H - 4}" rx="8" fill="${f.index % 2 ? 'var(--foam)' : 'var(--sand)'}" opacity="0.55"/>`)
      parts.push(`<text x="${(x0 + 4).toFixed(1)}" y="14" font-size="10" font-weight="700" fill="var(--ocean)">${esc(f.name)}</text>`)
    }
    // matches
    const det = tl.detected
    const byIndex = new Map()
    det.forEach((d) => { if (d.match !== null && d.match !== undefined) byIndex.set(d.match, d) })
    tl.expected.forEach((e, i) => {
      const d = byIndex.get(i)
      if (!d || e.dt === null) return
      const a = Math.abs(e.dt), c = a <= 0.12 ? 'var(--ok)' : a <= 0.25 ? 'var(--gold, #c9a227)' : 'var(--bad)'
      parts.push(`<line x1="${X(e.t).toFixed(1)}" y1="${yE + 7}" x2="${X(d.t).toFixed(1)}" y2="${yD - 7}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`)
    })
    // routine steps
    tl.expected.forEach((e, i) => {
      const x = X(e.t).toFixed(1), col = FOOT_COLOR[e.foot] || 'var(--muted)'
      const fig = rep.figures[e.fig]?.name || ''
      const tip = `${fig}, count ${e.count}: ${e.foot === 'L' ? 'left' : 'right'} foot${e.moves ? '' : ' (weight change in place)'}${e.dt !== null ? ` · you ${ms(e.dt)}` : ' · missed'}`
      parts.push(`<g><title>${esc(tip)}</title>${e.moves
        ? `<circle cx="${x}" cy="${yE}" r="6.5" fill="${col}"/>`
        : `<circle cx="${x}" cy="${yE}" r="5.5" fill="#fff" stroke="${col}" stroke-width="2.5"/>`}
        <text x="${x}" y="${yE - 11}" font-size="9.5" text-anchor="middle" fill="var(--muted)">${esc(e.count)}</text>
        ${e.dt === null ? `<text x="${x}" y="${yD + 4}" font-size="13" text-anchor="middle" fill="var(--bad)" font-weight="700">✕</text>` : ''}</g>`)
    })
    // your steps
    for (const d of det) {
      if (d.t < t0 - 0.2 || d.t > t1 + 0.2) continue
      const x = X(d.t).toFixed(1), col = FOOT_COLOR[d.foot] || 'var(--muted)'
      const extra = d.match === null || d.match === undefined
      const tip = `${d.t.toFixed(2)} s: ${d.foot === 'L' ? 'left' : 'right'} foot ${d.kind === 'land' ? 'lands' : 'takes the weight'}${extra ? ' (extra: not in the routine)' : ''}`
      parts.push(`<g opacity="${extra ? 0.45 : 1}"><title>${esc(tip)}</title>${d.kind === 'land'
        ? `<circle cx="${x}" cy="${yD}" r="6.5" fill="${col}"/>`
        : `<circle cx="${x}" cy="${yD}" r="5.5" fill="#fff" stroke="${col}" stroke-width="2.5"/>`}</g>`)
    }
    // seconds axis
    for (let s = Math.ceil(t0); s <= t1; s++) parts.push(`<text x="${X(s).toFixed(1)}" y="${H - 2}" font-size="9" text-anchor="middle" fill="var(--muted)">${s}s</text>`)
    return `<div class="grade-tl"><div class="lab"><span></span><span>Routine</span><span>You</span></div>
      <div class="scroll"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Timeline of the routine's steps and the steps found in your video">${parts.join('')}</svg></div></div>`
  }

  return { open }
}
