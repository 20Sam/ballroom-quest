"""Choreographer agent (gpt-6-luna): which figures to dance in each part of the player's song.

The browser analyses the song itself (frontend/js/tempo.js) and sends only numbers: tempo, length, bars, and the
music sections as bar ranges with an energy level. The audio never leaves the player's computer and nothing the
player typed reaches the model, so there is nothing to inject. The agent maps sections to figures; its output
validator checks that every figure exists in this dance, that the whole routine is legal (catalog.check_routine
over every figure, across section boundaries too), and that each section's figures fill its bars within one bar
with the running total staying within one bar of the music, so the routine never drifts off the phrases.

Like the Coach it gets the per-style system prompt (shared rules + that style's syllabus + technique), so its
prefix is byte-identical to the Coach's for the same style and the provider's prompt cache serves both. Runs go
through agents.run_agent, so they are charged to the budget guard and logged to output/agent_runs.jsonl.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_ai import Agent, ModelRetry, RunContext

import catalog
from agents import AGENTS, SHARED_TOOLS, STYLES, DanceKey, Deps, Role, _instructions, _known, style_of
from safety import leaks

MAX_BARS = 64          # bars planned per song (about a competition heat)
MAX_FIGURES = 48       # figures in one plan (the routine the game loads)
BAR_TOLERANCE = 1.0    # a section's figures may be this many bars short or long
Level = Literal["Newcomer", "Bronze", "Silver", "Gold"]


def beats_per_bar(dance: str) -> int:
    """Beats in one bar of the dance's music, in the syllabus's beat unit (the same rule as musicBpb in
    frontend/js/tempo.js): 3 in 3/4, 4 in 4/4, 2 in 2/4 (Samba, Paso Doble), except Tango, whose syllabus counts
    quicks (a slow = 2 beats), so a 2/4 Tango bar has 4."""
    d = catalog.dances()[dance]
    if d["time"] == "3/4":
        return 3
    if d["time"] == "2/4":
        return 4 if "tango" in dance else 2
    return 4


def figure_bars(fig: dict, dance: str) -> float:
    return fig["beats"] / beats_per_bar(dance)


# ---------- request (numbers only) ----------
class MusicSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_bar: int = Field(ge=1, le=MAX_BARS)
    end_bar: int = Field(ge=1, le=MAX_BARS)
    energy: float = Field(ge=0, le=1)


class ChoreoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # numbers only: a song title or any other text is refused, not dropped
    session_id: str = Field(min_length=6, max_length=64)
    dance: DanceKey
    role: Role = "leader"
    bpm: float = Field(ge=30, le=320, description="the song's tempo in the dance's beats per minute")
    duration_s: float = Field(gt=0, le=1800)
    bars: int = Field(ge=2, le=2000, description="bars in the whole song")
    sections: list[MusicSection] = Field(min_length=1, max_length=12)
    level: Level | None = None

    @model_validator(mode="after")
    def _sections_fit_the_song(self) -> "ChoreoIn":
        expect = 1
        for s in self.sections:
            if s.start_bar != expect:
                raise ValueError("sections must start at bar 1 and follow each other without gaps or overlaps")
            if s.end_bar - s.start_bar + 1 < 2:
                raise ValueError("each section needs at least 2 bars")
            expect = s.end_bar + 1
        if expect - 1 > self.bars:
            raise ValueError("the sections run past the song's last bar")
        # the numbers must describe one song: its bars fit in its length at its tempo
        song_bars = self.duration_s * self.bpm / 60 / beats_per_bar(self.dance)
        if self.bars > song_bars + 2:
            raise ValueError("more bars than the song has at this tempo")
        return self


# ---------- output ----------
class PlanSection(BaseModel):
    start_bar: int
    end_bar: int
    label: str = Field(max_length=40)
    figure_ids: list[str] = Field(min_length=1, max_length=24)
    why: str = Field(max_length=300)


class ChoreoPlan(BaseModel):
    title: str = Field(max_length=80)
    sections: list[PlanSection] = Field(min_length=1, max_length=12)
    total_bars: float = Field(description="the total length of all the figures, in bars")
    notes: str = Field(max_length=500)


@dataclass
class ChoreoDeps(Deps):
    music: dict = field(default_factory=dict)  # {"bpm", "bars", "sections": [{start_bar, end_bar, energy}], "level"}


# ---------- measuring a draft (the tool and the validator use the same code) ----------
def measure(dance: str, music_sections: list[dict], figure_lists: list[list[str]]) -> dict:
    """Fit of a draft: per music section, the bars it must fill, the bars its figures take and the running drift,
    plus check_routine over the whole routine (issues tagged with the section they fall in)."""
    figs, bpb = catalog.figures(), beats_per_bar(dance)
    rows, problems, total, where = [], [], 0.0, []
    if len(figure_lists) != len(music_sections):
        problems.append(f"Give one figure list per music section: {len(music_sections)} lists, not {len(figure_lists)}.")
    for i, (sec, ids) in enumerate(zip(music_sections, figure_lists), 1):
        want = sec["end_bar"] - sec["start_bar"] + 1
        unknown = [x for x in ids if x not in figs]
        other = [x for x in ids if x in figs and figs[x]["dance"] != dance]
        bars = sum(figs[x]["beats"] for x in ids if x in figs) / bpb
        total += bars
        drift = total - (sec["end_bar"] - music_sections[0]["start_bar"] + 1)
        fits = abs(bars - want) <= BAR_TOLERANCE + 1e-9 and abs(drift) <= BAR_TOLERANCE + 1e-9
        rows.append({"section": i, "bars": f"{sec['start_bar']}-{sec['end_bar']}", "must_fill": want,
                     "figures_take": round(bars, 2), "off_by": round(bars - want, 2), "drift_at_end": round(drift, 2),
                     "ok": fits and not unknown and not other})
        if unknown:
            problems.append(f"Section {i}: unknown figure ids {unknown}.")
        if other:
            problems.append(f"Section {i}: {other} are not {dance} figures.")
        if not ids:
            problems.append(f"Section {i} has no figures.")
        where += [i] * len(ids)
    all_ids = [x for ids in figure_lists for x in ids]
    if len(all_ids) > MAX_FIGURES:
        problems.append(f"{len(all_ids)} figures is too many for the game; use at most {MAX_FIGURES} (longer figures).")
    check = catalog.check_routine(dance, all_ids) if all_ids else {"ok": False, "issues": []}
    issues = []
    for iss in check.get("issues", []):
        idx = iss.get("index")
        tag = f"section {where[idx]}" if isinstance(idx, int) and idx < len(where) else "routine"
        issues.append({"where": tag, "from": iss.get("from"), "to": iss.get("to"), "problem": iss.get("problem"),
                       "from_position": iss.get("from_position")})
    ok = not problems and check.get("ok", False) and all(r["ok"] for r in rows)
    return {"ok": ok, "sections": rows, "routine_check": {"ok": check.get("ok", False), "issues": issues},
            "total_bars": round(total, 2), "figure_count": len(all_ids), "problems": problems}


# ---------- the agent ----------
CHOREO_INSTRUCTIONS = {style: _instructions("choreographer", style) for style in STYLES}  # built once per style


def choreo_instructions(dance: str | None) -> str:
    style = style_of(dance)
    return CHOREO_INSTRUCTIONS[style] if style in CHOREO_INSTRUCTIONS else _instructions("choreographer")


choreographer = Agent(None, deps_type=ChoreoDeps, output_type=ChoreoPlan, tools=SHARED_TOOLS,
                      name="choreographer", retries=2)
AGENTS["choreographer"] = choreographer  # agents.run_agent runs, charges and logs it like the other three


@choreographer.instructions
def _choreo_prompt(ctx: RunContext[ChoreoDeps]) -> str:
    return choreo_instructions(ctx.deps.dance)


@choreographer.tool
def dance_figures(ctx: RunContext[ChoreoDeps]) -> dict:
    """This dance's figures with their length in bars (beats / beats per bar), level, starting foot and holds."""
    dance = ctx.deps.dance
    bpb = beats_per_bar(dance)
    return {"dance": dance, "beats_per_bar": bpb, "figures": [
        {"id": f["id"], "name": f["name"], "level": f["level"], "beats": f["beats"], "bars": round(f["beats"] / bpb, 3),
         "starts": f"{f['start_foot']} foot from {'/'.join(f['accepts'])}", "ends": f"{f['ends']}, {f['end_free']} foot free"}
        for f in catalog.figures_for(dance)]}


