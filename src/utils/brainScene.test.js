import { describe, expect, it } from 'vitest';
import {
  computeLabelLeaderWidth,
  getResponsiveSpecimenScale,
  getResponsiveSpecimenVerticalOffset,
} from './brainScene.js';

describe('computeLabelLeaderWidth', () => {
  it('places annotation text beyond the brain with a generous gutter', () => {
    expect(computeLabelLeaderWidth('left', 420, 360, 640, 180)).toBe(100);
    expect(computeLabelLeaderWidth('right', 580, 360, 640, 180)).toBe(100);
  });
});

describe('getResponsiveSpecimenScale', () => {
  it('reduces the specimen on phone screens', () => {
    expect(getResponsiveSpecimenScale(375)).toBe(0.73);
  });

  it('steps up cleanly across phone and tablet breakpoints', () => {
    expect(getResponsiveSpecimenScale(480)).toBe(0.73);
    expect(getResponsiveSpecimenScale(481)).toBe(0.8);
    expect(getResponsiveSpecimenScale(640)).toBe(0.8);
    expect(getResponsiveSpecimenScale(641)).toBe(1);
  });

  it('preserves the desktop specimen scale', () => {
    expect(getResponsiveSpecimenScale(1200)).toBe(1);
  });

  it('moves the phone specimen below the description panel', () => {
    expect(getResponsiveSpecimenVerticalOffset(375)).toBe(-0.2);
    expect(getResponsiveSpecimenVerticalOffset(1200)).toBe(0);
  });
});
