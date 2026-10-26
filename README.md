# Ballroom Quest

A 3D practice game for novice ballroom dancers. Walk around **Evans Hall**, a Yale SOM–inspired
building with five rectangular ballrooms. The **Standard Ballroom** is a grand competition hall: deep blue
walls with gilt mouldings, a polished black marble floor, a mezzanine with balustrades on gilt columns along
both long walls, a great crystal chandelier, and a bright arched doorway between two scoreboards. The
**Smooth**, **Latin** and **Rhythm** rooms follow a classic ballroom painting (ivory panelled walls, blue-gray
drapes, crystal chandeliers, a herringbone floor and spectators along the walls), and **Social & Nightclub**
is a nightclub (bar, DJ booth, lighting rig and mirror ball):

| Room | Dances |
|---|---|
| **Standard Ballroom** (International Standard) | Slow Waltz, Slow Foxtrot, Tango, Quickstep, Viennese Waltz |
| **Smooth Ballroom** (American Smooth) | Waltz, Tango, Foxtrot, Viennese Waltz |
| **Latin Ballroom** (International Latin) | Cha Cha, Rumba, Jive, Samba, Paso Doble |
| **Rhythm Ballroom** (American Rhythm) | Cha Cha, Rumba, East Coast Swing, Bolero, Mambo |
| **Social & Nightclub** | East Coast Swing, West Coast Swing, Lindy Hop, Salsa |

