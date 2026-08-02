import { describe, expect, it } from 'vitest';
import {
  computeLabelLeaderWidth,
  getResponsiveSpecimenScale,
} from './brainScene.js';

describe('computeLabelLeaderWidth', () => {
  it('places annotation text beyond the brain with a generous gutter', () => {
    expect(computeLabelLeaderWidth('left', 420, 360, 640, 180)).toBe(100);
    expect(computeLabelLeaderWidth('right', 580, 360, 640, 180)).toBe(100);
  });
});

describe('getResponsiveSpecimenScale', () => {
  it('reduces the specimen on phone screens', () => {
    expect(getResponsiveSpecimenScale(375)).toBe(0.68);
  });

  it('preserves the desktop specimen scale', () => {
    expect(getResponsiveSpecimenScale(1200)).toBe(1);
  });
});
