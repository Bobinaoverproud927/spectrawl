# Spectrawl — Project Context

## What
Self-hosted Node.js package — unified web layer for AI agents. One API for search, browse, crawl, auth, and platform actions. 5,000 free searches/month via Gemini Grounded Search. Open source, MIT, npm installable.

## Status: v0.6.2 — Block detection + site fallbacks
Block detection for 15+ anti-bot patterns. Automatic fallback chain: Reddit via PullPush API, Amazon via Jina Reader. LinkedIn reading unsolved (needs residential proxy).

## Repo
**github.com/FayAndXan/spectrawl** (public)
- npm: `spectrawl@0.6.2`
- Dockerfile: node:22-slim, port 3900

## Infrastructure
- **Spectrawl systemd service**: `spectrawl.service`, localhost:3900, auto-restart
- WorkingDirectory: `/root/.openclaw/workspace-dijiclaw/projects/spectrawl`
- GITHUB_TOKEN + GEMINI_API_KEY in service env
- Old proxy dead (`204.252.81.197:46620`). Proxy rotation system built but no working upstream.

## Site Access Status
| Site | Status | Method |
|---|---|---|
| GitHub, X, blogs | ✅ Works | Camoufox direct browse |
| Reddit | ✅ Solved | PullPush API fallback (free, no auth) |
| Amazon | ✅ Solved | Jina Reader fallback |
| LinkedIn | ❌ Blocked | Needs residential proxy — all free paths exhausted |
| Cloudflare sites | ⚠️ Detected | Block flagged but no workaround |

## Block Detection (`detectBlockPage`)
15+ patterns: Reddit, Amazon, LinkedIn, Cloudflare (inc. RFC 9457), Akamai, AWS WAF, Imperva, DataDome, PerimeterX, hCaptcha, reCAPTCHA, Google consent. Plus content quality heuristic (<100 chars from known-large sites).

## Site Override System (`_getSiteOverride`)
Pre-routes known-blocked sites through alternative APIs before wasting time on Playwright:
- **Reddit**: PullPush API — subreddit listings, threads + comments, search
- **Amazon**: Jina Reader — renders pages server-side, returns markdown
- Returns `blocked: true` with actionable error message when no fallback works

## Crawl Engine (v2)
- Camoufox-only, auto-parallel based on RAM (~250MB/tab)
- fastMode: 400ms wait + instant scroll
- Async jobs: POST with `async:true`, poll GET `/crawl/{jobId}`
- Sitemap crawling enabled by default
- Performance: 10 pages in 14s, ~200 pages in 3 min

## v0.6.0 Features
- Structured extraction (`/extract`) — schema-driven, Gemini Flash
- AI browser agent (`/agent`) — simplified DOM, 100 element cap
- Network capture (XHR/fetch only)
- Sitemap crawling (enabled by default)
- Webhook notifications (fire-and-forget)
- BM25 relevance filtering

## What's Built & Validated
- Search: 8 engines, deep search, source ranking, scraping
- Browse: 3-tier stealth (Playwright → Camoufox → Remote) + site overrides
- Crawl: parallel, async jobs, RAM-aware, fast mode
- HTTP Server: /search, /browse, /crawl, /extract, /agent, /act, /status, /health
- MCP Server: stdio transport, 5 tools
- Auth: SQLite cookies, 5 accounts stored (Reddit, IndieHackers, etc.)
- CAPTCHA: stealth bypass → Gemini Vision → unsolvable
- Adapters: 24 total
- Rate limiter + dedup, Form filler
- Proxy rotation system (built, needs working upstream)

## Key Files
- `src/browse/index.js` — browse engine, block detection, site overrides
- `src/crawl.js` — crawl engine v2
- `src/search/index.js` — search engine, deepSearch
- `src/server.js` — HTTP server (port 3900)
- `src/extract.js` — structured extraction
- `src/agent.js` — AI browser agent
- `src/proxy/index.js` — rotating proxy gateway
- `src/act/adapters/*.js` — 24 platform adapters

## Recent Commits
- `3a9f986` — v0.6.2: Reddit PullPush API fallback
- `4376a39` — v0.6.1: block detection + Amazon Jina fallback
- `e5cbb9d` — v0.6.0: extract, agent, network capture, sitemap, webhook
- `53b46bf` — README comprehensive rewrite

## Open TODOs
- [ ] Residential proxy for LinkedIn + Cloudflare sites (Smartproxy $7/GB recommended)
- [ ] Post content to platforms (drafts written, zero published)
- [ ] Streaming/SSE for long operations
- [ ] Agent `_getSimplifiedDOM` optimization
- [ ] Process GitHub competitor research (stagehand, crawl4ai, masa-finance/crawler)
