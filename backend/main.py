"""Ballroom Quest API + game server. One process serves the game (frontend/) and the agents (/api)."""
from __future__ import annotations

import json
import threading
import uuid
from collections import defaultdict
from datetime import date, datetime
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pydantic_ai import UsageLimitExceeded

import catalog
from agents import Deps, days_until, run_agent
from config import DATA_DIR, FRONTEND_DIR, MAX_NOTES_CHARS, MODEL_NAME, OUTPUT_DIR, SESSION_BUDGET_USD, key_is_set
from safety import GUARD, screen_notes

app = FastAPI(title="Ballroom Quest")


@app.middleware("http")
async def no_stale_files(request: Request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static"):
        response.headers["Cache-Control"] = "no-cache"
    return response
DRILLS_FILE = DATA_DIR / "drills.json"
_drill_lock = threading.Lock()

DanceKey = Literal["std_waltz", "std_foxtrot", "std_tango", "quickstep", "std_viennese", "waltz", "tango", "foxtrot", "viennese", "chacha", "rumba", "jive", "samba", "paso", "am_chacha", "am_rumba", "swing", "bolero", "mambo"]
Role = Literal["leader", "follower"]


# ---------- request bodies (strict) ----------
class CoachIn(BaseModel):
    session_id: str = Field(min_length=6, max_length=64)
    dance: DanceKey
    role: Role = "leader"
    figure_ids: list[str] = Field(min_length=1, max_length=12)
    stats: dict[str, float] = Field(default_factory=dict)  # figure_id -> accuracy 0..1


class DrillIn(BaseModel):
    session_id: str = Field(min_length=6, max_length=64)
    notes: str = Field(min_length=10, max_length=MAX_NOTES_CHARS * 2)
    author: str = Field(default="A teammate", max_length=40)
    role: Role = "leader"
    save: bool = True


class PlanIn(BaseModel):
    session_id: str = Field(min_length=6, max_length=64)
    role: Role = "leader"
    competition_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    minutes_per_day: int = Field(ge=10, le=120)
    dances: list[DanceKey] = Field(min_length=1, max_length=6)
    progress: dict[str, dict[str, float]] = Field(default_factory=dict)


# ---------- helpers ----------
def load_drills() -> list[dict]:
    if not DRILLS_FILE.exists():
        return []
    return json.loads(DRILLS_FILE.read_text())


def save_drill(drill: dict) -> None:
    with _drill_lock:
        drills = load_drills()
        drills.insert(0, drill)
        DRILLS_FILE.write_text(json.dumps(drills[:100], indent=2))


def gate(session: str) -> None:
    if not key_is_set():
        raise HTTPException(503, "AI is offline: PORTKEY_API_KEY is not set. The game still works.")
    blocked = GUARD.check(session)
    if blocked:
        raise HTTPException(429, blocked)


async def call(name: str, prompt: str, deps: Deps):
    try:
        out, record = await run_agent(name, prompt, deps)
    except UsageLimitExceeded:
        raise HTTPException(502, "The agent hit its step limit before finishing. Try a shorter request.")
    except Exception as exc:  # provider errors, content filter, timeouts
        if "content_filter" in str(exc):
            raise HTTPException(422, "The AI provider's safety filter blocked this text. Remove anything that "
                                     "isn't about dancing and try again.")
        raise HTTPException(502, f"The AI coach is unavailable right now ({type(exc).__name__}).")
    GUARD.charge(deps.session, record["cost_usd"])
    usage = {k: record[k] for k in ("run_id", "input_tokens", "cached_tokens", "output_tokens", "reasoning_tokens",
                                    "requests", "tool_calls", "cost_usd", "seconds")}
    usage["session_spent_usd"] = GUARD.spent(deps.session)
    usage["session_budget_usd"] = SESSION_BUDGET_USD
    return out, usage, record


# ---------- routes ----------
@app.get("/api/health")
def health():
    return {"ok": True, "ai": key_is_set(), "model": MODEL_NAME}


@app.get("/api/catalog")
def get_catalog():
    return catalog.public_catalog()


@app.post("/api/check")
def check(body: CoachIn):
    """Instant, free rule check (no AI) used by the game while you build a routine."""
    return catalog.check_routine(body.dance, body.figure_ids)


@app.post("/api/coach")
async def coach_route(body: CoachIn):
    gate(body.session_id)
    names = {f["id"]: f["name"] for f in catalog.figures_for(body.dance)}
    stats = {k: round(v, 2) for k, v in body.stats.items() if k in names}
    prompt = (f"Dance: {body.dance}. Player role: {body.role}.\n"
              f"Routine figure ids in order: {json.dumps(body.figure_ids)}\n"
              f"<player_data>timing accuracy per figure from the game: {json.dumps(stats)}</player_data>")
    deps = Deps(session=body.session_id, role=body.role, dance=body.dance, routine=body.figure_ids)
    out, usage, record = await call("coach", prompt, deps)
    return {"report": out.model_dump(), "usage": usage, "trace": record["trace"]}


@app.post("/api/drill")
async def drill_route(body: DrillIn):
    gate(body.session_id)
    screened = screen_notes(body.notes)
    warn = ""
    if screened["flags"]:
        warn = (f"\nSecurity note from the app: {len(screened['flags'])} line(s) looked like instructions, not dance "
                "notes, and were removed before you saw them. Mention this in coach_note.")
    prompt = (f"Player role: {body.role}.{warn}\n<teammate_notes>\n{screened['text']}\n</teammate_notes>")
    deps = Deps(session=body.session_id, role=body.role)
    out, usage, record = await call("drill_builder", prompt, deps)
    drill = {"id": "drill_" + uuid.uuid4().hex[:8], "author": body.author.strip() or "A teammate",
             "created": datetime.now().isoformat(timespec="minutes"), **out.model_dump()}
    if body.save:
        save_drill(drill)
    return {"drill": drill, "screening": {"flags": screened["flags"], "truncated": screened["truncated"]},
            "usage": usage, "trace": record["trace"]}


@app.get("/api/drills")
def drills():
    return load_drills()


@app.post("/api/plan")
async def plan_route(body: PlanIn):
    gate(body.session_id)
    days = days_until(body.competition_date)
    if days < 0:
        raise HTTPException(422, "The competition date is in the past.")
    team = [d for d in load_drills() if d["dance"] in body.dances]
    prompt = (f"Today is {date.today().isoformat()}. Competition on {body.competition_date} ({days} days away, "
              f"about {max(1, days // 7)} weeks). Role: {body.role}. Dances to prepare: {', '.join(body.dances)}. "
              f"Minutes per day: {body.minutes_per_day}.")
    deps = Deps(session=body.session_id, role=body.role, progress=body.progress,
                minutes_per_day=body.minutes_per_day, drills=team)
    out, usage, record = await call("planner", prompt, deps)
    return {"plan": out.model_dump(), "days_left": days, "usage": usage, "trace": record["trace"]}


MOCAP_DIR = DATA_DIR / "mocap"


def mocap_index() -> dict[str, dict]:
    """Motion clips captured from lesson videos (skeletons only, no video)."""
    out = {}
    for p in sorted(MOCAP_DIR.glob("*.game.json")) if MOCAP_DIR.exists() else []:
        try:
            clip = json.loads(p.read_text())
        except ValueError:
            continue
        cid = p.name.removesuffix(".game.json")
        frames = max((len(d["frames"]) for d in clip.get("dancers", [])), default=0)
        out[cid] = {"id": cid, "dance": clip.get("dance"), "fps": clip.get("fps"), "frames": frames,
                    "label": clip.get("label") or cid.replace("_", " ")}
    return out


@app.get("/api/mocap")
def mocap_list():
    return list(mocap_index().values())


@app.get("/api/mocap/{clip_id}")
def mocap_clip(clip_id: str):
    if clip_id not in mocap_index():  # allowlist: no path tricks
        raise HTTPException(404, "No such clip.")
    return FileResponse(MOCAP_DIR / f"{clip_id}.game.json", media_type="application/json")


@app.get("/api/usage")
def usage_summary():
    """Measured tokens and cost per agent from output/agent_runs.jsonl (tokenomics evidence)."""
    path = OUTPUT_DIR / "agent_runs.jsonl"
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()] if path.exists() else []
    agg: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    for r in rows:
        a = agg[r["agent"]]
        a["runs"] += 1
        for k in ("input_tokens", "cached_tokens", "output_tokens", "reasoning_tokens", "cost_usd", "seconds"):
            a[k] += r.get(k, 0) or 0
    out = {}
    for name, a in agg.items():
        n = a["runs"]
        out[name] = {"runs": int(n), **{f"avg_{k}": round(a[k] / n, 6 if k == "cost_usd" else 1)
                                        for k in ("input_tokens", "cached_tokens", "output_tokens", "reasoning_tokens", "cost_usd", "seconds")}}
    return {"model": MODEL_NAME, "agents": out, "total_runs": len(rows)}


# ---------- the game ----------
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on the server."})
