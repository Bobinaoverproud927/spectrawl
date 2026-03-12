# Compact 013 — Crawl Engine v2 (Mar 12, 04:48-05:52 UTC)

## Done
- Rebuilt /crawl: Camoufox-only, no Jina Reader
- Fixed scope bug: undefined opts overriding defaults via `{ ...defaults, ...opts }`
- Auto-parallel crawling: reads system RAM → calculates safe concurrency (250MB/tab)
- fastMode in browse engine: 400ms + instant scroll (vs 800-2200ms)
- Async jobs: POST async:true → poll GET /crawl/{jobId}
- GET /crawl/capacity endpoint
- Pattern filtering (include/exclude), merge mode, domain/prefix/any scope
- Published 0.4.1 → 0.4.3, pushed GitHub, repo made public
- CI was failing (private repo checkout) — fixed

## Performance (8GB Hetzner)
- 10 pages: 14s (concurrency 10)
- ~200 pages: ~3 min
- ~1K pages: ~15 min
- Bottleneck: shared Playwright browser instance

## Decisions
- Don't chase CF on throughput — our edge is stealth + free
- Multi-browser pool deferred (too RAM-hungry for 8GB)
- Opus set as default model

## Parked
- AI trading research (strategies, frameworks, DeFAI) — Fay wants to explore later
