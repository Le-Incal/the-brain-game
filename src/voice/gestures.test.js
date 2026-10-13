import { describe, expect, it } from 'vitest';

const gestureModule = await import('./gestures.js').catch(() => ({}));
const { gestureStrength } = gestureModule;

// The guide's speaking motion. Kyle, 2026-10-13: the slow sway (it moved only
// 0.18 degrees at the pace of her syllables) is replaced by puppet speech, a
// beat on every syllable and a tilt on each phrase (puppet.test.js). How
// strongly it plays keeps its rules.
describe('How strongly the brain speaks', () => {
  // Kyle, 2026-10-06: a lit region kept the brain dead while the guide
  // talked. Lit and still now means half strength; moving, showcasing, held
  // or explored still means none.
  it('runs at full strength when free, half while a region or lobe stays lit, none otherwise', () => {
    const free = { control: 'guide_free', highlighted: false, reducedMotion: false };
    expect(gestureStrength(free)).toBe(1);
    expect(gestureStrength({ ...free, highlighted: true })).toBe(0.5);
    for (const control of ['guide_moving', 'player_holding', 'player_exploring']) {
      expect(gestureStrength({ ...free, control }), control).toBe(0);
      expect(gestureStrength({ ...free, control, highlighted: true }), control).toBe(0);
    }
    expect(gestureStrength({ ...free, reducedMotion: true })).toBe(0);
  });

  it('keeps only the strength rule: the slow sway is gone', () => {
    expect(gestureModule.stepGesture).toBeUndefined();
    expect(gestureModule.createGesture).toBeUndefined();
  });
});
