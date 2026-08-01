# Brain Game — Product Requirements Document
### Version 1.0

---

## 1. Overview

**Product Name:** Brain Game: A Study in Cerebral Geography

**One-Liner:** A web-based game where players rotate a 3D brain and catch falling words by aligning them with the correct anatomical region, rendered in a Victorian woodblock engraving aesthetic.

**Problem Statement:** Functional neuroanatomy is taught through static diagrams, textbook memorization, and lecture. These methods fail to exploit the brain's own learning pathways. Spatial reasoning, motor memory, and failure-driven correction encode information more durably than passive reading, but no product combines all three with neuroscientific rigor.

**Solution:** A game mechanic purpose-built to teach neuroanatomy through the same cognitive processes it teaches about. The player physically manipulates a brain to answer questions about what that brain does. Correct and incorrect feedback are immediate, spatial, and memorable.

**Target Users:** Students, educators, neuroscience enthusiasts, and general-audience learners. No prior knowledge required. Content scales from introductory (Tier 1) through graduate-level (Tier 4).

---

## 2. Product Principles

These are ranked. When they conflict, higher-ranked principles override lower ones.

1. **Neuroscience accuracy is never sacrificed for gameplay simplicity.** If a function maps to multiple regions, we design the mechanic to teach that complexity.

2. **The game must be genuinely engaging on its own merits.** If the player isn't compelled to rotate the brain one more time, the science doesn't matter.

3. **The Victorian engraving aesthetic is a core differentiator, not a skin.** Every visual and typographic decision passes through this filter. No modern UI patterns.

4. **Accessibility over exclusivity.** Tier 1 should be completable by anyone. Tier 4 should challenge neuroscience professionals. The same mechanic serves both.

---

## 3. User Stories

### 3.1 Core Game Loop

**US-01: Rotate the brain**
As a player, I can click-drag (or touch-drag on mobile) the 3D brain to rotate it in any direction, so I can view and access all anatomical regions.

Acceptance criteria:
- Horizontal drag rotates the brain around the vertical axis
- Vertical drag rotates the brain around the horizontal axis (drag down = brain tilts down, natural mapping)
- Rotation has inertia on drag release (decays over ~1 second)
- Scroll wheel (or pinch on mobile) zooms in/out within defined limits
- Brain auto-rotates slowly from a lateral view on initial load
- Auto-rotation stops permanently on first user interaction

**US-02: Catch a falling word**
As a player, I see a word or phrase drop from the top of the screen. I rotate the brain so the correct region is positioned beneath the falling word before it passes through.

Acceptance criteria:
- Word appears at a random horizontal position within the central 60% of the viewport
- Word falls at a consistent, readable speed (tunable, starting at ~1.5px/frame)
- Word text is styled in Playfair Display, legible against the white background
- Collision is detected when the word's vertical position reaches the brain's surface area and a raycast from the word's screen position intersects a brain mesh

**US-03: Correct answer feedback**
As a player, when I catch a word on the correct region, I receive immediate positive feedback that teaches me something.

Acceptance criteria:
- The target region illuminates with a warm amber glow (shader uniform shift)
- The word visually absorbs into the brain surface (fade + slight scale-down)
- A factoid appears in Victorian italic typeset (EB Garamond) near the region for 3-4 seconds
- Score increases by the tier's point value (Tier 1: 10, Tier 2: 25, Tier 3: 50, Tier 4: 100)
- If the word has `acceptAlternates`, any listed region is also accepted as correct

**US-04: Incorrect answer feedback**
As a player, when a word hits the wrong region, I see where it should have gone so I learn from the failure.

Acceptance criteria:
- The word shatters into letter fragments
- Fragments tumble off the brain surface and fall into the void below (no floor, infinite fall)
- Fragment physics are approximate (CSS transforms with gravity, slight random rotation)
- The correct region pulses gently for 2-3 seconds, teaching through the error
- A brief annotation appears showing the correct region name
- No score penalty (V1)

**US-05: Word misses the brain entirely**
As a player, if I fail to position any region under a falling word, the word passes through and falls into the void.

Acceptance criteria:
- Word continues falling past the brain's vertical extent
- No shatter effect (the word simply falls intact into the void)
- Correct region pulses briefly
- Next word drops after a short delay

### 3.2 Scoring

**US-06: Session score**
As a player, my score accumulates during a session so I have a simple measure of progress.

