import { describe, expect, it } from 'vitest';
import { computeHighlightPulse } from './brainScene.js';

const brainSceneModule = await import('./brainScene.js');
const { resolveHighlight, createVoiceUniforms, VOICE_HIGHLIGHT_PULSE } = brainSceneModule;

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
