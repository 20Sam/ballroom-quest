# Ballroom Quest

A 3D practice game for novice ballroom dancers. Walk around **Evans Hall Ballroom**, a Yale SOM–inspired
building: a glass courtyard ringed by four oval classroom "drums", one studio per style (**International
Standard**, **American Smooth**, **International Latin**, **American Rhythm**). Step into a studio, combine figures with a few keystrokes, watch the footwork from your
own point of view (leader or follower), and play it to the beat. Three AI agents on `gpt-6-luna`
help between songs:

| Agent | What it does | Tools |
|---|---|---|
| **Coach Marisol** | Reviews the routine you chained, explains any link that doesn't flow (wrong free foot, wrong position), and inserts the fix | `check_routine`, `suggest_bridges`, `figure_details` |
| **Drill Builder** | Turns a teammate's lesson notes into a playable drill for the whole team | same + output validation against the syllabus |
| **Practice Planner** | Builds a weekly plan for your competition from your practice history and the team's drills | same + `progress_report`, `list_team_drills` |

The dance rules live in `data/figures.json` and `backend/catalog.py`, so they stay the same on
every run. The agents explain and plan, but the code decides whether a routine is danceable.

## Run it (about 3 minutes)

You need Python 3.11+ and an internet connection (three.js loads from a CDN). No Node.js needed.

1. Clone and enter the repo:
   ```bash
   git clone https://github.com/20Sam/ballroom-quest.git
   cd ballroom-quest
   ```
2. Add the key. Copy `.env.example` to `.env` **in this folder or in the folder one level above**,
   and paste the course `PORTKEY_API_KEY`. The app checks this folder first, then the one above.
3. Create the environment and install:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate          # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. Start the server (it serves both the game and the API):
   ```bash
   uvicorn main:app --app-dir backend --port 8040
   ```
5. Open **http://127.0.0.1:8040** and click **Enter the studio**.

The top-left card shows **"AI helpers online · gpt-6-luna"** when the key was found. Without a key the
game, the footwork and the free rule checks still work; only the three agents are paused.

## Try this (2-minute tour)

1. Walk (WASD) into the **Smooth** drum (top right on the minimap) and press **E**.
2. Press **2**, **4**, **5** (LF Closed Change → Natural Turn → Reverse Turn). The chain turns red: after
   a Natural Turn the right foot is free, but a Reverse Turn starts on the left.
3. Press **C**: Coach Marisol explains it and offers to insert a Right Foot Closed Change.
4. Press **W** to watch from behind your dancer (press **V** for the top-down footwork view), then **Enter**
   to play. Use ↑ ↓ ← → Space on the beat.
5. Press **B** for the Drill Board and try the **"Notes with a prompt injection"** example. The safety
   screen removes the attack line before the AI sees it, and the drill is still built.
6. Press **P** for the Planner.

## Safety and cost controls

- **Prompt injection:** a screen in code (`backend/safety.py`) removes lines that look like
  instructions before the notes reach the model. The rest is wrapped in `<teammate_notes>` tags, and
  the prompt marks it as data.
- **Output validation:** every agent's output is checked in code. Unknown figure ids, routines that
  aren't danceable, wrong verdicts, links or key-like text, and plans over the time budget are all
  sent back to the agent to fix (`ModelRetry`).
- **Spend caps:** $0.25 per browser session, $3 per day for the whole app, 20 AI requests per
  10 minutes per session, 8 model calls and 150k tokens per agent run. Failed runs are logged and charged too.
- **Escaping:** the browser escapes all AI text before showing it.
- **Logging:** every run is logged with its tokens, cost and step-by-step trace in
  `output/agent_runs.jsonl`. `GET /api/usage` returns the averages per agent.

## Project layout

```
backend/
  main.py          FastAPI: game files + /api routes
  agents.py        the three PydanticAI agents, tools, validators, token logging
  catalog.py       syllabus loader + routine checker + bridge finder (no AI)
  safety.py        injection screen, budgets, rate limits
  config.py        model, prices, limits, .env lookup
  prompts/         technique.md (holds, posture, hip action, rise & fall: shared by all agents), shared_rules.md (+ syllabus, cached prefix), coach.md, drill_builder.md, planner.md
frontend/
  index.html, style.css
  js/world.js      Evans Hall Ballroom: courtyard, 4 style drums, library, terrace, minimap, collisions
  js/mocap.js      replays instructor motion captured from lesson videos (skeletons only)
  js/body.js       proportioned man and lady (IK legs and arms, holds, Latin hip action, Standard posture)
  js/dancer.js     characters + footwork engine (leader steps -> mirrored follower)
  js/main.js       game loop, rhythm game, panels
  js/api.js        API client + local progress
data/
  figures.json     131 figures, 19 dances, 4 styles (Standard figures checked against Alex Moore's
                   technique book; figures marked "general" still need a coach check)
  drills.json      team drills saved by the Drill Builder
output/
  agent_runs.jsonl measured tokens, cost and trace per agent run
```

## Changing the data

- To add a figure, add it to `data/figures.json`. Steps are written for the leader as
  `[foot, direction, beats, turn°, count]`. The follower's part, the animation, the keys and the rules
  come from that line. Where her part is not the plain mirror, add `"follow_steps": {"<leader step index>":
  [foot, dir, weight?]}`. Quickstep figures need `"end_travel": "fwd" | "back"`; `"only_after"` /
  `"only_before"` restrict neighbours; every dance has a `"rise"` (`waltz`, `swing` or `none`).
- To reset the team board, replace `data/drills.json` with `[]`.
