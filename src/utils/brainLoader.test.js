import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeRegionLabelAnchors } from './brainLoader.js';

describe('computeRegionLabelAnchors', () => {
  it('places each anchor on a vertex belonging to that rendered region', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        -0.5, 0.1, 0,
        -0.4, 0.2, 0.1,
        -0.45, 0.15, -0.1,
        0.4, -0.2, 0,
        0.5, -0.1, 0.1,
        0.45, -0.15, -0.1,
      ], 3)
    );
    geometry.setAttribute(
      'regionId',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 1)
    );

    const anchors = computeRegionLabelAnchors(
      [new THREE.Mesh(geometry)],
      2
    );

    expect(anchors[0].x).toBeLessThan(0);
    expect(anchors[1].x).toBeGreaterThan(0);
    expect(anchors[0].distanceTo(anchors[1])).toBeGreaterThan(0.7);
    expect(anchors[0].surfaceNormal.length()).toBeCloseTo(1);
    expect(anchors[1].surfaceNormal.length()).toBeCloseTo(1);
    expect(anchors[0].candidates.length).toBeGreaterThan(1);
    expect(anchors[1].candidates.length).toBeGreaterThan(1);
  });
});