Acceptance criteria:
- Score displayed in the upper-right corner in period-appropriate typography
- Score is a running total for the current session
- No leaderboards, lives, timers, or streaks in V1
- Score resets on page reload

### 3.3 Visual Modes

**US-07: Colour Regions toggle**
As a player, I can toggle color-coded regions on and off to see the brain's functional zones.

Acceptance criteria:
- Toggle labeled "Colour Regions" (Victorian British spelling, intentional)
- Off state: monochrome engraving (ink on white)
- On state: muted Victorian palette washes appear beneath the persistent linework
- Each of the 14 functional zones gets a distinct color from the defined palette
- Colors are semi-transparent, blended behind the dark engraving lines
- The linework never changes between modes

**US-08: Annotations toggle**
As a player, I can toggle floating labels that identify each brain region.

Acceptance criteria:
- Toggle labeled "Annotations"
- Labels render in EB Garamond italic at each region's defined `labelPosition`
- Fine leader lines connect each label to the brain surface
- Labels are resolution-independent (CSS2DRenderer, not 3D text)
- Labels remain readable and non-overlapping at default zoom
- Labels orbit with the brain during rotation

### 3.4 Region Hover

**US-09: Hover identification**
As a player, I can hover over any brain region to see its name, so I can learn the anatomy even outside the game loop.

Acceptance criteria:
- Hovering over the brain triggers a raycast that identifies the region under the cursor
- Region name and subtitle appear centered at the bottom of the viewport
- Text has a subtle white text-shadow for legibility against the brain
- The hovered region highlights in the shader (slight warm tint)
- Highlight clears immediately when the cursor leaves the brain

---

## 4. Functional Requirements

### 4.1 Brain Model

| Requirement | Specification |
|---|---|
| Format | GLB (GLTF binary) |
| Source | Meshy AI custom sculpt |
| Polygon count | 50,000 - 100,000 faces |
| Physical meshes | 8 (bilateral frontal, parietal, temporal lobes + occipital + cerebellum/brain stem) |
| Functional zones | 14 (mapped via vertex `regionId` attribute) |
| Region assignment | Positional vertex classifier (V1), painted vertex colors (future) |
| Normalization | Auto-centered and scaled to unit bounding box on load |

### 4.2 Shader System

| Requirement | Specification |
|---|---|
| Type | Custom GLSL (vertex + fragment), not post-processing |
| Hatching layers | 4, at different angles and densities |
| Layer activation | Smoothstep thresholds based on darkness value |
| Lighting model | Half-lambert (dot * 0.5 + 0.5) for wrapped illumination |
| Edge treatment | Fresnel darkening (power: 2.0) |
| Darkness cap | 0.90 maximum (linework always visible) |
| Light floor | 0.10 minimum (detail preserved in shadow) |
| Color mode | Per-region color uniform blended behind linework |
| Highlight | Per-region warm tint uniform for hover/active states |

### 4.3 Word Bank

| Requirement | Specification |
|---|---|
| Total words (V1) | 24+ across 4 tiers |
| Tier structure | Tier 1: obvious, Tier 2: functional, Tier 3: nuanced, Tier 4: expert |
| Multi-region support | `acceptAlternates` array on entries with legitimate multi-region functions |
| Factoids | One per word, traceable to Kandel, Purves, or Nolte |
| Recycling | Pool resets when all words in active tiers are exhausted |

### 4.4 Typography

| Element | Font | Weight/Style |
|---|---|---|
| Title ("BRAIN GAME") | Playfair Display | 900, uppercase, 0.18em tracking |
| Subtitle | EB Garamond | 400 italic, 0.12em tracking |
| Falling words | Playfair Display | 700 |
| Factoids | EB Garamond | 400 italic |
| Hover labels | EB Garamond | 400 italic |
| Toggle buttons | Playfair Display | 400, uppercase, 0.1em tracking |
| Score | EB Garamond | 400, uppercase |

### 4.5 Color Palette (Colour Mode)

