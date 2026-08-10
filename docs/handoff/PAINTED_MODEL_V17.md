# Brain Game — Painted Model Handoff (v17)

## Contents
- brain_master_painted.glb — 109,002-vertex brain; COLOR_1 carries regionId (r) and divisionId (g) as uint16-normalized.
- textures/brain_region_ids_4096.png — authoritative region id texture (values 1-20; sample on TEXCOORD_3 with NEAREST).
- textures/brain_region_colors_4096.png — same map pre-colored with the palette (debug/reference).
- brain_regions.json — 20 regions: names, divisions, hex colors, hemisphere rules, annotation labels, subtitles, click descriptions, catch factoids, acceptAlternates.
- color_codes.json — palette plus the Color Rule (how to sample, encode, tint, and highlight).
- views_taxonomy.json — axonometric naming taxonomy and all camera vectors.
- renders/ — 6 orthographic color exports (4 elevations + top/under plans) and 8 axonometric color renders.

## Integration order (Three.js)
1. Load GLB; keep the custom engraving shader; add uniforms: regionIdTexture, colourMode, highlightRegionId.
2. Sample brain_region_ids_4096.png in the fragment shader via the mesh's TEXCOORD_3 (uv3). NEAREST filtering, no mips.
3. Colour Mode: blend palette[regionId] under the hatching. Annotations: leader-line labels from brain_regions.json annotationLabel.
4. Raycast picking: read COLOR_1 of the hit triangle's nearest vertex for regionId; confirm against the id texture sample.
5. Game rules: hemisphere lock for regions 6 and 13 (left, +x); acceptAlternates arrays score as correct.

## Provenance
Painted from the artist's six V2 vector mask sheets, artwork-vote priority (17 supreme, laterals over plan views, Wernicke exception),
with the artist's masked corrections applied at pixel-exact coordinates. All 20 regions verified present; brainstem owns the lowest point;
lateralization constraints enforced throughout.
