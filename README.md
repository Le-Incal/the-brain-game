# BRAIN GAME
### A Study in Cognition

A web-based interactive learning experience where the player rotates a 3D brain model and catches falling words by aligning them with the correct brain region responsible for that function. Victorian woodblock engraving aesthetic. Built with React + Three.js + custom GLSL shaders.

---

## Quick Start

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

**Local preview:** `http://localhost:3000` after `npm run dev`.

A procedural stand-in `public/brain.glb` is included for development. Replace it with your Meshy anatomical model when ready. See [Brain Model](#brain-model) below.

---

## Project Status

### What's Built

| Component | Status | File(s) |
|---|---|---|
| GLSL engraving shader (vertex + fragment) | **Done, tuned** | `src/shaders/` |
| Custom orbit controls (drag, zoom, inertia, auto-rotate) | **Done** | `src/utils/orbitControls.js` |
| Scene manager (camera, renderer, raycasting, CSS2D labels) | **Done** | `src/utils/brainScene.js` |
| Brain model loader (GLB + region classifier) | **Done** | `src/utils/brainLoader.js` |
| Region data (14 zones, colors, ~50-word bank) | **Done** | `src/data/regions.js` |
| Game engine (fall, catch, miss/wrong/correct, tier scoring) | **Done** | `src/game/gameEngine.js` |
| Victorian UI (title, toggles, difficulty, score, feedback) | **Done** | `src/App.jsx` |
| Product docs (PRD, instructions, copy) | **Done** | `docs/claude/` |

### What Needs Work

1. **Replace the procedural stand-in GLB** with the Meshy anatomical model at `public/brain.glb`. Regenerate the stand-in anytime with `npm run generate-brain`. Tune `classifyVertex()` axes once the real mesh is in.

2. **Shader on anatomical geometry.** Hatching density and fresnel may need dialing on the real gyri/sulci. Constants are at the top of `fragmentShader.js`.

3. **Neuroscience review of the expanded word bank** (~50 entries) against Kandel / Purves / Nolte.

4. **Painted vertex colors in Blender** for production region boundaries (replace positional heuristics).

5. **Mobile playtesting** of touch orbit + word catching on small viewports.

Canonical PRD: [`docs/claude/PRD.md`](docs/claude/PRD.md).

---

## Brain Model

The 3D brain was created with Meshy AI and should be decimated to approximately 50,000-100,000 faces. The visual quality comes from the shader, not polygon count.

**To add your model:**

1. Export from your 3D software as `.glb` format
2. Center the origin
3. Decimate to 50-100K faces (Blender: Decimate modifier)
4. Place at `public/brain.glb`

The loader will automatically center, normalize, and assign region IDs to vertices based on their position. For more accurate region boundaries, paint vertex colors in Blender corresponding to the 14 functional zones defined in `src/data/regions.js`.

---

## Architecture

### Two-Tier Region System

**Tier 1 — Physical Geometry (8 meshes in the GLB):**

| # | Mesh | Notes |
|---|---|---|
| 1 | Left Frontal Lobe | Bilateral split produces visible longitudinal fissure |
| 2 | Right Frontal Lobe | |
| 3 | Left Parietal Lobe | |
| 4 | Right Parietal Lobe | |
| 5 | Left Temporal Lobe | |
| 6 | Right Temporal Lobe | |
| 7 | Occipital Lobe | |
| 8 | Cerebellum + Brain Stem | |

**Tier 2 — Functional Zones (14 regions, painted onto meshes via vertex `regionId` attribute):**

| ID | Zone | Parent | Function |
|----|------|--------|----------|
| 0 | Higher Mental Functions (Prefrontal) | Frontal | Planning, decision-making, personality |
| 1 | Motor Function Area | Frontal | Voluntary movement initiation |
| 2 | Broca's Area | Frontal (Left) | Speech production |
| 3 | Eye Motor Area | Frontal | Voluntary eye movement |
| 4 | Emotional Area | Frontal | Emotional regulation |
| 5 | Sensory Area | Parietal | Touch, temperature, pain |
| 6 | Somatosensory Association | Parietal | Sensory integration, spatial awareness |
| 7 | Sensory Association | Parietal | Higher-order interpretation |
| 8 | Auditory Area | Temporal | Sound processing |
| 9 | Wernicke's Area | Temporal (Left) | Language comprehension |
| 10 | Olfactory Area | Temporal | Smell processing |
| 11 | Association Area | Temporal | Memory, object recognition |
| 12 | Visual Area | Occipital | Visual processing |
| 13 | Motor Functions | Cerebellum | Balance, coordination, timing |

### Shader System

The Victorian engraving effect is a custom GLSL fragment shader, not post-processing. The key insight: tonal value is rendered as layers of crosshatched lines that activate at different darkness thresholds.

```
Layer 1 (lightest shadows):  sparse diagonal lines      activates at dark > 0.06
Layer 2:                     cross diagonal lines       activates at dark > 0.22
Layer 3:                     tighter fill lines         activates at dark > 0.38
Layer 4 (deepest shadows):   dense crosshatch           activates at dark > 0.52
```

Lighting uses half-lambert (`dot(N,L) * 0.5 + 0.5`) which wraps light around the form. A fresnel term darkens edges for that woodcut silhouette quality. Maximum darkness is capped at 0.90 so linework is always visible, even in the deepest sulci.

**Color mode** overlays muted Victorian palette washes (dusty gold, sage, mauve, slate blue, terra cotta) beneath the persistent linework, exactly like hand-tinted anatomical illustrations. The lines never change; the "paper" color shifts per region.

### Controls

- Click-drag to orbit (vertical: drag down rotates brain down)
- Scroll to zoom
- Auto-rotation from lateral view on load, stops on first interaction
- Inertia on drag release
- Region detection via raycasting on hover

---

## File Structure

```
brain-game/
├── public/
│   └── brain.glb              ← YOU MUST ADD THIS (3D brain model)
├── src/
│   ├── main.jsx               Entry point
│   ├── App.jsx                 Victorian UI frame, state management
│   ├── shaders/
│   │   ├── index.js            Barrel export
│   │   ├── vertexShader.js     Passes normals + regionId to fragment
│   │   └── fragmentShader.js   4-layer crosshatch engraving shader
│   ├── data/
│   │   └── regions.js          14 functional zones, colors, word bank
│   ├── utils/
│   │   ├── brainLoader.js      GLB loader + binary fallback + region classifier
│   │   ├── brainScene.js       Three.js scene, camera, renderer, raycasting
│   │   └── orbitControls.js    Custom spherical orbit with inertia
│   └── game/
│       └── gameEngine.js       Word dropping, collision, scoring (scaffolded)
├── index.html
├── package.json
├── vite.config.js
├── .cursorrules               AI assistant context for Cursor
└── README.md
```

---

## Game Design

### Core Loop

1. A word or phrase appears at the top and begins falling
2. Player rotates the brain to position the correct region beneath the falling word
3. **Correct:** region illuminates with warm glow, word absorbs into brain, score increases, factoid appears
4. **Incorrect:** word shatters into fragments that tumble off the brain and fall into the void below. Correct region pulses, teaching through failure
5. Next word drops

### Word Bank Tiers

- **Tier 1 (Obvious):** "VISION" → Occipital. "HEARING" → Auditory.
- **Tier 2 (Functional):** "PLANNING A TRIP" → Prefrontal. "CATCHING A BALL" → Cerebellum.
- **Tier 3 (Nuanced):** "UNDERSTANDING SARCASM" → Temporal Association. "PHONE VIBRATING IN POCKET" → Somatosensory.
- **Tier 4 (Expert):** "PHANTOM LIMB SENSATION" → Somatosensory Association. "TIP-OF-THE-TONGUE" → Wernicke's + Temporal Association.

Words that genuinely involve multiple regions have an `acceptAlternates` array. The science is never sacrificed for clean game design.

### Scoring (V1)

Tier points: Tier 1 = 10, Tier 2 = 25, Tier 3 = 50, Tier 4 = 100. Session accumulation only — no leaderboards, lives, timers, or streaks. Difficulty control (T1–T4) sets the max tier in the word pool.

### Miss vs wrong

- **Miss** (word clears the catch line over empty space): intact fall into the void; correct region pulses.
- **Wrong** (lands on an incorrect region): letter shatter; correct region pulses; correction annotation.

---

## Development Workflow

We use TDD:

1. Write tests based on expected input/output
2. Run tests, confirm they fail
3. Commit tests
4. Implement until tests pass

### Suggested Next Steps for Cursor

1. **Drop in the Meshy anatomical GLB** at `public/brain.glb` (replace the procedural stand-in). Retune `classifyVertex()` or paint vertex colors in Blender.
2. **Neuroscience review** of the ~50-word bank and factoids against Kandel / Purves / Nolte.
3. **Playtest** miss vs wrong feedback, difficulty tiers, and mobile touch orbit.
4. **Deploy** to Railway when the specimen and word bank are production-ready.

---

## Neuroscience Integrity

- No false simplifications. Multiple regions acknowledged via `acceptAlternates`.
- No "left brain/right brain" myths. Bilateral architecture teaches actual lateralization.
- Cerebellum is not just balance. It handles cognitive timing, emotional regulation, and language at higher tiers.
- Every factoid traceable to Kandel, Purves, or Nolte.
- Neuroplasticity as meta-lesson: the game is literally doing to the player's brain what it teaches about the brain.

---

## Design References

The aesthetic target is Victorian woodblock engraving / hand-tinted anatomical illustration. Think:
- Henry Gray's *Anatomy* (1858) illustration style
- Ernst Haeckel's *Kunstformen der Natur* linework
- Period broadsheet typography and editorial layout

**What this is NOT:** neon, glassmorphism, gradient mesh, modern medical illustration, textbook diagram, or Duolingo-style gamification. Clean, serious, warm. Like holding a beautiful old book.

---

*"The brain is wider than the sky." — Emily Dickinson, c. 1862*
