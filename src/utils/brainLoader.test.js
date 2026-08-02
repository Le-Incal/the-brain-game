import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  bakeAndNormalizeMesh,
  computeRegionLabelAnchors,
} from './brainLoader.js';

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

describe('bakeAndNormalizeMesh', () => {
  it('bakes inherited transforms before centering the geometry', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0], 3)
    );
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set(5, 0, 0);
    mesh.updateMatrixWorld(true);

    bakeAndNormalizeMesh(mesh, new THREE.Vector3(6, 0, 0), 2);

    const positions = geometry.getAttribute('position');
    expect(positions.getX(0)).toBeCloseTo(-0.5);
    expect(positions.getX(1)).toBeCloseTo(0.5);
    expect(mesh.position.length()).toBe(0);
  });
});
