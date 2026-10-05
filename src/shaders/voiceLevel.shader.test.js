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

  it('never dims other regions or withdraws their colour for the guide', () => {
    expect(fragmentShader).not.toMatch(/otherDuringFeedback = [^;]*uVoiceRegion/);
    expect(fragmentShader).not.toMatch(/colourRegionsActive =[^;]*uVoiceRegion/);
  });
});
