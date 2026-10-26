// "What do you want to work on?": tags each figure with practice goals, deterministically from its data (steps,
// turns, name, cues and level; no AI). main.js marks the matching figures on the floor panel and prefers them in
// the "★ next" and "Try next" suggestions.
//   travel  : moving round the floor (forward/back progressions, walks, chassés, locks, feathers)
//   turns   : a net half turn or more for either partner (his turn, or her spins from follow_turns)
//   styling : arm styling / upper body ("flare"): fans, hockey sticks, alemanas, promenades, shadows, sways...
//   basics  : rhythm basics: basics, closed changes, boxes, walks, rocks, time steps at the early levels
//   showoff : Silver and Gold (or American Level 3 and up)

export const GOALS = [
  { id: 'travel', label: 'Travel', hint: 'moving around the floor' },
  { id: 'turns', label: 'Turns', hint: 'turns and spins' },
  { id: 'styling', label: 'Arm styling', hint: 'upper body, flare' },
  { id: 'basics', label: 'Rhythm basics', hint: 'feel the beat' },
  { id: 'showoff', label: 'Show-off', hint: 'Silver and Gold' },
]
export const GOAL_LABEL = Object.fromEntries(GOALS.map((g) => [g.id, g.label]))

const TRAVEL_DIRS = new Set(['fwd', 'back', 'diag_fwd_l', 'diag_fwd_r', 'diag_back_l', 'diag_back_r', 'cross_fwd', 'cross_back', 'slip_fwd', 'slip_back'])
const TRAVEL_NAME = /walk|progress|chass|lock|feather|three step|telemark|run|travel|weave|quick open|promenade|twinkle|whisk|zig|botafogo|volta|chase|sugar push|tuck/i
const STYLING_NAME = /fan|hockey|alemana|spiral|rope|opening out|hip twist|wing|oversway|promenade|shadow|aida|contra check|lunge|throwaway|sliding door|hand to hand|new york|fallaway|cuban|line|curl|whip|chasse? roll|cape|sur place|appel|attack|press line|syncopated|sway/i
const STYLING_CUE = /\barms?\b|styling|free hand|free arm|extend|shape|sway/i
const BASICS_NAME = /basic|closed change|box|walk|time step|rock|cucaracha|side break|forward and back|six count|eight count|triple|step tap|back break|change step|quarter turn|fallaway rock|\blink\b|progressive|chass/i
const SHOWOFF_LEVEL = /silver|gold|level (3|4|5|6|iii|iv)\b/i
const EARLY_LEVEL = /newcomer|concepts|beginning bronze|^bronze$|level (1|i)$/i

const cache = new WeakMap()
// The goals a figure matches. kind = the dance's floor kind ('lod', 'slot' or 'spot', dancer.js floorKind).
export function figGoals(f, kind) {
  let g = cache.get(f)
  if (g) return g
  g = new Set()
  const steps = f.steps || [], name = f.name || '', cues = `${f.lead_cue || ''} ${f.follow_cue || ''}`
  // turns: his total turn, or hers with her own turns (spins under his arm), half a turn or more
  // (net turn: a Box or Change that turns one way and back again is not a turning figure)
  const his = Math.abs(steps.reduce((a, s) => a + (+s[3] || 0), 0))
  const ft = f.follow_turns || {}
  const hers = Math.abs(steps.reduce((a, s, i) => a + (+(ft[String(i)] ?? s[3]) || 0), 0))
  if (Math.max(his, hers) >= 180 || /spin|pivot|turn|twirl|volta|alemana|tumble|spiral|curl|\btop\b/i.test(name)) g.add('turns')
  // travel: walking or travelling figures anywhere; forward/back progressions on line-of-dance floors (spot
  // dances barely travel, so only long runs of forward/back steps count there)
  const moving = steps.filter((s) => TRAVEL_DIRS.has(s[1])).length
  if (TRAVEL_NAME.test(name) || (kind === 'lod' ? moving >= 3 && moving / steps.length >= 0.4 : kind === 'slot' ? moving >= 4 && moving / steps.length >= 0.5 : moving >= 6 && moving / steps.length >= 0.6)) g.add('travel')
  if (STYLING_NAME.test(name) || STYLING_CUE.test(cues)) g.add('styling')
  const showoff = SHOWOFF_LEVEL.test(f.level || '')
  if (showoff) g.add('showoff')
  else if (BASICS_NAME.test(name) || EARLY_LEVEL.test(f.level || '') && steps.length <= 8 && Math.max(his, hers) < 180) g.add('basics')
  cache.set(f, g)
  return g
}
