> **Historical reference (copied from the claude.ai Project on 2026-10-02).**
> The paint pipeline this describes is complete: see `PAINTED_MODEL_V17.md` and `src/data/brainRegions.json`.
> Region names below predate repo canon. **`src/data/brainRegions.json` wins:** 8 is Somatosensory Association Cortex, 14 is Inferior Temporal Cortex (the fusiform gyrus is a structure inside it), 15 is Piriform Cortex (paint fixed, not midbrain), 20 is Brain Stem (midbrain, pons and medulla).
> Still valid and worth reading: the verified mesh and axis facts, the camera conventions, and the standing rules at the end.

# Brain Game: Region Paint Pipeline Handoff

**Purpose:** Paint 20 anatomical region IDs onto `brain_master.glb` by back-projecting six hand-authored 2D masks, then emit a region JSON for the app.

---

## Read this first

The container filesystem does **not** survive into a new chat. Every intermediate
(parsed mesh, curvature graph, adjacency matrix, alignment parameters) must be rebuilt.
Budget roughly 15 tool calls to get back to where this chat ended.

### Files to upload at the start of the next chat

| File | Why |
|---|---|
| `brain_master.glb` | The mesh. Source of truth for geometry. |
| `Brain_Color_Region_Masks.pdf` | The six masks. **Latest version, all 20 swatches verified.** |
| This document | Context. |

`brain_uv_geometry.json` (60 MB) is **not** needed. It is UV-space only, has no 3D
positions, and cannot contribute to the paint pass. Ignore it.

---

## Verified facts: do not re-derive

Each of these was measured, not assumed. Several corrected an earlier wrong guess.

### Mesh

- 109,002 vertices, 99,685 triangles, single primitive
- Welds to **49,837 unique positions** (UV seams duplicate vertices).
  Any per-vertex write must hit *all* copies of a seam vertex or cracks appear.
- Attributes present: `POSITION`, `NORMAL`, `TEXCOORD_0..3`, `COLOR_0`, `COLOR_1`
- `COLOR_0` = uniform white, `COLOR_1` = uniform black. **Both are empty placeholders.**
- `COLOR_1` is `uint16 VEC4`: 65,536 values per channel, ideal for region IDs.

### Axes

- **x is the mid-sagittal mirror plane.** Nearest-neighbour residual 0.05 vs 0.52 and 0.51
  for the other two axes.
- **+y is superior.** Confirmed by width profile: 44% at vertex, 92% at mid-height,
  tapering to a 6% tail at the bottom (the brain stem).
- **+z is anterior.** Brain stem centroid sits at z = −1.82 with deepest inferior extent
  posterior to it.
- **+x is the model's LEFT** under glTF convention (+Y up, +Z toward viewer, +X viewer's right;
  a model facing +Z has its left at +X). **Verify this independently before shipping.**
  If wrong, Broca's and Wernicke's land on the wrong hemisphere.

### Coverage

- Six orthographic views reach **93.3%** of surface area. 6.7% (9,559 triangles) is
  never visible from any axis and must be filled by geodesic nearest-neighbour.
- Per view: superior 39.1%, inferior 38.0%, anterior 35.9%, posterior 32.6%,
  left 30.7%, right 30.6%.

### Camera conventions (CORRECTED: earlier versions were wrong twice)

```python
# right = forward x up ;  nearness = -(P . forward) ;  sort ascending = far first
CAMS = {
  'left':      ((-1,0,0), (0,1,0)),   # camera on +x side
  'right':     (( 1,0,0), (0,1,0)),
  'anterior':  (( 0,0,-1),(0,1,0)),
  'posterior': (( 0,0, 1),(0,1,0)),
  'superior':  (( 0,-1,0),(1,0,0)),   # NOTE up = +x, not +z
  'inferior':  (( 0, 1,0),(-1,0,0)),
}
```

**Two bugs were made and fixed here. Do not repeat them.**

1. *Inverted depth sort.* Sorting the wrong way renders the far side of the model.
   Caught by asserting cerebellum must not appear from above.
2. *Missing reflections.* All six artwork views are mirrored relative to naive
   projection. After adding flips, scale and aspect solve to 1.00 on every view,
   which proves the artwork proportions were always correct.

Registration results with flips included:

| View | IoU | flipH | flipV |
|---|---|---|---|
| left | 0.635 | 0 | 1 |
| right | 0.608 | 0 | 1 |
| anterior | 0.525 | 1 | 1 |
| posterior | 0.539 | 0 | 1 |
| superior | 0.574 | 1 | 1 |
| inferior | 0.579 | 1 | 1 |

---

## The PDF

`Brain_Color_Region_Masks.pdf`: 7 pages, ~456 KB, **pure vector, zero embedded images.**
(The V2 per-view mask PDFs now in `docs/handoff/masks/` are a later set without legend text.)

- Page 1 = spread of all six views (reference only)
- Pages 2 to 7 = one view each, with the full legend

Page-to-view mapping, determined from which regions appear on each page:

