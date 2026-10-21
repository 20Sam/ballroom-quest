"""Defenses: injection screening, spend caps, rate limits, output checks."""
from __future__ import annotations

import re
import threading
import time
from collections import defaultdict, deque
from datetime import date

from config import DAILY_BUDGET_USD, MAX_NOTES_CHARS, RUNS_PER_10_MIN, SESSION_BUDGET_USD

INJECTION_PATTERNS = [
    r"ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|prompts?)",
    r"disregard (the |your )?(rules|instructions|syllabus)",
    r"(system|developer) prompt",
    r"you are now",
    r"act as (an? )?(admin|developer|different)",
    r"(api|secret) key|portkey|password|\.env",
    r"<\s*/?\s*(script|system|instructions?)",
    r"https?://",
    r"reveal|exfiltrat|send (it|this|them) to",
]
_INJ = [re.compile(p, re.IGNORECASE) for p in INJECTION_PATTERNS]


def screen_notes(text: str) -> dict:
    """Flag suspicious lines in teammate notes. Notes are always treated as data, flagged or not."""
    clean = text.replace("\x00", "")[:MAX_NOTES_CHARS]
    flags, kept = [], []
    for n, line in enumerate(clean.splitlines(), 1):
        if any(p.search(line) for p in _INJ):
            flags.append({"line": n, "text": line.strip()[:160]})
            kept.append(f"[line {n} removed by the safety screen]")  # quarantined: never reaches the model
        else:
            kept.append(line)
    return {"text": "\n".join(kept), "truncated": len(text) > MAX_NOTES_CHARS, "flags": flags}


LEAK_PATTERN = re.compile(r"https?://|portkey|api[_ ]?key|system prompt|<script", re.IGNORECASE)


def leaks(text: str) -> bool:
    return bool(LEAK_PATTERN.search(text or ""))


class Guard:
    """Per-session budget, a whole-app daily budget, and a sliding-window rate limit."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.session_spend: dict[str, float] = defaultdict(float)
        self.day = date.today()
        self.day_spend = 0.0
        self.calls: dict[str, deque] = defaultdict(deque)

    def check(self, session: str) -> str | None:
        with self.lock:
            if date.today() != self.day:
                self.day, self.day_spend = date.today(), 0.0
            q = self.calls[session]
            now = time.time()
            while q and now - q[0] > 600:
                q.popleft()
            if len(q) >= RUNS_PER_10_MIN:
                return "Slow down: too many AI requests in 10 minutes. Try again shortly."
            if self.session_spend[session] >= SESSION_BUDGET_USD:
                return f"This session reached its ${SESSION_BUDGET_USD:.2f} AI budget. The game still works; AI coaching is paused."
            if self.day_spend >= DAILY_BUDGET_USD:
                return "The app reached today's AI budget. The game still works; AI coaching resumes tomorrow."
            q.append(now)
            return None

    def charge(self, session: str, usd: float) -> None:
        with self.lock:
            self.session_spend[session] += usd
            self.day_spend += usd

    def spent(self, session: str) -> float:
        return round(self.session_spend[session], 6)


GUARD = Guard()
