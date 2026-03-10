# Compact 009 — Speed Optimization + Tavily Fallback Engine
*2026-03-10 ~05:30-05:47 UTC*

## Done
- **Speed: 16s → ~10s (full mode), ~6s (snippets mode)**
  - Scrape timeout: 10s → 5s per URL (quality > speed, Fay's call)
  - Skip DDG when Gemini returns ≥5 results (saves 2-3s of DDG latency)
  - New `mode: 'snippets'` — no scraping at all, sources + snippets only (~6s)
  - `mode: 'fast'` also skips scraping (~5s)
- **Tavily engine added** (`src/search/engines/tavily.js`)
  - Uses `TAVILY_API_KEY` env var
  - Added to default cascade: `gemini-grounded → tavily → brave → ddg`
  - Falls back gracefully when no key
  - Tested standalone: 10 results, 4.9s
- **Default cascade updated** in config.js: `['gemini-grounded', 'tavily', 'brave', 'ddg']`
- **Published spectrawl@0.3.14** (speed + tavily) and **@0.3.15** (5s scrape timeout)
- **Head-to-head vs Tavily tested**: 10 sources each, comparable quality, our scraped content is deeper
- **Compaction config fix**: set `compaction.model` to `claude-sonnet-4` for dijiclaw (config got lost from earlier attempt, reapplied)

## Key Decisions
- **5s scrape timeout** — Fay chose quality over speed. 3s catches 90%, 5s catches ~95%.
- **Spectrawl = for agents, Tavily = for scripts** — agents have their own LLM, need rich sources not pre-chewed answers. Scripts need fast answers. Different products for different users.
- **DDG skip when Gemini has enough** — no point running a flaky engine when primary already returned 5+ results
- **Never restart gateway from session** — rule reinforced after breaking things again

## Benchmarks (v0.3.14)
| Mode | Time |
|------|------|
| snippets | 6.4s |
| full | 9.4s |
| fast | ~5s |

vs Tavily: ~2s (10 sources, snippet-only, $0.01/query)

## Published
- spectrawl@0.3.14, @0.3.15
