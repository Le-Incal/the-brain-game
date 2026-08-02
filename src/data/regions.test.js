import { describe, expect, it } from 'vitest';
import { REGION_COLORS } from './regions.js';

describe('region palette', () => {
  it('uses a faded violet for the temporal association cortex', () => {
    expect(REGION_COLORS.association).toEqual([0.69, 0.63, 0.77]);
  });

  it('distinguishes primary auditory cortex with a brighter pink', () => {
    expect(REGION_COLORS.auditory).toEqual([0.82, 0.62, 0.69]);
  });
});
