# BRAIN GAME — Cursor Kickoff Prompt

Copy everything below this line and paste it into Cursor as your first prompt.

---

I'm handing off a project called Brain Game. Read the README.md and .cursorrules files first. Do not write any code until I say so. This is the research and planning phase.

## What This Is

A web-based 3D brain model rendered with a custom Victorian woodblock engraving GLSL shader. The player rotates the brain and catches falling words by aligning them with the correct anatomical region. React + Three.js + Vite.

## Where We Left Off

We built this as a single monolithic JSX artifact in Claude.ai and hit the file size ceiling. The project has been refactored into proper modules but has NOT been run in this form yet. The shader code is battle-tested across multiple iterations. The module wiring is new and untested.

## The Brain Model

I have a GLB file created with Meshy AI. It's a detailed anatomical brain (cerebrum with gyri/sulci, cerebellum, brain stem). It needs to go in `public/brain.glb`. The model has been decimated to roughly 50-100K faces. The visual quality comes from the shader, not polygon count.

## What Works (Proven in Previous Iterations)

1. **The GLSL hatching shader** — 4-layer crosshatch that activates at different darkness thresholds. Half-lambert lighting. Fresnel edge darkening. Darkness capped at 0.90 so you always see linework, never solid black. This has been tuned through about 8 iterations.

2. **The orbit controls** — spherical orbit with inertia, auto-rotation that stops on first interaction, scroll zoom.

3. **The region data** — 14 functional zones with Victorian color palette, a curated word bank with 4 difficulty tiers, neuroscience factoids, and multi-region acceptance for words that legitimately span regions.

## What Has NOT Been Tested in This Refactored Form

1. **GLB loading pipeline.** The `brainLoader.js` uses Three.js GLTFLoader. The `classifyVertex()` function assigns region IDs based on vertex position. The coordinate axes may need adjustment depending on how the model was exported.

2. **Shader material hookup.** The uniforms need to be created and the custom `regionId` vertex attribute needs to flow from the loader through to the shader.

3. **The game mechanic.** `gameEngine.js` is scaffolded with the full API but has no rendering or animation. Words need to fall as HTML overlays, collision needs screen-to-world raycasting, and incorrect answers need a shatter/fragment effect.

4. **CSS2D labels.** The annotations toggle exists in the UI but isn't wired to Three.js CSS2DRenderer yet.

## Critical Constraints

- **Aesthetic is non-negotiable.** Victorian woodblock engraving. Dense hatching lines. Playfair Display and EB Garamond fonts. Muted hand-tinted colors in colour mode. No modern UI patterns, no neon, no glassmorphism. Read the .cursorrules.

- **Neuroscience accuracy is non-negotiable.** The word bank has `acceptAlternates` arrays for words that map to multiple regions. Do not simplify region mappings. Do not reinforce left-brain/right-brain myths. The cerebellum is not just "balance."

- **The shader is the soul of the product.** If something breaks visually, fix the shader parameters before restructuring anything. The tunable constants are at the top of `fragmentShader.js`.

## Proposed Build Sequence

Phase 1 — Get it rendering:
1. Run `npm install && npm run dev`
2. Place brain.glb in public/
3. Verify the model loads and the engraving shader renders correctly
4. Fix any axis/orientation issues in the vertex classifier
5. Test the colour regions toggle and hover raycasting

Phase 2 — Game mechanic:
1. Implement falling word rendering (HTML overlay positioned above the 3D canvas)
2. Word-to-region collision detection (when word reaches vertical center, raycast from word's screen position to find which region it's over)
3. Correct answer: region glows warm amber, word absorbs, factoid appears in Victorian typeset
4. Incorrect answer: word shatters into letter fragments that tumble with CSS physics, correct region pulses
5. Score accumulation (simple V1, no lives or timers)

Phase 3 — Polish:
1. CSS2D floating labels with leader lines for annotations toggle
2. Victorian UI refinements (ornamental score frame, period-appropriate language)
3. Mobile responsive adaptation
4. Loading state ("Preparing the specimen...")

## Your First Task

Read the full codebase. Read README.md and .cursorrules. Then tell me:

1. What do you see as the riskiest integration point?
2. Do you spot any issues with how the shader uniforms are wired between brainScene.js and the fragment shader?
3. What's your recommended approach for the word-to-region collision detection — HTML overlay with raycasting, or fully 3D text objects?

Do not write code yet. Let's align on the plan first.
