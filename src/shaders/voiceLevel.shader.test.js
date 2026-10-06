import { describe, expect, it } from 'vitest';
import fragmentShader from './fragmentShader.js';

describe('M2: hatching answers the voice', () => {
  it('declares the voice level uniform', () => {
    expect(fragmentShader).toContain('uniform float uVoiceLevel;');
  });

  // Each use is a factor of the form (1.0 + uVoiceLevel * GAIN), so a silent
  // guide (level 0) renders exactly the engraving we have today.
  it('modulates hatch density by a factor that is 1.0 in silence', () => {
    expect(fragmentShader).toMatch(/1\.0 \+ uVoiceLevel \* VOICE_HATCH_GAIN/);
  });

  it('modulates the edge weight by a factor that is 1.0 in silence', () => {
    expect(fragmentShader).toMatch(/1\.0 \+ uVoiceLevel \* VOICE_EDGE_GAIN/);
  });

  it('keeps the gains modest', () => {
    for (const name of ['VOICE_HATCH_GAIN', 'VOICE_EDGE_GAIN']) {
      const match = fragmentShader.match(new RegExp(`#define ${name} ([0-9.]+)`));
      expect(match, name).not.toBeNull();
      expect(Number(match[1])).toBeGreaterThan(0);
      expect(Number(match[1])).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('M2 decision: guide highlight in the shader', () => {
  it('has its own uniform', () => {
    expect(fragmentShader).toContain('uniform float uVoiceRegion;');
  });

  it("draws the region's own tint under the full linework, after catch feedback", () => {
    expect(fragmentShader).toContain('bool voiceRegion = uVoiceRegion > -0.5 && validRegion && regionId == int(floor(uVoiceRegion + 0.5));');
    expect(fragmentShader).toMatch(
      /else if \(!feedbackMode && \(selectedRegion \|\| voiceRegion\)\) \{\s*finalColor = mix\(tintedRegionColor, uInkColor, totalInk\);/
    );
  });

  it('never dims the linework of other regions for the guide', () => {
    expect(fragmentShader).not.toMatch(/otherDuringFeedback = [^;]*(uVoiceRegion|voiceActive)/);
  });

  // Kyle, after the first live run: with Colour Regions on, the guide's
  // highlight was invisible among the other washes. It now isolates its
  // region exactly as a player selection does; linework never changes.
  it('withdraws the other colour washes while the guide highlights a region, as a selection does', () => {
    expect(fragmentShader).toContain('bool voiceActive = uVoiceRegion > -0.5;');
    expect(fragmentShader).toContain(
      'uColorMode > 0.5 && !selectionActive && !feedbackMode && validRegion && !voiceActive'
    );
  });
});
