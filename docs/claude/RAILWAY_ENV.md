# Railway Environment: Voice Layer (M3 contract)

Service: `the-brain-game` (Railway project `accurate-spontaneity`, production, www.brain-game.io). As of 2026-10-04 the service has no environment variables of its own and still deploys as a static site; M3 switches it to the Express server, which reads the variables below. That switch is made on a Railway staging environment first, never on production.

Build-time, not a secret: `VITE_VOICE_ENABLED` keeps Study mode and all voice UI out of the production build until launch. Leave it unset (off) in production; set it to `true` only on staging.

Values live only in Railway. Never commit them, and never give any of them a `VITE_` prefix: Vite bundles `VITE_` variables into the browser build, which would ship them to every player.

| Variable | Secret | Purpose |
|---|---|---|
| `ELEVENLABS_API_KEY` | yes | Server-side key used to mint conversation tokens. A restricted key with ElevenAgents access only. |
| `ELEVENLABS_AGENT_ID` | treat as yes | The Sylvi and Rollo agent. Server only; the browser never sees it. |
| `VOICE_ID_ROLLO` | no | ElevenLabs voice for Rollo (also the agent's primary voice). |
| `VOICE_ID_SYLVI` | no | ElevenLabs voice for Sylvi. |
| `VOICE_SESSION_SECRET` | yes | HMAC key for the anonymous, signed, host-bound device cookie that carries the per-device caps (64 hex chars). |
| `VOICE_HOSTS` | no | Comma-separated hosts the cookie is bound to: `www.brain-game.io,brain-game.io`. |
| `VOICE_SESSION_MAX_SECONDS` | no | Per-conversation cap. `480`. |
| `VOICE_DAILY_MAX_SECONDS` | no | Per-player daily cap across all conversations. `900`. |
| `VOICE_GLOBAL_DAILY_MAX_SECONDS` | no | Global daily minute budget across all players. When spent, voice reports itself unavailable until the next UTC day; the game is unaffected. |
| `ELEVENLABS_WEBHOOK_SECRET` | yes | HMAC secret of the ElevenLabs post-call webhook. The webhook route verifies every delivery with it before refunding unused minutes. Optional: without it voice still works, but every conversation stays charged its full reservation. |

All variables except `ELEVENLABS_WEBHOOK_SECRET` are required; if any is missing or invalid, voice reports itself unavailable. The caps have no silent defaults. Later, the `log_knowledge_gap` server tool gets its own shared secret (not the post-call webhook secret).

## How M3 uses them

- `POST /api/voice/token` with `{ guide: 'rollo' | 'sylvi' }`: checks the device cookie (issuing one if absent), the per-IP rate limit, the per-device caps and the global daily budget, mints a conversation token for `ELEVENLABS_AGENT_ID` with `ELEVENLABS_API_KEY`, and returns `{ conversationToken, guideName, voiceId, maxSeconds, dynamicVariables: { guide_name, reservation } }`. The voice map lives on the server (from `VOICE_ID_*`), so a voice can be swapped in Railway without a redeploy of the client.
- The browser then calls `startSession({ conversationToken, dynamicVariables, overrides: { tts: { voiceId } } })`, passing `dynamicVariables` exactly as returned. Always send the override, for both guides.
- Minutes are reserved, then refunded: minting reserves the session cap (or what the device has left, if less) against the device's daily cap and the global budget. ElevenLabs' post-call webhook (`POST /api/voice/webhook/elevenlabs`, header `elevenlabs-signature: t=<secs>,v0=<hex HMAC-SHA256 of "t.body">`) reports the real duration, which settles the reservation. No webhook means no refund.
- `GET /api/voice/status` returns `{ available, reason?, remainingSeconds? }` so the client knows whether to offer voice.
- Launch is public, with no access code. The token route is rate-limited per IP.
- Missing required variables at boot: the server still serves the game, and voice reports itself unavailable (it never crashes the site).
- Tests (Supertest) use fake values and a mocked ElevenLabs token endpoint; no test reads real secrets.
