# BRAIN GAME
### A Study in Cognition

---

## I. Who We Are

This project is built by a team that operates at the intersection of two disciplines that rarely talk to each other well: game design and cognitive neuroscience.

We are not building an educational app that happens to have a game bolted on top. We are not building a game that uses "brain" as a loose theme. We are building something that could only exist because both disciplines shaped every decision from the ground up.

**The Game Maker** thinks in terms of flow state, feedback loops, escalating challenge curves, and the irreplaceable feeling of "one more round." The Game Maker knows that if the player isn't compelled to rotate that brain one more time, none of the science matters. Every mechanic must earn its place by being genuinely fun, not just instructive.

**The Cerebral Expert** has spent a lifetime studying how the brain processes, learns, adapts, and encodes memory. This person knows that the frontal lobe doesn't just "think" and the temporal lobe doesn't just "hear." The brain is an interconnected system where regions collaborate, compensate, and compete. The Expert ensures that every word, every label, every region mapping in this game reflects how the brain actually works, not how a pop-science infographic oversimplifies it.

When these two perspectives conflict, we don't compromise. We find the design that satisfies both. If the science says a function maps to multiple regions, we don't pick one for simplicity. We design a mechanic that teaches the complexity. If the game design says a mechanic is fun but teaches the wrong thing, we kill it.

---

## II. What We Are Building

**Brain Game** is a web-based interactive learning experience where the player rotates a 3D brain model and catches falling words by aligning them with the correct brain region responsible for that function.

The core loop: a word or phrase drops from above (like Tetris). The player must rotate the brain using their mouse so that the word lands on the correct anatomical region. Correct placement illuminates the region. Incorrect placement causes the word to shatter, with fragments cascading off the brain and falling into an infinite void beneath.

This is spatial reasoning meets neuroanatomy meets hand-eye coordination. Nothing like it exists.

---

## III. Design Philosophy

### Aesthetic: Victorian Woodblock Etching

Every visual decision passes through this filter. We are not making a modern medical app. We are making something that feels like it was pulled from an 1890s anatomy journal, then given life.

**What this means concretely:**

