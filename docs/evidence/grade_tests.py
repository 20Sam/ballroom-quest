"""Reproducible tests for "Grade my video" (backend/grade.py, POST /api/grade). No AI model, no cost.

1. Synthetic sanity tests: a simulated dancer (pose landmarks drawn from the routine's own step times, with pixel
   noise) is graded: perfect, sloppy timing, wrong feet in one figure, late against the music, follower role.
2. Music beat: a synthetic metronome track is found at the right phase; noise is not taken for a beat.
3. API (FastAPI TestClient): 501 when the optional extras are missing (simulated in a child process where the
   imports fail, so the base app is shown to start without them), 422 / 413 / 429 paths, and, if a local clip is
   given with --clip, the 200 path. Every request's private temp folder is checked to be deleted afterwards.

No video or frame is stored: the clip is read from where it is, and only numbers are written.

Run:  .venv/bin/python docs/evidence/grade_tests.py [--clip VIDEO --dance chacha --figures a,b --bpm 105]
Writes docs/evidence/grade_tests.json.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "backend"))

import numpy as np  # noqa: E402

import grade  # noqa: E402

RESULTS: list[dict] = []


def check(name: str, ok: bool, **info) -> None:
    RESULTS.append({"test": name, "pass": bool(ok), **info})
    print(("PASS " if ok else "FAIL ") + name + "  " + json.dumps(info)[:300])


# ----------------------------------------------------------------------------- synthetic dancer
def synth_track(steps, spb, offset, fps=15.0, lag=0.0, jitter=0.0, flip=frozenset(), noise=1.5, seed=0):
    """Landmarks (T, 33, 3) of one dancer facing the camera doing `steps` (from grade.expected_steps).

    Leg length 400 px. A moving step swings the foot out (0.45 leg) or back beside the other one, lifting it a
    little mid-swing; the hips move over the foot that takes the weight. Steps listed in `flip` use the other foot.
    lag shifts every step, jitter adds random timing error (s)."""
    rng = np.random.default_rng(seed)
    times = [offset + s["beat"] * spb + lag + (rng.normal(0, jitter) if jitter else 0.0) for s in steps]
    end = times[-1] + 1.5
    t = np.arange(0.0, end, 1.0 / fps)
    foot = {"L": np.array([540.0, 900.0]), "R": np.array([460.0, 900.0])}
    side = {"L": 1.0, "R": -1.0}
    moves = []  # (foot, t0, t1, p0, p1)
    shifts = []  # (t0, t1, from_foot, to_foot)
    weight = "R"
    prev_t = times[0] - 0.6
    for s, ti in zip(steps, times):
        f = grade.OTHER[s["foot"]] if s["i"] in flip else s["foot"]
        o = grade.OTHER[f]
        d = float(np.clip(0.7 * (ti - prev_t), 0.12, 0.35))
        if s["moves"]:
            p0 = foot[f].copy()
            apart = abs(foot[f][0] - foot[o][0]) > 120
            x1 = foot[o][0] + side[f] * (60.0 if apart else 180.0)
            p1 = np.array([x1, 900.0 + (12.0 if s["i"] % 2 else -12.0)])
            moves.append((f, ti - d, ti, p0, p1))
            foot[f] = p1
        if weight != f:
            shifts.append((ti - (d / 2 if s["moves"] else 0.15), ti + 0.05, weight, f))
            weight = f
        prev_t = ti

    def foot_at(f, tt):
        p, lift = None, 0.0
        for g, a, b, p0, p1 in moves:
            if g != f:
                continue
            if tt < a:
                return (p0 if p is None else p), 0.0
            if tt <= b:
                u = (tt - a) / (b - a)
                w = 0.5 - 0.5 * math.cos(math.pi * u)
                return p0 + (p1 - p0) * w, 16.0 * math.sin(math.pi * u)
            p = p1
        return (p if p is not None else np.array([540.0 if f == "L" else 460.0, 900.0])), lift

    P = np.zeros((len(t), 33, 3))
    Wd = np.zeros((len(t), 33, 3))
    for k, tt in enumerate(t):
        fp = {f: foot_at(f, tt) for f in "LR"}
        hw = "R"
        u = 0.0
        for a, b, fr, to in shifts:
            if tt >= b:
                hw, u = to, 0.0
            elif tt >= a:
                hw, u = fr, (tt - a) / (b - a)
                frm, tgt = fp[fr][0][0], fp[to][0][0]
                hip_x = frm + (tgt - frm) * u
                break
        else:
            hip_x = fp[hw][0][0]
        if u == 0.0:
            hip_x = fp[hw][0][0]
        J = {}
        for f, hip_i, knee_i in (("L", 23, 25), ("R", 24, 26)):
            (x, y), lift = fp[f]
            hx = hip_x + (30 if f == "L" else -30)
            J[hip_i] = (hx, 500.0)
            J[knee_i] = ((hx + x) / 2, 700.0 - lift / 2)
            a_, h_, t_ = grade.FOOT[f]
            J[a_] = (x, y - 10 - lift)
            J[h_] = (x - 4, y - lift)
            J[t_] = (x + 6, y + 8 - lift)
            Wd[k, a_, 1] = 0.8 - lift / 400 * 0.85
        J[11], J[12], J[0] = (hip_x + 50, 250.0), (hip_x - 50, 250.0), (hip_x, 150.0)
        for j, (x, y) in J.items():
            P[k, j] = (x + rng.normal(0, noise), y + rng.normal(0, noise), 0.9)
        for j in range(33):
            if j not in J:
                P[k, j] = (hip_x, 400.0, 0.5)
    return {"t": t, "P": P, "Wd": Wd, "fps": fps}


def synthetic_tests() -> None:
    dance, figs, bpm = "chacha", ["cc_basic_full", "cc_new_yorker", "cc_hand_to_hand"], 120.0
    spb = 60 / bpm
    steps, _ = grade.expected_steps(figs, "leader")
    off = 2.0
    grid = {"phase": off - 4 * spb, "period": spb, "strength": 9.9, "bpm": bpm, "score": 1.0}

    def run(track, role="leader", grid_=None, first=None):
        ev, q = grade.detect_steps(track)
        return grade.grade_events(ev, dance, figs, role, bpm, first, q, grid_), ev

    r, ev = run(synth_track(steps, spb, off))
    m = r["metrics"]
    check("synthetic: perfect dancer is graded high", m["on_beat"] >= 0.9 and m["foot_accuracy"] >= 0.9
          and m["step_count_score"] >= 0.85 and r["overall"] >= 85, overall=r["overall"], on_beat=m["on_beat"],
          foot=m["foot_accuracy"], steps=f"{m['steps_detected']}/{m['steps_expected']}", confidence=m["confidence_label"],
          first_step=r["alignment"]["first_step_s"])
    dts = [s["dt"] for s in r["timeline"]["expected"] if s["dt"] is not None]
    check("synthetic: detected step times sit on the expected ones", len(dts) >= 0.9 * len(steps)
          and float(np.mean(np.abs(dts))) < 0.06, mean_abs_dt_ms=round(1000 * float(np.mean(np.abs(dts))), 1))

    r2, _ = run(synth_track(steps, spb, off, jitter=0.16, seed=3))
    m2 = r2["metrics"]
    check("synthetic: sloppy timing (+-160 ms) scores lower", m2["on_beat"] <= m["on_beat"] - 0.15
          and r2["overall"] <= r["overall"] - 8 and m2["consistency"] < m["consistency"], overall=r2["overall"], on_beat=m2["on_beat"],
          spread_ms=m2["spread_ms"], tips=r2["tips"][:2])

    flip = frozenset(s["i"] for s in steps if s["fig"] == 1)
    r3, _ = run(synth_track(steps, spb, off, flip=flip))
    f3 = {f["id"]: f for f in r3["figures"]}
    check("synthetic: wrong feet in one figure are caught", r3["metrics"]["foot_accuracy"] < 0.8
          and f3["cc_new_yorker"]["right_foot"] <= 2 and f3["cc_basic_full"]["right_foot"] >= 8,
          foot=r3["metrics"]["foot_accuracy"], per_figure_right_foot={k: f"{v['right_foot']}/{v['steps']}" for k, v in f3.items()},
          tip=[t for t in r3["tips"] if "feet" in t or "foot" in t][:1])

    late = synth_track(steps, spb, off, lag=0.15)
    r4, _ = run(late, grid_=grid)
    r5, _ = run(late)
    check("synthetic: late against the music is caught only with the music's beat",
          r4["metrics"]["mean_offset_ms"] > 100 and r4["metrics"]["on_beat"] < 0.5 and r5["metrics"]["on_beat"] >= 0.9
          and any("after the beat" in t for t in r4["tips"]),
          with_music={"mean_offset_ms": r4["metrics"]["mean_offset_ms"], "on_beat": r4["metrics"]["on_beat"]},
          without_music={"mean_offset_ms": r5["metrics"]["mean_offset_ms"], "on_beat": r5["metrics"]["on_beat"]})

    fsteps, _ = grade.expected_steps(figs, "follower")
    ftrack = synth_track(fsteps, spb, off, seed=5)
    r6, _ = run(ftrack, role="follower")
    r7, _ = run(ftrack, role="leader")
    check("synthetic: follower graded on her own feet", r6["metrics"]["foot_accuracy"] >= 0.9
          and r7["metrics"]["foot_accuracy"] < 0.5, as_follower=r6["metrics"]["foot_accuracy"],
          as_leader=r7["metrics"]["foot_accuracy"])

    still = synth_track(steps[:1], spb, off)
    try:
        ev, q = grade.detect_steps(still)
        grade.grade_events(ev, dance, figs, "leader", bpm, None, q)
        check("synthetic: a video with almost no steps is refused", False)
    except grade.GradeError as exc:
        check("synthetic: a video with almost no steps is refused", True, message=str(exc)[:90])


def music_tests() -> None:
    sr, dur, bpm, phase = 11025, 20, 120, 0.37
    rng = np.random.default_rng(1)
    x = 0.02 * rng.standard_normal(sr * dur)
    m = int(0.08 * sr)
    for k in range(int((dur - 0.6 - phase) * bpm / 60)):
        i = int((phase + k * 60 / bpm) * sr)
        x[i:i + m] += 0.3 * np.sin(2 * np.pi * (1320 if k % 4 == 0 else 880) * np.arange(m) / sr) * np.exp(-np.arange(m) / (0.02 * sr))
    env, dt, t0 = grade.onset_envelope(x, sr)
    g = grade.beat_grid(env, dt, t0, bpm)
    err = abs(((g["phase"] - phase + 0.25) % 0.5) - 0.25)
    check("music: metronome beat found at the right time", err < 0.02 and g["strength"] >= grade.MUSIC_MIN_STRENGTH,
          phase_error_ms=round(1000 * err, 1), strength=round(g["strength"], 2), bpm=g["bpm"])
    env, dt, t0 = grade.onset_envelope(0.05 * rng.standard_normal(sr * dur), sr)
    g = grade.beat_grid(env, dt, t0, bpm)
    check("music: noise is not taken for a beat", g["strength"] < grade.MUSIC_MIN_STRENGTH, strength=round(g["strength"], 2))


# ----------------------------------------------------------------------------- API
CHILD_501 = r"""
import sys
for m in ("mediapipe", "av", "numpy", "python_multipart", "multipart"):
    sys.modules[m] = None          # every optional import now fails, as on a base install
