"""The figure syllabus and the rule checker every agent relies on.

The rules are deterministic on purpose: the agents explain and plan, but whether
two figures can be danced back to back is decided here, never by the model.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OTHER = {"L": "R", "R": "L"}


@lru_cache(maxsize=1)
def load() -> dict:
    data = json.loads((DATA_DIR / "figures.json").read_text())
    for fig in data["figures"]:
        weighted = [s for s in fig["steps"] if len(s) < 6 or s[5]]
        fig["start_foot"] = fig["steps"][0][0]
        fig["end_free"] = OTHER[weighted[-1][0]]
        fig["beats"] = sum(s[2] for s in fig["steps"])
    return data


def figures() -> dict[str, dict]:
    return {f["id"]: f for f in load()["figures"]}


def dances() -> dict[str, dict]:
    return load()["dances"]


def figures_for(dance: str) -> list[dict]:
    return [f for f in load()["figures"] if f["dance"] == dance]


def check_routine(dance: str, figure_ids: list[str], start_position: str = "closed") -> dict:
    """Check a chain of figures. Returns ok + one issue per broken link."""
    figs = figures()
    issues: list[dict] = []
    unknown = [i for i in figure_ids if i not in figs]
    if unknown:
        return {"ok": False, "issues": [{"index": None, "problem": f"Unknown figure ids: {unknown}"}], "unknown": unknown}
    wrong_dance = [i for i in figure_ids if figs[i]["dance"] != dance]
    if wrong_dance:
        return {"ok": False, "issues": [{"index": None, "problem": f"Not {dance} figures: {wrong_dance}"}], "unknown": []}
    position = start_position
    free = None  # the first figure may start on either foot
    for idx, fid in enumerate(figure_ids):
        fig = figs[fid]
        prev = figs[figure_ids[idx - 1]]["name"] if idx else "the start"
        if free and fig["start_foot"] != free:
            issues.append({"index": idx, "from": figure_ids[idx - 1], "to": fid, "kind": "foot",
                           "problem": f"After {prev} the leader's {free} foot is free, but {fig['name']} starts with the {fig['start_foot']} foot."})
        if position not in fig["accepts"]:
            issues.append({"index": idx, "from": figure_ids[idx - 1] if idx else None, "to": fid, "kind": "position",
                           "problem": f"After {prev} you are in {position} position, but {fig['name']} starts from {' or '.join(fig['accepts'])}."})
        position = position if fig["ends"] == "same" else fig["ends"]
        free = fig["end_free"]
    return {"ok": not issues, "issues": issues, "end_position": position, "end_free_foot": free}


def bridges(dance: str, from_id: str, to_id: str) -> list[list[str]]:
    """Shortest fixes (1 or 2 figures) that make from_id -> ... -> to_id legal."""
    pool = [f["id"] for f in figures_for(dance)]
    singles = [[b] for b in pool if check_routine(dance, [from_id, b, to_id])["ok"]]
    if singles:
        return singles[:4]
    doubles = [[a, b] for a in pool for b in pool if check_routine(dance, [from_id, a, b, to_id])["ok"]]
    return doubles[:4]


def catalog_text() -> str:
    """Compact, stable text version of the syllabus for the agents' system prompt (cache-friendly)."""
    data = load()
    lines = []
    for key, d in data["dances"].items():
        lines.append(f"## {d['name']} ({key}, {d['style']}, {d['time']}): {d['feel']}")
        for f in figures_for(key):
            accepts = "/".join(f["accepts"])
            ends = f["ends"]
            lines.append(f"- {f['id']}: {f['name']} [{f['level']}] starts {f['start_foot']} foot from {accepts}; "
                         f"ends {ends} with {f['end_free']} foot free; {f['beats']:g} beats. Lead: {f['lead_cue']} "
                         f"Follow: {f['follow_cue']} Common mistake: {f['mistake']}")
    return "\n".join(lines)


def public_catalog() -> dict:
    data = load()
    return {"styles": data["styles"], "dances": data["dances"], "figures": data["figures"]}
