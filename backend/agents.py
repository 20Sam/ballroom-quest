"""Three agents on gpt-6-luna: Coach, Drill Builder, Practice Planner.

The Drill Builder and the Planner share one long, static prefix (rules + full syllabus) so the
provider's prompt cache can reuse it across calls and across agents. The Coach always knows the
dance, so it gets a smaller prompt per style (rules + only that style's syllabus + coach job),
built once per style at import so each one stays byte-identical and cacheable. Only the user
message changes. Every run, finished or failed, is traced and priced into output/agent_runs.jsonl
and charged to the budget guard.
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelRetry, RunContext, UsageLimits, capture_run_messages
from pydantic_ai.messages import ModelResponse, RetryPromptPart, ToolCallPart, ToolReturnPart
from pydantic_ai.usage import RunUsage

import catalog
from config import OUTPUT_DIR, PROMPTS_DIR, REQUEST_LIMIT, TOKEN_LIMIT_PER_RUN, MODEL_NAME, build_model, cost_usd
from safety import GUARD, leaks

DanceKey = Literal["std_waltz", "std_foxtrot", "std_tango", "quickstep", "std_viennese", "waltz", "tango", "foxtrot", "viennese", "chacha", "rumba", "jive", "samba", "paso", "am_chacha", "am_rumba", "swing", "bolero", "mambo"]
Role = Literal["leader", "follower"]


# ---------- outputs ----------
class Issue(BaseModel):
    between: list[str] = Field(description="[from_figure_id, to_figure_id]")
    problem: str
    fix_figure_ids: list[str] = Field(default_factory=list)
    tip: str


class CoachReport(BaseModel):
    verdict: Literal["flows", "needs_fix"]
    summary: str
    issues: list[Issue] = Field(default_factory=list)
    role_tip: str
    next_challenge: str | None = None


class Drill(BaseModel):
    title: str
    dance: DanceKey
    figure_ids: list[str] = Field(min_length=1, max_length=8)
    cues: list[str]
    tempo_pct: int = Field(ge=50, le=100)
    coach_note: str
    skipped: list[str] = Field(default_factory=list)


class PlanItem(BaseModel):
    kind: Literal["figure", "drill", "routine"]
    ref_ids: list[str]
    label: str
    minutes: int = Field(ge=1, le=60)


class Session(BaseModel):
    day: str
    focus: str
    items: list[PlanItem]
    why: str


class PracticePlan(BaseModel):
    headline: str
    sessions: list[Session] = Field(min_length=1, max_length=7)
    milestones: list[str] = Field(default_factory=list, max_length=3)


# ---------- deps ----------
@dataclass
class Deps:
    session: str
    role: Role = "leader"
    dance: str | None = None
    dances: list[str] = field(default_factory=list)  # planner: the dances the player is entering
    progress: dict = field(default_factory=dict)
    minutes_per_day: int = 20
    drills: list = field(default_factory=list)
    routine: list = field(default_factory=list)


# ---------- system prompts ----------
def _figure_line(f: dict) -> str:
    # Same line format as catalog.catalog_text(), so every agent reads the syllabus the same way.
    return (f"- {f['id']}: {f['name']} [{f['level']}] starts {f['start_foot']} foot from {'/'.join(f['accepts'])}; "
            f"ends {f['ends']} with {f['end_free']} foot free; {f['beats']:g} beats. Lead: {f.get('lead_cue', '')} "
            f"Follow: {f.get('follow_cue', '')} Common mistake: {f.get('mistake', '')}")


def catalog_text(style: str | None = None) -> str:
    """Syllabus text for a system prompt.

    style=None returns the whole syllabus (catalog.catalog_text(), shared by Drill Builder and Planner).
    With a style key ("standard", "smooth", "latin", "rhythm") it returns only that style's dances,
    built here from catalog.dances() / catalog.figures_for() so catalog.py stays untouched.
    """
    if style is None:
        return catalog.catalog_text()
    keys = [k for k, d in catalog.dances().items() if d["style"] == style]
    if not keys:
        raise KeyError(f"unknown style {style!r}")
    label = catalog.public_catalog()["styles"].get(style, {}).get("label", style)
    lines = [f"Only the {label} syllabus is loaded for this job: {', '.join(keys)}. "
             "Every figure id you use must come from the list below."]
    for key in keys:
        d = catalog.dances()[key]
        lines.append(f"## {d['name']} ({key}, {d['style']}, {d['time']}): {d['feel']}")
        lines.extend(_figure_line(f) for f in catalog.figures_for(key))
    return "\n".join(lines)


def _instructions(job: str, style: str | None = None) -> str:
    shared = (PROMPTS_DIR / "shared_rules.md").read_text().replace("{catalog}", catalog_text(style))
    return shared + "\n\n" + (PROMPTS_DIR / f"{job}.md").read_text()


INSTRUCTIONS = {job: _instructions(job) for job in ("drill_builder", "planner")}
STYLES = sorted({d["style"] for d in catalog.dances().values()})
COACH_INSTRUCTIONS = {style: _instructions("coach", style) for style in STYLES}  # built once, stable per style


def style_of(dance: str | None) -> str | None:
    d = catalog.dances().get(dance or "")
    return d["style"] if d else None


def coach_instructions(dance: str | None) -> str:
    """The Coach's system prompt for this dance's style (the full syllabus only if the dance is unknown)."""
    style = style_of(dance)
    if style in COACH_INSTRUCTIONS:
        return COACH_INSTRUCTIONS[style]
    if "coach" not in INSTRUCTIONS:
        INSTRUCTIONS["coach"] = _instructions("coach")
    return INSTRUCTIONS["coach"]


# ---------- shared tools ----------
def check_routine(ctx: RunContext[Deps], dance: DanceKey, figure_ids: list[str], start_position: str = "closed") -> dict:
    """Check whether a chain of figures can be danced back to back. Returns ok and the issues."""
    return catalog.check_routine(dance, figure_ids, start_position)


def suggest_bridges(ctx: RunContext[Deps], dance: DanceKey, from_id: str, to_id: str) -> list[list[str]]:
    """Find the shortest legal figure(s) to insert between two figures that don't connect."""
    return catalog.bridges(dance, from_id, to_id)