| Region | Color Name | RGB |
|---|---|---|
| Prefrontal | Dusty gold | (0.82, 0.72, 0.50) |
| Motor | Sage green | (0.65, 0.75, 0.60) |
| Broca's | Mauve | (0.72, 0.58, 0.68) |
| Eye Motor | Slate blue | (0.60, 0.65, 0.72) |
| Emotional | Terra cotta | (0.78, 0.60, 0.50) |
| Sensory | Muted rose | (0.75, 0.65, 0.62) |
| Somatosensory Assoc. | Parchment sage | (0.70, 0.72, 0.65) |
| Sensory Assoc. | Cool slate | (0.65, 0.68, 0.72) |
| Auditory | Warm ochre | (0.72, 0.62, 0.55) |
| Wernicke's | Lavender | (0.68, 0.60, 0.70) |
| Olfactory | Parchment ochre | (0.75, 0.70, 0.55) |
| Association | Warm gray | (0.70, 0.65, 0.60) |
| Visual | Sage slate | (0.62, 0.70, 0.68) |
| Cerebellum | Sandy ochre | (0.72, 0.65, 0.58) |

---

## 5. Non-Functional Requirements

### 5.1 Performance

- Target: 60fps on mid-range hardware (2020+ integrated graphics)
- Shader complexity must not degrade below 30fps on low-end devices
- GLB model load time under 3 seconds on broadband
- No visible hitching during orbit rotation or word animation

### 5.2 Browser Support

- Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- WebGL 2.0 required (graceful fallback message if unavailable)
- Desktop-first, mobile-responsive

### 5.3 Accessibility

- Keyboard navigation is a V2 consideration (V1 is mouse/touch only)
- Sufficient contrast on all text elements (the high-contrast engraving aesthetic helps)
- Loading state with status message ("Preparing the specimen...")
- Error state with actionable message if model fails to load

### 5.4 Responsiveness

- Desktop: brain centered, occupying 70-80% of viewport height
- Tablet: full-width brain, controls repositioned to avoid occlusion
- Mobile: touch-drag replaces mouse orbit, pinch-to-zoom replaces scroll, UI elements reflow below brain if needed

---

## 6. Technical Architecture

### 6.1 Stack

| Layer | Technology |
|---|---|
| Framework | React 18 |
| 3D Rendering | Three.js r170 |
| Shaders | Custom GLSL (not post-processing) |
| Build | Vite 6 |
| Test | Vitest |
| Deployment | Railway |
| Version Control | GitHub |

### 6.2 Project Structure

```
brain-game/
├── public/
│   └── brain.glb              3D brain model
├── src/
│   ├── main.jsx               Entry point
│   ├── App.jsx                 UI frame, state management
│   ├── shaders/
│   │   ├── vertexShader.js     Normals + regionId passthrough
│   │   └── fragmentShader.js   4-layer crosshatch engraving
│   ├── data/
│   │   └── regions.js          14 zones, colors, word bank
│   ├── utils/
│   │   ├── brainLoader.js      GLB loader + vertex classifier
│   │   ├── brainScene.js       Scene, camera, renderer, raycasting
│   │   └── orbitControls.js    Spherical orbit with inertia
│   └── game/
│       └── gameEngine.js       Word dropping, collision, scoring
├── .cursorrules               AI context for Cursor IDE
├── package.json
└── vite.config.js
```

### 6.3 Data Flow

```
GLB File
  → GLTFLoader (brainLoader.js)
  → Vertex classification (classifyVertex assigns regionId per vertex)
  → BufferGeometry with regionId attribute
  → ShaderMaterial (vertexShader passes regionId to fragment)
  → Fragment shader: lighting → darkness → hatching layers → composite

User Input (mouse/touch)
  → OrbitControls (theta/phi update)
  → Camera position recalculation
  → Raycaster (hover detection → regionId lookup → highlight uniform)

Game Loop
  → Word selected from bank (filtered by tier)
  → Word rendered as HTML overlay (falling animation)
  → On collision: raycast from word screen position → region check
  → Correct: glow + absorb + factoid + score
  → Incorrect: shatter + correct region pulse + annotation
```

---

## 7. Neuroscience Integrity Standards

These are not guidelines. They are requirements.

**7.1** No false simplifications. If we say the occipital lobe "processes vision," we acknowledge in factoids or tooltips that it also handles visual memory, spatial processing, and interacts with the parietal lobe for visuospatial integration.

**7.2** No left-brain/right-brain mythology. Our bilateral mesh architecture teaches actual lateralization (language predominantly left hemisphere) without the pop-science myth.

**7.3** The cerebellum is cognitively complex. It is increasingly understood to play roles in cognitive timing, emotional regulation, and language processing. Our word bank reflects this at higher tiers.

**7.4** Multi-region acceptance. When a cognitive function genuinely involves multiple regions, the word carries `acceptAlternates` listing all scientifically defensible target regions. We never force a single-region answer for a multi-region function.

