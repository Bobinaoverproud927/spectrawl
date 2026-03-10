# Spectrawl — Project Context

## What
Self-hosted Node.js package — unified web layer for AI agents. One API for search, browse, auth, and platform actions. Free Tavily alternative. Open source, MIT, npm installable.

## Status: v0.3.8 — Production-ready search, 24 adapters
Google-quality search via Gemini Grounded, beats Tavily on result volume, free.

## Repo
**github.com/FayAndXan/spectrawl** (public, 25+ commits)

## Published
- npm: `spectrawl@0.3.8` (account: fay_)
- npm token: automation type (2FA enabled)

## What's Built

### Search (8 engines)
- **Gemini Grounded Search** (PRIMARY) — Google results via Gemini API, free 5000/month
- Brave Search API — 2,000/month free
- DuckDuckGo — free, unreliable from datacenter IPs
- Bing — scraper, also blocked from datacenter
- Serper.dev — 2,500 one-time trial (NOT monthly)
- Google CSE — 100/day free
- Jina Reader — search + extraction
- SearXNG — self-hosted, 70+ engines

### Deep Search Pipeline
Query → Gemini Grounded + DDG (parallel, 500ms stagger)
→ Merge & deduplicate (12-16 results)
→ Source quality ranking (boost GitHub/SO/HN, penalize SEO spam)
→ Parallel scraping (Jina → readability → Playwright browser fallback)
→ AI summarization with [1] [2] citations (gemini-2.5-flash)

### Model Split
- `gemini-2.0-flash` — grounded search (only model with structured groundingChunks)
- `gemini-2.5-flash` — summarizer, reranker, query expander (better reasoning)

### Performance vs Tavily
| | Tavily | Spectrawl |
|---|---|---|
| Speed (fast) | ~2s | ~6-9s |
| Quality | Google index | Google via Gemini ✅ |
| Results | 10 | 12-16 ✅ |
| Citations | ✅ | ✅ |
| Cost | $0.01/query | Free ✅ |
| Stealth | ❌ | ✅ |
| Auth+posting | ❌ | 24 adapters ✅ |
| Source ranking | ❌ | ✅ |
| Cached repeat | ❌ | <1ms ✅ |

### Browse (3-tier stealth)
1. playwright-extra + stealth plugin (default)
2. Camoufox binary download (`npx spectrawl install-stealth`)
3. Remote Camoufox service

### Auth
SQLite cookie store, multi-account, refresh cron, event hooks

### Platform Adapters (24)
API-based: X, Reddit, LinkedIn, Dev.to, Hashnode, Medium, GitHub, Discord, PH, YouTube, HuggingFace, BetaList, HN
Browser: Quora, AlternativeTo, SaaSHub, DevHunt, IH
Generic directory: 14 sites (MicroLaunch, Uneed, Peerlist, etc.)

### Infrastructure
MCP server (5 tools), HTTP server (port 3900), CLI, proxy server, rate limiter, dedup, dead letter queue, source ranker

## Key Requirement
- Best experience: `GEMINI_API_KEY` (free signup)
- Without Gemini: DDG-only, no AI features (unreliable from datacenter)
- Summarizer works with any LLM (OpenAI, Anthropic, MiniMax, xAI, Ollama)
- Only Gemini has grounding — no other LLM can search Google

## Known Issues
- Speed: 6-9s vs Tavily's 2s (Gemini API latency ~4s, unfixable)
- DDG: CAPTCHA'd from datacenter IPs after 1-2 requests
- Bing: same datacenter blocking as DDG
- Brave: untested (wired, needs API key to verify)
- Browser automation adapters: selectors unvalidated (Quora, AlternativeTo, SaaSHub, DevHunt)

## What's NOT Built
- Proxy auto-wiring into browse engine
- X posting via residential proxy
- Live adapter testing (Medium, GitHub, Discord, PH, HN, YouTube)
- npm/PyPI publish adapters

## Relationship to xanOS
Open-source infra that xanOS uses. XanLens audits → xanOS generates → Spectrawl publishes.

## Key Files
- `src/search/engines/gemini-grounded.js` — primary search engine
- `src/search/index.js` — search engine + deepSearch
- `src/search/source-ranker.js` — domain trust scoring
- `src/search/summarizer.js` — multi-provider LLM answers
- `src/search/scraper.js` — Jina + readability + Playwright fallback
- `src/index.js` — main entry (accepts config objects now)
- `src/config.js` — defaults (cascade: gemini-grounded → brave → ddg)
- `src/act/adapters/*.js` — 24 platform adapters
