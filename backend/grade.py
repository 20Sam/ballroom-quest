"""Grade a phone video of yourself dancing a Ballroom Quest routine (step timing, step count, feet).

Optional feature. It needs the extras in requirements-video.txt (mediapipe, av, numpy, python-multipart) and the
pose model in models/. Without them POST /api/grade answers 501 with an install hint and the rest of the app runs
as before: this module imports only the standard library (and catalog) at load time.

Pipeline, for ONE dancer filmed alone (with several people in frame, the largest, most central one is followed):
  1. PyAV decodes the clip (phone rotation fixed) at about 15 frames a second (more for short clips).
  2. MediaPipe PoseLandmarker (models/pose_landmarker_full.task) finds the ankles, heels and toes: the first frames
     count the people in the shot; alone, VIDEO mode tracks the dancer; with others in view, every frame is
     detected afresh and a tracker follows the same person.
  3. Foot landings: a foot that swings against the other, planted one (fast, far enough) and stops on the floor
     (not held in the air). Weight changes in place (a cha cha "replace"): the hips cross from one foot to the
     other. Brief left/right label swaps of the pose model are undone by continuity.
  4. The music's beat, when the sound has a clear one (onset envelope, phase and period near the tempo).
  5. The detected steps are aligned to the routine's expected step times (each figure's beats at the tempo): with
     the music, the routine starts on one of its beats; without it, the best start time with the tempo allowed to
     drift by up to +-5 %. Steps are then matched in order (dynamic programming).
  6. Grades: timing (share of steps within +-0.12 s and +-0.25 s), step count, left/right foot, per-figure timing,
     rhythm consistency, a confidence (against randomly re-ordered stepping); timeline data for a chart and tips.

Privacy: the upload is copied into a private temporary folder, read only by this process, and the folder is deleted
in a finally block whatever happens. Nothing about the video (its name, frames or landmarks) is logged or saved;
only the numeric report goes back to the browser. No AI model sees the video.

CLI (local test on a clip, prints the report):
  .venv/bin/python backend/grade.py VIDEO --dance chacha --figures cc_basic_full,cc_new_yorker --bpm 120 \
      [--role leader] [--start S --end E] [--first-step T] [--facing front|back]
"""
from __future__ import annotations

import importlib
import json
import math
import os
import shutil
import tempfile
import threading
import time
import warnings
from pathlib import Path

import catalog

REPO_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = REPO_DIR / "models" / "pose_landmarker_full.task"
EXTRAS_MSG = "Video grading needs the optional extras: pip install -r requirements-video.txt"
MAX_SECONDS = 60.0
MAX_BYTES = 300 * 1024 * 1024
MAX_FIGURES = 12
VIDEO_EXT = {".mov", ".mp4", ".m4v", ".webm", ".mkv", ".avi", ".3gp"}
ON_BEAT, CLOSE, MATCH = 0.12, 0.25, 0.35   # seconds: "on the beat", "close", farthest a step can be matched
MUSIC_MIN_STRENGTH = 2.0                   # onset strength on the beats / at a random phase, to trust the beat
FRAME_BUDGET = 900                         # frames analysed at most (60 s at 15 fps); short clips get more fps
FPS_MIN, FPS_MAX = 15.0, 24.0
MAX_SIDE = 960                             # frames are scaled down to this long side before pose detection
OTHER = {"L": "R", "R": "L"}
STILL_DIRS = {"replace", "in_place"}       # steps that change weight without moving the foot
QUICK_COUNTS = {"&", "a", "e"}

# landmark indices (MediaPipe pose, 33 points)
NOSE, L_SH, R_SH, L_HIP, R_HIP, L_KNEE, R_KNEE = 0, 11, 12, 23, 24, 25, 26
FOOT = {"L": (27, 29, 31), "R": (28, 30, 32)}  # ankle, heel, toe ("foot index")

_BUSY = threading.Lock()  # one video at a time: pose detection is CPU heavy


class GradeError(Exception):
    """A problem with the video the player can fix (shown to them as is)."""

    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


# ----------------------------------------------------------------------------- optional extras
def extras_missing() -> list[str]:
    """pip names of the optional packages that cannot be imported (empty = video grading available)."""
    os.environ.setdefault("GLOG_minloglevel", "2")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    missing = []
    for mods, pip in ((("numpy",), "numpy"), (("av",), "av"), (("mediapipe",), "mediapipe"),
                      (("python_multipart", "multipart"), "python-multipart")):
        for m in mods:
            try:
                importlib.import_module(m)
                break
            except Exception:  # ImportError, or a broken binary wheel
                continue
        else:
            missing.append(pip)
    return missing


# ----------------------------------------------------------------------------- the routine's expected steps
def expected_steps(figure_ids: list[str], role: str) -> tuple[list[dict], float]:
    """The player's own steps in order, with their start beat (as the game's timeline: each step lasts its beats).

    The follower dances the figure's follow_steps entry when it has one, else the mirror (other foot); a mirrored
    step moves exactly when his does, so only the foot changes. Returns (steps, total beats)."""
    figs = catalog.figures()
    out, beat = [], 0.0
    for fi, fid in enumerate(figure_ids):
        f = figs[fid]
        for si, st in enumerate(f["steps"]):
            foot, d, beats = st[0], st[1], float(st[2])
            weight = len(st) < 6 or bool(st[5])
            if role == "follower":
                o = (f.get("follow_steps") or {}).get(str(si))
                if isinstance(o, list) and o and o[0] in OTHER:
                    foot = o[0]
                    d = o[1] if len(o) > 1 else d
                    weight = o[2] if len(o) > 2 and isinstance(o[2], bool) else weight
                else:
                    foot = OTHER[foot]
            out.append({"i": len(out), "fig": fi, "fig_id": fid, "foot": foot, "moves": d not in STILL_DIRS,
                        "weight": weight, "beat": round(beat, 4), "count": str(st[4])})
            beat += beats
    return out, beat


# ----------------------------------------------------------------------------- video -> landmarks
def probe(path: Path) -> dict:
    import av
    with av.open(str(path)) as c:
        if not c.streams.video:
            raise GradeError("That file has no video track.")
        s = c.streams.video[0]
        dur = float(c.duration / 1e6) if c.duration else (float(s.duration * s.time_base) if s.duration else 0.0)
    return {"duration": round(dur, 2)}


