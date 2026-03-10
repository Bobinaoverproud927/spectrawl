# Spectrawl — Project Context

## What
Self-hosted Node.js package — unified web layer for AI agents. One API for search, browse, auth, and platform actions. Free Tavily alternative. Open source, MIT, npm installable.

## Status: v0.3.9 — All core components validated
Google-quality search via Gemini Grounded, beats Tavily on result volume, free. All core components tested end-to-end.

## Repo
**github.com/FayAndXan/spectrawl** (public, 25+ commits)

## Published
- npm: `spectrawl@0.3.9` (account: fay_)
- npm token: automation type (2FA enabled)

## Infrastructure
- **Spectrawl systemd service**: `spectrawl.service`, localhost:3900, auto-restart, runs permanently
- **GITHUB_TOKEN in gateway env**: all agents can use it (Fay approved)
- **Credential architecture**: Spectrawl HTTP service holds credentials. Other agents (Dante, Grokit, etc.) call `localhost:3900/act` — never see raw tokens.

## What's Built & Validated

### Search (8 engines) ✅
- **Gemini Grounded Search** (PRIMARY) — Google results via Gemini API, free 5000/month
- Brave Search API — 2,000/month free
- DuckDuckGo — free, unreliable from datacenter IPs
- Bing — scraper, also blocked from datacenter
- Serper.dev — 2,500 one-time trial (NOT monthly)
- Google CSE — 100/day free
- Jina Reader — search + extraction
- SearXNG — self-hosted, 70+ engines

### Deep Search Pipeline ✅
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

### HTTP Server ✅ (all 5 endpoints tested)
- `GET /health` — server health
- `GET /status` — auth account status
- `POST /search` — web search (returned 13 results)
- `POST /browse` — stealth browse (Playwright)
- `POST /act` — platform actions (graceful auth errors)

### MCP Server ✅ (tested with JSON-RPC)
- Initialize, tool listing (5 tools), web_search execution — all working

### Auth Manager ✅
- SQLite cookie store: add, getCookies, updateCookies, getStatus, remove
- Cookie refresher: fires cookie_expiring + cookie_expired events
- Event hooks working

### Rate Limiter + Dedup ✅
- Rate limiting blocks after configured limit
- Dedup blocks same content hash within 24h

### Browse (3-tier stealth) — Tier 1 ✅
1. playwright-extra + stealth plugin (default) ✅ tested
2. Camoufox binary download (`npx spectrawl install-stealth`) — installer logic works, binary not downloaded
3. Remote Camoufox service — untested

### Platform Adapters (24) — 3 live tested
- **GitHub** ✅ LIVE: created issue #1 → closed it
- **Reddit** ✅ LIVE: posted to u/EntrepreneurSharp538 → deleted
- **X** ✅ reads work, writes blocked from datacenter (Error 226)
- 18 untested (need accounts): Dev.to, Hashnode, LinkedIn, Medium, Discord, PH, HN, YouTube, Quora, HuggingFace, BetaList, AlternativeTo, SaaSHub, DevHunt, IH
- Generic directory adapter: 14 sites

### Summarizer ✅ (bug fixed)
- **Bug found**: constructor defaulted to `gpt-4o-mini` for ALL providers — Gemini calls silently failed
- **Fixed**: provider-specific defaults (gemini-2.5-flash, claude-3-5-haiku, etc.)
- Tested: Gemini ✅, xAI ✅, MiniMax ❌ (key expired)

## API Key Status (as of Mar 10)
- Gemini (`AIzaSyDwZ5...`): ✅ working
- MiniMax: ❌ invalid/expired
- xAI: ❌ credits exhausted (429)
- Reddit token_v2: expires 2026-03-10T16:48:51

## Known Issues
- Speed: 6-9s vs Tavily's 2s (Gemini API latency ~4s, unfixable)
- DDG: CAPTCHA'd from datacenter IPs after 1-2 requests
- Bing: same datacenter blocking as DDG
- X writes blocked from datacenter IP (Error 226)
- Browser automation adapters: selectors unvalidated

## Accounts Fay Needs to Create
- **Quick wins** (API key, 2 min): Dev.to, HuggingFace, Discord bot
- **Browser cookies**: LinkedIn, HN, Quora, AlternativeTo, SaaSHub, DevHunt
- **OAuth flows**: Medium, Product Hunt, YouTube

## What's NOT Built
- Proxy auto-wiring into browse engine
- X posting via residential proxy
- npm/PyPI publish adapters

## Relationship to xanOS
Open-source infra that xanOS uses. XanLens audits → xanOS generates → Spectrawl publishes.

## Key Files
- `src/search/engines/gemini-grounded.js` — primary search engine
- `src/search/index.js` — search engine + deepSearch
- `src/search/source-ranker.js` — domain trust scoring
- `src/search/summarizer.js` — multi-provider LLM answers (provider-specific defaults)
- `src/search/scraper.js` — Jina + readability + Playwright fallback
- `src/index.js` — main entry (accepts config objects now)
- `src/config.js` — defaults (cascade: gemini-grounded → brave → ddg)
- `src/act/adapters/*.js` — 24 platform adapters
- `src/server.js` — HTTP server (port 3900)
- `src/mcp.js` — MCP server (stdio)
- `src/auth/index.js` — auth manager (SQLite)
- `src/auth/refresh.js` — cookie refresher + event hooks
- `src/act/rate-limiter.js` — rate limiting + dedup
