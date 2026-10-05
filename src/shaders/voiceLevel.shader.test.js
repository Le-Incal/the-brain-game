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
