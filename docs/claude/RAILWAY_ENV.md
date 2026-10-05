# Railway Environment: Voice Layer (M3 contract)

Service: `the-brain-game` (Railway project `accurate-spontaneity`, production, www.brain-game.io). As of 2026-10-04 the service has no environment variables of its own and still deploys as a static site; M3 switches it to the Express server, which reads the variables below.

Values live only in Railway. Never commit them, and never give any of them a `VITE_` prefix: Vite bundles `VITE_` variables into the browser build, which would ship them to every player.

| Variable | Secret | Purpose |
|---|---|---|
| `ELEVENLABS_API_KEY` | yes | Server-side key used to mint conversation tokens. A restricted key with ElevenAgents access only. |
| `ELEVENLABS_AGENT_ID` | treat as yes | The Sylvi and Rollo agent. Server only; the browser never sees it. |
| `VOICE_ID_ROLLO` | no | ElevenLabs voice for Rollo (also the agent's primary voice). |
| `VOICE_ID_SYLVI` | no | ElevenLabs voice for Sylvi. |
| `VOICE_SESSION_SECRET` | yes | HMAC key for the signed, host-bound access cookie (64 hex chars). |
| `VOICE_ACCESS_CODE` | yes | The beta access code players enter to unlock voice. |
| `VOICE_HOSTS` | no | Comma-separated hosts the cookie is bound to: `www.brain-game.io,brain-game.io`. |
| `VOICE_SESSION_MAX_SECONDS` | no | Per-conversation cap. `480`. |
| `VOICE_DAILY_MAX_SECONDS` | no | Per-player daily cap across all conversations. `900`. |

Later, when the gap webhook is configured in ElevenLabs: `ELEVENLABS_WEBHOOK_SECRET` (yes), the shared secret the webhook route verifies.

## How M3 uses them

- `POST /api/voice/token` with `{ guide: 'rollo' | 'sylvi' }`: checks the access cookie and the caps, mints a conversation token for `ELEVENLABS_AGENT_ID` with `ELEVENLABS_API_KEY`, and returns `{ conversationToken, guideName, voiceId }`. The voice map lives on the server (from `VOICE_ID_*`), so a voice can be swapped in Railway without a redeploy of the client.
- The browser then calls `startSession({ conversationToken, dynamicVariables: { guide_name: guideName }, overrides: { tts: { voiceId } } })`. Always send the override, for both guides.
- Missing required variables at boot: the server still serves the game, and voice reports itself unavailable (it never crashes the site).
- Tests (Supertest) use fake values and a mocked ElevenLabs token endpoint; no test reads real secrets.
