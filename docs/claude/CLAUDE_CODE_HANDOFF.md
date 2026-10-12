# Claude Code Handoff: Brain Game

Date: 2026-10-11, evening. Written at the end of a build session with Kyle in claude.ai. Read `CLAUDE.md` first for the rules; this file is the state of play. It replaces the 2026-10-02 version, whose Step 0 and M1 are long done.

## 1. Where we are

| Track | Status |
|---|---|
| **A. Voice layer** | Built and on `staging`: the voice guide is the front door, guides Study, and coaches the game. Kyle is testing on staging. **Not ready for `main`.** |
| **B. Knowledge base** | Built (`knowledge/`). Every fact is `proposed` until Kyle approves it as steward. |
| **C. Graph view** | Later. |

## 2. Repo state (verified 2026-10-11)

- **`staging`**: code as of `1ce59b8`, then the commit that adds this handoff; deployed to Railway staging (`https://the-brain-game-staging.up.railway.app`). Full suite: **82 files, 1,261 tests passing.**
- **`main` at `04ef3d4`**, production. Untouched by this work. Kyle: "We are not ready to push."
- The voice build is switched on only where `VITE_VOICE_ENABLED=true` (staging).

**On Kyle's Mac:** the working copy was on `staging` at `54b93e2`, 35 commits behind (34 of code, then this handoff). Before pulling, remove the untracked `src/assets/quill.svg` (the pull adds the same file and git refuses to overwrite an untracked one):

```bash
rm src/assets/quill.svg
git pull --ff-only origin staging
npm install
npx vitest run          # expect 82 files, 1,261 passing
```

## 3. The live ElevenLabs agent ("The Specimen", branch Main)

- **Prompt:** exactly section 3 of `agent/architect-brief.md`. Verify by SHA-256 of the prompt with blank lines removed: `ac16068f0f6fe088f86c1e58eadef364801f035bb0d1ba5a65ab9d4b638dc1cf` (128 lines).
- **Tools:** 18 client tools, exactly section 4 of the brief (a test checks `AGENT_TOOL_NAMES` against it). `set_annotations` and `set_voice` must stay detached.
- **LLM:** Claude Haiku 4.5. First message empty, wait time -1 (the app plays a recorded welcome). Overrides allowed: Voice ID, text only.
- **Guides:** Sylvi (voice "Cruella") is the default since 2026-10-11; Rollo (voice "Wilf") is chosen in Settings.
- **Last publish:** "Game guide: set_game_speed, set_difficulty, switch_mode, give_hint, play_example; prompt game section; misses stay quiet" (2026-10-11).
- **Editing it:** every change needs Kyle's explicit OK. Press "Sync Now" before editing: a stale draft re-attached `set_annotations` twice. Read the Review Changes diff before publishing; replace the auto-generated commit message, which has been wrong.

## 4. What was built (2026-10-11)

**Front door.** The guide is present from arrival in Explore and Study. Bottom bar: Colour Regions, Play the Game, Study the Brain, Settings (Section appears in Study only). A recorded welcome plays 4 s after the brain appears, counting only visible time. The transcript streams in a thin column on the right, with a quill-marked writing field, small Voice and Motion switches, and the sound notice. The live session rests after 30 s of quiet and wakes on speech, writing or a click; on screen it is one conversation.

**Midline section.** Study only. The brain turns to its left side and `public/section/midsagittal.png` is laid over it. The guide opens it with `show_section`. Kyle will mask the plate (keep 1278×1116, transparent background).

**Game guide.** The guide never moves or lights the brain while a scored word can be in the air. It can:
- `play_example`: an unscored example word (turns the region to the top, tilted 12°, measured on the painted model). On the first Play of a visit, with a conversation open, it offers one; the game starts after 6 s of quiet (20 s at most without the player speaking).
- `give_hint`: where to look, then the lobe, then the region. The word keeps falling.
- `set_game_speed`, `set_difficulty`, `set_colour_regions` (now allowed in games), `switch_mode`.
- Levels of hard: each step (a quarter faster, colours off, the exact region) is a level; the score shows Easy, Hard 1, Hard 2...
- Coach: five catches in a row offers "faster or colours off" (the exact region once colours are off at 1.5x or more); three misses in a row or four of the last six offers "slower or colours back on". Six words between offers.
- Misses stay quiet: the guide explains one only when the player asks.

**One mechanism to know.** A contextual update is background the agent reads at its next turn; a user message makes it answer now (ElevenLabs client-to-server events). So offers and the first-Play prompt go as `[app]` user messages (`src/voice/guidePrompter.js`): they wait for the guide's sentence to end, drop after 8 s, and never show in the transcript.

## 5. Open items

1. **Kyle's live test** of the game guide and the front door. Not yet seen live: `[app]` prompts as user messages, and text-only replies (if text-only fails, switch it to a websocket signed URL).
2. **Flagged, not decided:** the brain's turn on load stops only at the first drag, so a player who presses Play without grabbing it plays on a turning brain. Predates this work.
3. **Optional:** set `WELCOME_TTS_MODEL` on Railway if the welcome voice should differ from the default `eleven_turbo_v2_5`.
4. **Before launch:** production webhook and secret; M5 integrity eval; the section plate's anatomy (mixed midsagittal and parasagittal, mammillary bodies, missing pituitary, ventricles, tectum and pineal) and its provenance.

## 6. Waiting on Kyle (do not decide these)

1. Steward review of `knowledge/review/review-2026-10-03.csv` (1,764 proposed records; conflict and flagged rows first).
2. Pointing choices without a source: thalamus and hypothalamus to 20, basal ganglia to 12, secondary somatosensory cortex to 7.
3. Word bank: 16 words accept alternate regions no source supports. Tighten or keep?
4. Region 8 name (currently Somatosensory Association Cortex).
5. Pronunciation dictionary: listen to `knowledge/build/pronunciations.pls` before relying on it.

## 7. File map

| Need | Read |
|---|---|
| Rules | `CLAUDE.md`, `.cursorrules` |
| Agent prompt and tool contract | `agent/architect-brief.md` (sections 3 and 4 are what is live) |
| Front door, bar, Settings, score | `src/frontDoor.jsx`, `src/App.jsx` |
| Guide column, transcript, welcome, rest and wake | `src/voice/GuideColumn.jsx`, `VoicePanel.jsx`, `transcriptStream.js`, `welcome.js`, `restWake.js`, `voiceSession.js` |
| Scene and game commands, client tools | `src/voice/sceneCommands.js`, `gameCommands.js`, `clientTools.js`, `contextUpdates.js`, `guidePrompter.js` |
| Game | `src/game/gameEngine.js`, `levels.js`, `coach.js`, `hints.js`, `demo.js` |
| Section | `src/sectionPlate.js`, `public/section/midsagittal.png` |
| Server (tokens, caps, webhook, welcome, ended) | `server/app.js`, `server/ledger.js`, `server/welcome.js` |
| Voice decisions and history | `docs/claude/VOICE_CONFIG_UPDATE.md`, `docs/claude/VOICE_LAYER_PLAN.md` |
| Knowledge base | `knowledge/README.md`, `knowledge/ONTOLOGY.md` |

## 8. Kickoff prompt

Paste this into Claude Code, opened in the `the-brain-game` folder:

> Read `CLAUDE.md`, then `docs/claude/CLAUDE_CODE_HANDOFF.md` in full. Run the four commands in its section 2 and report in under 150 words: the commit you are on, the test count, and anything inconsistent with the handoff. Do not change code, the ElevenLabs agent or Railway. Then wait for my next task.
