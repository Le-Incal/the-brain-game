# Brain Game: Voice Layer Plan (V1)

Status: PLAN PHASE. No code written. Awaiting confirmation to start M1 tests.
Date: 2026-10-01 (updated 2026-10-02: guide names; 2026-10-04: guide voices and knowledge base, see `docs/claude/VOICE_CONFIG_UPDATE.md`; later 2026-10-04: public launch, guide choice, build flag)

Mirror of the claude.ai Project doc `claude/VOICE_LAYER_PLAN.md`, copied into the repo so local Claude Code sessions can read it.

## Locked decisions

| Decision | Choice |
|---|---|
| V1 scope | Puppeteer: the brain speaks, rotates itself, lights its own regions. Game master is V2. |
| Voice and play | Study mode only. Voice never runs during the falling-word game. |
| Persona | The brain itself, first person. "Turn me over, you'll find my cerebellum beneath." |
| Guide names | **Sylvi** (female voice; from the Sylvian fissure) and **Rollo** (male voice; from the fissure of Rolando, the central sulcus). Rollo spelled with two l's to avoid the ROLO candy trademark. Neither guide claims to be the historical anatomist. "Specimen" retired. |
| Listening | Full conversation. Players can talk back and type. |
| Code reuse | Copy Atlas modules (param normalization, auth cookie), do not extract a shared package. |
| Voice | The brain gets its own voices, not the Atlas clone. |
| Guides and voices | One agent, two guides, one British voice each: Rollo (Wilf, the agent's primary voice) and Sylvi (Cruella). Default guide: Rollo. No accent choice. |
| Choosing a guide | In the app's Settings, never by talking to the agent. No voice-switching tool; the contract stays at 9 tools. |
| Applying the choice | At conversation start the app sends the `guide_name` dynamic variable and the Voice ID override (`overrides.tts.voiceId`), always, for both guides, from one voice-map module. The agent never sees voice IDs. Security overrides: Voice ID only. |
| Switching mid-conversation | Overrides apply only at conversation start, so a switch ends the conversation and starts a new one with the new guide, fresh. When the switch happens is open (see Open). |
| Knowledge base | Attached, RAG on: the 21 files in `knowledge/kb/{anatomy,cells,physiology}`. The graph still reaches the agent only through tools; tools win any disagreement. |
| "Specimen" | Retired everywhere the agent speaks; the prompt avoids the word. |
| `log_knowledge_gap` | Out of the prompt until the M3 server and webhook exist. |
| Guide change mid-conversation | Takes effect at the next conversation. Settings also offers "Switch now", which warns that it ends the current conversation. (Kyle, 2026-10-04) |
| First visit | On first entry to Study mode the player picks Sylvi or Rollo; Settings changes it later. (Kyle, 2026-10-04) |
| Launch access | Public from day one, no access code. Abuse and cost are held by per-device caps on an anonymous signed cookie, a per-IP rate limit on the token route, and a global daily minute budget. (Kyle, 2026-10-04) |
| Launch gate | Nothing goes public until M5 passes: the 20-question eval and the 7 acceptance conversations in `agent/architect-brief.md`. |
| Build flag | `main` deploys to brain-game.io on push, so Study mode and all voice UI stay behind `VITE_VOICE_ENABLED` (off in production) until launch. |
| Staging first | The M3 switch from static hosting to the Node start command happens on a Railway staging environment first, never on production. |

## Architecture: three layers

### Layer 1: Scene commands (no voice dependency)
A pure, testable command API over the existing scene. Voice is one client of it; scripted tours and UI buttons can be others.

- `rotateTo(view)` views from `viewsTaxonomy.json` (lateral L/R, anterior, posterior, superior, inferior)
- `faceRegion(regionId)` turns the region toward camera; respects hemisphere (Broca's, Wernicke's are left only)
- `highlightRegion(regionId | null)`
- `setColourRegions(bool)`, `setAnnotations(bool)`
- `resetView()`
- `getSceneState()` returns current view, visible regions, highlighted region, mode
- Every command returns a truthful result object `{ ok, did, reason }`. Never claim success that did not happen (Atlas bug).
- Prerequisite: `BrainOrbitControls` gains a tween API plus instant cancel on user drag (Atlas `cancelCameraMotion` pattern). Scroll-zoom does not cancel (decided in M1).

### Layer 2: Voice bridge (browser)
- `@elevenlabs/react` (current package; Atlas uses deprecated `@11labs/react`). Requires `ConversationProvider`. Pin exact version.
- Client tools map 1:1 to scene commands, wrapped by the Atlas `voiceClientTools.js` normalizer and alias expander (copied).
- Two-way: app sends `sendContextualUpdate` on meaningful player actions (region clicked, rotation settled on a new view, Study mode entered, player took hold of the brain and what it interrupted, player let go). Atlas never did this.
- Text input via `sendUserMessage`, transcript in store (Atlas pattern).

### Layer 3: Server (new; Express on Railway)
- Serves `dist/`, replaces static hosting.
- No login: launch is public. An anonymous, HMAC-signed, host-bound httpOnly device cookie (signing ported from Atlas) identifies the device for its caps.
- `POST /api/voice/token` mints a conversation token only after the device cookie, the per-IP rate limit and the caps pass. Agent ID never ships to the client (Atlas exposed it).
- Metering per device: 8-minute session cap, 15-minute daily cap, counted across conversations.
- Global daily minute budget (`VOICE_GLOBAL_DAILY_MAX_SECONDS`). When it is spent, voice reports itself unavailable until the next day; the game is unaffected.
- `POST /api/voice/log-gap` webhook with shared-secret verification (Atlas webhooks were unauthenticated).

## Agent tools (V1)

Client tools: `face_region`, `rotate_to_view`, `highlight_region`, `clear_highlight`, `set_colour_regions`, `set_annotations`, `lookup_region`, `list_regions`, `get_scene_state`.

Server tool: `log_knowledge_gap` (every question the guide cannot answer from `brainRegions.json` becomes curation backlog for the Cerebral Expert).

## Neuroscience integrity
- `lookup_region` returns the exact JSON record. Tools are the authority on the 20 regions. The 21 `knowledge/kb` files are attached as a RAG knowledge base for depth beyond the regions; when they disagree with a tool, the tool wins.
- Persona prompt and tool schemas live in the repo (`agent/persona.md`, `agent/tools.json`), versioned. Dashboard mirrors repo, never the reverse. Model and voice IDs pinned in repo.
- Hard rules in prompt: no left-brain/right-brain myth, cerebellum is cognitively complex, unknowns go to `log_knowledge_gap` and are spoken as "beyond my notes for now."

## Embodiment
No orb. The brain is the body.
- New shader uniform `uVoiceLevel` from `getOutputVolume()` modulates hatching density and Fresnel edge weight while speaking.
- Region under discussion warms via `highlightRegion` as it is named.

## Milestones (TDD each: failing tests, commit, implement)
- M1 Scene commands + orbit tween with drag-cancel. Pure unit tests, no voice.
- M2 Study mode shell (gamePhase `study`, game paused) + `uVoiceLevel` shader uniform driven by a mock level. Includes a test that entering Study mode turns auto-rotate off, so the brain does not drift away from a region the guide just faced; the player's own controls stay unchanged. Also wires the real BrainScene adapter for the M1 scene commands.
- M3 Express server: anonymous device cookie, token mint, per-IP rate limit on the token route, per-device caps, global daily budget, gap webhook. Supertest. Minute caps count per player per day across conversations, so switching guides cannot reset the 8-minute session or 15-minute daily cap. Deployed to a Railway staging environment first.
- M4 Voice bridge: before the mic opens for the first time, show: "Talking with your guide sends your voice to ElevenLabs, our voice provider. Audio isn't stored; transcripts are kept for 30 days to improve the guide. Please don't share personal details." Then: client tools, normalization, contextual updates. Mocked SDK. Adds the Settings guide picker (change applies to the next conversation; "Switch now" warns and restarts), the voice-map module (guide to ElevenLabs voice ID), and restarting the conversation on a guide switch.
- M5 Agent config in repo + 20-question integrity eval script (myths, lateralization, buried regions, out-of-scope). Launch gate: the eval and the 7 acceptance conversations must pass before voice goes public.

## M2 test list (written 2026-10-04)

- **Specimen space.** `regionGeometry.json` is measured from raw mesh positions, but the painted model's node carries an 8.1 degree rotation and a translation that the loader bakes in. `describeNormalization` records the source matrix with the bounds; `createSpecimenSpace` maps a geometry point to where the scene draws it inside the specimen. The scene adapter exposes this as `toSpecimenSpace(point)`, replacing M1's `getPivot()`, and `toSpecimenDirection(axis)` (rotation only) for the six view axes, which live in the same raw frame as the centroids and `labelsPerView`. `rotateTo`, the medial fixed views and `getSceneState` all use converted axes; without this, `rotate_to_view` and the reported view stay about 8 degrees off. `faceRegion` fails truthfully ("not loaded") until the specimen exists.
- **Persistent guide highlight.** `resolveHighlight` holds the voice highlight steadily (`VOICE_HIGHLIGHT_PULSE` = 1) until cleared. Kyle: it is drawn as the region's own Colour Regions tint under unchanged linework, on its own `uVoiceRegion` uniform, so it reads differently from the game's feedback and never dims other regions or withdraws their colour; game feedback takes over while it runs and behaves exactly as before when there is no voice highlight.
- **BrainScene adapter.** `createBrainSceneAdapter` drives the scene controls and voice highlight, routes colour and labels through App state (so the on-screen toggles stay in sync), reports App's mode, and clears the guide highlight on leaving Study mode (`resetForGame`).
- **Build flag.** `isVoiceEnabled` reads `VITE_VOICE_ENABLED` (only the string `'true'` enables it); with it off, no Study control appears and Study mode cannot be entered.
- **First guide choice.** Entering Study mode with no saved guide asks the player to pick Sylvi or Rollo first; the choice is saved per browser and survives blocked storage (falls back to asking).
- **Study mode.** Entered from the ready screen or a paused game only, never mid-countdown or mid-fall; leaving returns where it came from and never resumes falling words. A Study control appears when the brain is ready and no game runs, styled and placed with the existing typographic toggles (Colour Regions, Annotations), and in the compact settings menu on mobile; Begin and Pause stay out of Study mode. `sceneModeForPhase` reports `'study'` only in Study mode.
- **Auto-rotate.** `stopAutoRotate()` on entering Study mode stops the spin without counting as the player's first interaction; drag, zoom and the camera are unchanged. It stays off after leaving.
- **Voice level.** `uVoiceLevel` starts at 0; the shader applies it only as `(1.0 + uVoiceLevel * GAIN)` factors on hatch density and edge weight (gains at most 0.5), so silence renders today's engraving. `smoothVoiceLevel` rises fast and falls slowly, clamped to 0..1; `mockVoiceLevel` drives it until M4.

## M3 test list (written 2026-10-05)

- **Configuration.** All variables are required, with no silent defaults for the caps; any missing or invalid one makes voice unavailable (named, never echoed). The webhook secret is required in production (Kyle, 2026-10-05): without refunds every conversation costs the full 480 s, about 37 conversations a day site-wide on an 18,000 s budget. Outside production it is optional and refunds are off.
- **Device cookie.** `bg_device`: anonymous (a random id, no IP or user agent), HMAC-signed with `VOICE_SESSION_SECRET`, bound to the request host, httpOnly, SameSite=Lax, Secure in production, host-only. A tampered or foreign-host cookie is replaced. Hosts outside `VOICE_HOSTS` get no voice (localhost allowed outside production).
- **Rate limit.** `POST /api/voice/token` allows `TOKEN_RATE_LIMIT` (20 per 10 minutes) per IP, regardless of cookies, then 429 with `Retry-After`. Twenty, not six, because schools put a whole class behind one address (Kyle, 2026-10-05).
- **Reserve, then refund.** Minting reserves the session cap, or what the device has left if less, against the device's daily cap and the global budget; under 30 seconds left refuses. The post-call webhook settles the reservation to the real duration, capped at the session cap: the unused part is refunded, an overrun beyond a short reservation is charged. A reservation settles once; a conversation id settles once. If ElevenLabs cannot mint a token, the reservation is released in full. No report, no refund. Days are UTC, so the reset is 5pm Pacific: refusals and the status route carry `resetsInSeconds`, and players are told "voice returns in about 3 hours", never "tomorrow" (`describeVoiceUnavailable`). A refund applies to the day of its reservation. A valid reservation the server no longer remembers (minted before a restart) is charged its real duration to the global budget, once per conversation.
- **Matching a conversation to its reservation (proposal).** The token response carries a signed reservation (`<random id>.<HMAC>`), which the client passes back to ElevenLabs as the dynamic variable `reservation` alongside `guide_name`. ElevenLabs echoes dynamic variables in the webhook (`data.conversation_initiation_client_data.dynamic_variables`). The server verifies the HMAC, so a forged reservation is ignored, and settles each reservation and each conversation id at most once, so a replay changes nothing. A client can only name a reservation it was given, and every reservation still refunds at most its own unused time, so misnaming cannot create minutes. To confirm in M4 with a live call: that a dynamic variable not used in the prompt is still echoed; if not, the fallback is the client reporting its conversation id to the server.
- **Webhook.** Signature `t=<secs>,v0=<hex HMAC-SHA256 of "t.body">` (checked against the official ElevenLabs JS SDK), constant-time compare, timestamp no older than 30 minutes and not from the future. Forged: 401. Replayed, other agent, other event types, or no valid reservation: 200 and ignored (ElevenLabs retries 5xx, 408 and 429 only, so a 200 ends retries).
- **Token response.** `{ conversationToken, guideName, voiceId, maxSeconds, dynamicVariables: { guide_name, reservation } }`. The agent id, API key, session secret and webhook secret never appear in any response.
- **Serving.** `dist` statically, `index.html` for unknown app routes, 404 for missing assets and unknown API routes. Missing variables leave the game serving and voice reporting `not_configured`.
- **Storage: rebuilt from ElevenLabs (Kyle, 2026-10-05).** The ledger stays in memory; a Railway volume would take the game offline on every deploy. On startup the server reads today's conversations for our agent (`GET /v1/convai/conversations?agent_id&call_start_after_unix=<UTC midnight>&page_size=100&summary_mode=exclude`, following `next_cursor`; fields checked against the official SDK) and restores the global total: each conversation's `call_duration_secs` capped at the session cap, and the full cap for any still `initiated`, `in-progress` or `processing`. ElevenLabs bills us, so it is the most accurate source. Restored conversation ids are remembered, so their webhooks never count twice. Per-device counts start fresh after a restart (accepted: players can clear cookies anyway). If the rebuild fails, voice reports `restoring` and the server retries after 5 s, 15 s, 60 s, then every 5 minutes; the game is unaffected. The API key must be allowed to read conversation history.
- **Branches.** M3 never goes to `main` first, because `main` deploys production. Once approved it goes to a `staging` branch, which the Railway staging environment tracks; production gets it only after it works there. Staging needs its own domain in `VOICE_HOSTS`.

## M3 fix: unused tokens cannot drain the budget (tests written 2026-10-05)

As first built, each token reserved up to 8 minutes until its webhook arrived, so one address minting without connecting could spend the whole day's budget in under 20 minutes, and a player who never connected (mic denied, tab closed) lost the reservation for the day.

- **Caps on open reservations.** At most one per device, two per address, and `VOICE_MAX_OPEN_RESERVATIONS` (10, the ElevenLabs concurrency limit) site-wide. Beyond a cap: 429 with reason `busy`, shown as "The guide is busy. Try again shortly." A burst from one address holds at most two reservations.
- **Conversation id at mint.** The token response carries `conversation_id` (required in the SDK's `TokenResponseModel`). The server records it with the reservation, never sends it to the browser, and matches webhooks by it, so matching no longer depends on the `reservation` variable being echoed or on anything the client reports. The client-reported fallback is dropped.
- **Sweep.** Every `SWEEP_INTERVAL_MS`, each reservation open longer than `RESERVATION_EXPIRY_MS` (token window plus the 8-minute session cap plus margin) is looked up by its conversation id (`GET /v1/convai/conversations/{id}`). Not found, or never past `initiated`: released in full. `done` or `failed`: settled to its real duration (this also covers a lost webhook). Still running, or ElevenLabs unreachable: left open for the next sweep. The token lifetime is not stated in the SDK or the API reference, so a released reservation whose conversation turns up later is still charged its real duration.

## M4 test list (written 2026-10-05)

SDK facts checked against `@elevenlabs/react` 1.16.0 and `@elevenlabs/client` 1.26.0: `startSession({ conversationToken, connectionType: 'webrtc', dynamicVariables, overrides: { tts: { voiceId } }, clientTools })`; client tools may return only a string or number; callbacks `onConnect({ conversationId })`, `onDisconnect({ reason: 'user' | 'agent' | 'error' })`, `onMessage({ message, role: 'user' | 'agent', event_id })`; controls `sendContextualUpdate`, `sendUserMessage`, `getOutputVolume`.

- **Client tools.** The nine tools, named exactly as in `agent/architect-brief.md` section 4 (drift-tested), map snake_case parameters to the scene commands and return results as JSON text. Parameters may arrive as a JSON string or under `arguments` (Atlas normalizer). A throwing command answers `ok: false`, never throws.
- **Moves never outlast the agent.** A tool stops waiting after `TOOL_TIMEOUT_MS` (under the agent's 8 s) and cancels the move; a hidden tab cancels any move. `BrainOrbitControls.cancelMove(reason)` resolves the move with that reason, and the scene commands say why in plain words.
- **Contextual updates** in the prompt's formats: clicked region; grab with what it interrupted; let go with the view; a new view with visible regions (only when it changed); idle 25 s, once until new activity; Study mode entered. A click reports the region, not a let-go.
- **Session lifecycle.** First mic: the consent notice, word for word, saved per browser (asked again if storage is blocked; declining leaves voice off). Then `POST /api/voice/token`, then `startSession` over WebRTC with the voice override always sent and the dynamic variables as returned. The client ends the conversation at the reserved time. Refusals and network failures read in plain words. The speaking level and contextual updates flow only while connected.
- **Guide changes.** While talking, a change applies to the next conversation; "Switch now" (with its warning) ends this one and starts the new guide.
- **Transcript.** Guide and player lines from SDK messages, empty ones dropped, resends replaced, the most recent kept.
- **Shared control (Kyle, 2026-10-05).** Guide and player share the brain like an agent and a user share a browser cursor. Control states, exposed as `getSceneState().control`: `guide_moving`, `player_holding`, `player_exploring`, `guide_free`. Control returns to the guide 2 s after the player's last input; grab, drag and zoom restart the clock (pinch must too when `cursor/two-finger-pan-pinch-b546` merges; keys do not control the brain); hover never counts. Until then `faceRegion` and `rotateTo` refuse, saying the player is still exploring. Zoom never cancels a guide turn, but restarts the clock. A plain click from a free brain reports at once and starts no quiet period. One handoff update when the brain is free replaces the separate release update. Nothing moves the brain by itself when control returns: the guide works from what the player is looking at, unless resuming a cut-off explanation (prompt rule). While the guide turns the brain, an italic line under the title reads "<Guide> is turning…" and the cursor stays the open hand. Every contextual update is worded once, in `CONTEXT_MESSAGES`, which the prompt quotes; the old "rotated; now viewing …" update is dropped (the agent can ask `get_scene_state`).
- **Matching by conversation id.** A webhook without the reservation variable settles through the conversation id the server recorded at mint (see the M3 fix above).

## Blocked microphones (2026-10-05)

The ElevenLabs SDK cannot start a voice session without the microphone: WebRTC setup waits for it and disconnects if it is refused (`@elevenlabs/client` 1.26.0, `WebRTCConnection.js`). So a player cannot type to the guide and still hear it.

- **Built:** the app asks for the microphone after consent and before requesting a token, so a blocked mic reserves nothing. It says: "Your microphone is blocked, so we can't talk aloud. Allow the microphone for this site in your browser settings, then try again. On a school Chromebook, ask your teacher." A conversation that fails to start after its token is minted is released at once (`POST /api/voice/release`): the server refunds only after ElevenLabs confirms the conversation never started, and charges late if it turns up. Without this the one-per-device cap would say "the guide is busy" for up to 30 minutes.
- **Deferred to after launch (Kyle, 2026-10-05): "Type instead".** Text in, text out, the guide still turning and lighting the brain. Decide once staging and launch show how often players hit a blocked mic. It needs:
  1. a second server route that mints a WebSocket signed URL (`get-signed-url`), with the same reservation accounting as the token route;
  2. the text-only override (`overrides.conversation.textOnly`) allowed in the agent's security settings, where only the voice override is allowed today;
  3. its own tests, including that the client tools still turn the brain in text-only mode.

## Known issues

- **Specimen pivot excludes the wrong regions.** `NON_CEREBRUM_REGION_IDS` in `src/utils/brainLoader.js` is `{20, 22}`, ids from an older region scheme; the cerebellum is 19, so the rotation pivot still includes it and sits lower and further back than "upper brain mass" intends. Not fixed on purpose: moving the rotation centre changes how dragging feels for every player (Kyle, 2026-10-04). The specimen-space transform reads the pivot the scene actually uses, so the voice layer is correct either way.

## Open
- Region 15: piriform cortex or midbrain.
- Buried or medial regions (cingulate, precuneus, primary auditory inside the lateral sulcus) need a defined `faceRegion` view and spoken caveat.
- Railway deploy switches from static to Node start command.
