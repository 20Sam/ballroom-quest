# Tokenomics evidence: what Ballroom Quest's three AI helpers cost

**Question:** what does one AI helper run cost, and what would the AI cost per player per month at 100 and 10,000 players?

**Short answer.** Per-run costs are measured (shown); monthly costs are an estimate from a stated usage model. On 15 fresh live runs (2026-10-25, gpt-6-luna via Portkey), a Coach Marisol review cost **$0.00075** on average, a drill **$0.00163** and a practice plan **$0.00304**. With 3 practice sessions a week, 2 coach reviews per session, 1 drill a week and 2 plans a month, one active player costs about **$0.033 a month**: **$3.27 a month for 100 players** and **$326.81 a month for 10,000 players** (likely nearer $222.36 once heavy traffic keeps the prompt cache warm). 100 players stay far under the $3/day app cap ($0.11/day); 10,000 players ($10.74/day) would hit it, so the cap must rise before scale. The prompt cache cut cost per run by 66% and the per-style coach prompt cut coach input tokens per model call by 60% (measured).

## How we measured

- **Fresh live runs, 2026-10-25 10:44–10:47** on a local server (port 8051) running the public code at HEAD `efd89c0` (151 figures, 22 dances, 5 styles). 10 coach reviews (one broken and one legal routine per style), 3 drills (a waltz note, a cha cha note, and the app's own prompt-injection sample note) and 2 plans (different dances and minutes).
- Each request used a `tokenomics-…` session id, so the rows are the ones with session `tokenomi` in `ballroom-quest/output/agent_runs.jsonl` (the app's own log; local, gitignored). Token counts come from the provider's usage data that PydanticAI records per model call.
- **Price sheet** (`backend/config.py`, USD per 1M tokens): input $0.10, cached input $0.01, output $0.50. Cost = (input − cached) × 0.10 + cached × 0.01 + output × 0.50, per million. Reasoning tokens are part of the output tokens and are billed as output. Every logged cost was re-computed from its tokens and matched.
- **Portkey response cache.** Portkey can replay an identical request from its cache (a repeat in under 1.5 s with identical tokens). Every fresh request had different inputs; the fastest fresh run took 3.06 s and no two runs shared token counts, so **0 fresh runs were excluded**. One historical run is excluded: `939be0f373` (2026-10-23) returned in 0.81 s with exactly the tokens of `bec82df3f4`.
- Drills were built with `save: false`, so the team drill board was not changed. Fresh spend for this evidence: **$0.0185** for all 15 runs.
- **Cold vs warm cache.** The provider caches a repeated prompt prefix for a short while. The first run of each prompt (each coach style, the Drill Builder, the Planner) started cold: its first model call had 0 cached tokens. 6 of the 15 runs started cold and 9 warm. In the coach runs the broken routine always ran first, so *broken* and *cold* coincide; the warm re-pricing below separates them.

## 1. Every fresh run

| # | Run | Agent | What we sent | Result | Model calls | Tool calls | Input tokens | Cached | Cache share | Output | of which reasoning | Seconds | Cost (USD) | Cold start |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `79ba0bfb74` | Coach Marisol | std_waltz (standard), leader: sw_natural → sw_reverse | verdict needs_fix; fix: insert sw_rf_change | 3 | 2 | 18,893 | 12,241 | 65% | 508 | 267 | 9.0 | $0.00104 | yes |
| 2 | `47cf7b5c70` | Coach Marisol | std_foxtrot (standard), follower: sf_feather → sf_reverse → sf_three_step | verdict flows | 2 | 1 | 12,445 | 12,055 | 97% | 326 | 199 | 4.8 | $0.00032 | no |
| 3 | `c6e8909eac` | Coach Marisol | waltz (smooth), follower: waltz_box → waltz_natural → waltz_reverse | verdict needs_fix; fix: insert waltz_lf_change, waltz_rf_change | 3 | 3 | 15,917 | 10,195 | 64% | 658 | 267 | 7.7 | $0.00100 | yes |
| 4 | `5727f645cf` | Coach Marisol | tango (smooth), leader: tango_walks → tango_link → tango_closed_prom | verdict flows | 2 | 1 | 10,293 | 9,912 | 96% | 189 | 69 | 5.2 | $0.00023 | no |
| 5 | `1c9cb0fa2f` | Coach Marisol | chacha (latin), follower: cc_basic_full → cc_fan → cc_hockey | verdict needs_fix; fix: insert cc_basic_fwd | 5 | 4 | 33,140 | 25,300 | 76% | 1,252 | 905 | 14.8 | $0.00166 | yes |
| 6 | `263aae3dcc` | Coach Marisol | rumba (latin), leader: rb_basic_fwd → rb_new_yorker → rb_hand_to_hand | verdict flows | 3 | 2 | 18,678 | 17,989 | 96% | 411 | 233 | 5.8 | $0.00045 | no |
| 7 | `9cbc22ced1` | Coach Marisol | mambo (rhythm), leader: mb_basic → mb_cross_body → mb_underarm | verdict needs_fix; fix: insert mb_open_break | 3 | 2 | 16,001 | 10,333 | 65% | 336 | 127 | 5.8 | $0.00084 | yes |
| 8 | `3f1c4ffa44` | Coach Marisol | am_rumba (rhythm), follower: ar_box → ar_underarm → ar_open_break | verdict flows | 2 | 1 | 10,561 | 10,176 | 96% | 175 | 53 | 3.1 | $0.00023 | no |
| 9 | `67cbf2b44f` | Coach Marisol | lindy (social), follower: lh_basic6 → lh_swingout → lh_circle | verdict needs_fix; fix: insert lh_tuck, lh_lindy_turn | 3 | 3 | 18,930 | 12,217 | 64% | 1,011 | 673 | 9.8 | $0.00130 | yes |
| 10 | `9697696b95` | Coach Marisol | salsa (social), leader: sa_basic → sa_cbl → sa_right_turn | verdict flows | 3 | 2 | 18,763 | 18,082 | 96% | 363 | 202 | 6.1 | $0.00043 | no |
| 11 | `8a5c735ef2` | Drill Builder | waltz lesson note, leader | waltz drill, 6 figures | 4 | 3 | 73,969 | 54,837 | 74% | 806 | 460 | 10.0 | $0.00286 | yes |
| 12 | `aff51d4486` | Drill Builder | cha cha lesson note, follower | chacha drill, 4 figures; skipped 1 unknown | 2 | 1 | 36,246 | 35,736 | 99% | 422 | 193 | 5.5 | $0.00062 | no |
| 13 | `41440db28b` | Drill Builder | app's injection sample note, leader | rumba drill, 6 figures; screen removed 1 line | 4 | 3 | 73,835 | 72,424 | 98% | 1,092 | 765 | 14.0 | $0.00141 | no |
| 14 | `e393d3878e` | Practice Planner | std_waltz, chacha; 20 min/day; leader | 7-session plan, 41 days left | 3 | 6 | 55,278 | 35,686 | 65% | 2,983 | 1,359 | 23.7 | $0.00381 | yes |
| 15 | `d2b95ac1b2` | Practice Planner | quickstep, rumba, salsa; 35 min/day; follower | 6-session plan, 41 days left | 3 | 5 | 55,073 | 53,729 | 98% | 3,201 | 1,887 | 29.8 | $0.00227 | no |

Tool calls count `check_routine`, `suggest_bridges`, `figure_details`, `progress_report` and `list_team_drills`; the structured-answer call (`final_result`) is not counted. All 15 runs finished first time: no output-validator retries, no errors.

## 2. Cost per run, per agent (averages of the fresh runs)

| Agent | Runs | Model calls | Tool calls | Input tokens | Cached input (share) | Output tokens | of which reasoning | Seconds | **Cost per run** | Median (range) | Cost if no prompt cache |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Coach Marisol | 10 | 2.9 | 2.1 | 17,362 | 13,850 (80%) | 523 | 300 | 7.2 | **$0.00075** | $0.00065 ($0.00023–$0.00166) | $0.00200 |
| Drill Builder | 3 | 3.3 | 2.3 | 61,350 | 54,332 (89%) | 773 | 473 | 9.8 | **$0.00163** | $0.00141 ($0.00062–$0.00286) | $0.00652 |
| Practice Planner | 2 | 3.0 | 5.5 | 55,176 | 44,708 (81%) | 3,092 | 1,623 | 26.7 | **$0.00304** | $0.00304 ($0.00227–$0.00381) | $0.00706 |
| All 15 runs | 15 | 3.0 | 2.6 | 31,202 | 26,061 (84%) | 916 | 511 | 10.3 | **$0.00123** | $0.00100 ($0.00023–$0.00381) | $0.00358 |

**Where the money goes (share of average cost per run):**

| Agent | Fresh input | Cached input | Output (incl. reasoning) | Input tokens per model call |
|---|---|---|---|---|
| Coach Marisol | 47% | 18% | 35% | 5,987 |
| Drill Builder | 43% | 33% | 24% | 18,405 |
| Practice Planner | 34% | 15% | 51% | 18,392 |

- The Coach reads ~5,987 tokens per model call (one style's syllabus); the Drill Builder and Planner read ~18,405 (the full syllabus). The Planner is the most expensive helper because it writes the most: 3,092 output tokens per plan, about half of them reasoning, are 51% of its cost.
- **Coach, broken vs legal routine.** Broken routines took more steps (3.4 vs 2.4 model calls, 2.8 vs 1.4 tool calls, 9.4 s vs 5.0 s) and cost $0.00117 vs $0.00033. Part of that gap is the cold cache (all five broken runs ran first in their style). Re-priced as if warm, a broken-routine review costs $0.00067 and a legal one $0.00033.
- **Cold-start premium** (a run whose first call misses the cache): about $0.00050 for the Coach and $0.00161 for the Drill Builder and Planner. With every run warm, the averages would be $0.00050 (Coach), $0.00110 (Drill Builder) and $0.00224 (Planner). Method: the cold first call is re-priced with all but the median uncached tail of warm first calls (190 tokens) at the cached rate.
- Speed: the free rule check (`POST /api/check`, no AI) answered in a median 0.7 ms on the local server (20 calls, max 7.3 ms) and costs $0; a coach review takes 7.2 s on average.

## 3. Usage model → cost per active player per month

The trial has not run yet, so real usage is unknown. This is a stated assumption for one *active* novice in the run-up to the December competition; the trial form asks testers how many minutes a week they would use the app, and those answers should replace these numbers.

| Activity | Assumption | Why | Runs per month | Cost per run | Cost per month |
|---|---|---|---|---|---|
| Practice sessions | 3 a week (13 a month) | around the team's lessons plus one weekend session | – | – | – |
| Coach reviews | 2 per session | a 20-minute session (the planner's default day) builds and checks about two routines; the 10-minute trial script uses one | 26 | $0.00075 | $0.0195 |
| Drills from lesson notes | 1 a week | one set of notes after a lesson (trial task 3) | 4.33 | $0.00163 | $0.0071 |
| Practice plans | 2 a month | one plan at the start of the run-up, one re-plan as December nears | 2 | $0.00304 | $0.0061 |
| **Total per active player** | | | 32.3 runs | | **$0.0327** |

Per-run costs are the fresh averages above (a mix of 6 cold and 9 warm runs).

| Players | Per month | Per day | Per year | Fits the $3/day app cap? |
|---|---|---|---|---|
| 1 | $0.03 | $0.00 | $0.39 | yes |
| 100 | $3.27 | $0.11 | $39.22 | yes |
| 10,000 | $326.81 | $10.74 | $3,921.71 | **no** |

Two other cases:

- **Warm cache (likely at 10,000 players).** With thousands of players every prompt stays in the cache, so the cold-start premium mostly disappears: $0.0222 per player per month, $2.22 for 100 and $222.36 for 10,000 ($7.31/day).
- **Heavy user** (competition week: 5 sessions a week, 4 reviews per session, 2 drills a week, 4 plans a month): $0.0914 per player per month; $9.14 for 100 and $914.02 for 10,000 ($30.05/day).

**What the caps mean here:**

- **$0.25 per browser session:** a typical session spends about $0.0025 (1% of the cap); the cap would allow about 332 coach reviews. It only stops abuse or a runaway loop, never normal practice.
- **$3 per day for the whole app:** enough for about **2,792 typical players** (4,103 with a warm cache, 998 heavy users). At 100 players it is never reached; at 10,000 players demand is $10.74/day, so AI help would pause for everyone part-way through each day. At $3 a day the app spends about $91.25 a month while the server stays up; a restart resets the daily count, and runs already in flight when the cap is hit still finish and are charged.
- **20 runs per 10 minutes per session; 8 model calls and 150,000 tokens per run.** The fresh runs used at most 5 model calls and 73,969 input tokens (74,775 in total), so the per-run caps never bind in normal use. A runaway run typically costs about $0.0162 (8 uncached full-syllabus calls ≈ 150k tokens); the hard ceiling is $0.075 (150k tokens all priced as output).

## 4. Cost-cutting steps: measured effect and trade-offs

| Step | Measured effect | Trade-off | Label |
|---|---|---|---|
| **Static, cache-friendly prompt** (rules + syllabus first and byte-identical; player data last, inside `<player_data>` / `<teammate_notes>`) | 84% of all input tokens were served from the cache; cost per run $0.00123 vs $0.00358 without the cache (−66%). Coach −62%, Drill Builder −75%, Planner −57%. | No personal data can go in the system prompt. The first run after a quiet spell pays full price (+$0.00050 coach, +$0.00161 drill/plan), so a small team gets less of the saving than a big one. | shown |
| **Per-style coach prompt** (only the dance's style syllabus) | 2026-10-23, same agent: 12,884 → 5,147 input tokens per model call (−60%), cost per model call $0.00059 → $0.00022 (−62%). Today, with 151 figures: about 18,189 → 5,987 tokens per call (−67%, estimate) and $0.00166 → $0.00075 per review (−55%, estimate). | The Coach cannot see other styles' figures (fine: its validator already allows only the routine's own dance). Five prompts to keep in sync, and five caches to warm instead of one. | shown (2026-10-23); estimate (today) |
| **Free deterministic rule check** (`/api/check`, and `check_routine` / `suggest_bridges` as agent tools) | $0 and a median 0.7 ms per check vs $0.00075 and 7.2 s for a coach review. The game re-checks the routine on every edit for free; the AI is called only when the player asks the coach. The model never has to work out foot and hold rules itself, and the output validator rejects a verdict that disagrees with the checker. | The rules had to be hand-coded and tested (syllabus validator, 33,545 engine checks). They cover free foot and hold only, not style or technique quality. | shown |
| **Per-run caps** (8 model calls, 150,000 tokens) | Never reached in normal use (max 5 calls; 73,969 input / 74,775 total tokens); a runaway run typically costs ≈$0.016, hard ceiling ≈$0.075 (all 150k tokens billed as output). | A genuinely long request can be stopped part-way; the player sees "hit its step limit" and the failed run is still charged. | shown (limits); estimate (bound) |
| **Budgets** ($0.25 per session, $3 per day, 20 runs per 10 minutes) | Typical session uses 1% of its budget; the $3/day cap allows about $91.25/month while the server stays up (a restart resets the count; runs in flight can overshoot). | The $3/day cap would pause AI for everyone above ~2,792 active players. The session id comes from the browser, so the per-session cap is soft (the daily cap is the hard stop). Budgets live in server memory and reset on restart. The guard checks before a run and charges after, so a session can overshoot by the runs it has in flight (one if sequential, up to 20 under the rate limit), each usually ≈$0.016 and at most ≈$0.075. | shown (caps in code); estimate (players supported) |

A cut that did **not** happen: the Drill Builder and Planner were meant to share one cached prefix across agents (comment in `agents.py`). They do not: the Planner's first call got 0 cached tokens right after Drill Builder runs, both on 2026-10-25 (`e393d3878e`) and on 2026-10-20 (`764992a779`). Likely reason: the two agents send different tool and answer schemas ahead of the shared syllabus text, so the prefixes differ from the start (likely, not tested).

## 5. Per-style coach prompt: before vs after (same agent)

| Run | When | Prompt | Dance, figures | Model calls | Input tokens | First call input | Input per call | Cost | Cost per call |
|---|---|---|---|---|---|---|---|---|---|
| `df3ac3c182` | 2026-10-23 09:50:03 | full syllabus (before) | Standard Waltz, 3 | 3 | 38,653 | 12,787 | 12,884 | $0.00178 | $0.00059 |
| `bec82df3f4` | 2026-10-23 11:08:58 | Standard only (after) | Quickstep, 3 | 5 | 25,734 | 4,853 | 5,147 | $0.00111 | $0.00022 |
| `5d1eb2b687` | 2026-10-23 15:06:30 | Smooth only (after) | Smooth Waltz, 1 | 4 | 18,163 | 4,365 | 4,541 | $0.00084 | $0.00021 |

- **Shown (2026-10-23):** 12,884 → 5,147 input tokens per model call (−60%). The before and after routines differ (Waltz vs Quickstep, both 3 Standard figures), so this is a fair but not identical comparison.
- **Today (estimate):** the syllabus has grown to 151 figures. Measured first-call input per style: Standard 6,186, Smooth 5,122, Latin 6,121, Rhythm 5,240, Social 6,150 tokens. A full-syllabus coach prompt would be about 18,010 tokens (fit of 0.2579 tokens per prompt character across the 5 coach prompts and the Drill Builder, whose full-syllabus prompt is the same size). Applied to the 10 fresh coach runs: $0.00166 per review with the full syllabus vs $0.00075 measured (−55%).
- `939be0f373` (2026-10-23 11:09, 0.81 s, identical tokens to `bec82df3f4`) is a Portkey cached repeat and is excluded.
- The 2026-10-20 runs (32-figure syllabus, ~3.8k-token prompts) are listed in `tokenomics.json` for history only; they are not comparable with today's syllabus.

## 6. What we would do at 10,000 players

1. **Raise the daily cap and make budgets per player.** Base demand is $10.74/day ($7.31 warm, $30.05 in a heavy week) against a $3 cap. Set the app cap near 2× expected base demand (about $21.48/day) with an alert at 80%, and replace the browser-session cap with a per-signed-in-player monthly cap (for example $0.25, about 7× typical use) so a new session id cannot reset it. Keep the budget in a shared store (a database) so several server processes share one count.
2. **Give the Drill Builder the per-style trick.** It still reads the full syllabus (~18,405 tokens per call). A free keyword match on the notes ("waltz", "cha cha"…) can pick the style first, as the coach already does; the coach result suggests about two-thirds fewer input tokens per call (estimate).
3. **Trim the Planner's output.** At $0.00304 it is the priciest run, and output (about half of it reasoning) is 51% of its cost: lower the reasoning effort, shorten the plan schema, and reuse a plan for players with the same dances, minutes and weeks left. A cheaper model for the Planner is worth a test only if plan quality holds (uncertain, not measured).
4. **Batch what can wait.** Weekly re-plans could run overnight through a batch endpoint if the provider discounts batch work for this model (uncertain).
5. **Keep the cache warm and shared.** At scale the five coach prompts stay warm on their own (the warm-cache case above). Sending the Drill Builder and Planner identical tool lists would let them share one cached prefix (likely, not tested).
6. **Watch it.** `/api/usage` already reports average tokens and cost per agent from the log; add a daily per-agent cost report.

## 7. Caveats

- Small sample: 10 coach, 3 drill and 2 plan runs on one morning; the Planner and Drill Builder averages rest on 2–3 runs each. Costs vary 7× across coach runs, so the averages are a guide, not a guarantee.
- The usage model is an assumption until the teammate trial reports real use (minutes per week).
- Prices come from the course price sheet in `config.py` (checked 2026-10-06); Portkey's own fees, if any, are not included.
- Cold vs warm depends on how long the provider keeps a prefix cached (typically minutes; not measured here).
- One quality slip seen in the traced coach run (`79ba0bfb74`): the issue text names the "LF Closed Change" while the fix id is `sw_rf_change` (the RF Closed Change, which is the correct bridge). The validator checks ids and the verdict, not the wording.

## So what for us?

Cost is not the obstacle. Under the usage model AI help costs about $0.03 per active player a month, so even 100 active players would cost about $3.27 a month. The game itself (watching, playing, the free rule check) costs nothing per use. What has to change before scale is the guard rails, not the model bill: the $3/day cap would start pausing AI help above ~2,792 active players, and budgets need to follow signed-in players, not browser sessions. The next saving is the Drill Builder's prompt; the next risk to watch is the Planner's output length.

## Files

- `tokenomics.json`: every row used (15 fresh, 8 historical with their role), per-agent averages, warm re-pricing, the usage model, caps and the per-style prompt comparison.
- `coach_trace.json`: the full trace of run `79ba0bfb74` (broken Standard Waltz, Natural Turn → Reverse Turn), call by call.
- Source log: `ballroom-quest/output/agent_runs.jsonl` (local only). Prices: `ballroom-quest/backend/config.py`.
