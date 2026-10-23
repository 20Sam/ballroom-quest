"""Three agents on gpt-6-luna: Coach, Drill Builder, Practice Planner.

Every agent shares the same long, static prefix (rules + full syllabus) so the provider's
prompt cache can reuse it across calls and across agents; only the job prompt and the user
message change. Every run is traced and priced into output/agent_runs.jsonl.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelRetry, RunContext, UsageLimits
from pydantic_ai.messages import ModelResponse, ToolCallPart, ToolReturnPart

import catalog
from config import OUTPUT_DIR, PROMPTS_DIR, REQUEST_LIMIT, TOKEN_LIMIT_PER_RUN, MODEL_NAME, build_model, cost_usd
from safety import leaks

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
    progress: dict = field(default_factory=dict)
    minutes_per_day: int = 20
    drills: list = field(default_factory=list)
    routine: list = field(default_factory=list)


def _instructions(job: str) -> str:
    shared = (PROMPTS_DIR / "shared_rules.md").read_text().replace("{catalog}", catalog.catalog_text())
    return shared + "\n\n" + (PROMPTS_DIR / f"{job}.md").read_text()


INSTRUCTIONS = {job: _instructions(job) for job in ("coach", "drill_builder", "planner")}


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
coach = Agent(None, deps_type=Deps, output_type=CoachReport, instructions=INSTRUCTIONS["coach"],
              tools=SHARED_TOOLS, name="coach", retries=2)
drill_builder = Agent(None, deps_type=Deps, output_type=Drill, instructions=INSTRUCTIONS["drill_builder"],
                      tools=SHARED_TOOLS, name="drill_builder", retries=2)
planner = Agent(None, deps_type=Deps, output_type=PracticePlan, instructions=INSTRUCTIONS["planner"],
                tools=SHARED_TOOLS, name="planner", retries=2)


@planner.tool
def progress_report(ctx: RunContext[Deps]) -> dict:
    """The player's practice history per figure (plays, best accuracy 0-1) and the weakest figures."""
    figs = catalog.figures()
    rows = []
    for fid, p in (ctx.deps.progress or {}).items():
        if fid in figs:
            rows.append({"id": fid, "dance": figs[fid]["dance"], "plays": p.get("plays", 0), "best": round(p.get("best", 0), 2)})
    rows.sort(key=lambda r: (r["best"], r["plays"]))
    practiced = {r["dance"] for r in rows}
    return {"figures": rows[:30], "weakest": [r["id"] for r in rows[:5]],
            "dances_never_practiced": [d for d in catalog.dances() if d not in practiced],
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
    bad = _known([i for iss in out.issues for i in iss.fix_figure_ids] + ([out.next_challenge] if out.next_challenge else []))
    if bad:
        raise ModelRetry(f"These ids are not in the syllabus: {bad}. Use only syllabus ids.")
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
    for s in out.sessions:
        total = sum(i.minutes for i in s.items)
        if total > ctx.deps.minutes_per_day + 5:
            raise ModelRetry(f"Session '{s.day}' is {total} minutes; the player has {ctx.deps.minutes_per_day}.")
        for it in s.items:
            if it.kind == "drill":
                if any(r not in drill_ids for r in it.ref_ids):
                    raise ModelRetry(f"Unknown drill id in {it.ref_ids}. Use list_team_drills ids.")
                continue
            bad = _known(it.ref_ids)
            if bad:
                raise ModelRetry(f"Unknown figure ids {bad}.")
            if it.kind == "routine":
                dance = catalog.figures()[it.ref_ids[0]]["dance"]
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
    return steps


def _log(record: dict) -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    with _log_lock, open(OUTPUT_DIR / "agent_runs.jsonl", "a") as f:
        f.write(json.dumps(record, default=str) + "\n")


async def run_agent(name: str, prompt: str, deps: Deps):
    agent = {"coach": coach, "drill_builder": drill_builder, "planner": planner}[name]
    t0 = time.perf_counter()
    result = await agent.run(prompt, deps=deps, model=build_model(),
                             usage_limits=UsageLimits(request_limit=REQUEST_LIMIT, total_tokens_limit=TOKEN_LIMIT_PER_RUN))
    usage = result.usage() if callable(result.usage) else result.usage
    details = getattr(usage, "details", None) or {}
    tokens = {"requests": usage.requests, "tool_calls": usage.tool_calls, "input_tokens": usage.input_tokens,
              "cached_tokens": usage.cache_read_tokens, "output_tokens": usage.output_tokens,
              "reasoning_tokens": details.get("reasoning_tokens", 0)}
    tokens["cost_usd"] = cost_usd(tokens["input_tokens"], tokens["cached_tokens"], tokens["output_tokens"])
    tokens["seconds"] = round(time.perf_counter() - t0, 2)
    record = {"run_id": uuid.uuid4().hex[:10], "at": datetime.now().isoformat(timespec="seconds"), "agent": name,
              "model": MODEL_NAME, "session": deps.session[:8], **tokens,
              "prompt_preview": prompt[:300], "trace": _trace(result.all_messages()),
              "output": result.output.model_dump()}
    _log(record)
    return result.output, record


def days_until(iso: str) -> int:
    try:
        return (date.fromisoformat(iso) - date.today()).days
    except ValueError:
        return -1
