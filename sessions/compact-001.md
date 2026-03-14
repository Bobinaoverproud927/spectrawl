# Compact 001 — 2026-03-14: Block Detection, Fallbacks, Site Access Fixes

## What happened
- Audited Spectrawl's real-world browsing: Reddit ❌, Amazon ❌, LinkedIn ❌, GitHub ✅, X ✅
- Built block detection for 15+ patterns (Reddit, Amazon, LinkedIn, Cloudflare, Google consent, Akamai, AWS WAF, Imperva, DataDome, PerimeterX, hCaptcha, reCAPTCHA)
- Added content quality heuristic: <100 chars from known-large sites = suspected block
- Built site-specific override/fallback system (`_getSiteOverride()`)
- Reddit: PullPush API fallback — subreddit listings, threads + comments, search. Free, no auth, works from datacenter IPs
- Amazon: Jina Reader fallback — gets real product pages through CAPTCHA wall
- LinkedIn: tested everything (Voyager API, cookies, Facebook UA, embed, Jina) — ALL blocked from datacenter IP. No free solution exists.
- Shipped v0.6.1 (block detection) and v0.6.2 (Reddit PullPush fallback)
- Existing proxy (`204.252.81.197:46620`) is dead
- Researched proxy providers: Smartproxy ($7/GB) best budget option
- Drafted multiple promotional posts, Fay pushed back on fake problems — post should focus on the SOLUTION (fallbacks that get content), not detection

## Commits
- `4376a39` — v0.6.1: block detection + Amazon Jina fallback
- `3a9f986` — v0.6.2: Reddit PullPush API fallback

## Key decisions
- Reddit solved via PullPush (free archive API), not proxy
- Amazon solved via Jina Reader, not proxy
- LinkedIn needs residential proxy — no free workaround
- Posts must be honest: don't invent problems, focus on real solutions
- Agents don't "summarize block pages as content" — they recognize blocks and fail. The real problem is failing silently without alternatives.

## Status
- Reddit: ✅ solved (PullPush)
- Amazon: ✅ solved (Jina Reader)
- LinkedIn reading: ❌ needs proxy
- Cloudflare sites: ⚠️ detected but no workaround
