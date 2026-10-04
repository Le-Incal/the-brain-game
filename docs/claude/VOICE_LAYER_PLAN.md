# Brain Game: Voice Layer Plan (V1)

Status: PLAN PHASE. No code written. Awaiting confirmation to start M1 tests.
Date: 2026-10-01 (updated 2026-10-02: guide names; 2026-10-04: guide voices and knowledge base, see `docs/claude/VOICE_CONFIG_UPDATE.md`)

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
- Access-code login with HMAC-signed, host-bound httpOnly cookie (ported from Atlas).
- `POST /api/voice/token` mints a conversation token only after cookie and quota check. Agent ID never ships to the client (Atlas exposed it).
- Metering per device: 8-minute session cap, 15-minute daily cap (from September design; confirm).
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
- M2 Study mode shell (gamePhase `study`, game paused) + `uVoiceLevel` shader uniform driven by a mock level.
- M3 Express server: login, token mint, quotas, gap webhook. Supertest. Minute caps count per player per day across conversations, so switching guides cannot reset the 8-minute session or 15-minute daily cap.
- M4 Voice bridge: client tools, normalization, contextual updates. Mocked SDK. Adds the Settings guide picker, the voice-map module (guide to ElevenLabs voice ID), and restarting the conversation on a guide switch.
- M5 Agent config in repo + 20-question integrity eval script (myths, lateralization, buried regions, out-of-scope).

## Open
- Guide change mid-conversation: apply to the next conversation, or switch now (ends this one). Kyle to decide.
- First visit: pick a guide on entering Study mode, or start with Rollo and change it in Settings. Kyle to decide.
- Region 15: piriform cortex or midbrain.
- Confirm quotas (8 min session, 15 min daily) and access-code gating vs public.
- Buried or medial regions (cingulate, precuneus, primary auditory inside the lateral sulcus) need a defined `faceRegion` view and spoken caveat.
- Railway deploy switches from static to Node start command.
