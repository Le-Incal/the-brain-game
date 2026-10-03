# Atlas for Urban Intelligence: voice reference files

Read-only copies from `~/Atlas-for-Urban-Intelligence` at commit 6e902fe 2026-05-14. The Atlas is our shipped ElevenLabs build. Port its patterns into the Brain Game; do not import these files.

| File | Atlas path | Port | Do not repeat |
|---|---|---|---|
| `voiceClientTools.js` | `src/lib/voiceClientTools.js` | Parameter normalization and tool-name alias expansion, copy nearly as is | |
| `VoiceBridge.jsx` | `src/components/VoiceBridge.jsx` | Client tool registration, transcript store, typed input | Uses deprecated `@11labs/react` (we use `@elevenlabs/react` with `ConversationProvider`); most tools return "updated" even when nothing happened; never sends contextual updates to the agent |
| `server-index.js` | `server/index.js` | Express app shape, HMAC-signed host-bound cookie, password gate, runtime config | Sends the agent id to the browser (we mint conversation tokens server-side); webhooks mounted before auth with no signature check; no minute caps |

Review notes: `docs/claude/VOICE_M1_HANDOFF.md` section "Atlas lessons".