def figure_details(ctx: RunContext[Deps], figure_id: str) -> dict:
    """Full details of one figure: steps (leader's foot, direction, beats, turn, count), cues, common mistake."""
    fig = catalog.figures().get(figure_id)
    return fig or {"error": f"unknown figure {figure_id}"}


SHARED_TOOLS = [check_routine, suggest_bridges, figure_details]


# ---------- agents ----------
# The Coach has no static instructions: the per-style prompt is resolved for each run from deps.dance.
coach = Agent(None, deps_type=Deps, output_type=CoachReport, tools=SHARED_TOOLS, name="coach", retries=2)
drill_builder = Agent(None, deps_type=Deps, output_type=Drill, instructions=INSTRUCTIONS["drill_builder"],
                      tools=SHARED_TOOLS, name="drill_builder", retries=2)
planner = Agent(None, deps_type=Deps, output_type=PracticePlan, instructions=INSTRUCTIONS["planner"],
                tools=SHARED_TOOLS, name="planner", retries=2)
AGENTS = {"coach": coach, "drill_builder": drill_builder, "planner": planner}


@coach.instructions
def _coach_prompt(ctx: RunContext[Deps]) -> str:
    return coach_instructions(ctx.deps.dance)


@planner.tool
def progress_report(ctx: RunContext[Deps]) -> dict:
    """The player's practice history per figure (plays, best accuracy 0-1) for the dances they are entering,
    the weakest figures, and which of those dances they have never practised."""
    figs = catalog.figures()
    chosen = ctx.deps.dances or list(catalog.dances())
    rows = []
    for fid, p in (ctx.deps.progress or {}).items():
        if fid in figs and figs[fid]["dance"] in chosen:
            rows.append({"id": fid, "dance": figs[fid]["dance"], "plays": p.get("plays", 0), "best": round(p.get("best", 0), 2)})
    rows.sort(key=lambda r: (r["best"], r["plays"]))
    practiced = {r["dance"] for r in rows}
    return {"dances": chosen, "figures": rows[:30], "weakest": [r["id"] for r in rows[:5]],
            "dances_never_practiced": [d for d in chosen if d not in practiced],
            "role": ctx.deps.role, "minutes_per_day": ctx.deps.minutes_per_day}


