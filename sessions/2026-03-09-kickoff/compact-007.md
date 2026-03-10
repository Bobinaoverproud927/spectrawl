# Compact 007 — Component Validation + Systemd Service
*2026-03-10 ~00:45-02:14 UTC*

## Done
- HTTP server tested: all 5 endpoints (`/health`, `/status`, `/search`, `/browse`, `/act`) working
- MCP server tested: initialize + tool listing (5 tools) + `web_search` execution via JSON-RPC stdio
- Auth manager tested: `add()`, `getCookies()`, `updateCookies()`, `getStatus()`, `remove()` all working
- Cookie refresher tested: `_check()` fires `cookie_expiring` + `cookie_expired` events correctly
- Rate limiter tested: blocks after configured limit, dedup blocks same content hash
- **Summarizer bug found + fixed**: constructor used `gpt-4o-mini` as default model for ALL providers (including Gemini) — Gemini calls hit `models/gpt-4o-mini:generateContent` and silently failed. Added provider-specific defaults.
- Summarizer validated with Gemini (✅) and xAI (✅). MiniMax key expired. 
- **GitHub adapter live tested**: created issue #1 on FayAndXan/spectrawl → closed it
- **Reddit adapter live tested**: posted to u/EntrepreneurSharp538 → deleted
- Published `spectrawl@0.3.9` with summarizer fix
- **Spectrawl systemd service created**: `spectrawl.service`, auto-restart, port 3900, runs permanently
- **GITHUB_TOKEN added to gateway env**: all agents on server can access it
- 17/17 unit tests passing

## Architecture Decision: Credential Access
- **Option 1 chosen**: Spectrawl runs as HTTP service on localhost:3900. Credentials stay in dijiclaw workspace. Other agents (Dante, Grokit, etc.) call the HTTP API — never see raw tokens.
- **Exception: GITHUB_TOKEN** in gateway env — low risk, Dante needs it for GitHub adapter directly
- Agents call `curl localhost:3900/act` for Reddit, X, Medium, etc. — Spectrawl handles auth.
- No internet exposure — localhost only.

## API Key Status
- MiniMax: invalid/expired
- xAI: credits exhausted (429)
- Gemini (`AIzaSyDwZ5...`): working
- Reddit token_v2: expires 2026-03-10T16:48:51 (~15h from session)

## Still Untested
- 18 platform adapters (need live accounts: Dev.to, Medium, Discord, PH, HN, YouTube, Quora, etc.)
- Form filler (need real page)
- Camoufox binary download (700MB)
- Dead letter queue (needs live adapter failures)

## Accounts Fay Needs to Create
Quick wins (API key): Dev.to, HuggingFace, Discord bot
Browser cookies: LinkedIn, HN, Quora, AlternativeTo, SaaSHub, DevHunt
OAuth: Medium, Product Hunt, YouTube
