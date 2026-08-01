import { describe, expect, it } from 'vitest';
import vertexShader from './vertexShader.js';
import fragmentShader from './fragmentShader.js';

describe('region shader interpolation', () => {
  it('classifies regions per fragment instead of per triangle', () => {
    expect(vertexShader).toContain('varying vec3 vObjectPosition;');
    expect(fragmentShader).toContain('int classifyRegion(vec3 position)');
    expect(fragmentShader).not.toContain('getRegionWeight');
    expect(vertexShader).not.toContain('vRegionWeights0');
    expect(vertexShader).not.toContain('flat varying float vRegionId;');
  });
});