| Page | View | Distinguishing evidence |
|---|---|---|
| 2 | Superior | no cerebellum, no brain stem |
| 3 | **Left lateral** | contains region 6 (Broca's) |
| 4 | Posterior | visual cortex + cerebellum, no frontal |
| 5 | Right lateral | like page 3 but **no** region 6 |
| 6 | Anterior | frontal regions, no occipital |
| 7 | Inferior | contains 15 and 16 |

### Reading it

The 20 legend swatches are `page.rects`, sorted top-to-bottom = regions 1 to 20.
The artwork is `page.curves` with `x0 > 400`. Build the colour→ID lookup from the
swatches rather than transcribing hex codes.

```python
rs = sorted(page.rects, key=lambda r: r['top'])
KEY = {tuple(round(v,3) for v in r['non_stroking_color']): i+1
       for i, r in enumerate(rs)}
```

**All 20 fills are RGB and match their printed hex exactly.** Verified in the current
version. Earlier versions had CMYK, Lab, and duplicate values; all resolved.

Closest colour pair: superior temporal gyrus vs Wernicke's at **5.8 ΔE**
(`#b4bcd6` vs `#adc2da`). Accepted by Kyle. Safe for import because fills are read as
exact vector values, not sampled pixels. Only affects a player's ability to
distinguish them on screen.

---

## Region table (historical names; see banner for current canon)

| # | Region | Division | Hex |
|---|---|---|---|
| 1 | Prefrontal Cortex | Frontal | `#d26477` |
| 2 | Orbitofrontal Cortex | Frontal | `#dc93a0` |
| 3 | Premotor Cortex | Frontal | `#f59a1d` |
| 4 | Supplementary Motor Area | Frontal | `#fabb14` |
| 5 | Primary Motor Area | Frontal | `#dd8a5a` |
| 6 | Broca's Area | Frontal (**left only**) | `#b6557d` |
| 7 | Primary Somatosensory | Parietal | `#6ec763` |
| 8 | Superior Parietal Lobule | Parietal | `#59c2aa` |
| 9 | Angular Gyrus | Parietal | `#3c9693` |
| 10 | Precuneus | Parietal | `#a3d7bf` |
| 11 | Primary Auditory Cortex | Temporal | `#8b93c4` |
| 12 | Superior Temporal Gyrus | Temporal | `#b4bcd6` |
| 13 | Wernicke's Area | Temporal (**left only**) | `#adc2da` |
| 14 | Fusiform Gyrus | Temporal | `#c787c8` |
| 15 | Piriform Cortex | Temporal | `#dcb5c8` |
| 16 | Cingulate Cortex | Limbic Lobe | `#965a96` |
| 17 | Primary Visual Cortex | Occipital | `#a88573` |
| 18 | Visual Association Cortex | Occipital | `#d3b497` |
| 19 | Cerebellum | Cerebellum | `#ffdc64` |
| 20 | Brain Stem: Pons, Medulla | Brain Stem | `#a8a9ac` |

Region presence per view (from the PDF, verified):

```
superior   [1,3,4,5,7,8,9,10,17,18]
left       [1,2,3,4,5,6,7,8,9,10,11,12,14,15,17,18,19,20]
posterior  [7,8,9,10,12,13,14,17,18,19,20]
right      [1,2,3,4,5,7,8,9,10,11,12,14,15,18,19,20]
anterior   [1,2,3,4,11,14,15,16,19,20]
inferior   [1,2,11,12,13,14,15,16,17,18,19,20]
```

Note **6 appears only on left lateral**: lateralisation is encoded in the geometry.
Note **13 appears only on posterior and inferior**: absent from both laterals.

---

## Where the work stopped (historical)

Registration was solved; the remaining IoU gap (0.53 to 0.64) came from stylised artwork outlines.
The next steps were deformable (thin-plate spline) registration, back-projection with
`|normal · view_direction|` vote weighting, nearest-neighbour fill of the never-visible 6.7%,
optional curvature-weighted diffusion to snap boundaries into sulci, then writing region ID to
`COLOR_1.r` and division ID to `COLOR_1.g` as raw uint16.

Shader read:

```glsl
float regionId   = floor(color1.r * 65535.0 + 0.5);
float divisionId = floor(color1.g * 65535.0 + 0.5);
```

---

## Open decisions at the time (status as of 2026-10-02)

1. **Region 15, piriform or midbrain?** Resolved: piriform. The paint is fixed and will not be redone; the midbrain is a structure inside region 20.
2. **Region 12 vs 11 overlap.** Painted as delivered; 11 is shaded across the lateral temporal surface for playability.
3. **Region 13 missing from both lateral views.** Painted as delivered.
4. **Difficulty levels.** Agreed: Level 1 = 6 divisions + simple words; Level 2 = 20 regions + nuanced phrases. The level-2 answer must sit inside the level-1 answer (checkable against division id).
5. **Unlock vs choose** for level 2. Undecided.
6. **Small-region catchability** (Broca's). Needs a hit-tolerance radius or acceptance that it is study-only.

---

## Standing rules agreed in this project (still in force)

- **Region names must be tissue nouns, never functions.** A name may use any of four
  conventions (cytoarchitectural, topographic, eponymous, gross anatomical) but must be
  the conventional term for that piece of tissue. "Primary motor cortex" passes.
  "Motor" does not. Abbreviation is what caused every naming drift; do not shorten.
- **Simplify the target, never the explanation.** Region 11 is shaded across the whole
  lateral temporal surface for playability, and its description says plainly that
  Heschl's gyrus is buried inside the lateral sulcus and invisible on an intact brain.
  Same pattern applies to 10, 16, 17.
- **Functions are tagged `primary` or `contributing`,** so the panel teaches networks
  rather than one-to-one mappings.
- **Colour encodes region** in the current palette (20 colours).
- **Every claim gets a number.** Two camera bugs in this project both looked correct and
  were caught only by assertion ("cerebellum must not be visible from above",
  "primary visual must not appear laterally"). Keep those as regression tests.

## Workflow

Research, then Plan, then Execute, with explicit confirmation before writing code.
TDD: write failing tests first, confirm they fail, commit, then implement.