def iter_frames(path: Path, fps: float, start: float = 0.0, end: float | None = None, max_side: int = MAX_SIDE,
                meta: dict | None = None):
    """Yield (t, upright RGB uint8 array) about `fps` times a second (t = seconds from the clip's first frame).

    Each yielded frame is the first decoded frame at or after its target time, and t is that frame's own time, so
    timing stays exact. Phone videos store a display rotation; it is applied here (np.rot90 turns counter-clockwise
    like PIL's rotate, the same sign as PyAV's frame.rotation)."""
    import av
    import numpy as np
    with av.open(str(path)) as c:
        s = c.streams.video[0]
        s.thread_type = "AUTO"
        t_first, k = None, 0
        for f in c.decode(s):
            if f.pts is None:
                continue
            t_abs = float(f.pts * s.time_base)
            if t_first is None:
                t_first = t_abs
                if meta is not None:
                    meta["t0_abs"] = t_first  # the clip's clock starts here (the sound is placed on the same clock)
            t = t_abs - t_first
            if t < start - 1e-6:
                continue
            if end is not None and t > end:
                break
            if t + 1e-6 < start + k / fps:
                continue
            while start + (k + 1) / fps <= t + 1e-6:  # skip targets this frame overshoots (variable frame rate)
                k += 1
            k += 1
            w, h = f.width, f.height
            sc = min(1.0, max_side / max(w, h))
            w2, h2 = max(2, int(round(w * sc / 2)) * 2), max(2, int(round(h * sc / 2)) * 2)
            img = f.to_ndarray(format="rgb24", width=w2, height=h2)
            rot = int(getattr(f, "rotation", 0) or 0)
            if rot % 360:
                img = np.rot90(img, (rot // 90) % 4)
            yield t, np.ascontiguousarray(img)


def _detections(result, W: int, H: int) -> list[dict]:
    import numpy as np
    out = []
    for nl, wl in zip(result.pose_landmarks, result.pose_world_landmarks):
        p = np.array([[l.x * W, l.y * H, l.visibility or 0.0] for l in nl], np.float32)
        w = np.array([[l.x, l.y, l.z] for l in wl], np.float32)
        good = p[p[:, 2] > 0.3, :2] if (p[:, 2] > 0.3).sum() >= 4 else p[:, :2]
        torso = float(np.linalg.norm(p[[L_HIP, R_HIP], :2].mean(0) - p[[L_SH, R_SH], :2].mean(0)))
        size = max(float(good[:, 1].max() - good[:, 1].min()), 3.2 * torso, 20.0)
        out.append({"p": p, "w": w, "hip": p[[L_HIP, R_HIP], :2].mean(0), "size": size,
                    "vis": float(p[[L_SH, R_SH, L_HIP, R_HIP, 25, 26, 27, 28], 2].mean())})
    return out


def track_video(path: Path, start: float = 0.0, end: float | None = None, fps: float | None = None,
                progress=None) -> dict:
    """Landmarks of the one dancer, frame by frame. Returns numpy arrays t (T,), P (T, 33, 3: x px, y px,
    visibility; NaN where the dancer was not found) and Wd (T, 33, 3: MediaPipe world metres, y down)."""
    import mediapipe as mp
    import numpy as np
    from mediapipe.tasks.python import BaseOptions, vision

    if not MODEL_PATH.exists():
        raise GradeError("The pose model is missing: models/pose_landmarker_full.task (see models/README.md).", 501)
    dur = probe(path)["duration"]
    span = (min(end, dur) if end is not None and dur else (end or dur or MAX_SECONDS)) - start
    if fps is None:
        fps = float(min(FPS_MAX, max(FPS_MIN, FRAME_BUDGET / max(span, 1.0))))
    def landmarker(mode, n):
        return vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(MODEL_PATH)), running_mode=mode, num_poses=n,
            min_pose_detection_confidence=0.4, min_pose_presence_confidence=0.4, min_tracking_confidence=0.4))

    # The first few frames run in IMAGE mode (up to 3 people) to see whether the dancer is alone. Alone, VIDEO mode
    # tracks the one pose from frame to frame (about twice as fast, and steadier). With a partner or onlookers in
    # the shot, every frame is detected afresh (IMAGE mode, 2 poses: VIDEO mode loses or swaps overlapping
    # people) and the tracker below keeps following the same person.
    PROBE_FRAMES = 3
    ts, P, Wd = [], [], []
    prev, lost_since, size_wh, others = None, None, None, 0
    t0 = time.time()
    probe_lm, video_lm = landmarker(vision.RunningMode.IMAGE, 3), None
    try:
        meta: dict = {}
        for k, (t, rgb) in enumerate(iter_frames(path, fps, start, end, meta=meta)):
            if t - start > MAX_SECONDS + 0.5:
                raise GradeError(f"Please trim the video to {MAX_SECONDS:.0f} seconds or less.")
            H, W = rgb.shape[:2]
            size_wh = (W, H)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            if k < PROBE_FRAMES:
                dets = _detections(probe_lm.detect(image), W, H)
                big = max((d["size"] for d in dets), default=0)
                others = max(others, sum(d["size"] > 0.5 * big for d in dets) - 1)
            else:
                if video_lm is None:
                    probe_lm.close()
                    probe_lm = None
                    video_lm = landmarker(vision.RunningMode.IMAGE if others else vision.RunningMode.VIDEO, 2 if others else 1)
                res = video_lm.detect(image) if others else video_lm.detect_for_video(image, int(round(t * 1000)))
                dets = _detections(res, W, H)
            chosen = None
            if dets and video_lm is not None and not others:
                chosen = dets[0]  # alone: VIDEO mode already tracks the one dancer
            elif dets and prev is not None:
                # follow the same person: nearest hips (in body sizes), similar size
                def cost(d):
                    return float(np.linalg.norm(d["hip"] - prev["hip"])) / prev["size"] + 0.5 * abs(math.log(d["size"] / prev["size"]))
                best = min(dets, key=cost)
                if cost(best) < 0.35 + 0.6 * (t - prev["t"]):
                    chosen = best
                elif lost_since is not None and t - lost_since > 1.0:
                    prev = None  # lost for a second: pick again below
            if dets and prev is None and chosen is None:
                # the largest, most central, best seen person
                chosen = max(dets, key=lambda d: d["size"] * (1.2 - abs(d["hip"][0] / W - 0.5)) * (0.5 + d["vis"]))
            if chosen is not None:
                prev = {**chosen, "t": t}
                lost_since = None
                P.append(chosen["p"]); Wd.append(chosen["w"])
            else:
                lost_since = t if lost_since is None else lost_since
                P.append(np.full((33, 3), np.nan, np.float32)); Wd.append(np.full((33, 3), np.nan, np.float32))
            ts.append(t)
            if progress and k % 30 == 0:
                progress(t, span)
    finally:
        for lm in (probe_lm, video_lm):
            if lm is not None:
                lm.close()
    if not ts:
        raise GradeError("I couldn't read any frames from that video. Try an .mp4 or .mov straight from your phone.")
    return {"t": np.array(ts), "P": np.array(P), "Wd": np.array(Wd), "fps": round(fps, 2), "frame_size": size_wh,
            "seconds": round(time.time() - t0, 1), "others_in_shot": int(others), "t0_abs": meta.get("t0_abs", 0.0)}


