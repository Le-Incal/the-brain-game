# Brain Game: A Study in Cerebral Geography
## Project Description

---

### The Premise

Brain Game is a web-based interactive learning experience that teaches functional neuroanatomy through spatial reasoning and hand-eye coordination. The player rotates a 3D brain model and catches falling descriptive words by aligning them with the correct anatomical region responsible for that function. Correct placement illuminates the region and delivers a neuroscience factoid. Incorrect placement shatters the word into fragments that tumble into a void beneath the brain.

Nothing like this exists. It is not a quiz app with a brain theme. It is not a 3D model viewer with labels. It is a game mechanic built from the ground up to exploit how spatial memory and motor learning encode information more durably than reading or rote memorization. The game is doing to the player's brain exactly what the game is teaching about the brain.

---

### The Team

This project operates at the intersection of two disciplines that rarely collaborate well: game design and cognitive neuroscience.

**The Game Maker** thinks in terms of flow state, feedback loops, escalating challenge curves, and the irreducible feeling of "one more round." If the player isn't compelled to rotate that brain one more time, none of the science matters.

**The Cerebral Expert** has spent a career studying how the brain processes, learns, adapts, and encodes memory. This person knows that the frontal lobe doesn't just "think" and the temporal lobe doesn't just "hear." The brain is an interconnected system where regions collaborate, compensate, and compete.

When these two perspectives conflict, we don't compromise. We find the design that satisfies both. If the science says a function maps to multiple regions, we don't pick one for simplicity. We design a mechanic that teaches the complexity. If a mechanic is fun but teaches the wrong thing, we kill it.

---

### The Aesthetic

Every visual decision passes through a single filter: Victorian woodblock engraving.

We are not making a modern medical app. We are making something that feels like it was pulled from an 1890s anatomy journal and given life. Dense parallel lines and crosshatching follow the brain's surface contours. Tonal variation comes from line density, never color gradation. A custom GLSL shader renders four layers of hatching that activate at different darkness thresholds, producing authentic engraving texture that responds to the brain's real anatomical normals.

The typography is editorial. Playfair Display for display text, EB Garamond italic for floating annotations. Period-appropriate language where natural. Fine leader lines radiate from anatomical points to floating labels. The overall impression is a scientific journal spread that happens to be interactive.

When color mode is activated, muted Victorian palette washes (dusty gold, sage green, mauve, slate blue, terra cotta) overlay each brain region beneath the persistent linework, exactly like hand-tinted anatomical illustrations. The dark engraving lines never change. Only the paper beneath them shifts.

---

### The Technology

Brain Game is built with React, Three.js, and custom GLSL shaders, bundled with Vite. The 3D brain model is a custom GLB mesh created with Meshy AI and processed to carry vertex-level region data.

The architecture uses a two-tier region system. Eight physical meshes define the gross anatomy (bilateral frontal, parietal, and temporal lobes, plus occipital lobe and cerebellum). Fourteen functional zones are painted onto these meshes via a vertex attribute, enabling per-zone coloring, labeling, and game collision detection without requiring fourteen separate geometric pieces.

The shader is the soul of the product. Half-lambert lighting wraps illumination around the form so no area goes completely flat. Fresnel edge darkening produces woodcut silhouette quality. Maximum darkness is capped so linework is always visible, even in the deepest sulci. All visual parameters are tunable without architectural changes.

---

### The Science

Neuroscience integrity is a hard constraint, not a polish pass. The word bank is not a trivia list. It is a curated teaching tool organized into four difficulty tiers, from the obvious ("VISION" maps to Occipital) through the nuanced ("UNDERSTANDING SARCASM" maps to the Temporal Association Area) to the expert ("PHANTOM LIMB SENSATION" maps to the Somatosensory Association Area).

Words that genuinely involve multiple brain regions carry an `acceptAlternates` array listing additional correct answers. We do not pretend complex cognitive functions map to a single spot. We do not reinforce the left-brain/right-brain myth. We treat the cerebellum as the cognitively sophisticated structure emerging research reveals it to be, not just the "balance center." Every factoid in the game is traceable to established neuroanatomy texts.

---

### The Audience

Anyone curious about how their brain works. Students encountering neuroanatomy for the first time. Educators looking for an engagement tool that doesn't sacrifice accuracy. Neuroscience enthusiasts who want their knowledge challenged at higher difficulty tiers. People who simply enjoy beautiful, well-crafted interactive experiences.

The game requires no prior knowledge. Tier 1 words teach broad mappings through play. By Tier 4, the player is internalizing functional neuroanatomy that typically requires graduate coursework to encounter.

---

### What Success Looks Like

A person opens this in their browser. They see a slowly rotating brain that looks like nothing they have encountered on the internet before. It is beautiful. It is clearly a brain. It looks like it was etched by hand in 1890 and somehow came to life on their screen.

A word begins to fall. "SPEECH." They grab the brain, spin it, and try to catch the word on the right spot. They get it wrong. The word shatters. The correct region pulses. They think: "Oh, Broca's Area. Left frontal." They did not read that in a textbook. They learned it by failing at a game. And they want to try again.

---

*"The brain is wider than the sky." — Emily Dickinson, c. 1862*
