import { describe, expect, it } from 'vitest';
import { computeHighlightPulse } from './brainScene.js';
import { REGION_IDS } from '../data/regions.js';

const brainSceneModule = await import('./brainScene.js');
const { resolveHighlight, createVoiceUniforms, VOICE_HIGHLIGHT_PULSE, toHighlightUniforms } = brainSceneModule;

describe('M2: the guide highlight persists', () => {
  it('holds a voice highlight steadily until it is cleared', () => {
    const early = resolveHighlight({ now: 1000, feedback: null, voiceRegionId: 6 });
    const late = resolveHighlight({ now: 61000, feedback: null, voiceRegionId: 6 });
    expect(early).toEqual({ regionId: 6, pulse: VOICE_HIGHLIGHT_PULSE });
    expect(late).toEqual(early);
    expect(VOICE_HIGHLIGHT_PULSE).toBeGreaterThan(0);
    expect(VOICE_HIGHLIGHT_PULSE).toBeLessThanOrEqual(1);
  });

  it('lets game feedback take over while it runs, then returns to the voice highlight', () => {
    const feedback = { regionId: 17, startedAt: 1000, until: 3000 };
    expect(resolveHighlight({ now: 1500, feedback, voiceRegionId: 6 })).toEqual({
      regionId: 17,
      pulse: computeHighlightPulse(500),
    });
    expect(resolveHighlight({ now: 3000, feedback, voiceRegionId: 6 })).toEqual({
      regionId: 6,
      pulse: VOICE_HIGHLIGHT_PULSE,
    });
  });

  it('keeps game feedback exactly as before when there is no voice highlight', () => {
    const feedback = { regionId: 17, startedAt: 1000, until: 3000 };
    expect(resolveHighlight({ now: 1200, feedback, voiceRegionId: null })).toEqual({
      regionId: 17,
      pulse: computeHighlightPulse(200),
    });
    expect(resolveHighlight({ now: 3000, feedback, voiceRegionId: null })).toEqual({ regionId: -1, pulse: 0 });
    expect(resolveHighlight({ now: 0, feedback: null, voiceRegionId: null })).toEqual({ regionId: -1, pulse: 0 });
  });
});

describe('M2: voice level uniform', () => {
  it('starts silent', () => {
    expect(createVoiceUniforms()).toEqual({ uVoiceLevel: { value: 0 } });
  });
});

describe('M2 decision: the guide highlight is a steady Colour Regions tint', () => {
  // Kyle: steady, drawn as the region's own Colour Regions tint under unchanged
  // linework, so it reads differently from the game's feedback.
  it('holds at full tint', () => {
    expect(VOICE_HIGHLIGHT_PULSE).toBe(1);
  });

  // The mask follows the painted-region order the shader's uRegionIds use.
  const maskOf = (ids) => REGION_IDS.map((id) => (ids.includes(id) ? 1 : 0));

  it('sends the guide highlight as its own mask, leaving catch feedback untouched', () => {
    expect(toHighlightUniforms({ now: 500, feedback: null, voiceRegionIds: [6] })).toEqual({
      uHighlight: -1,
      uHighlightPulse: 0,
      uVoiceMask: maskOf([6]),
      uVoiceActive: 1,
    });
    const feedback = { regionId: 17, startedAt: 1000, until: 3000 };
    expect(toHighlightUniforms({ now: 1500, feedback, voiceRegionIds: [6] })).toEqual({
      uHighlight: 17,
      uHighlightPulse: computeHighlightPulse(500),
      uVoiceMask: maskOf([]),
      uVoiceActive: 0,
    });
    expect(toHighlightUniforms({ now: 3000, feedback, voiceRegionIds: [6] })).toMatchObject({ uHighlight: -1, uVoiceActive: 1 });
    expect(toHighlightUniforms({ now: 0, feedback: null, voiceRegionIds: null })).toEqual({
      uHighlight: -1,
      uHighlightPulse: 0,
      uVoiceMask: maskOf([]),
      uVoiceActive: 0,
    });
  });

  it('lights a whole lobe at once', () => {
    expect(toHighlightUniforms({ now: 0, feedback: null, voiceRegionIds: [11, 12, 13, 14, 15] }).uVoiceMask).toEqual(
      maskOf([11, 12, 13, 14, 15])
    );
  });
});
