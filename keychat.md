# Spectrawl Keychat — Architecture & Decisions

## 2026-03-14: Site Access Architecture

### Block Detection System
- `detectBlockPage()` in `src/browse/index.js` — 15+ patterns covering Reddit, Amazon, LinkedIn, Cloudflare, Akamai, AWS WAF, Imperva, DataDome, PerimeterX, hCaptcha, reCAPTCHA, Google consent
- Content quality heuristic: flags <100 chars from known-large sites list as `suspected-block`
- Runs post-browse on every page, sets `blocked: true` + `blockType` + `blockDetail` on result

### Site Override / Fallback System
- `_getSiteOverride(url)` returns site-specific fallback function
- Runs BEFORE Playwright attempt — if fallback has content, skip browser entirely
- If fallback confirms blocked, return immediately with actionable error (don't waste time on Playwright)
- Current overrides: Reddit (PullPush API), Amazon (Jina Reader)

### Reddit Access (PullPush API)
- `api.pullpush.io` — free Reddit archive, no auth, not IP-blocked
- Parses Reddit URLs: `/r/{sub}`, `/r/{sub}/comments/{id}`, search queries
- Returns formatted markdown: titles, scores, authors, selftext, comments
- Limitation: archive data, not real-time. Good enough for research.

### Amazon Access (Jina Reader)
- `r.jina.ai/{url}` — renders page server-side, returns markdown
- Works for product pages that block with CAPTCHA
- Falls back only when content > 100 chars and doesn't contain block strings

### LinkedIn Access
- **Unsolved from datacenter IPs.** Every path tested and failed:
  - Direct browse: HTTP 999
  - Voyager API with valid cookies: 401 (IP fingerprinting)
  - Facebook/Googlebot UA: 317K CSS shell, zero content
  - Jina Reader: empty
  - No public archive API exists
- Needs residential proxy. Smartproxy ($7/GB) recommended.

### Proxy Infrastructure
- `src/proxy/index.js` — rotating proxy gateway already built
- Supports round-robin/random/least-used strategies
- Old proxy URL dead. Need new upstream.

### Content Post Strategy (Fay feedback)
- Don't invent fake problems to sell the tool
- Agents recognize block pages — they don't "summarize garbage as real content"
- The real value is fallbacks that GET THE CONTENT, not just detecting blocks
- Posts should be first-person honest ("I had this problem, I fixed it")
