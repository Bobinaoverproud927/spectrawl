# Spectrawl — Project Context

## What
Self-hosted Node.js package — unified web layer for AI agents. One API for search, browse, auth, and platform actions. 5,000 free searches/month via Gemini Grounded Search. Open source, MIT, npm installable.

## Status: v0.3.20 — Launched, promoted across 10+ platforms
Launched on Reddit (4 subs), Dev.to, Hashnode, OpenClaw Discussions + Discord. HN karma building (post in ~4 days). X/LinkedIn/Medium manually posted by Fay. 4 awesome list PRs submitted (180K+ combined stars). Glama submitted for review. 7 adapters live tested. 19 individual + 1 generic directory adapter.

## Repo
**github.com/FayAndXan/spectrawl** (public, 30+ commits)
- GitHub Release: v0.3.20
- Dockerfile: node:22-slim, port 3900
- Topics: mcp, mcp-server, model-context-protocol, ai-agents, web-scraping, search-engine, browser-automation, self-hosted, nodejs, stealth-browser

## Published
- npm: `spectrawl@0.3.20` (account: fay_)

## Infrastructure
- **Spectrawl systemd service**: `spectrawl.service`, localhost:3900, auto-restart
- **GITHUB_TOKEN in gateway env**: all agents can use it
- **Credential architecture**: HTTP service holds credentials. Other agents call `localhost:3900/act`.

## Launch Status

### Live ✅
| Platform | URL/PR |
|----------|--------|
| Reddit r/selfhosted | https://www.reddit.com/r/selfhosted/comments/1rpqekt/ |
| Reddit r/opensource | https://www.reddit.com/r/opensource/comments/1rpqets/ |
| Reddit r/node | https://www.reddit.com/r/node/comments/1rpqf5p/ |
| Reddit r/artificial | https://www.reddit.com/r/artificial/comments/1rpqfeg/ |
| Dev.to | https://dev.to/fay_/i-built-a-self-hosted-web-layer-for-ai-agents-2gah |
| Hashnode | https://feydefi.hashnode.dev/i-built-a-self-hosted-web-layer-for-ai-agents |
| OpenClaw Discussions | https://github.com/openclaw/openclaw/discussions/41916 |
| OpenClaw Discord | posted by Fay |
| LinkedIn | posted by Fay |
| Medium | posted by Fay (imported from Dev.to) |
| X (@fayandxan) | posted by Fay |
| npm | spectrawl@0.3.20 |

### Awesome List PRs (pending merge)
| List | Stars | PR |
|------|-------|----|
| awesome-mcp-servers | 82K ⭐ | #3017 (needs Glama URL) |
| awesome-web-scraping | 7.8K ⭐ | #201 |
| awesome-ai-agents | 26K ⭐ | #426 |
| awesome-nodejs | 65K ⭐ | #1397 |
| awesome-selfhosted | 279K ⭐ | ❌ locked to collaborators |

### Pending
- HN karma building (cron: 3 comments/day, Mar 10-13) → auto-post attempt daily
- Glama listing → once approved, update awesome-mcp-servers PR

### Not Yet Submitted
- BetaList, DevHunt, SaaSHub, AlternativeTo (form-based directories)
- Stacker News, Peerlist (need adapters)
- Product Hunt (needs Fay's PH account)
- Lobsters (invite-only)

## Pricing (honest)
| Volume | Spectrawl | Tavily |
|--------|-----------|--------|
| <5K/month | **Free** | $40 |
| 10K/month | $80 | $90 |
| 50K/month | $720 | **$490** |

## Key Design Decisions
- **Summarizer OFF by default** — agents have their own LLM
- **Tavily as fallback engine** — in default cascade
- **Speed**: ~10s full, ~6s snippets. Floor is Gemini API latency.
- **5s scrape timeout** — quality over speed
- **For agents, not scripts** — rich sources > pre-chewed answers
- **No aggressive Tavily comparison** — "Different tools for different needs"

## What's Built & Validated
- Search: 8 engines, deep search, source ranking, scraping
- HTTP Server: 5 endpoints tested
- MCP Server: stdio transport, 5 tools
- Auth: SQLite cookies, expiry detection, refresher
- Browse: 3-tier stealth (Playwright → Camoufox → Remote)
- CAPTCHA: stealth bypass → Gemini Vision → unsolvable
- Adapters: 24 total, 7 live tested
- Rate limiter + dedup
- Form filler

## Next Steps
1. Wait for Glama approval → update awesome-mcp-servers PR
2. Monitor awesome list PR reviews
3. Monitor HN karma cron → auto-post when ready
4. Submit to launch directories (BetaList, DevHunt, SaaSHub, AlternativeTo)
5. Build Peerlist + Stacker News adapters
6. Test remaining untested adapters (need accounts)
7. Battle-test CAPTCHA solver on real protected sites

## Key Files
- `src/search/index.js` — search engine, deepSearch
- `src/search/engines/gemini-grounded.js` — primary search
- `src/server.js` — HTTP server (port 3900)
- `src/mcp.js` — MCP server (stdio)
- `src/act/adapters/*.js` — 24 platform adapters
- `src/auth/index.js` — SQLite auth manager
- `Dockerfile` — node:22-slim, HTTP server default
