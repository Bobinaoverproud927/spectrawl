# Compact 006 — Deep Search Optimization + Gemini Grounded + Reliability Fixes
**Saved:** 2026-03-09 19:54 UTC

## What Happened

### Gemini Grounded Search Engine (Primary)
- Built `src/search/engines/gemini-grounded.js` — uses Gemini API with `google_search` tool
- Returns Google-quality results via grounding chunks
- Resolved redirect URLs from `vertexaisearch.cloud.google.com` to actual page URLs
- Free tier: 5,000 grounded queries/month
- Only `gemini-2.0-flash` returns structured `groundingChunks` — 2.5-flash doesn't

### Model Split
- **Grounded search:** `gemini-2.0-flash` (structured URL chunks with confidence scores)
- **Summarizer/reranker/expander:** `gemini-2.5-flash` (better reasoning)

### Critical Bug Fix: Config Objects Silently Ignored
- ROOT CAUSE: `Spectrawl` constructor expected file path string, not config object
- Every programmatic test was running on DEFAULTS (searxng → ddg → brave → serper)
- `gemini-grounded` was never in the cascade — results came from DDG alone
- This caused 0 results on ~50% of queries
- Fix: constructor now accepts both file paths AND config objects via `deepMergeConfig`

### Speed Optimization
- Parallel scraping: all URLs simultaneously with per-URL hard timeout (5.4s → 1.4s)
- Skip query expansion for Gemini Grounded (it searches Google natively)
- Parallel Gemini + DDG with 500ms stagger (DDG rate-limits concurrent requests)
- Fast mode (`mode: 'fast'`): skip scraping, ~6s response

### Reliability
- Never cache empty results (prevents poisoning cache with failures)
- DDG from datacenter IPs is unreliable (JSON API only works for factoid queries, HTML gets CAPTCHA'd)
- Bing also CAPTCHA's from datacenter IPs
- Built DDG retry with backoff + multi-endpoint (html.duckduckgo.com, lite.duckduckgo.com)
- Built Bing scraper (also blocked from datacenter — documented limitation)
- Default cascade changed: `gemini-grounded → brave → ddg`

### Source Quality Ranker (Novel Feature)
- `src/search/source-ranker.js` — boost trusted domains, penalize SEO spam
- Boosted: GitHub, SO, HN, Reddit, MDN, arxiv, Wikipedia
- Penalized: w3schools, tutorialspoint, javatpoint
- URL quality signals: /blog/, /docs/ boost; /tag/, /category/ penalize
- Freshness signal: URLs with recent years get small boost
- Customizable: users can add their own domain weights + block list

### Summarizer Improvement
- Prompt rewritten: direct answers, no hedging
- "Never say 'based on provided sources'" — give direct answers like Tavily
- System message updated to match

### README + Types Overhaul
- README rewritten with Tavily comparison table as headline
- Deep search pipeline diagram documented
- Source quality ranking documented with config examples
- TypeScript declarations updated: `deepSearch()`, `mode`, `DeepSearchOptions`, `SourceRanker`

## Benchmark Results (vs Tavily)
| Query | Tavily | Spectrawl | Winner |
|-------|--------|-----------|--------|
| AI frameworks | 10 results, 432ms | 15 results, 9.6s | Spectrawl (volume) |
| Self-host search | 10 results, 406ms | 5 results, 8.9s | Tavily (both) |
| Node.js scraping | 10 results, 460ms | 12 results, 10.4s | Spectrawl (volume) |
| Vercel alternatives | 10 results, 408ms | 14 results, 6.3s | Spectrawl (volume) |

## Published
- spectrawl@0.3.1 → 0.3.2 → 0.3.3 → 0.3.4 → 0.3.5 → 0.3.6 → 0.3.7 → 0.3.8

## Key Decisions
- Gemini 2.0-flash for grounding (structured chunks), 2.5-flash for LLM tasks
- DDG demoted to last-resort fallback
- Zero-config requires at minimum GEMINI_API_KEY (free signup)
- Source ranking is a differentiator vs Tavily
