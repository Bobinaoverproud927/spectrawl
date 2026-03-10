# Compact 011 — Mar 10, 2026 ~07:56 UTC

## Context
Tone cleanup per Xan's feedback + full launch push across platforms.

## Done
- [x] README toned down — removed aggressive Tavily claims, "Different tools for different needs"
- [x] DDG removed from default cascade → `gemini-grounded → tavily → brave`
- [x] Speed claims updated to `~6-10s` everywhere (no more 17s)
- [x] GitHub repo description + npm description synced at 0.3.19
- [x] Triple-checked: code = README = npm = GitHub. All match.
- [x] Published 0.3.17, 0.3.18, 0.3.19
- [x] Reddit: posted to r/selfhosted, r/opensource, r/node, r/artificial
- [x] Dev.to: article published (https://dev.to/fay_/i-built-a-self-hosted-web-layer-for-ai-agents-2gah)
- [x] OpenClaw GitHub Discussions: Show and Tell post (discussions/41916)
- [x] OpenClaw Discord: Fay posted manually
- [x] HN karma builder: cron set, 3 comments posted today, runs Mar 10-13
- [x] HN post attempt: cron set Mar 11-14, auto-retries, self-removes on success
- [x] HN cookies + Discord bot token saved to credentials
- [x] X post drafted for @fayandxan (tonight ~10 PM CST)

## To Do
- [ ] Post X tweet tonight
- [ ] Add selectors for ~8 form directories to generic adapter
- [ ] Build Peerlist + Stacker News adapters
- [ ] Submit PRs to awesome-selfhosted + awesome-mcp-servers
- [ ] HN "Show HN" post (waiting for karma)
- [ ] Gateway restart (Fay) for compaction model config

## Key Decisions
- No aggressive Tavily comparison — honest positioning
- DDG removed from defaults (unreliable from datacenter)
- HN karma building via automated comments before attempting post
- Post auto-retry cron — removes itself when successful
- Manual Discord post (bot not invited to OpenClaw server)

## Draft
- X post: features-only, no comparison, github link