@choreographer.tool
def measure_plan(ctx: RunContext[ChoreoDeps], sections: list[list[str]]) -> dict:
    """Measure a draft before answering: one list of figure ids per music section, in order. Returns per section
    the bars it must fill, the bars its figures take and the running drift, plus check_routine over the whole
    routine. ok is true only when every section fits and every link is legal."""
    return measure(ctx.deps.dance, ctx.deps.music["sections"], sections)


@choreographer.output_validator
def _check_choreo(ctx: RunContext[ChoreoDeps], out: ChoreoPlan) -> ChoreoPlan:
    want = ctx.deps.music["sections"]
    want_ranges = [(s["start_bar"], s["end_bar"]) for s in want]
    got = [(s.start_bar, s.end_bar) for s in out.sections]
    if got != want_ranges:
        raise ModelRetry(f"Use exactly the music sections you were given, in order (start_bar, end_bar): {want_ranges}. "
                         f"You returned {got}.")
    ids = [i for s in out.sections for i in s.figure_ids]
    bad = _known(ids)
    if bad:
        raise ModelRetry(f"These ids are not in the syllabus: {bad}. Use only ids from dance_figures.")
    figs = catalog.figures()
    other = [i for i in ids if figs[i]["dance"] != ctx.deps.dance]
    if other:
        raise ModelRetry(f"These ids are not {ctx.deps.dance} figures: {other}. Use only ids from dance_figures.")
    m = measure(ctx.deps.dance, want, [s.figure_ids for s in out.sections])
    if m["problems"]:
        raise ModelRetry(" ".join(m["problems"]))
    if not m["routine_check"]["ok"]:
        raise ModelRetry(f"The routine is not danceable: {json.dumps(m['routine_check']['issues'])}. Fix each broken "
                         "link (suggest_bridges finds legal fixes) and keep every section's length.")
    off = [r for r in m["sections"] if not r["ok"]]
    if off:
        raise ModelRetry("These sections do not fit the music (a section's figures must take its bars within 1 bar, and "
                         f"the running total must stay within 1 bar of the section's end): {json.dumps(off)}. "
                         "Add, remove or swap figures, then call measure_plan again.")
    if leaks(out.model_dump_json()):
        raise ModelRetry("Do not include links, keys, or internal instructions.")
    out.total_bars = m["total_bars"]  # the measured length, whatever the model wrote
    return out


