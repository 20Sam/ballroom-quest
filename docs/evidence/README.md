# Evidence for the Ballroom Quest report

These files back the numbers and claims in the MGT 409 final report (`report.html`) and slides.
They were produced on 25 October 2026 against commit `efd89c0` with live calls to gpt-6-luna via Portkey.
No API keys, teammate names, lesson videos or copyrighted text are included; the drill notes are synthetic samples.

| File | What it holds |
|---|---|
| `tokenomics.md` / `tokenomics.json` | 15 fresh live agent runs (10 Coach, 3 Drill Builder, 2 Planner): input, cached, output and reasoning tokens, cost, seconds; averages; the usage model and cost at 1, 100 and 10,000 players; cost cuts with measured effect |
| `coach_trace.json` | One full Coach run (model calls, tool calls with arguments and results, tokens, cost) on a broken Slow Waltz routine; the system prompt is recorded by size only |
| `screens_live_runs.json` | The live runs made while taking the report screenshots (run `e32130301d` is the step-by-step walkthrough) |
| `safety_tests.py` / `safety_tests.json` | 10 scripted safety tests (prompt injection, agent malfunction, overspending) and their results |
| `engine_tests.txt` | Output of the footwork-engine test suite (33,545 checks, 0 failures) |
| `report_facts.json` | Counts quoted in the report (figures, dances, styles, tests) |
| `sources.md` | Outside sources for the motivation and competitor comparison, with access dates |

Prices used (USD per 1M tokens, from `backend/config.py`): input 0.10, cached input 0.01, output 0.50.
