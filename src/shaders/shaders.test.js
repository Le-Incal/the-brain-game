import { describe, expect, it } from 'vitest';
import vertexShader from './vertexShader.js';
import fragmentShader from './fragmentShader.js';

describe('region shader interpolation', () => {
  it('decodes sparse atlas IDs from a dedicated discrete texture', () => {
    expect(fragmentShader).toContain('uniform sampler2D uRegionIdMap;');
    // The painted id texture is unwrapped on TEXCOORD_3, a different unwrap
    // from the engraving maps, and must be read with NEAREST so an id is never
    // interpolated into an id that does not exist.
    expect(fragmentShader).toContain(
      'int atlasRegionId = int(floor(texture2D(uRegionIdMap, vUvRegionId).r * 255.0 + 0.5));'
    );
    expect(vertexShader).toContain('attribute vec2 uv3;');
    expect(vertexShader).toContain('vUvRegionId = uv3;');
    expect(fragmentShader).toContain('varying vec2 vUvRegionId;');
    expect(fragmentShader).toContain('uniform float uRegionIds[20];');
    expect(fragmentShader).not.toContain('int getMaskRegionId(vec3 sampledColor)');
    expect(fragmentShader).not.toContain('int classifyRegion(vec3 position)');
    expect(fragmentShader).not.toContain('getRegionWeight');
    expect(vertexShader).not.toContain('vRegionWeights0');
    expect(vertexShader).not.toContain('flat varying float vRegionId;');
  });

  it('uses the baked etching map as anatomical ink', () => {
    expect(fragmentShader).toContain('uniform sampler2D uEtchingMap;');
    expect(fragmentShader).toContain(
      'texture2D(uEtchingMap, vUv0).r'
    );
    expect(fragmentShader).toContain(
      'float etchedLine = antialiasedThreshold(etching, 0.80);'
    );
    expect(fragmentShader).toContain(
      'float bakedEtching = etchedLine * 0.54;'
    );
    expect(fragmentShader).not.toContain(
      'float bakedEtching = etchedLine * 0.60;'
    );
  });

  it('uses derivatives to suppress subpixel etching and hatch shimmer', () => {
    expect(fragmentShader).toContain(
      'float filterWidth = clamp(fwidth(value) * 0.75, 0.025, 0.12);'
    );
    expect(fragmentShader).toContain(
      'smoothstep(threshold - filterWidth, threshold + filterWidth, value)'
    );
    expect(fragmentShader).toContain(
      'smoothstep(0.12, 0.32, pixelWidth)'
    );
    expect(fragmentShader).not.toContain(
      'texture2D(uEtchingMap, vUv0, -1.0)'
    );
  });

  it('composes crisp line masks over the paper instead of adding gray layers', () => {
    expect(fragmentShader).toContain(
      'float structuralInk = max(cavityInk, curvatureInk);'
    );
    expect(fragmentShader).toContain(
      'float totalInk = max(structuralInk, engravedInk);'
    );
    expect(fragmentShader).not.toContain('float inkStrength');
    expect(fragmentShader).not.toContain('anatomicalInk + silhouette + engravedInk');
  });

  it('uses one controlled parchment blend for every region fill', () => {
    // Lower blends toward parchment less, so the palette reads stronger.
    expect(fragmentShader).toContain(
      'const float REGION_PARCHMENT_BLEND = 0.45;'
    );
    expect(fragmentShader).toContain(
      'vec3 tintedRegionColor = mix(regionColor, uPaperColor, REGION_PARCHMENT_BLEND);'
    );
    expect(fragmentShader).not.toContain('vibrantRegionColor');
    expect(fragmentShader).not.toContain('regionOverlayAlpha');
  });

  it('drives Colour Regions from the authored palette, not a colour mask', () => {
    // The palette lives in brainRegions.json and reaches the shader as
    // uniforms, so a second colour texture can no longer disagree with it.
    expect(fragmentShader).not.toContain('uRegionColorMap');
    expect(fragmentShader).not.toContain('maskColor');
    expect(fragmentShader).toContain(
      'bool colourRegionsActive ='
    );
    expect(fragmentShader).toContain(
      'uColorMode > 0.5 && !selectionActive && !feedbackMode && validRegion'
    );
    // Linework is composited last and is never changed by colour.
    expect(fragmentShader).toContain(
      'finalColor = mix(tintedRegionColor, uInkColor, totalInk);'
    );
  });

  it('uses exact pre-smoothed IDs without crossing UV chart seams', () => {
    expect(fragmentShader).toContain(
      'bool selectedRegion = selectionActive && regionId == selectedRegionId;'
    );
    expect(fragmentShader).not.toContain('getSelectedCoverage');
    expect(fragmentShader).not.toContain('uRegionIdTexelSize');
    expect(fragmentShader).not.toContain('vec2 texelSize = vec2(1.0 / 1024.0);');
    expect(fragmentShader).not.toContain('selectionOverlay');
  });

  it('accepts only region IDs the fragment triangle can legitimately show', () => {
    expect(vertexShader).toContain('attribute float atlasRegionId;');
    expect(vertexShader).toContain('attribute vec4 atlasRegionCandidates;');
    expect(vertexShader).toContain('vAtlasRegionId = atlasRegionId;');
    expect(vertexShader).toContain(
      'vAtlasRegionCandidates = atlasRegionCandidates;'
    );
    expect(fragmentShader).toContain('varying float vAtlasRegionId;');
    expect(fragmentShader).toContain('varying vec4 vAtlasRegionCandidates;');
    // Atlas charts abut without a gutter, so a lookup near a chart border can
    // read unrelated cortex. The triangle's own one-hop label set is the only
    // legitimate vocabulary for that fragment.
    expect(fragmentShader).toContain(
      'bool isRegionCandidate(int regionId)'
    );
    expect(fragmentShader).toContain(
      'bool atlasRegionAllowed = atlasRegionId > 0 && isRegionCandidate(atlasRegionId);'
    );
    expect(fragmentShader).toContain(
      'int regionId = atlasRegionAllowed ? atlasRegionId : nearestCandidateRegion();'
    );
  });

  it('keeps the engraving when a region is selected', () => {
    // Selection turns colour on. It must not flatten the etched surface into
    // tonal shading, which erased the engraving everywhere but the selection.
    expect(fragmentShader).toContain(
      'finalColor = mix(tintedRegionColor, uInkColor, totalInk);'
    );
    expect(fragmentShader).not.toContain('ghostColor');
    expect(fragmentShader).not.toContain('ghostPaper');
    expect(fragmentShader).not.toContain('selectedRegion ? selectedColor');
  });

  it('isolates catch feedback without a solid colour flash', () => {
    // Feedback withdraws other colour washes, dims non-target etching, and
    // pulses the answer's colour under full-strength linework.
    expect(fragmentShader).toContain('uniform float uHighlightPulse;');
    expect(fragmentShader).toContain('const float FEEDBACK_OTHER_INK = 0.38;');
    expect(fragmentShader).toContain(
      'float displayInk = otherDuringFeedback ? totalInk * FEEDBACK_OTHER_INK : totalInk;'
    );
    expect(fragmentShader).toContain(
      'vec3 pulsedFill = mix('
    );
    expect(fragmentShader).toContain(
      'finalColor = mix(pulsedFill, uInkColor, totalInk);'
    );
    // The old path painted a solid tint and erased the woodblock lines.
    expect(fragmentShader).not.toContain(
      'finalColor = tintedRegionColor;'
    );
  });

  it('rejects black UV gutters while preserving sparse interaction IDs', () => {
    expect(fragmentShader).toContain(
      'bool validRegion = regionId > 0;'
    );
    expect(fragmentShader).toContain('int selectedRegionId = int(floor(uSelectedRegion + 0.5));');
    expect(fragmentShader).toContain(
      'bool feedbackRegion = feedbackMode && validRegion && regionId == highlightRegionId;'
    );
  });
});
