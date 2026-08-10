# Brain Game — Cursor Integration Instructions

Read this fully before writing code. Follow the project workflow: Research (read files, no code) → Plan (propose, ask questions) → Execute (confirm, then TDD).

## What you received

| File | Role |
|---|---|
| `brain_master_painted.glb` | The mesh. `COLOR_1` per-vertex carries regionId + divisionId. `TEXCOORD_3` is the bake atlas. |
| `textures/brain_region_ids_4096.png` | **Authoritative region map.** Single channel, value 1–20 = region id. Sample on `uv3` (TEXCOORD_3) with NEAREST. |
| `textures/brain_region_colors_4096.png` | Same map, pre-colored. Debug/reference only. |
| `brain_regions.json` | 20 regions: names, divisions, hex, hemisphere rules, annotation labels, click descriptions, factoids, acceptAlternates. |
| `color_codes.json` | Palette + the Color Rule. |
| `views_taxonomy.json` | Camera vectors for the 8 axonometric and 6 orthographic reference views. |
| `renders/` | Ground-truth images. If the app ever disagrees with these, the app's material setup is wrong, not the data. |

## Region ID texture — exact loading (do not deviate)

Three failure modes are known and solved. Wrong UV channel → confetti checkerboard. `flipY` left true → regions vertically misplaced. sRGB decode or linear filtering → wrong/blended ids at boundaries.

```js
const regionTex = await new THREE.TextureLoader().loadAsync('textures/brain_region_ids_4096.png');
regionTex.flipY = false;                    // glTF convention
regionTex.colorSpace = THREE.NoColorSpace;  // data texture, never sRGB
regionTex.magFilter = THREE.NearestFilter;
regionTex.minFilter = THREE.NearestFilter;
regionTex.generateMipmaps = false;
```

## Sampling in the engraving shader

The GLB's atlas is `TEXCOORD_3` → attribute `uv3`. Inject into the existing custom material via `onBeforeCompile` (or add equivalent lines if the shader is fully custom):

```js
material.onBeforeCompile = (shader) => {
  shader.uniforms.regionMap        = { value: regionTex };
  shader.uniforms.colourMode       = { value: 0.0 };   // 0 = monochrome, 1 = tinted
  shader.uniforms.highlightRegion  = { value: -1.0 };  // region id to glow, -1 = none
  shader.uniforms.regionPalette    = { value: paletteTexture }; // 20x1 RGBA, NEAREST

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec2 uv3;
      varying vec2 vRegionUv;`)
    .replace('#include <uv_vertex>', `#include <uv_vertex>
      vRegionUv = uv3;`);

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform sampler2D regionMap;
      uniform sampler2D regionPalette;
      uniform float colourMode;
      uniform float highlightRegion;
      varying vec2 vRegionUv;`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      float regionId = floor(texture2D(regionMap, vRegionUv).r * 255.0 + 0.5);
      vec3 regionTint = texture2D(regionPalette, vec2((regionId - 0.5) / 20.0, 0.5)).rgb;
      // Colour Mode: tint sits UNDER the hatching lines; lines never change
      diffuseColor.rgb = mix(diffuseColor.rgb,
                             mix(diffuseColor.rgb, regionTint, 0.40),
                             colourMode);
      // Highlight: warm amber luminance on the active region
      if (abs(regionId - highlightRegion) < 0.5) {
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.78, 0.42), 0.45);
      }`);
};
```

Palette texture from `color_codes.json`:

```js
function buildPaletteTexture(palette) {          // palette = colorCodes.palette
  const data = new Uint8Array(20 * 4);
  for (let id = 1; id <= 20; id++) {
    const hex = palette[String(id)];
    data[(id-1)*4+0] = parseInt(hex.slice(1,3),16);
    data[(id-1)*4+1] = parseInt(hex.slice(3,5),16);
    data[(id-1)*4+2] = parseInt(hex.slice(5,7),16);
    data[(id-1)*4+3] = 255;
  }
  const t = new THREE.DataTexture(data, 20, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
```

## Raycast picking — the logic channel

`COLOR_1` is uint16-normalized: `regionId = round(color1.r * 65535)`, `divisionId = round(color1.g * 65535)`. Three.js exposes it as a BufferAttribute (commonly named `color_1`; check `mesh.geometry.attributes`).

```js
function pickRegion(raycaster, mesh) {
  const hit = raycaster.intersectObject(mesh, false)[0];
  if (!hit) return null;
  const attr = mesh.geometry.attributes.color_1 ?? mesh.geometry.attributes.COLOR_1;
  const ids = [hit.face.a, hit.face.b, hit.face.c].map(i =>
    Math.round(attr.getX(i) * (attr.normalized ? 65535 : 1)));
  // majority vote of the triangle's three vertices
  ids.sort();
  const regionId = ids[1];
  const divisionId = Math.round(attr.getY(hit.face.a) * (attr.normalized ? 65535 : 1));
  return { regionId, divisionId };
}
```

For maximum robustness cross-check against the texture: compute the hit's `uv3` via `hit.uv3` (r160+) or barycentric interpolation, sample `regionMap` on CPU (keep the PNG's pixel data in a canvas), and prefer the texture value when the two disagree. The texture is the visual authority; COLOR_1 is the fast path.

## Game rules from brain_regions.json

```js
const regions = (await (await fetch('brain_regions.json')).json());
const byId = Object.fromEntries(regions.regions.map(r => [r.id, r]));

function isCorrectCatch(wordTargetId, hitRegionId) {
  if (hitRegionId === wordTargetId) return true;
  return byId[wordTargetId].acceptAlternates.includes(hitRegionId);
}
```

- Regions **6 (Broca's)** and **13 (Wernicke's)** exist only on the anatomical left hemisphere (`+x` in model space). The paint already enforces this; no runtime check needed, but never mirror the model or the lateralization teaching breaks.
- Annotations toggle ON → show `annotationLabel` with a leader line to the region.
- Click / correct catch → `name`, `subtitle`, `clickDescription`; the short Victorian line for catch feedback is `factoid`.
- `divisionId` (COLOR_1.g) gives the 7 gross divisions for Level 1 / easy-mode grouping.

## Verification checklist (run before building gameplay)

1. Load the model, enable Colour Mode, orbit to each of the 8 axonometric angles from `views_taxonomy.json`.
2. Compare against `renders/axon_*.png`. Regions must match. Small differences in shading are fine; region PLACEMENT differences are not.
3. If you see: confetti → wrong UV channel; vertical misplacement → flipY; washed-out or blended boundary colors → colorSpace/filtering; specks at region seams → you are not using this package's texture (the gutters here are nearest-neighbor padded specifically to prevent that).
4. `console.assert` spot checks: raycast the cerebellum (yellow, bottom rear) → regionId 19; the brain stem → 20; Broca's patch (left frontal, dark magenta) → 6.

## Do not

- Do not re-bake, resize, or re-compress `brain_region_ids_4096.png` (lossy compression destroys ids).
- Do not enable mipmaps or anisotropy on the id texture.
- Do not read region ids from the colors texture; it exists for human eyes.
- Do not modify COLOR_1 or TEXCOORD_3 in any DCC tool re-export; hand edits invalidate both channels.