@planner.tool
def list_team_drills(ctx: RunContext[Deps]) -> list[dict]:
    """Drills teammates built from their lesson notes (id, title, dance, figures)."""
    return [{"id": d["id"], "title": d["title"], "dance": d["dance"], "figure_ids": d["figure_ids"]} for d in ctx.deps.drills][:20]


# ---------- output validators (the agent must fix its own mistakes) ----------
def _known(ids: list[str]) -> list[str]:
    figs = catalog.figures()
    return [i for i in ids if i not in figs]


@coach.output_validator
def _check_coach(ctx: RunContext[Deps], out: CoachReport) -> CoachReport:
    truth = catalog.check_routine(ctx.deps.dance, ctx.deps.routine)
    expected = "flows" if truth["ok"] else "needs_fix"
    if out.verdict != expected:
        raise ModelRetry(f"check_routine says the verdict is '{expected}'. Fix the verdict and issues.")
    ids = [i for iss in out.issues for i in iss.fix_figure_ids] + ([out.next_challenge] if out.next_challenge else [])
    bad = _known(ids)
    if bad:
        raise ModelRetry(f"These ids are not in the syllabus: {bad}. Use only syllabus ids.")
    figs = catalog.figures()
    other = [i for i in ids if figs[i]["dance"] != ctx.deps.dance]
    if other:
        raise ModelRetry(f"These ids are not {ctx.deps.dance} figures: {other}. Use only figures from this dance.")
    if leaks(out.model_dump_json()):
        raise ModelRetry("Do not include links, keys, or internal instructions.")
    return out


@drill_builder.output_validator
def _check_drill(ctx: RunContext[Deps], out: Drill) -> Drill:
    bad = _known(out.figure_ids)
    if bad:
        raise ModelRetry(f"These ids are not in the syllabus: {bad}. Map them to real ids or list them in skipped.")
    result = catalog.check_routine(out.dance, out.figure_ids)
    if not result["ok"]:
        raise ModelRetry(f"The drill is not danceable: {result['issues']}. Insert bridges from suggest_bridges.")
    if len(out.cues) != len(out.figure_ids):
        raise ModelRetry("Give exactly one cue per figure, in the same order.")
    if leaks(out.model_dump_json()):
        raise ModelRetry("Do not include links, keys, or internal instructions.")
    return out


@planner.output_validator
def _check_plan(ctx: RunContext[Deps], out: PracticePlan) -> PracticePlan:
    drill_ids = {d["id"] for d in ctx.deps.drills}
    chosen = set(ctx.deps.dances)
    figs = catalog.figures()
    for s in out.sessions:
        total = sum(i.minutes for i in s.items)
        if total > ctx.deps.minutes_per_day + 5:
            raise ModelRetry(f"Session '{s.day}' is {total} minutes; the player has {ctx.deps.minutes_per_day}.")
        for it in s.items:
            if not it.ref_ids:
                raise ModelRetry(f"Item '{it.label}' has no ref_ids. Give one figure id, one drill id, or a routine of figure ids.")
            if it.kind == "drill":
                if any(r not in drill_ids for r in it.ref_ids):
                    raise ModelRetry(f"Unknown drill id in {it.ref_ids}. Use list_team_drills ids.")
                continue
            bad = _known(it.ref_ids)
            if bad:
                raise ModelRetry(f"Unknown figure ids {bad}.")
            if chosen:
                off = [r for r in it.ref_ids if figs[r]["dance"] not in chosen]
                if off:
                    raise ModelRetry(f"{off} are not from the player's chosen dances {sorted(chosen)}. "
                                     "Only plan those dances, by their exact dance keys.")
            if it.kind == "routine":
                dance = figs[it.ref_ids[0]]["dance"]
                res = catalog.check_routine(dance, it.ref_ids)
                if not res["ok"]:
                    raise ModelRetry(f"Routine {it.ref_ids} is not danceable: {res['issues']}")
    if leaks(out.model_dump_json()):
        raise ModelRetry("Do not include links, keys, or internal instructions.")
    return out