Walk onto a room's floor, combine figures with a few keystrokes, watch the footwork from your own point of
view (leader or follower), and play it to the beat. Two other couples share the floor, as in a real
ballroom. In the grand hall your own couple is the hero couple of the reference picture (a champagne gown
with a feather hem, and white tie); in the other rooms it wears the default costumes. Walls between you and
the camera sink out of the way (a Sims-style cutaway). As at a competition, two scoreboards on the Standard
ballroom's north wall show **tonight's heats** (the room's dances and their tempos) until you score, then
**your best figures** (with your best timing, topped up with the current dance's figures still to score), and
the **team board** (your role, level and XP, and the team's latest drills); they update after every play,
when you switch role or dance, and when a teammate's drill is saved. Four AI agents on `gpt-6-luna` help
between songs:

| Agent | What it does | Tools |
|---|---|---|
| **Coach Marisol** | Reviews the routine you chained, explains any link that doesn't flow (wrong free foot, wrong position), and inserts the fix | `check_routine`, `suggest_bridges`, `figure_details` |
| **Drill Builder** | Turns a teammate's lesson notes into a playable drill for the whole team | same + output validation against the syllabus |
| **Practice Planner** | Builds a weekly plan for your competition from your practice history and the team's drills | same + `progress_report`, `list_team_drills` |
| **Choreographer** | Plans which figures to dance in each part of your song (calm figures where the music is quiet, the showy ones where it peaks), from numbers only: tempo, length, bars and the energy of each section | same + `dance_figures` (bar lengths), `measure_plan` (fit + legality) |

The dance rules live in `data/figures.json` and `backend/catalog.py`, so they stay the same on
every run. The agents explain and plan, but the code decides whether a routine is danceable.

### How the couples use the floor

Each dance has a `"floor"` field in the syllabus, and the footwork engine (`frontend/js/dancer.js`) steers
every routine to stay on the room's rectangular floor:

- **Line of dance** (`lod`: all Standard and Smooth dances, Samba, Paso Doble): the couple starts on the long
  side nearest the camera, near the left corner, and travels counter-clockwise round the room with the wall
  on the leader's right. Standard, Smooth and Paso Doble start facing diagonal to wall (so the Paso's
  chassés to his left travel along the line of dance). When a figure would run off the floor, the next figure
  curves a quarter turn to the left at the corner.
- **Slot** (`slot`: West Coast Swing): the follower travels up and down a narrow lane along the floor's long
  side.
- **Spot** (`spot`: the other Latin, Rhythm and Social dances): the couple stays near one place.

The two background couples dance endless legal routines of the room's current dance by the same rules. They
are spaced round the line of dance (facing the way the engine starts the dance there), or on their own spots
and slots, wait at the end of a step instead of running into your couple, and step aside if they get stuck.
Every chain starts in a hold its first figure accepts. They only exist while you are in (or at the door of)
their room.

Your own couple stands ready exactly as the routine's first frame: the same place and hold, and each
dancer's weight already on the standing foot (the leader's free foot is the first step's foot), so nothing
shifts when the count-in starts. Changing the routine's first figure re-places the couple. While dancing,
the follower answers the lead a fraction of a beat later (her body and weight change trail his), but her
feet, the hold and her distance from him are always those of the same instant as his.

### Cameras (press V on a floor)

- **Behind**: over your own dancer's shoulder, the view for learning the steps. Your own body turns half
  see-through and your shoes light up (left blue, right gold, like the prints). As the leader the camera sits
  higher over your left shoulder and you also see through her skirt and legs to your feet.
- **Footwork**: straight down on the feet. In the nightclub it sits just below the lighting rig, so the
  mirror ball and truss never cover the feet.
- **Side**: side-on to the couple from the side that faces the middle of the room: across the line of dance
  for travelling dances (rounded at the corners), across the slot for West Coast Swing, and across the
  partners for spot dances. It always stays inside the room, never among the spectators, the club's bar and
  lounge, or behind a wall, and it swings gently round the couple instead of jumping. A background couple
  that walks into the shot turns see-through.
- **Hall**: the couple against the room. In the grand hall the camera stands low on the couple's south side
  with a wide lens and tilts up, so the doorway, the scoreboards, the north balcony and the great chandelier
  rise behind the dancers (it turns east or west when the couple dances close to the south wall). In the
  other rooms it is a wide view from the far corner of the floor. It stays inside the room like the side
  view.

### Outfits and footprints (press O)

- **Outfits**: the 👗 Outfit button or **O** opens the wardrobe. Pick an outfit and colour for the leader and
  the follower; it shows at once, only on your couple, and is saved on this device. "Room default" puts him in
  practice wear (white tie in the grand hall) and her in a short dress (the gown in the grand hall, which turns
  into a short dress while you Watch or Play). Tip: the short dress shows both partners' steps.
- **Footprints**: during Watch and Play your next three steps show as shoe-sole prints: blue for the left
  foot, gold for the right, numbered 1-3. The pad that lands first is solid and marked H (heel) or T (toe);
  the other pad is pale with a dashed outline. A curved arrow shows a swivel or turn. A key chip at the
  bottom explains the colours.

### Tempo and music (press U on a floor)

- **Recommended tempo.** Under the tempo slider: the dance's competition tempo (beats and bars per minute, with
  the WDSF / NDCA range, e.g. Cha Cha 120 bpm = 30 bars/min, 120–128), the presets **Learn 70%**, **Practise
  85%**, **Competition 100%**, and **★ For you** (by your level and your timing in that dance). Latin, Rhythm
  and social dances never start below 80%. Each dance remembers the tempo you chose.
- **What plays.** The Music panel (**U**) picks the metronome, a built-in **backing** for the dance (WebAudio,
  with the dance's own step rhythm accented: Cha Cha 2, 3, 4-and-1, Rumba 2, 3, 4, Samba 1-a-2, waltzes in 3), or
  **your own song** (choose an audio file). Watch and Play then start on beat 1 of the music and take their beat
  from the audio clock, so they never drift. A song at another tempo than your routine is time-stretched with
  its pitch kept; **Dance at the song's tempo** sets the routine to it.
- **Your song stays on your computer.** It is decoded and analysed in the browser (`frontend/js/tempo.js`:
  onset envelope, autocorrelation comb, half/double time resolved by the dance's tempo range, beat 1, bars,
  8-bar sections by energy) and never uploaded or saved. **Listen** plays it with clicks on the beats it found;
  shift beat 1 or tap along (**T**) if they are off. The panel says whether it fits, e.g. *"Your song: 124 bpm
  — fits Cha Cha (competition 120–128)"* or *"too fast for Waltz"*, and which other dances it suits.
- **Choreograph to this song.** The Choreographer receives only numbers (the panel shows exactly what is
  sent) and returns figures for each music section (the first 64 bars, about a competition heat). Its output
  validator checks every figure, every link across the whole routine, and that each section's figures fill
  its bars within one bar without drifting off the phrases. **Load routine** puts the plan on the floor;
  **▶ Practise** starts one section from its own bar of the song.

### Grade my video (press G on a floor)

Film yourself dancing your routine (phone propped up, whole body in view, front or side, music or metronome
out loud, 60 s at most), then **🎬 Grade my video** in the floor panel. The game's own server
(`backend/grade.py`, `POST /api/grade`) decodes the clip at about 15 frames a second, finds your ankles, heels
and toes with MediaPipe's pose model (`models/`), detects each foot landing and each weight change in place,
lines them up with the routine's step times at your tempo (and with the music's beat when it can hear one),
and grades **timing** (steps within ±0.12 s and ±0.25 s), **step count**, **left/right foot**, **per-figure
timing** and **rhythm consistency**. The results show a timeline of the routine's steps against yours, tips,
and a confidence badge (how much better than random stepping the match is). **Ask Coach Marisol** then reviews
the routine with those per-figure scores (numbers only). The video stays on the machine running the server, is
deleted as soon as it is graded (also on errors) and is never logged; no AI model sees it. This needs the
optional extras (step 3b below); without them the button explains how to turn it on and the rest of the game is
unchanged. `docs/evidence/grade_tests.py` checks it (synthetic dancers, the 501/413/422/429 paths, temp-file
deletion).

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
   3b. Optional, for **Grade my video** only (MediaPipe, PyAV, NumPy; about 360 MB installed):
   `pip install -r requirements-video.txt`. The pose model already ships in `models/`.
4. Start the server (it serves both the game and the API):
   ```bash
   uvicorn main:app --app-dir backend --port 8040
   ```
5. Open **http://127.0.0.1:8040** and click **Enter the studio**.

The top-left card shows **"AI helpers online · gpt-6-luna"** when the key was found. Without a key the
game, the footwork, the music and the free rule checks still work; only the AI agents are paused.

## Try this (2-minute tour)

1. From the courtyard, walk (WASD) north across the hall and through the door of the **Smooth Ballroom**
   (top middle on the minimap). Walk onto the floor and press **E**.
2. Press **2**, **4**, **5** (LF Closed Change → Natural Turn → Reverse Turn). The chain turns red: after
   a Natural Turn the right foot is free, but a Reverse Turn starts on the left.
3. Press **C**: Coach Marisol explains it and offers to insert a Right Foot Closed Change.
4. Press **W** to watch from behind your dancer (press **V** for the top-down footwork view, the side
   view or the hall view), then **Enter** to play. Use ↑ ↓ ← → Space on the beat. Your couple travels counter-clockwise
   along the line of dance while the other couples keep their distance.
5. Press **Esc** twice to leave the floor, then visit the **Social & Nightclub** room (bottom right on the
   minimap) and press **Tab** on its floor to switch between East Coast Swing, West Coast Swing (a slot
   dance), Lindy Hop and Salsa.
6. Press **B** for the Drill Board and try the **"Notes with a prompt injection"** example. The safety
   screen removes the attack line before the AI sees it, and the drill is still built.
7. Press **P** for the Planner.

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
  agents.py        the Coach, Drill Builder and Planner agents, tools, validators, token logging
  choreo.py        the Choreographer agent: numbers-only request, bar lengths, measure_plan, validator
  grade.py         Grade my video: pose tracking, step detection, music beat, alignment, grades (no AI; optional extras)
  catalog.py       syllabus loader + routine checker + bridge finder (no AI)
  safety.py        injection screen, budgets, rate limits
  config.py        model, prices, limits, .env lookup
  prompts/         technique.md (holds, posture, hip action, rise & fall: shared by all agents), shared_rules.md (+ syllabus, cached prefix), coach.md, drill_builder.md, planner.md, choreographer.md
frontend/
  index.html, style.css
  js/world.js      Evans Hall: five rectangular ballrooms (a grand competition hall, three classic rooms
                   and a nightclub), the hall with Coach Marisol,
                   Ross Library, Beinecke Terrace, the courtyard; floors, wall cutaway, minimap, collisions
  js/mocap.js      replays instructor motion captured from lesson videos (skeletons only)
  js/body.js       rigged, costumed man and lady (IK legs and arms, holds, Latin hip action, Standard
                   posture, skirt and tails motion) + alternate costume palettes for other couples
  js/dancer.js     footwork engine: leader steps -> follower, smooth body path, floor steering
                   (line of dance, slot, spot)
  js/main.js       game loop, rhythm game, background couples, cameras, scoreboards, panels
  js/footprints.js shoe-sole ghost prints (heel / toe pad, swivel arrow, step numbers; pooled meshes,
                   cached textures) and the footprint key chip
  js/wardrobe.js   outfit picker (O), saved outfits, dresses the player's couple only
  js/syllabus.js   syllabus level chips and figure cards (from the separate syllabus job)
  js/tempo.js      tempo rules + presets, in-browser beat / bar / section analysis, backing patterns (no DOM)
  js/music.js      tempo presets, Music panel, backings and songs on the audio clock, Choreographer UI
                   (styles in music.css)
  js/api.js        API client + local progress
  js/grade.js      Grade my video: upload form, progress, results modal with timeline (injects its own CSS)
models/            MediaPipe pose model (Apache-2.0, see models/README.md) used only by grade.py
data/
  figures.json     151 figures, 22 dances, 5 styles (Standard figures checked against Alex Moore's
                   technique book; figures marked "general" still need a coach check). East Coast
                   Swing is listed by both Rhythm and Social and shares one set of figures.
  drills.json      team drills saved by the Drill Builder
output/
  agent_runs.jsonl measured tokens, cost and trace per agent run
```

## Changing the data

- To add a figure, add it to `data/figures.json`. Steps are written for the leader as
  `[foot, direction, beats, turn°, count]`. The follower's part, the animation, the keys and the rules
  come from that line. Where her part is not the plain mirror, add `"follow_steps": {"<leader step index>":
  [foot, dir, weight?]}`. Quickstep figures need `"end_travel": "fwd" | "back"`; `"only_after"` /
  `"only_before"` restrict neighbours; every dance has a `"rise"` (`waltz`, `swing` or `none`) and a
  `"floor"` (`lod`, `slot` or `spot`).
- To reset the team board, replace `data/drills.json` with `[]`.
