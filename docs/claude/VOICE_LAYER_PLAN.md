# Brain Game: Voice Layer Plan (V1)

Status: PLAN PHASE. No code written. Awaiting confirmation to start M1 tests.
Date: 2026-10-01 (updated 2026-10-02: guide names)

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
- Prerequisite: `BrainOrbitControls` gains a tween API plus instant cancel on user drag or wheel (Atlas `cancelCameraMotion` pattern).

### Layer 2: Voice bridge (browser)
- `@elevenlabs/react` (current package; Atlas uses deprecated `@11labs/react`). Requires `ConversationProvider`. Pin exact version.
- Client tools map 1:1 to scene commands, wrapped by the Atlas `voiceClientTools.js` normalizer and alias expander (copied).
- Two-way: app sends `sendContextualUpdate` on meaningful player actions (region clicked, rotation settled on a new view, Study mode entered). Atlas never did this.
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
- `lookup_region` returns the exact JSON record. It is the sole source of anatomical fact. No RAG knowledge base in V1. (Under review: a foundations KB now exists in `agent/kb/`; JSON stays canon if adopted.)
- Persona prompt and tool schemas live in the repo (`agent/persona.md`, `agent/tools.json`), versioned. Dashboard mirrors repo, never the reverse. Model and voice IDs pinned in repo.
- Hard rules in prompt: no left-brain/right-brain myth, cerebellum is cognitively complex, unknowns go to `log_knowledge_gap` and are spoken as "beyond my notes for now."

## Embodiment
No orb. The brain is the body.
- New shader uniform `uVoiceLevel` from `getOutputVolume()` modulates hatching density and Fresnel edge weight while speaking.
- Region under discussion warms via `highlightRegion` as it is named.

## Milestones (TDD each: failing tests, commit, implement)
- M1 Scene commands + orbit tween with drag-cancel. Pure unit tests, no voice.
- M2 Study mode shell (gamePhase `study`, game paused) + `uVoiceLevel` shader uniform driven by a mock level.
- M3 Express server: login, token mint, quotas, gap webhook. Supertest.
- M4 Voice bridge: client tools, normalization, contextual updates. Mocked SDK.
- M5 Agent config in repo + 20-question integrity eval script (myths, lateralization, buried regions, out-of-scope).

## Open
- How Sylvi and Rollo coexist: player chooses a guide (recommended: one persona prompt, name and voice as variables), distinct roles, or duet. If roles, keep them gender-neutral.
- Amend "no RAG in V1" to adopt the foundations KB?
- Region 15: piriform cortex or midbrain.
- Confirm quotas (8 min session, 15 min daily) and access-code gating vs public.
- Buried or medial regions (cingulate, precuneus, primary auditory inside the lateral sulcus) need a defined `faceRegion` view and spoken caveat.
- Railway deploy switches from static to Node start command.
