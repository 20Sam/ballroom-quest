"""Model, prices, limits and .env loading.

.env lookup order (course rule): the repo folder first, then the folder one level
above. A third level is also checked so it works inside the course workspace.
load_dotenv never overrides, so the closest file wins.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

from dotenv import load_dotenv  # noqa: E402
from openai import AsyncOpenAI  # noqa: E402
from pydantic_ai.models.openai import OpenAIResponsesModel  # noqa: E402
from pydantic_ai.providers.openai import OpenAIProvider  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent
REPO_DIR = BACKEND_DIR.parent
OUTPUT_DIR = REPO_DIR / "output"
DATA_DIR = REPO_DIR / "data"
PROMPTS_DIR = BACKEND_DIR / "prompts"
FRONTEND_DIR = REPO_DIR / "frontend"

for env_dir in (REPO_DIR, REPO_DIR.parent, REPO_DIR.parent.parent):
    load_dotenv(env_dir / ".env")

# Course key may only be used with gpt-6-luna, so the model is fixed.
MODEL_NAME = "gpt-6-luna"
PORTKEY_BASE_URL = "https://api.portkey.ai/v1"

# USD per 1M tokens, OpenAI standard tier (same sheet as Lecture 11, checked 2026-10-06).
PRICE_INPUT = 0.10
PRICE_CACHED_INPUT = 0.01
PRICE_OUTPUT = 0.50

# Guard rails
REQUEST_LIMIT = 8            # model calls per agent run
TOKEN_LIMIT_PER_RUN = 60_000
SESSION_BUDGET_USD = 0.25    # per browser session
DAILY_BUDGET_USD = 3.00      # whole app, per day
RUNS_PER_10_MIN = 20         # per browser session
MAX_NOTES_CHARS = 4000


def key_is_set() -> bool:
    key = os.getenv("PORTKEY_API_KEY", "").strip()
    return bool(key) and not key.startswith(("your-", "replace"))


@lru_cache(maxsize=1)
def build_model() -> OpenAIResponsesModel:
    if not key_is_set():
        raise RuntimeError("PORTKEY_API_KEY is missing. Put it in a .env in the repo folder or one level above.")
    key = os.environ["PORTKEY_API_KEY"].strip()
    client = AsyncOpenAI(
        api_key=key,
        base_url=PORTKEY_BASE_URL,
        default_headers={"x-portkey-api-key": key, "x-portkey-provider": "openai"},
        timeout=120.0,
        max_retries=1,
    )
    # gpt-6-luna only accepts tool calls on the Responses API.
    return OpenAIResponsesModel(MODEL_NAME, provider=OpenAIProvider(openai_client=client))


def cost_usd(input_tokens: int, cached_tokens: int, output_tokens: int) -> float:
    fresh = max(input_tokens - cached_tokens, 0)
    return round((fresh * PRICE_INPUT + cached_tokens * PRICE_CACHED_INPUT + output_tokens * PRICE_OUTPUT) / 1_000_000, 8)
