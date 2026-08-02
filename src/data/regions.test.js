import { describe, expect, it } from 'vitest';
import { REGION_COLORS } from './regions.js';

describe('region palette', () => {
  it('uses a faded violet for the temporal association cortex', () => {
    expect(REGION_COLORS.association).toEqual([0.66, 0.58, 0.78]);
  });

  it('distinguishes primary auditory cortex with a brighter pink', () => {
    expect(REGION_COLORS.auditory).toEqual([0.86, 0.60, 0.70]);
  });
});
