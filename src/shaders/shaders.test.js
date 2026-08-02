import { describe, expect, it } from 'vitest';
import vertexShader from './vertexShader.js';
import fragmentShader from './fragmentShader.js';

describe('region shader interpolation', () => {
  it('classifies regions per fragment instead of per triangle', () => {
    expect(vertexShader).toContain('varying vec3 vObjectPosition;');
    expect(fragmentShader).toContain('int classifyRegion(vec3 position)');
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

  it('applies functional region colour as a translucent top overlay', () => {
    const engraving = fragmentShader.indexOf(
      'vec3 finalColor = mix(shadedPaper, uInkColor, totalInk);'
    );
    const regionOverlay = fragmentShader.indexOf(
      'finalColor = mix(finalColor, vibrantRegionColor, regionOverlayAlpha);'
    );

    expect(engraving).toBeGreaterThan(-1);
    expect(regionOverlay).toBeGreaterThan(engraving);
    expect(fragmentShader).toContain(
      'float regionOverlayAlpha = feedbackActive ? 0.96 :'
    );
    expect(fragmentShader).toContain(
      'regionOverlayAlpha *= 1.0 - totalInk;'
    );
  });

  it('uses a saturated region wash for game feedback', () => {
    expect(fragmentShader).toContain(
      'vec3 vibrantRegionColor = mix(vec3(regionLuma), regionColor, 1.35);'
    );
    expect(fragmentShader).toContain(
      'feedbackActive ? 0.96'
    );
    expect(fragmentShader).toContain(
      'finalColor = mix(finalColor, amber, 0.08);'
    );
  });
});