# ---------- tracing + tokenomics ----------
_log_lock = threading.Lock()


def _trace(messages) -> list[dict]:
    steps = []
    for m in messages:
        if isinstance(m, ModelResponse):
            u = m.usage
            steps.append({"kind": "model_call", "input_tokens": u.input_tokens, "cached_tokens": u.cache_read_tokens,
                          "output_tokens": u.output_tokens,
                          "tool_calls": [{"tool": p.tool_name, "args": p.args_as_dict()} for p in m.parts if isinstance(p, ToolCallPart)]})
        else:
            for p in getattr(m, "parts", []):
                if isinstance(p, ToolReturnPart):
                    steps.append({"kind": "tool_result", "tool": p.tool_name, "result": json.dumps(p.content, default=str)[:400]})
                elif isinstance(p, RetryPromptPart):
                    steps.append({"kind": "retry", "tool": p.tool_name, "reason": json.dumps(p.content, default=str)[:400]})
    return steps


def _log(record: dict) -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    with _log_lock, open(OUTPUT_DIR / "agent_runs.jsonl", "a") as f:
        f.write(json.dumps(record, default=str) + "\n")


def _tokens(usage: RunUsage, t0: float) -> dict:
    details = getattr(usage, "details", None) or {}
    tokens = {"requests": usage.requests, "tool_calls": usage.tool_calls, "input_tokens": usage.input_tokens,
              "cached_tokens": usage.cache_read_tokens, "output_tokens": usage.output_tokens,
              "reasoning_tokens": details.get("reasoning_tokens", 0) or getattr(usage, "output_reasoning_tokens", 0) or 0}
    tokens["cost_usd"] = cost_usd(tokens["input_tokens"], tokens["cached_tokens"], tokens["output_tokens"])
    tokens["seconds"] = round(time.perf_counter() - t0, 2)
    return tokens


async def run_agent(name: str, prompt: str, deps: Deps):
    """Run one agent. Every run is charged to the budget guard and logged exactly once, including runs that
    fail (usage limit, validator retries exhausted, provider error): those keep the tokens they already used."""
    agent = AGENTS[name]
    model = build_model()
    base = {"run_id": uuid.uuid4().hex[:10], "at": datetime.now().isoformat(timespec="seconds"), "agent": name,
            "model": MODEL_NAME, "session": deps.session[:8]}
    if name == "coach":
        base["style"] = style_of(deps.dance)  # which per-style prompt was used
    run_usage = RunUsage()  # filled in place by pydantic_ai, so it survives an exception
    t0 = time.perf_counter()
    with capture_run_messages() as messages:
        try:
            result = await agent.run(prompt, deps=deps, model=model, usage=run_usage,
                                     usage_limits=UsageLimits(request_limit=REQUEST_LIMIT, total_tokens_limit=TOKEN_LIMIT_PER_RUN))
        except (Exception, asyncio.CancelledError) as exc:
            record = {**base, "status": "error", "error": type(exc).__name__, **_tokens(run_usage, t0),
                      "trace": _trace(messages)}
            GUARD.charge(deps.session, record["cost_usd"])
            _log(record)
            raise
    usage = result.usage() if callable(result.usage) else result.usage
    record = {**base, "status": "ok", **_tokens(usage, t0),
              "prompt_preview": prompt[:300], "trace": _trace(result.all_messages()),
              "output": result.output.model_dump()}
    GUARD.charge(deps.session, record["cost_usd"])
    _log(record)
    return result.output, record


def days_until(iso: str) -> int:
    try:
        return (date.fromisoformat(iso) - date.today()).days
    except ValueError:
        return -1