# ----------------------------------------------------------------------------- landmarks -> steps
def _fill(x, max_gap: int):
    """Linear interpolation over NaN runs of at most max_gap rows (per column); longer gaps stay NaN."""
    import numpy as np
    x = np.array(x, np.float64)
    flat = x.reshape(len(x), -1)
    for c in range(flat.shape[1]):
        v = flat[:, c]
        ok = np.isfinite(v)
        if ok.sum() < 2:
            continue
        idx = np.flatnonzero(ok)
        filled = np.interp(np.arange(len(v)), idx, v[idx])
        # only gaps that are short and inside the valid range
        gap_len = np.zeros(len(v), int)
        for a, b in zip(idx[:-1], idx[1:]):
            if b - a > 1:
                gap_len[a + 1:b] = b - a - 1
        put = ~ok & (gap_len > 0) & (gap_len <= max_gap)
        v[put] = filled[put]
    return flat.reshape(x.shape)


def _smooth(x, sigma: float):
    """Gaussian smoothing along axis 0 that ignores NaNs (sigma in frames)."""
    import numpy as np
    x = np.array(x, np.float64)
    if sigma <= 0.05 or len(x) < 3:
        return x
    r = max(1, min(int(3 * sigma), (len(x) - 1) // 2))  # np.convolve "same" needs the kernel no longer than x
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    ok = np.isfinite(x)
    num = np.apply_along_axis(lambda v: np.convolve(v, k, mode="same"), 0, np.where(ok, x, 0.0))
    den = np.apply_along_axis(lambda v: np.convolve(v, k, mode="same"), 0, ok.astype(float))
    out = num / np.maximum(den, 1e-9)
    out[~ok] = np.nan
    return out


def _continuity(P):
    """Two foot tracks, A and B, that never jump from one foot to the other.

    MediaPipe sometimes swaps its left and right labels for a few frames (legs crossing, a turn, a side view), which
    would look like both feet flying across. Each frame the two labelled feet are handed to whichever track they
    continue with the least motion. a_is_L[i] says whether track A carried MediaPipe's left label in frame i; a
    step's foot is the label its track carried for most of the moment around it."""
    import numpy as np
    T = len(P)
    with warnings.catch_warnings():  # frames where the dancer was not found are all-NaN: they stay NaN
        warnings.simplefilter("ignore", RuntimeWarning)
        c = {s: np.nanmean(P[:, list(FOOT[s]), :2], axis=1) for s in "LR"}
    a_is_L = np.ones(T, bool)
    last = None
    for i in range(T):
        if not (np.isfinite(c["L"][i]).all() and np.isfinite(c["R"][i]).all()):
            a_is_L[i] = a_is_L[i - 1] if i else True
            continue
        if last is not None:
            keep = np.linalg.norm(c["L"][i] - last[0]) + np.linalg.norm(c["R"][i] - last[1])
            swap = np.linalg.norm(c["R"][i] - last[0]) + np.linalg.norm(c["L"][i] - last[1])
            a_is_L[i] = keep <= swap
        last = (c["L"][i], c["R"][i]) if a_is_L[i] else (c["R"][i], c["L"][i])
    return a_is_L


def detect_steps(track: dict, facing: str = "front") -> tuple[list[dict], dict]:
    """Foot landings and in-place weight changes of the tracked dancer.

    Returns (events sorted by time: {t, foot, kind: land|shift, strength}, quality dict)."""
    import numpy as np
    t = np.asarray(track["t"], np.float64)
    P = np.array(track["P"], np.float64)
    Wd = np.array(track["Wd"], np.float64)
    T = len(t)
    fps = float(track.get("fps") or (1 / np.median(np.diff(t)) if T > 1 else 15))
    ok = np.isfinite(P[:, L_HIP, 0])
    quality = {"frames": int(T), "fps": round(fps, 2), "tracked": round(float(ok.mean()) if T else 0.0, 3)}
    if T < 8 or ok.sum() < max(8, 0.2 * T):
        return [], {**quality, "notes": ["I could not find a dancer in most of the video."]}
    if facing == "back":  # back to the camera: the model labels the dancer as if facing it
        for L, R in zip((L_SH, L_HIP, L_KNEE) + FOOT["L"], (R_SH, R_HIP, R_KNEE) + FOOT["R"]):
            P[:, [L, R]] = P[:, [R, L]]
            Wd[:, [L, R]] = Wd[:, [R, L]]
    # body scale: leg length in pixels (hip-knee-ankle), robust and smoothed (dancer may move nearer the camera)
    leg = np.fmax(np.linalg.norm(P[:, L_HIP, :2] - P[:, L_KNEE, :2], axis=1) + np.linalg.norm(P[:, L_KNEE, :2] - P[:, 27, :2], axis=1),
                  np.linalg.norm(P[:, R_HIP, :2] - P[:, R_KNEE, :2], axis=1) + np.linalg.norm(P[:, R_KNEE, :2] - P[:, 28, :2], axis=1))
    leg_med = float(np.nanmedian(leg))
    scale = _fill(_smooth(np.where(np.isfinite(leg), np.clip(leg, 0.7 * leg_med, 1.3 * leg_med), np.nan), fps * 0.7), int(fps * 2))
    scale = np.where(np.isfinite(scale), scale, leg_med)
    max_gap = int(round(0.4 * fps))
    sig = max(0.8, 0.06 * fps)

    a_is_L = _continuity(P)
    quality["label_swaps_fixed"] = int(np.count_nonzero(np.diff(a_is_L.astype(int))))
    sel = {"A": np.where(a_is_L, 1, 0), "B": np.where(a_is_L, 0, 1)}  # 1 = this track is MediaPipe's L this frame
    raw = {}
    for k in "AB":
        pts = np.where(sel[k][:, None, None] == 1, P[:, list(FOOT["L"]), :], P[:, list(FOOT["R"]), :])
        wy = np.where(sel[k] == 1, Wd[:, FOOT["L"][0], 1], Wd[:, FOOT["R"][0], 1])
        raw[k] = (pts, wy)
    with warnings.catch_warnings():  # all-NaN frames (dancer not found) stay NaN
        warnings.simplefilter("ignore", RuntimeWarning)
        vis = {k: np.nanmean(raw[k][0][:, :, 2], axis=1) for k in "AB"}
        feet = {k: _smooth(_fill(np.nanmean(raw[k][0][:, :, :2], axis=1), max_gap), sig) for k in "AB"}
    feet_w = {k: _smooth(_fill(raw[k][1], max_gap), sig) for k in "AB"}  # world y (down) of the ankle
    hip = _smooth(_fill(P[:, [L_HIP, R_HIP], :2].mean(1), max_gap), sig)
    other = {"A": "B", "B": "A"}
    win = max(2, int(round(0.3 * fps)))

    def label(k, a, b):
        """The foot (L/R) track k was labelled as for most of frames a..b (plus a little either side)."""
        lab = sel[k][max(0, a - win):min(T, b + win + 1)]
        return "L" if lab.mean() >= 0.5 else "R"

    # A step moves one foot against the other, planted one. Motion both feet share (the dancer drifting, the
    # camera wobbling, the pose jittering) is removed: each frame only the faster foot gets a speed, measured
    # against the other foot (leg lengths per second).
    V = {k: np.gradient(feet[k], t, axis=0) / scale[:, None] for k in "AB"}
    sp = {k: np.nan_to_num(np.linalg.norm(V[k], axis=1)) for k in "AB"}
    rel = np.nan_to_num(np.linalg.norm(V["A"] - V["B"], axis=1))
    own = {k: np.where(sp[k] >= sp[other[k]], rel, 0.0) for k in "AB"}
    moving_all = np.concatenate([own["A"], own["B"]])
    p90 = float(np.percentile(moving_all[moving_all > 0], 90)) if (moving_all > 0).any() else 1.0
    hi = float(np.clip(0.45 * p90, 0.6, 2.5))
    lo = 0.45 * hi
    quality["speed_thresholds"] = [round(lo, 2), round(hi, 2)]
    events = []
    for k in "AB":
        F, v = feet[k], own[k]
        moving = v > lo
        i = 0
        while i < T:
            if not moving[i]:
                i += 1
                continue
            a = i
            while i < T and moving[i]:
                i += 1
            b = i  # first still frame after the swing (or T)
            if b >= T or a == 0:
                continue
            pk = int(a + np.argmax(v[a:b]))
            if v[pk] < hi or not (np.isfinite(F[a - 1]).all() and np.isfinite(F[b]).all()):
                continue
            disp = float(np.linalg.norm(F[b] - F[a - 1]) / scale[b])
            if disp < 0.1:
                continue
            # the foot must be down when it stops (not held in the air): not clearly higher than the other foot
            o = other[k]
            lift = feet_w[o][b] - feet_w[k][b] if np.isfinite(feet_w[o][b]) and np.isfinite(feet_w[k][b]) else 0.0
            if lift > 0.09:
                continue
            # landing time: where the speed falls back through `lo` (interpolated between frames)
            u = (v[b - 1] - lo) / max(v[b - 1] - v[b], 1e-9)
            tl = float(t[b - 1] + min(max(u, 0.0), 1.0) * (t[b] - t[b - 1]))
            conf = float(np.nanmean(vis[k][a:b + 1])) if np.isfinite(vis[k][a:b + 1]).any() else 0.5
            events.append({"t": tl, "foot": label(k, a, b), "kind": "land",
                           "strength": round(min(1.0, disp / 0.3) * conf, 3)})

    # weight changes in place: the hips cross over from one foot to the other (image x; only while the feet are
    # far enough apart to tell)
    sep = (feet["A"][:, 0] - feet["B"][:, 0]) / scale
    with np.errstate(invalid="ignore", divide="ignore"):
        wa = (hip[:, 0] - feet["B"][:, 0]) / (feet["A"][:, 0] - feet["B"][:, 0])  # 1 = over foot A
    wa = _smooth(np.where(np.abs(sep) > 0.12, np.clip(wa, -0.5, 1.5), np.nan), sig)
    state, last_i = None, None
    shifts = []
    for i in range(T):
        x = wa[i]
        if not np.isfinite(x):
            continue
        new = "A" if x > 0.68 else "B" if x < 0.32 else None
        if new and state and new != state:
            tc = float(t[i])  # where wa passed 0.5 on the way over (interpolated between frames)
            for j in range(last_i + 1, i + 1):
                a_, b_ = wa[j - 1], wa[j]
                if np.isfinite(a_) and np.isfinite(b_) and a_ != b_ and (a_ - 0.5) * (b_ - 0.5) <= 0:
                    tc = float(t[j - 1] + (0.5 - a_) / (b_ - a_) * (t[j] - t[j - 1]))
                    break
            shifts.append({"t": tc, "foot": label(new, i, i), "kind": "shift", "strength": 0.6})
        if new:
            state, last_i = new, i
    lands = list(events)
    for sh in shifts:  # a weight change that comes with a landing of that foot is the same step
        if not any(e["foot"] == sh["foot"] and -0.3 < sh["t"] - e["t"] < 0.2 for e in lands):
            events.append(sh)
    events.sort(key=lambda e: e["t"])
    # merge double detections of one landing (same foot, very close)
    merged = []
    for e in events:
        if merged and merged[-1]["foot"] == e["foot"] and e["t"] - merged[-1]["t"] < 0.1:
            if e["strength"] > merged[-1]["strength"]:
                merged[-1] = e
            continue
        merged.append(e)
    for e in merged:
        e["t"] = round(e["t"], 3)
    # camera view: shoulder width against torso height (front ~0.5+, side ~0.2)
    sw = np.linalg.norm(P[:, L_SH, :2] - P[:, R_SH, :2], axis=1)
    th = np.linalg.norm(P[:, [L_SH, R_SH], :2].mean(1) - P[:, [L_HIP, R_HIP], :2].mean(1), axis=1)
    ratio = float(np.nanmedian(sw / np.maximum(th, 1e-6))) if np.isfinite(sw).any() else float("nan")
    quality["view"] = "front" if ratio > 0.45 else "side" if ratio < 0.25 else "mixed"
    quality["leg_px"] = round(leg_med, 1)
    quality["landings"] = sum(e["kind"] == "land" for e in merged)
    quality["weight_changes"] = sum(e["kind"] == "shift" for e in merged)
    return merged, quality


# ----------------------------------------------------------------------------- the music's beat (from the sound)
def onset_envelope(x, sr: int, hop: int = 128, win: int = 512):
    """Spectral-flux onset strength, one value per hop. The low band (kick, bass, conga: < 300 Hz) and the full band
    are normalised separately and added (the low band twice), so the beat's low drums outweigh bright offbeat
    hi-hats.
    Returns (envelope, seconds per value, time of value 0)."""
    import numpy as np
    if len(x) < win * 2:
        return np.zeros(0), hop / sr, 0.0
    frames = np.lib.stride_tricks.sliding_window_view(x.astype(np.float32), win)[::hop] * np.hanning(win).astype(np.float32)
    mag = np.log1p(100.0 * np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.maximum(np.diff(mag, axis=0), 0.0)
    low = int(300 / (sr / win)) + 1
    k = max(3, int(0.5 * sr / hop)) | 1
    edge = int(0.25 * sr / hop)
    env = np.zeros(len(flux))
    for weight, band in ((1.0, flux.sum(1)), (2.0, flux[:, :low].sum(1))):
        band = np.maximum(band - np.convolve(band, np.ones(k) / k, mode="same"), 0.0)  # sharp attacks only
        band[:edge] = 0.0  # the recording switching on is not a beat
        band[-edge:] = 0.0
        top = np.percentile(band, 98) if band.any() else 1.0
        env += weight * np.minimum(band / (top + 1e-9), 1.0)  # a few huge attacks (a clap, a bump) don't dominate
    # flux value i compares the windows starting at i and i + 1 hops; an attack shows most when it sits about
    # three quarters into the window (calibrated on synthetic clicks), hence the time of value 0
    return env / 3.0, hop / sr, (hop + 0.75 * win) / sr


def beat_grid(env, dt_env: float, t_offset: float, bpm: float) -> dict | None:
    """The beat times of the music at about the routine's tempo: phase and period (within +-3 % of bpm) with the
    most onset strength on the beats. strength = onset strength on those beats over the median phase's."""
    import numpy as np
    if len(env) < int(4 / dt_env):
        return None
    times = t_offset + np.arange(len(env)) * dt_env
    sm = _smooth(env, max(0.8, 0.02 / dt_env))  # tolerate a little jitter in the attacks
    best = None
    for kk in np.arange(0.97, 1.03001, 0.0025):
        period = 60.0 / bpm * kk
        phases = np.arange(0.0, period, 0.005)
        nb = int((times[-1] - times[0]) / period)
        if nb < 4:
            return None
        grid = times[0] + phases[:, None] + np.arange(nb)[None, :] * period
        sc = np.interp(grid, times, sm).mean(1)
        i = int(np.argmax(sc))
        if best is None or sc[i] > best["score"]:
            best = {"score": float(sc[i]), "phase": float(times[0] + phases[i]), "period": float(period),
                    "strength": float(sc[i] / (np.median(sc) + 1e-3))}
    best["bpm"] = round(60.0 / best["period"], 2)
    return best


def music_grid(path: Path, bpm: float, video_t0: float, end: float | None = None) -> dict | None:
    """Decode the clip's sound (if any) and find the music's beat; None when there is no clear beat."""
    import av
    import numpy as np
    sr = 11025
    chunks, t_first = [], None
    limit = sr * ((end or MAX_SECONDS) + 2)
    try:
        with av.open(str(path)) as c:
            if not c.streams.audio:
                return None
            a = c.streams.audio[0]
            res = av.AudioResampler(format="flt", layout="mono", rate=sr)
            n = 0
            for fr in c.decode(a):
                if t_first is None and fr.pts is not None:
                    t_first = float(fr.pts * a.time_base)
                for o in res.resample(fr):
                    arr = o.to_ndarray().reshape(-1)
                    chunks.append(arr)
                    n += len(arr)
                if n > limit:
                    break
    except av.error.FFmpegError:
        return None
    if not chunks:
        return None
    x = np.concatenate(chunks)
    if float(np.sqrt(np.mean(x ** 2))) < 1e-3:  # silent
        return None
    env, dt_env, t_env0 = onset_envelope(x, sr)
    grid = beat_grid(env, dt_env, (t_first or 0.0) - video_t0 + t_env0, bpm)
    if grid is None or grid["strength"] < MUSIC_MIN_STRENGTH:
        return None
    return grid


# ----------------------------------------------------------------------------- alignment + grades
def align(tau, steps: list[dict], events: list[dict], first_step: float | None = None, grid: dict | None = None,
          spb: float | None = None) -> dict:
    """Best global start time `offset` and tempo factor `k` so that the expected step times offset + k * tau fall
    on detected steps. Gaussian closeness score (sigma 0.08 s), with a small bonus when the foot agrees.

    With the music's beat grid, the routine must start on a beat of the music at the music's tempo, so being early
    or late against the music shows in the grades; without it, only the steps' timing relative to each other does."""
    import numpy as np
    tau = np.asarray(tau, np.float64)
    ev = np.array([e["t"] for e in events], np.float64)
    ev_foot = np.array([e["foot"] for e in events])
    exp_foot = np.array([s["foot"] for s in steps])
    span = float(tau[-1]) if len(tau) else 0.0
    if first_step is not None:
        lo, hi = first_step - 0.6, first_step + 0.6
    else:
        lo, hi = float(ev.min()) - 0.6 - span * 0.5, float(ev.max()) + 0.6
    lo = max(lo, -0.2)  # the routine cannot start before the video does
    order = np.argsort(ev)
    ev, ev_foot = ev[order], ev_foot[order]

    def score(offsets, k, sigma=0.08):
        pred = offsets[:, None] + k * tau[None, :]
        j = np.clip(np.searchsorted(ev, pred), 1, len(ev) - 1)
        jj = np.where(np.abs(pred - ev[j - 1]) < np.abs(pred - ev[j]), j - 1, j)  # nearest detected step
        g = np.exp(-0.5 * ((pred - ev[jj]) / sigma) ** 2)
        return (g * (1.0 + 0.2 * (ev_foot[jj] == exp_foot[None, :]))).sum(1)

    if grid is not None:
        k = grid["period"] / spb  # the dancer's beat is the music's beat
        n0, n1 = math.floor((lo - 0.35 - grid["phase"]) / grid["period"]), math.ceil((hi + 0.35 - grid["phase"]) / grid["period"])
        offsets = grid["phase"] + np.arange(n0, n1 + 1) * grid["period"]
        offsets = offsets[offsets >= -0.2] if (offsets >= -0.2).any() else offsets
        if first_step is not None:
            near = offsets[np.abs(offsets - first_step) <= max(0.6, grid["period"] / 2)]
            offsets = near if len(near) else offsets[[int(np.argmin(np.abs(offsets - first_step)))]]
        # a few beats look likely by a loose closeness (a late dancer is still near the right beat); the in-order
        # matching then decides which beat the routine starts on
        sc = score(offsets, k, sigma=0.2)
        best = None
        for i in np.argsort(-sc)[:6]:
            val = _dp(offsets[i] + k * tau, steps, events)[0]
            if best is None or val > best["score"]:
                best = {"score": float(val), "offset": float(offsets[i]), "k": float(k)}
        return best
    best = (-1.0, lo, 1.0)
    offsets = np.arange(lo, hi + 1e-9, 0.02)
    for k in np.arange(0.95, 1.0501, 0.01):
        sc = score(offsets, k)
        i = int(np.argmax(sc))
        if sc[i] > best[0]:
            best = (float(sc[i]), float(offsets[i]), float(k))
    # refine around the best
    _, o0, k0 = best
    offsets = np.arange(o0 - 0.03, o0 + 0.0301, 0.005)
    for k in np.arange(k0 - 0.01, k0 + 0.01001, 0.0025):
        sc = score(offsets, k)
        i = int(np.argmax(sc))
        if sc[i] > best[0]:
            best = (float(sc[i]), float(offsets[i]), float(k))
    return {"score": best[0], "offset": best[1], "k": best[2]}


def _step_score(dt: float | None) -> float:
    """Same scale as the game's Perfect / Good / Almost / Miss."""
    if dt is None:
        return 0.0
    a = abs(dt)
    return 1.0 if a <= ON_BEAT else 0.6 if a <= CLOSE else 0.3


def _match(pred, steps: list[dict], events: list[dict]) -> tuple[dict, dict]:
    return _dp(pred, steps, events)[1:]


def _dp(pred, steps: list[dict], events: list[dict]) -> tuple[float, dict, dict]:
    """Match expected steps to detected steps in order (each used once, no crossing), maximising closeness; a step
    on the other foot counts as 80 ms further away, a routine step left unmatched costs about as much as a match
    gains (so the routine is not slid along to skip its first steps). In order matters: when a dancer is late by most of a quick
    step, the nearest detected step may be the neighbouring step's, but the sequence as a whole is not.
    Returns (total closeness, {step i: (event j, dt)}, {event j: step i})."""
    lo_t, hi_t = float(pred[0]) - MATCH, float(pred[-1]) + MATCH
    order = sorted((j for j in range(len(events)) if lo_t <= events[j]["t"] <= hi_t), key=lambda j: events[j]["t"])
    n, m = len(pred), len(order)
    miss, extra = 0.3, 0.05  # a routine step with no detected step costs nearly a match; a stray detection, little
    V = [[-extra * j for j in range(m + 1)]] + [[-miss * i] + [0.0] * m for i in range(1, n + 1)]
    B = [[2] * (m + 1)] + [[1] + [0] * m for _ in range(n)]  # 0 = match, 1 = step unmatched, 2 = detection unmatched
    for i in range(1, n + 1):
        p, foot = float(pred[i - 1]), steps[i - 1]["foot"]
        Vi, Vp, Bi = V[i], V[i - 1], B[i]
        for j in range(1, m + 1):
            best, how = Vp[j] - miss, 1
            if Vi[j - 1] - extra > best:
                best, how = Vi[j - 1] - extra, 2
            e = events[order[j - 1]]
            dt = e["t"] - p
            if abs(dt) <= MATCH:
                val = Vp[j - 1] + MATCH + 0.1 - abs(dt) - (0.08 if e["foot"] != foot else 0.0)
                if val > best:
                    best, how = val, 0
            Vi[j], Bi[j] = best, how
    m_exp, m_ev = {}, {}
    total = V[n][m]
    i, j = n, m
    while i > 0 and j > 0:
        how = B[i][j]
        if how == 0:
            ej = order[j - 1]
            m_exp[i - 1], m_ev[ej] = (ej, events[ej]["t"] - float(pred[i - 1])), i - 1
            i, j = i - 1, j - 1
        elif how == 1:
            i -= 1
        else:
            j -= 1
    return total, m_exp, m_ev


def chance_on_beat(tau, steps: list[dict], events: list[dict], first_step: float | None, grid: dict | None = None,
                   spb: float | None = None, runs: int = 4) -> float:
    """How often steps land 'on the beat' by luck: the same number of detected steps, with the same gaps between
    them in a random order, aligned the same way. Dense, regular stepping matches any routine of that dance
    fairly well, so the grade's confidence is how far the real alignment beats this."""
    import numpy as np
    rng = np.random.default_rng(0)
    ts = np.sort([e["t"] for e in events])
    gaps = np.diff(ts)
    feet = [e["foot"] for e in events]
    out = []
    for _ in range(runs):
        fake_t = ts[0] + np.concatenate([[0.0], np.cumsum(rng.permutation(gaps))])
        fake = [{"t": float(x), "foot": f} for x, f in zip(fake_t, rng.permutation(feet))]
        al = align(tau, steps, fake, first_step, grid, spb)
        m, _ = _match(al["offset"] + al["k"] * np.asarray(tau), steps, fake)
        out.append(sum(abs(dt) <= ON_BEAT for _, dt in m.values()) / len(steps))
    return float(np.mean(out))


def grade_events(events: list[dict], dance: str, figure_ids: list[str], role: str, bpm: float,
                 first_step: float | None = None, quality: dict | None = None, grid: dict | None = None) -> dict:
    """Align detected steps to the routine and grade them (pure numbers, no video needed: used by the tests)."""
    import numpy as np
    quality = dict(quality or {})
    figs = catalog.figures()
    steps, total_beats = expected_steps(figure_ids, role)
    spb = 60.0 / bpm
    tau = np.array([s["beat"] * spb for s in steps])
    notes = list(quality.pop("notes", []))
    if len(events) < max(3, 0.25 * len(steps)):
        raise GradeError("I could only find %d steps in the video, too few to grade. Film your whole body (head to "
                         "feet) from the front or side, in good light, with the phone propped still." % len(events))
    al = align(tau, steps, events, first_step, grid, spb)
    offbeat = False
    if grid is not None:
        # loud offbeat accents (hi-hats, guiro) can make the half-beat look like the beat: if the steps clearly
        # follow the grid shifted by half a beat, that is the beat
        # (a dancer late or early by up to about a third of a beat is still graded against the music's beat)
        m0, _ = _match(al["offset"] + al["k"] * tau, steps, events)
        lag = abs(float(np.mean([dt for _, dt in m0.values()]))) if m0 else 0.0
        alt = {**grid, "phase": grid["phase"] + grid["period"] / 2}
        al2 = align(tau, steps, events, first_step, alt, spb)
        if lag > 0.38 * grid["period"] and al2["score"] > al["score"]:
            grid, al, offbeat = alt, al2, True
    pred = al["offset"] + al["k"] * tau
    m_exp, m_ev = _match(pred, steps, events)
    dts = np.array([m_exp[i][1] for i in sorted(m_exp)]) if m_exp else np.array([])
    n = len(steps)
    win0, win1 = pred[0] - 0.4, pred[-1] + 0.4
    in_win = [j for j, e in enumerate(events) if win0 <= e["t"] <= win1]
    on_beat = float(np.mean([i in m_exp and abs(m_exp[i][1]) <= ON_BEAT for i in range(n)]))
    close = float(np.mean([i in m_exp and abs(m_exp[i][1]) <= CLOSE for i in range(n)]))
    timing = float(np.mean([_step_score(m_exp[i][1] if i in m_exp else None) for i in range(n)]))
    step_count = max(0.0, 1.0 - abs(len(in_win) - n) / n)
    # left/right: landings carry the foot that moved; weight changes the foot that took the weight
    foot_ok = [events[m_exp[i][0]]["foot"] == steps[i]["foot"] for i in m_exp]
    foot_acc = float(np.mean(foot_ok)) if foot_ok else 0.0
    foot_mirror = float(np.mean([not x for x in foot_ok])) if foot_ok else 0.0
    spread = float(np.std(dts)) if len(dts) >= 3 else float("nan")
    mean_dt = float(np.mean(dts)) if len(dts) else 0.0
    consistency = float(np.clip(1.0 - (spread - 0.03) / 0.09, 0.0, 1.0)) if np.isfinite(spread) else 0.0
    overall = 0.45 * timing + 0.15 * step_count + 0.2 * foot_acc + 0.2 * consistency
    chance = chance_on_beat(tau, steps, events, first_step, grid, spb)
    confidence = float(np.clip((on_beat - chance) / max(1.0 - chance, 1e-6), 0.0, 1.0))
    conf_label = "high" if confidence >= 0.5 else "medium" if confidence >= 0.25 else "low"

    per_fig = []
    for fi, fid in enumerate(figure_ids):
        idx = [s["i"] for s in steps if s["fig"] == fi]
        sc = [_step_score(m_exp[i][1] if i in m_exp else None) for i in idx]
        per_fig.append({"index": fi, "id": fid, "name": figs[fid]["name"], "steps": len(idx),
                        "found": sum(i in m_exp for i in idx),
                        "on_beat": sum(i in m_exp and abs(m_exp[i][1]) <= ON_BEAT for i in idx),
                        "right_foot": sum(i in m_exp and events[m_exp[i][0]]["foot"] == steps[i]["foot"] for i in idx),
                        "score": round(float(np.mean(sc)) if sc else 0.0, 3),
                        "t0": round(float(pred[idx[0]]), 3), "t1": round(float(pred[idx[-1]]), 3)})

    # tips, most useful first
    tips = []
    if grid is not None and len(dts) >= 4 and abs(mean_dt) > 0.06:
        ms = int(round(abs(mean_dt) * 1000))
        tips.append(f"You land about {ms} ms after the beat: start moving the foot a little earlier so the weight "
                    f"arrives on the count." if mean_dt > 0 else
                    f"You land about {ms} ms before the beat (rushing): wait for the music and let each step "
                    f"take its full time.")
    worst = min(per_fig, key=lambda f: f["score"])
    if worst["score"] < 0.75 and len(per_fig) > 1:
        tips.append(f"Practise the {worst['name']} slowly: {worst['on_beat']} of {worst['steps']} steps were on the beat.")
    quick = [i for i, s in enumerate(steps) if s["count"] in QUICK_COUNTS]
    if quick and len(quick) < n:
        qs = np.mean([_step_score(m_exp[i][1] if i in m_exp else None) for i in quick])
        rest = np.mean([_step_score(m_exp[i][1] if i in m_exp else None) for i in range(n) if i not in quick])
        if rest - qs > 0.2:
            tips.append("The quick counts (the '&' steps, like the 4-&-1 chasse) are where the timing slips: keep "
                        "those steps small and under your body.")
    labels_swapped = foot_ok and len(foot_ok) >= 6 and foot_mirror >= 0.75
    if labels_swapped:
        notes.append("Left and right look swapped on most steps. If your back was to the camera, choose "
                     "'my back' and grade again; otherwise check that you start on the right foot.")
        tips.append(f"Most steps were on the other foot: the routine starts on your {steps[0]['foot']} foot "
                    f"(or the camera swapped your feet; see the note below).")
    elif foot_ok and foot_acc < 0.7:
        wrong = [f["name"] for f in per_fig if f["found"] and f["right_foot"] < f["found"]]
        tips.append(f"Check your feet: {len(foot_ok) - sum(foot_ok)} matched steps were on the other foot"
                    + (f" (in {', '.join(dict.fromkeys(wrong[:2]))})." if wrong else "."))
    if len(in_win) > 1.25 * n:
        tips.append(f"I saw {len(in_win)} steps where the routine has {n}: keep the feet still between counts "
                    "(no extra weight changes).")
    elif len(in_win) < 0.75 * n:
        tips.append("Some steps were missing or too small for the camera: make every step a clear weight change.")
    if np.isfinite(spread) and spread > 0.09:
        tips.append(f"Your timing wanders (about ±{int(spread * 1000)} ms): practise with the metronome at a "
                    "slower tempo, then speed up.")
    if not tips:
        tips.append("Lovely, even timing. Try it at full competition tempo next.")
    if quality.get("tracked", 1) < 0.8:
        notes.append(f"I could see you in {quality['tracked']:.0%} of the frames; keep your whole body in view.")
    if len(m_exp) < 0.5 * n:
        notes.append("Fewer than half of the routine's steps matched. Check the tempo (bpm) is the one you danced "
                     "to and that the whole routine is in the video.")
    if conf_label == "low":
        notes.append(f"Low confidence: random stepping at this density would score {chance:.0%} on the beat, so the "
                     "video does not clearly follow this routine's rhythm (or the camera could not see the feet "
                     "well). Treat this grade as rough.")
    if grid is None:
        notes.append("No clear music beat in the video's sound, so I graded your rhythm (your steps against each "
                     "other at this tempo), not whether you are early or late against the music. Dance to music or "
                     "the game's metronome, with the sound on, to be graded against the beat.")
    if quality.get("others_in_shot"):
        notes.append("Someone else was in the shot; I followed the largest, most central dancer.")
    if quality.get("view") == "mixed":
        notes.append("Filming straight from the front or side gives the clearest feet.")

    pct = round(100 * overall)
    label = ("Beautiful!" if pct >= 85 else "Nice dancing!" if pct >= 70 else "Getting there!" if pct >= 50
             else "Good start!")
    return {
        "ok": True, "overall": pct, "label": label,
        "metrics": {
            "timing_score": round(timing, 3), "on_beat": round(on_beat, 3), "close": round(close, 3),
            "steps_expected": n, "steps_detected": len(in_win), "steps_matched": len(m_exp),
            "step_count_score": round(step_count, 3), "foot_accuracy": round(foot_acc, 3), "foot_checked": len(foot_ok),
            "consistency": round(consistency, 3),
            "spread_ms": int(round(spread * 1000)) if np.isfinite(spread) else None,
            "mean_offset_ms": int(round(mean_dt * 1000)),
            "chance_on_beat": round(chance, 3), "confidence": round(confidence, 3), "confidence_label": conf_label,
        },
        "weights": {"timing": 0.45, "step_count": 0.15, "foot": 0.2, "consistency": 0.2},
        "figures": per_fig,
        "alignment": {"first_step_s": round(float(pred[0]), 3), "bpm": round(bpm, 2),
                      "fitted_bpm": round(bpm / al["k"], 2), "drift_pct": round(100 * (1 / al["k"] - 1), 1),
                      "auto": first_step is None, "total_beats": round(total_beats, 3),
                      "music": {"used": True, "bpm": grid["bpm"], "strength": round(grid["strength"], 1),
                                "first_beat_s": round(grid["phase"], 3), "half_beat_shift": offbeat}
                      if grid else {"used": False}},
        "timeline": {
            "start": round(float(win0), 3), "end": round(float(win1), 3),
            "expected": [{"t": round(float(pred[i]), 3), "foot": s["foot"], "count": s["count"], "fig": s["fig"],
                          "moves": s["moves"], "dt": round(m_exp[i][1], 3) if i in m_exp else None}  # dt None = missed
                         for i, s in enumerate(steps)],
            "detected": [{"t": e["t"], "foot": e["foot"], "kind": e["kind"], "match": m_ev.get(j)}  # match = step index
                         for j, e in enumerate(events) if win0 - 1 <= e["t"] <= win1 + 1],
        },
        "tips": tips[:5],
        "quality": {**quality, "notes": notes},
    }


def grade_video(path: Path, dance: str, figure_ids: list[str], role: str, bpm: float,
                first_step: float | None = None, facing: str = "front", start: float = 0.0,
                end: float | None = None) -> dict:
    t0 = time.time()
    info = probe(path)
    if end is None and info["duration"] > MAX_SECONDS + 0.5:
        raise GradeError(f"That video is {info['duration']:.0f} s long. Please trim it to {MAX_SECONDS:.0f} seconds "
                         "or less (just the routine).")
    track = track_video(path, start, end)
    grid = music_grid(path, bpm, track["t0_abs"], end)
    events, quality = detect_steps(track, facing)
    quality = {**quality, "duration_s": info["duration"], "pose_seconds": track["seconds"],
               "others_in_shot": track["others_in_shot"]}
    report = grade_events(events, dance, figure_ids, role, bpm, first_step, quality, grid)
    report["seconds"] = round(time.time() - t0, 1)
    return report


# ----------------------------------------------------------------------------- HTTP (POST /api/grade)
def _parse_fields(form) -> dict:
    """Validate the form fields (everything but the video). Raises GradeError(422)."""
    dances = catalog.dances()
    dance = str(form.get("dance") or "")
    if dance not in dances:
        raise GradeError("Unknown dance.")
    raw = str(form.get("figure_ids") or "").strip()
    try:
        ids = json.loads(raw) if raw.startswith("[") else [x.strip() for x in raw.split(",") if x.strip()]
    except ValueError:
        raise GradeError("figure_ids must be a JSON list or comma-separated ids.")
    if not isinstance(ids, list) or not 1 <= len(ids) <= MAX_FIGURES or not all(isinstance(x, str) for x in ids):
        raise GradeError(f"Send 1 to {MAX_FIGURES} figure ids.")
    figs = catalog.figures()
    bad = [x for x in ids if x not in figs or figs[x]["dance"] != dance]
    if bad:
        raise GradeError(f"Not {dances[dance]['name']} figures: {', '.join(x[:40] for x in bad[:3])}")
    role = str(form.get("role") or "leader")
    if role not in ("leader", "follower"):
        raise GradeError("role must be leader or follower.")
    try:
        bpm = float(form.get("bpm") or dances[dance]["bpm"])
    except ValueError:
        raise GradeError("bpm must be a number.")
    if not 20 <= bpm <= 260:
        raise GradeError("bpm must be between 20 and 260.")
    first = form.get("first_step")
    try:
        first_step = float(first) if first not in (None, "") else None
    except ValueError:
        raise GradeError("first_step must be a number of seconds.")
    if first_step is not None and not 0 <= first_step <= MAX_SECONDS:
        raise GradeError(f"first_step must be between 0 and {MAX_SECONDS:.0f} seconds.")
    facing = str(form.get("facing") or "front")
    if facing not in ("front", "side", "back"):
        raise GradeError("facing must be front, side or back.")
    return {"dance": dance, "figure_ids": ids, "role": role, "bpm": bpm, "first_step": first_step, "facing": facing}


async def handle(request) -> dict:
    """POST /api/grade (multipart): video + dance, figure_ids, role, bpm, optional first_step and facing."""
    from fastapi import HTTPException
    from starlette.concurrency import run_in_threadpool

    missing = extras_missing()  # checked before the body is read
    if missing:
        raise HTTPException(501, EXTRAS_MSG)
    if not MODEL_PATH.exists():
        raise HTTPException(501, "The pose model is missing: models/pose_landmarker_full.task (see models/README.md).")
    try:
        length = int(request.headers.get("content-length") or 0)
    except ValueError:
        length = 0
    if length > MAX_BYTES + 1_000_000:
        raise HTTPException(413, f"That video is over {MAX_BYTES // 2**20} MB. Trim it to the routine (60 s at most).")
    if not _BUSY.acquire(blocking=False):
        raise HTTPException(429, "Another video is being graded right now. Try again in a minute.")
    form, tmpdir = None, None
    try:
        form = await request.form(max_files=1, max_fields=10)
        video = form.get("video")
        if video is None or isinstance(video, str) or not hasattr(video, "read"):
            raise GradeError("Choose a video file to grade.")
        ext = Path(video.filename or "").suffix.lower()
        ctype = (video.content_type or "").lower()
        if ext not in VIDEO_EXT and not ctype.startswith("video/"):
            raise GradeError("That doesn't look like a video. Use an .mp4 or .mov from your phone.", 415)
        fields = _parse_fields(form)
        tmpdir = tempfile.mkdtemp(prefix="bq_grade_")  # private (0700), outside the repo
        path = Path(tmpdir) / ("clip" + (ext if ext in VIDEO_EXT else ".mp4"))
        size = 0
        with open(path, "wb") as out:
            while chunk := await video.read(1 << 20):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise GradeError(f"That video is over {MAX_BYTES // 2**20} MB. Trim it to the routine (60 s at most).", 413)
                out.write(chunk)
        if size == 0:
            raise GradeError("The video file is empty.")
        return await run_in_threadpool(_grade_file, path, fields)
    except GradeError as exc:
        raise HTTPException(exc.status, str(exc))
    finally:
        if tmpdir:
            shutil.rmtree(tmpdir, ignore_errors=True)  # always: the video never outlives the request
        if form is not None:
            await form.close()  # starlette's spooled upload copy (an unnamed temp file)
        _BUSY.release()


def _grade_file(path: Path, fields: dict) -> dict:
    try:
        return grade_video(path, fields["dance"], fields["figure_ids"], fields["role"], fields["bpm"],
                           fields["first_step"], fields["facing"])
    except GradeError:
        raise
    except Exception as exc:  # undecodable file, missing codec: never echo paths or internals
        import av
        if isinstance(exc, av.error.FFmpegError):
            raise GradeError("I couldn't read that video. Try an .mp4 or .mov straight from your phone.")
        raise


# ----------------------------------------------------------------------------- CLI
def _main() -> None:
    import argparse
    ap = argparse.ArgumentParser(description="Grade a local video against a routine (prints the JSON report).")
    ap.add_argument("video")
    ap.add_argument("--dance", required=True)
    ap.add_argument("--figures", required=True, help="comma-separated figure ids")
    ap.add_argument("--role", default="leader")
    ap.add_argument("--bpm", type=float, default=None)
    ap.add_argument("--first-step", type=float, default=None)
    ap.add_argument("--facing", default="front")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--end", type=float, default=None)
    a = ap.parse_args()
    missing = extras_missing()
    if missing:
        raise SystemExit(EXTRAS_MSG)
    ids = [x.strip() for x in a.figures.split(",") if x.strip()]
    bpm = a.bpm or catalog.dances()[a.dance]["bpm"]
    try:
        rep = grade_video(Path(a.video), a.dance, ids, a.role, bpm, a.first_step, a.facing, a.start, a.end)
    except GradeError as exc:
        raise SystemExit(f"grade: {exc}")
    print(json.dumps(rep, indent=1))


if __name__ == "__main__":
    _main()