- Dense parallel lines and crosshatching that follow the brain's surface contours, not a flat screen-space grid
- Tonal variation achieved through line density, never through color gradation (in the default monochrome mode)
- High contrast: dark ink (#1a1a1a) on clean white
- Bold outlines defining silhouettes, rendered via inverted-hull outline pass
- A handcrafted, textural quality where no surface area is "flat"
- Custom GLSL multi-layer hatching shader with 4 density tiers that respond to lighting
- Fresnel edge darkening for that woodcut silhouette quality

**Typography:**

- Display font: Playfair Display or equivalent high-contrast Didone serif
- Body/labels: EB Garamond italic for floating annotations
- All UI text should feel editorial, like a broadsheet or scientific journal
- Period-appropriate language where natural ("Cerebral Regions," "A Study in Cognition")
- Fine leader lines radiating from specific anatomical points to floating labels, with delicate termination marks

**Color Mode (toggle):**

When activated, muted period-appropriate color washes overlay each region beneath the persistent linework, exactly like hand-tinted Victorian anatomical illustrations. The palette:

- Dusty gold
- Sage green
- Mauve
- Slate blue
- Terra cotta
- Muted rose
- Parchment ochre

Colors are semi-transparent, blended behind the dark engraving lines. The lines never change. The "paper" color beneath them shifts per region.

**What this is NOT:**

- Not neon. Not glassmorphism. Not gradient mesh backgrounds.
- Not modern medical illustration. Not textbook diagram.
- Not cute, cartoonish, or gamified in the Duolingo sense.
- Clean, sleek, and serious. But warm. Inviting. Like holding a beautiful old book.

---

## IV. Technical Architecture

### Platform
Web-based (React + Three.js), designed for desktop-first interaction with mouse-driven rotation, responsive and adaptable to mobile touch controls.

### 3D Brain Model
- Source: Custom GLB model (Meshy AI sculpt, decimated to ~100K faces)
- Renderer: Three.js with custom GLSL shaders
- The model's real anatomical normals drive the hatching shader's lighting response, producing authentic contour-following line behavior across actual gyri and sulci

### Two-Tier Region Architecture

**Tier 1: Physical Geometry (8 meshes)**

These are the actual 3D shapes:

1. Left Frontal Lobe
2. Right Frontal Lobe
3. Left Parietal Lobe
4. Right Parietal Lobe
5. Left Temporal Lobe
6. Right Temporal Lobe
7. Occipital Lobe
8. Cerebellum + Brain Stem

The bilateral split produces a visible longitudinal fissure, which is anatomically correct and visually defining.

**Tier 2: Functional Zones (14 regions, painted onto meshes via vertex color data)**

Each mesh carries vertex color encoding that identifies which functional zone each triangle belongs to. This enables per-zone coloring, labeling, raycasting, and game collision detection without requiring 14 separate geometric pieces.

| Zone | Parent Mesh | Function |
|------|-------------|----------|
| Higher Mental Functions (Prefrontal) | Frontal | Planning, decision-making, personality, complex thought |
| Motor Function Area | Frontal | Voluntary movement initiation and control |
| Broca's Area | Frontal (Left) | Speech production, language processing |
| Eye Motor Area | Frontal | Voluntary eye movement and tracking |
| Emotional Area | Frontal | Emotional regulation, social behavior |
| Sensory Area | Parietal | Primary somatosensory processing (touch, temperature, pain) |
| Somatosensory Association Area | Parietal | Integration of sensory information, spatial awareness |
| Sensory Association Area | Parietal | Higher-order sensory interpretation |
| Auditory Area | Temporal | Primary sound processing |
| Wernicke's Area | Temporal (Left) | Language comprehension, semantic processing |
| Olfactory Area | Temporal | Smell processing |
| Association Area | Temporal | Memory formation, object recognition |
| Visual Area | Occipital | Primary and associative visual processing |
| Motor Functions (Cerebellum) | Cerebellum | Balance, coordination, motor learning, timing |

### Shader System

The Victorian engraving effect is achieved through a custom fragment shader, not post-processing. Key parameters:

- 4 hatching layers at different angles and densities
- Smoothstep thresholds controlling which layers activate based on darkness value
- Half-lambert lighting wrapping light around the form so no area goes completely flat
- Fresnel term for edge darkening
- Per-region color uniform for color mode blending
- Highlight uniform for hover/active states

All parameters are tunable without rebuilding architecture.

### Controls
- Orbit rotation via click-drag (vertical axis: drag down rotates brain down)
- Scroll to zoom
- Auto-rotation from lateral (side) view on load, stops on first user interaction
- Inertia on drag release for natural feel
- Region detection via raycasting on hover

---

## V. Game Mechanics (V1)

### Core Loop

1. A word or short phrase appears at the top of the screen and begins falling
2. The player rotates the brain to position the correct region beneath the falling word
3. On correct collision: the region illuminates with a warm glow, score increases, and the word is absorbed into the brain surface with a subtle flash
4. On incorrect collision: the word shatters into fragments that tumble off the brain and fall into the void below
5. Next word drops

### Scoring (V1 - Simple)

Every time the player visits and plays, they accumulate points. That is the entire scoring system for V1. No leaderboards, no lives, no timers, no streaks. Just: play, score points, learn.

Future versions can layer in difficulty tiers, timed modes, streak multipliers, and comparative scoring. But V1 proves the core mechanic is engaging on its own.

### Word Bank Design Principles

This is where the Cerebral Expert earns their keep. The word bank is not a trivia list. It is a carefully constructed teaching tool.

**Difficulty Tiers (for future implementation, but designed now):**

- **Tier 1 (Obvious):** "VISION" lands on the Occipital lobe. "HEARING" lands on the Auditory Area. These teach the broadest mappings.
- **Tier 2 (Functional):** "PLANNING A TRIP" lands on the Prefrontal area. "CATCHING A BALL" lands on the Cerebellum. These teach applied functions.
- **Tier 3 (Nuanced):** "UNDERSTANDING SARCASM" lands on the Right Temporal association area. "FEELING YOUR PHONE VIBRATE IN YOUR POCKET" lands on the Somatosensory area. These teach subtlety and challenge assumptions.
- **Tier 4 (Expert):** "PHANTOM LIMB SENSATION" lands on the Somatosensory Association Area. "TIP-OF-THE-TONGUE PHENOMENON" lands on the boundary of Wernicke's and the Temporal Association area. These reward deep knowledge.

**Critical rule:** If a function genuinely involves multiple regions, we do not pretend it maps to one. We either accept multiple correct answers or we design the word to target the primary processing region with a tooltip explaining the network. The science is never sacrificed for clean game design.

### Feedback Design

- **Correct:** Region glows warmly (shader shifts from ink-on-white to a warm amber luminance). A brief factoid appears in Victorian typeset: "Broca's Area, named for Pierre Paul Broca, 1861. The seat of articulate speech."
- **Incorrect:** Word shatters. Fragments obey physics, tumbling off the curved brain surface and falling. The correct region pulses subtly, teaching through the failure. A gentle annotation appears showing where it should have gone.
- **The void below:** There is no floor. Fragments fall into infinity. This reinforces the stakes, lost knowledge disappears, without being punishing.

---

## VI. UI Framework

The UI wraps the 3D brain, never competing with it. The brain is always the hero.

### Layout
- Brain centered, occupying the majority of the viewport
- Title "BRAIN GAME" in large Didone serif at top, with "A Study in Cognition" as subtitle
- Minimal controls: Color Mode toggle, Labels toggle, Score display
- Score rendered in period-appropriate typography, possibly with an ornamental frame
- All UI elements feel like they belong on the same page as the brain, part of the same Victorian journal spread

### Toggle Controls
- "Colour Regions" (Victorian British spelling, intentional)
- "Annotations" for labels
- Styled as small typographic toggles, not modern switches or buttons

### Responsive Adaptation (Mobile)
- Touch-drag replaces mouse orbit
- Pinch-to-zoom replaces scroll
- UI elements reflow to not occlude the brain on smaller viewports
- Word-catching mechanic works via touch rotation, same mental model

---

## VII. Neuroscience Integrity Standards

This section exists because the Cerebral Expert demands it.

1. **No false simplifications.** If we say the occipital lobe "processes vision," we acknowledge in tooltips or learning content that it also handles visual memory, spatial processing, and interacts heavily with the parietal lobe for visuospatial integration.

2. **Lateralization is real but overstated in pop culture.** We do not reinforce "left brain = logical, right brain = creative." Our bilateral mesh architecture lets us teach actual lateralization (language predominantly left hemisphere) without the myth.

3. **The cerebellum is not just "balance."** It is increasingly understood to play roles in cognitive timing, emotional regulation, and even language processing. Our word bank should reflect this emerging understanding at higher difficulty tiers.

4. **Neuroplasticity as a meta-lesson.** The game itself is an exercise in neuroplasticity. The player is literally building spatial memory associations between brain anatomy and function. We should acknowledge this somewhere in the experience, the game is doing to the player's brain what the game is teaching about the brain.

5. **Sources matter.** Every claim in the word bank and factoids should be traceable to peer-reviewed neuroscience or established clinical neuroanatomy texts (Kandel's Principles of Neural Science, Purves' Neuroscience, Nolte's The Human Brain). We do not cite pop-science books as primary sources.

---

## VIII. Development Workflow

We follow a strict phased approach:

### Phase 1: Research
Read relevant files. Review existing code. Identify what is working and what needs iteration. No code is written in this phase. We surface questions and map the current state against the target state.

### Phase 2: Plan
Clarifying questions surface. Architecture is proposed. We discuss tradeoffs openly and challenge assumptions before committing.

### Phase 3: Execute
Confirmation is explicit before writing code. We use test-driven development:
1. Write tests based on expected input/output
2. Run tests and confirm they fail
3. Commit tests when satisfied
4. Only then implement until tests pass

### Build Sequence (Confirmed)
1. Get the 3D brain model right with the engraving shader (visual fidelity confirmation) **[In Progress]**
2. Layer in functional zone mapping (vertex color encoding for 14 regions)
3. Build the word-catching game mechanic (falling words, collision detection, rotation targeting)
4. Add scoring system (V1: simple accumulation)
5. Add feedback system (illumination on correct, shatter on incorrect)
6. Build the Victorian magazine UI frame around the brain
7. Responsive/mobile adaptation
8. Word bank curation and difficulty tiering

---

## IX. What Success Looks Like

A person opens this in their browser. They see a slowly rotating brain that looks like nothing they have encountered on the internet before. It is beautiful. It is clearly a brain. It looks like it was etched by hand in 1890 and somehow came to life on their screen.

A word begins to fall. "SPEECH." They grab the brain, spin it, and try to catch the word on the right spot. They get it wrong. The word shatters. The correct region pulses. They think: "Oh, Broca's Area. Left frontal." They did not read that in a textbook. They learned it by failing at a game. And they want to try again.

That is the product. That is the intersection. That is what happens when a game maker and a cerebral expert build something together instead of separately.

---

*"The brain is wider than the sky." - Emily Dickinson, c. 1862*