**7.5** Source traceability. Every factoid in the word bank should be traceable to peer-reviewed neuroscience or established clinical neuroanatomy texts: Kandel's Principles of Neural Science, Purves' Neuroscience, or Nolte's The Human Brain.

**7.6** Neuroplasticity as meta-lesson. The game itself is an exercise in neuroplasticity. The player is building spatial memory associations between brain anatomy and function. We acknowledge this somewhere in the experience.

---

## 8. Scope Boundaries

### 8.1 In Scope for V1

- 3D brain rendering with Victorian engraving shader
- Mouse/touch orbit controls with inertia
- Colour Regions toggle
- Annotations toggle (floating CSS2D labels)
- Hover region identification
- Falling word game mechanic
- Correct answer: glow + absorb + factoid
- Incorrect answer: shatter + correct region pulse
- Session score (simple accumulation, no persistence)
- 24+ words across 4 difficulty tiers
- Desktop-first with responsive mobile adaptation
- Railway deployment

### 8.2 Out of Scope for V1

- Persistent user accounts or saved progress
- Leaderboards
- Lives, timers, or streak mechanics
- Difficulty selection UI (all tiers active in V1)
- Sound effects or music
- Tutorial or onboarding flow
- Social sharing
- Analytics or telemetry
- Internationalization
- Keyboard-only navigation
- Offline/PWA support

### 8.3 Considered for V2

- Difficulty tier selection (play Tier 1 only, or all tiers)
- Timed mode with increasing fall speed
- Streak multiplier scoring
- Persistent high score (localStorage)
- Sound design (period-appropriate, mechanical)
- Tutorial overlay on first visit
- "Explore" mode (free rotation with full annotations, no game)
- Additional word bank entries (50+ words)
- Region-specific deep-dive panels with anatomical detail

---

## 9. Build Sequence

This is the confirmed development order. Each phase must be validated before the next begins.

| Phase | Deliverable | Validation Criteria |
|---|---|---|
| 1 | Brain model renders with engraving shader | Visual fidelity matches Victorian engraving reference. Hatching follows surface contours. No solid black areas. Fresnel edges visible. |
| 2 | Functional zones mapped and testable | Colour toggle shows 14 distinct regions. Hover raycast identifies correct region. No gaps between regions. |
| 3 | Word-catching mechanic functional | Words fall, collision detects region, correct/incorrect paths both work. |
| 4 | Scoring system active | Points accumulate on correct answers. Tier multipliers applied. Score displays in UI. |
| 5 | Feedback polish | Glow, shatter, factoid, and pulse animations are smooth and visually consistent with the aesthetic. |
| 6 | Victorian UI frame complete | Title, toggles, score, hover labels are all styled and positioned. Layout feels like a journal spread. |
| 7 | Responsive/mobile | Touch controls work. UI reflows. No occlusion on small viewports. |
| 8 | Word bank complete | All 24+ words tested for accuracy. Factoids reviewed. acceptAlternates verified. |

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GLB model orientation doesn't match vertex classifier axes | High | Blocks Phase 1 | classifyVertex() coordinate system is documented. Adjust axis mapping on first load test. |
| Shader hatching too dense or sparse on real geometry | Medium | Visual quality | All constants are tunable at the top of fragmentShader.js. Iterative visual tuning expected. |
| Raycasting accuracy insufficient for small regions (Broca's, Olfactory) | Medium | Game fairness | Accept larger hit zones via acceptAlternates. Consider region proximity tolerance. |
| Performance degradation on mobile | Medium | Limits audience | Shader complexity is fixed (no branching). Model poly count is the main lever. Reduce to 30K faces if needed. |
| Word-to-region collision feels imprecise | High | Core mechanic quality | Provide visual indicator of which region the word is currently above. Let the player see the targeting before collision. |

---

## 11. Success Metrics (V1)

V1 is a proof-of-concept. Metrics are qualitative.

- Does the engraving shader produce a reaction of "I've never seen anything like this on the web"?
- Do players learn at least one brain region mapping they didn't know before, without reading a textbook?
- Do players voluntarily play more than 5 rounds in a session?
- Does the game feel fair when it marks an answer correct or incorrect?
- Can a neuroscience professional review the word bank and factoids without finding errors?

---

*Document version: 1.0*
*Last updated: June 2026*
