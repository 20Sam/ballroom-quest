// Talks to the FastAPI backend (same origin) and keeps the player's progress in localStorage.
export const SESSION = localStorage.bq_session || (localStorage.bq_session = crypto.randomUUID())

async function req(path, body) {
  const r = await fetch(path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: SESSION, ...body }),
  } : {})
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const d = data.detail
    throw new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : `HTTP ${r.status}`)
  }
  return data
}

export const api = {
  health: () => req('/api/health'),
  catalog: () => req('/api/catalog'),
  drills: () => req('/api/drills'),
  check: (dance, figure_ids) => req('/api/check', { dance, figure_ids }),
  coach: (b) => req('/api/coach', b),
  drill: (b) => req('/api/drill', b),
  plan: (b) => req('/api/plan', b),
  mocapList: () => req('/api/mocap'),
  mocapClip: (id) => req(`/api/mocap/${encodeURIComponent(id)}`),
}

const KEY = 'bq_progress_v1'
export const store = {
  load() {
    try { return JSON.parse(localStorage[KEY]) } catch { return { xp: 0, role: 'leader', figures: {}, plays: 0 } }
  },
  save(s) { localStorage[KEY] = JSON.stringify(s) },
}
