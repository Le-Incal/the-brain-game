import { describe, expect, it } from 'vitest';
import { REGION_COLORS } from './regions.js';

describe('region palette', () => {
  it('uses purple for the temporal association cortex', () => {
    expect(REGION_COLORS.association).toEqual([0.62, 0.48, 0.74]);
  });
});
