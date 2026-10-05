import { describe, expect, it } from 'vitest';

const voiceLevelModule = await import('./voiceLevel.js').catch(() => ({}));
const { smoothVoiceLevel, mockVoiceLevel } = voiceLevelModule;

describe('M2: smoothVoiceLevel', () => {
  it('rises quickly toward speech and falls back more slowly', () => {
    const rise = smoothVoiceLevel(0, 1, 0.05);
    const fall = 1 - smoothVoiceLevel(1, 0, 0.05);
    expect(rise).toBeGreaterThan(0);
    expect(rise).toBeLessThan(1);
    expect(fall).toBeGreaterThan(0);
    expect(rise).toBeGreaterThan(fall);
  });

  it('converges on a steady level', () => {
    let level = 0;
    for (let i = 0; i < 120; i += 1) level = smoothVoiceLevel(level, 0.6, 1 / 60);
    expect(level).toBeCloseTo(0.6, 3);
  });

  it('clamps to 0..1 and treats bad input as silence', () => {
    expect(smoothVoiceLevel(0, 7, 10)).toBeLessThanOrEqual(1);
    expect(smoothVoiceLevel(0.5, -3, 10)).toBeGreaterThanOrEqual(0);
    expect(smoothVoiceLevel(0.5, Number.NaN, 10)).toBeCloseTo(0, 6);
    expect(smoothVoiceLevel(Number.NaN, 0, 0.05)).toBe(0);
  });
});

describe('M2: mockVoiceLevel', () => {
  it('is deterministic, within 0..1, and varies like speech', () => {
    const samples = Array.from({ length: 200 }, (_, i) => mockVoiceLevel(i * 25));
    expect(samples).toEqual(Array.from({ length: 200 }, (_, i) => mockVoiceLevel(i * 25)));
    for (const value of samples) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.3);
  });
});