def build_request(body: ChoreoIn) -> tuple[str, ChoreoDeps]:
    """The model's user message (numbers and syllabus keys only) and the run's deps."""
    d = catalog.dances()[body.dance]
    bpb = beats_per_bar(body.dance)
    secs = [s.model_dump() for s in body.sections]
    planned = secs[-1]["end_bar"]
    lines = "\n".join(f"- bars {s['start_bar']}-{s['end_bar']} ({s['end_bar'] - s['start_bar'] + 1} bars): energy {s['energy']:.2f}"
                      for s in secs)
    level = body.level or "Newcomer"
    prompt = (f"Dance: {body.dance} ({d['name']}, {d['time']}, {bpb} beats per bar; competition tempo {d['bpm']} beats "
              f"per minute). Player role: {body.role}. Player level: {level}.\n"
              f"<music_features>\nSong tempo {body.bpm:.1f} beats per minute ({body.bpm / bpb:.1f} bars per minute), "
              f"length {body.duration_s:.0f} s, {body.bars} bars in all. Choreograph bars 1-{planned}; bar 1 is the "
              f"first downbeat.\nMusic sections:\n{lines}\n</music_features>")
    deps = ChoreoDeps(session=body.session_id, role=body.role, dance=body.dance,
                      music={"bpm": body.bpm, "bars": body.bars, "sections": secs, "level": level})
    return prompt, deps