sys.path.insert(0, sys.argv[1])
from fastapi.testclient import TestClient
import main
c = TestClient(main.app)
h = c.get("/api/health").status_code
r = c.post("/api/grade", content=b"x", headers={"content-type": "multipart/form-data; boundary=zz"})
print(h, r.status_code, r.json()["detail"])
"""


def api_tests(clip: Path | None, dance: str, figures: list[str], bpm: float) -> None:
    out = subprocess.run([sys.executable, "-c", CHILD_501, str(REPO / "backend")], capture_output=True, text=True,
                         cwd=str(REPO), timeout=120)
    line = (out.stdout.strip().splitlines() or [""])[-1]
    check("api: without the extras the app starts and /api/grade answers 501 with the install hint",
          line.startswith("200 501 ") and grade.EXTRAS_MSG in line, got=line[:160])

    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    made: list[str] = []
    real_mkdtemp = tempfile.mkdtemp

    def spy(*a, **k):
        d = real_mkdtemp(*a, **k)
        made.append(d)
        return d

    grade.tempfile.mkdtemp = spy
    try:
        form = {"dance": "chacha", "figure_ids": "cc_basic_full", "role": "leader", "bpm": "120"}
        r = client.post("/api/grade", data={**form, "dance": "nope"}, files={"video": ("a.mp4", b"0" * 100, "video/mp4")})
        check("api: unknown dance -> 422", r.status_code == 422, detail=r.json().get("detail"))
        r = client.post("/api/grade", data=form, files={"video": ("a.mp4", b"not a video" * 50, "video/mp4")})
        check("api: unreadable video -> 422, temp folder deleted", r.status_code == 422 and made and not Path(made[-1]).exists(),
              detail=r.json().get("detail"))
        old = grade.MAX_BYTES
        grade.MAX_BYTES = 2000
        r = client.post("/api/grade", data=form, files={"video": ("a.mp4", b"0" * 5000, "video/mp4")})
        grade.MAX_BYTES = old
        check("api: too big -> 413, temp folder deleted", r.status_code == 413 and not Path(made[-1]).exists(),
              detail=r.json().get("detail"))
        r = client.post("/api/grade", data=form, files={"video": ("a.txt", b"hello", "text/plain")})
        check("api: not a video -> 415", r.status_code == 415, detail=r.json().get("detail"))
        grade._BUSY.acquire()
        try:
            r = client.post("/api/grade", data=form, files={"video": ("a.mp4", b"0", "video/mp4")})
        finally:
            grade._BUSY.release()
        check("api: one video at a time -> 429", r.status_code == 429, detail=r.json().get("detail"))
        if clip is not None:
            n0 = len(made)
            with open(clip, "rb") as fh:
                r = client.post("/api/grade", data={**form, "dance": dance, "figure_ids": json.dumps(figures), "bpm": str(bpm)},
                                files={"video": ("clip" + clip.suffix.lower(), fh, "video/quicktime")})
            body = r.json()
            ok = r.status_code == 200 and body.get("ok") and len(made) == n0 + 1 and not Path(made[-1]).exists()
            check("api: local team clip -> 200 report, temp folder deleted", bool(ok), status=r.status_code,
                  overall=body.get("overall"), metrics=body.get("metrics"), alignment=body.get("alignment"),
                  quality={k: v for k, v in (body.get("quality") or {}).items() if k != "notes"},
                  notes=(body.get("quality") or {}).get("notes"), tips=body.get("tips"), seconds=body.get("seconds"),
                  clip="local team clip (not in the repo)")
    finally:
        grade.tempfile.mkdtemp = real_mkdtemp
    check("api: no temp folder left behind", all(not Path(d).exists() for d in made), folders=len(made))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", type=Path, default=None, help="a local video (<= 60 s) for the 200 path")
    ap.add_argument("--dance", default="chacha")
    ap.add_argument("--figures", default="cc_basic_full,cc_basic_full")
    ap.add_argument("--bpm", type=float, default=105)
    a = ap.parse_args()
    missing = grade.extras_missing()
    if missing:
        raise SystemExit(grade.EXTRAS_MSG)
    synthetic_tests()
    music_tests()
    api_tests(a.clip, a.dance, [x for x in a.figures.split(",") if x], a.bpm)
    passed = sum(r["pass"] for r in RESULTS)
    print(f"\n{passed}/{len(RESULTS)} passed")
    (HERE / "grade_tests.json").write_text(json.dumps({"run_at": datetime.now().isoformat(timespec="seconds"),
                                                       "passed": passed, "total": len(RESULTS), "results": RESULTS}, indent=1))
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    main()
