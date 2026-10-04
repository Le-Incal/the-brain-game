# Claude Code Handoff: Brain Game

Date: 2026-10-02. Written at the end of a planning and build session with Kyle in claude.ai. Read `CLAUDE.md` first for the rules; this file is the state of play.

## 1. What we are doing

Three tracks. Only Track A needs code from you next.

| Track | Goal | Status |
|---|---|---|
| **A. Voice layer** | Give the brain an AI voice (ElevenLabs). The brain speaks as itself, turns to show its regions, lights them as it talks, and answers questions. V1 is "puppeteer" in a dedicated Study mode. | Plan locked. ElevenLabs agent configured. **Next: M1 (scene commands), TDD.** |
| **B. Knowledge base** | A sourced knowledge graph (anatomy, functions, networks) that the guide's tools read from, plus narrative files for depth. | **Built** on branch `kb/ontology`. Every fact is `proposed` until Kyle approves it as steward. |
| **C. Graph view** | A later mode that morphs the 3D brain into a Neo4j network map, driven by the same guide. | Later. The ontology is already Neo4j-ready. |

## 2. Repo state (verified 2026-10-02)

**`main` at `d8435d9`** ("Let difficulty carry the region palette"), with these files present but uncommitted:

- `CLAUDE.md`
- `agent/architect-brief.md`
- `docs/claude/CLAUDE_CODE_HANDOFF.md` (this file), `VOICE_M1_HANDOFF.md`, `VOICE_LAYER_PLAN.md`
- `docs/reference/atlas/` (4 files)
- `docs/handoff/BRAIN_GAME_HANDOFF.md`
- `docs/handoff/masks/` (6 PDFs, about 47 MB; excluded via `.git/info/exclude`, local only)

**`kb/ontology` at `d05a9b6`**, 4 commits ahead of `main`, checked out in the worktree `.worktrees/kb-ontology`:

1. `72cb362` vocabulary, schema, fixtures and failing tests
2. `70d9321` validator, reasoner and outputs
3. `de66ec6` extracted knowledge base (proposed facts)
4. `d05a9b6` independent audit applied, originality guard

On that branch: **237 tests pass** (the original 99 plus 138 for the knowledge base), `npm run kb -- validate` reports **0 errors**, all **40 competency questions** pass, and every region meets its coverage gate. It adds `knowledge/`, `scripts/kb.mjs`, the `yaml` dev dependency, an `npm run kb` script and a `knowledge/build/` line in `.gitignore`.

**ElevenLabs:** the agent is configured to match `agent/architect-brief.md`: system prompt, first message, 9 client tools with mocks, timeouts of 8 s, pre-tool speech off. As of 2026-10-04 it has two guides with one British voice each (Rollo the default), the `guide_name` dynamic variable, the Voice ID override, and the 21 kb files attached with RAG on; see `docs/claude/VOICE_CONFIG_UPDATE.md` for the live state and the decisions behind it. The `log_knowledge_gap` webhook is deferred until the server exists (M3).

## 3. Locked decisions

- **V1 scope:** puppeteer. Voice only in Study mode, never during the falling-word game. Full two-way conversation.
- **Persona:** the brain in the first person, named Sylvi or Rollo (from the Sylvian fissure and the fissure of Rolando). Neither claims to be the anatomist. "Rollo" is spelled with two l's.
- **Controls:** existing user controls do not change. Any grab mid-move hands control back instantly.
- **Paint is fixed.** Region names follow `brainRegions.json`: 8 Somatosensory Association Cortex, 14 Inferior Temporal Cortex (fusiform gyrus inside it), 15 Piriform Cortex, 20 Brain Stem (midbrain, pons, medulla inside it).
- **Code reuse:** port patterns from the Atlas (`docs/reference/atlas/`), do not share a package.
- **Facts:** the agent's tools are the source of anatomical fact. M1's `lookupRegion` reads `brainRegions.json`; later the tools read the compiled graph `src/data/brainGraph.json`, adding fields only (the tool contract never breaks).
- **Knowledge architecture:** no triple store, no RDF; git is the store; Neo4j is for the graph view only.
- **Medical:** the guides never give medical advice and say so directly.

## 4. Step 0: consolidate the repo (ask Kyle first)

Fast-forward `main` to the knowledge base branch and commit the handoff files. `main` has not moved since the branch was cut, so this is conflict-free.

```bash
git status                         # expect only the untracked files listed in section 2
git merge --ff-only kb/ontology
git worktree prune                 # the worktree was registered from a cloud VM path that does not exist locally
rm -rf .worktrees/kb-ontology      # its files match d05a9b6; keep the kb/ontology branch
npm install                        # picks up the yaml dev dependency
npx vitest run                     # expect 237 passing
npm run kb -- validate             # expect 0 errors
git add CLAUDE.md agent docs/claude docs/reference docs/handoff/BRAIN_GAME_HANDOFF.md
git commit -m "Add Claude Code handoff, voice plan, agent brief and Atlas reference"
```

Then, as a separate commit (no history rewrite), stop tracking the Python bytecode that `kb/ontology` committed by mistake:

```bash
# add __pycache__/ and *.pyc to .gitignore
git rm --cached scripts/__pycache__/atlas_uv.cpython-310.pyc
git add .gitignore
git commit -m "Stop tracking Python bytecode"
```

Do not push unless Kyle asks.

## 5. Next task: M1, scene commands (Track A)

The full spec is `docs/claude/VOICE_M1_HANDOFF.md`: the tool contract table, the verified facts about `orbitControls.js` and `regionGeometry.json`, the complete M1 test list (R1 to R3 regression guards, 0 geometry, A orientation math, B programmatic move with drag-cancel, C scene commands) and the decisions already made.

In short: a pure, testable command layer (`faceRegion`, `rotateTo`, `highlightRegion`, `clearHighlight`, `setColourRegions`, `setAnnotations`, `lookupRegion`, `listRegions`, `getSceneState`), each returning `{ ok, did, reason }` truthfully, plus an eased programmatic move in `BrainOrbitControls` that any user grab cancels instantly. No voice, no UI in M1.

Notes since that handoff was written:

- The Atlas files it mentions are now in `docs/reference/atlas/`.
- The tool names and parameters in the M1 contract are exactly what the live ElevenLabs agent calls. Do not rename them.
- M1's `lookupRegion` returns `{ ok, region: { id, name, division, hemisphere, subtitle, description, factoid } }`, with `description` taken from `clickDescription`.

Later milestones (from `VOICE_LAYER_PLAN.md`): M2 Study mode and the `uVoiceLevel` shader uniform; M3 Express server (login, token mint, minute caps, gap webhook); M4 voice bridge with `@elevenlabs/react`; M5 agent config pulled into the repo and a 20-question integrity eval.

## 6. File map

| Need | Read |
|---|---|
| Rules and orientation | `CLAUDE.md`, `.cursorrules`, `docs/claude/BRAIN_GAME_PROJECT_INSTRUCTIONS.md` |
| M1 spec and test list | `docs/claude/VOICE_M1_HANDOFF.md` |
| Live ElevenLabs agent, guide voices and their decisions | `docs/claude/VOICE_CONFIG_UPDATE.md` |
| Voice architecture and milestones | `docs/claude/VOICE_LAYER_PLAN.md` |
| Agent persona, tools, acceptance conversations | `agent/architect-brief.md` |
| Code M1 touches | `src/utils/orbitControls.js` (+ its tests), `src/utils/brainScene.js`, `src/data/regions.js`, `src/data/brainRegions.json`, `src/data/regionGeometry.json`, `src/data/viewsTaxonomy.json`, `scripts/generate-region-geometry.py` |
| Atlas patterns to port (M3, M4) | `docs/reference/atlas/README.md` and the three files beside it |
| Knowledge base | `knowledge/README.md` (commands, steward workflow), `knowledge/ONTOLOGY.md` (spec v0.4) |
| Source reports behind every fact | `knowledge/sources/R1-region-report.md`, `knowledge/sources/R2-gap-run.md` |
| Painted model and mesh facts | `docs/handoff/PAINTED_MODEL_V17.md`, `docs/handoff/CURSOR_INTEGRATION.md`, `docs/handoff/BRAIN_GAME_HANDOFF.md` (historical; axes, camera conventions, standing rules) |
| Mask artwork | `docs/handoff/masks/*.pdf` (not needed for M1) |

## 7. Waiting on Kyle (do not decide these)

1. **Steward review** of `knowledge/review/review-2026-10-03.csv` (1,764 proposed records; 20 conflict rows and 70 flagged rows first).
2. **Pointing choices without a source:** thalamus and hypothalamus point to region 20, basal ganglia to 12, secondary somatosensory cortex to 7.
3. **Word bank:** 16 words accept alternate regions that no source supports. Tighten or keep?
4. **Region 8 name:** currently the default, Somatosensory Association Cortex.
5. ~~**Sylvi and Rollo**~~ **Resolved 2026-10-04:** one agent, one prompt with `guide_name`, one British voice per guide, Rollo the default. Recorded in `docs/claude/VOICE_CONFIG_UPDATE.md`, whose section 6 holds the follow-up questions.
6. **Voice quotas:** 8-minute sessions and a 15-minute daily cap behind an access code, or public?
7. **Pronunciation dictionary:** listen to `knowledge/build/pronunciations.pls` through ElevenLabs before relying on it.

## 8. Kickoff prompt

Paste this into Claude Code, opened in the `the-brain-game` folder:

> Read `CLAUDE.md`, then `docs/claude/CLAUDE_CODE_HANDOFF.md` in full, then every file listed under "Rules and orientation", "M1 spec and test list" and "Code M1 touches" in its file map. Report back in under 200 words: the repo state you find compared with section 2, and anything missing or inconsistent. Then ask me to confirm Step 0. After I confirm, run Step 0 exactly as written and report the test and validator results. Then start M1 as `docs/claude/VOICE_M1_HANDOFF.md` specifies: write the M1 tests, run the full suite, confirm the new tests fail and the R1 to R3 regression guards pass, commit the tests, and stop for my review. Do not write implementation code yet.
