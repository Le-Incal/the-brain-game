import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyVertexRegionAttributes,
  bakeAndNormalizeMesh,
  decodeAtlasVertexAttributes,
} from './brainLoader.js';

function buildAtlasIdentityBuffer(regionIds, candidates) {
  const buffer = new ArrayBuffer(
    4 + regionIds.length + 4 + candidates.length * 4
  );
  const view = new DataView(buffer);
  view.setUint32(0, regionIds.length, true);
  new Uint8Array(buffer, 4, regionIds.length).set(regionIds);
  view.setUint32(4 + regionIds.length, candidates.length, true);
  new Uint8Array(buffer, 8 + regionIds.length, candidates.length * 4).set(
    candidates.flat()
  );
  return buffer;
}

describe('applyVertexRegionAttributes', () => {
  it('gives every triangle the label set it may display', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
        3
      )
    );
    geometry.setIndex([0, 1, 2, 1, 3, 2]);
    const mesh = new THREE.Mesh(geometry);

    const applied = applyVertexRegionAttributes(
      [mesh],
      buildAtlasIdentityBuffer([8, 8, 19, 19], [
        [8, 19, 0, 0],
        [19, 0, 0, 0],
      ])
    );

    // Per-triangle data requires each triangle to own its corners.
    expect(applied).toBe(6);
    expect(mesh.geometry.index).toBeNull();
    expect(mesh.geometry.getAttribute('position').count).toBe(6);
  });

  it('resolves candidates per de-indexed triangle corner', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
        3
      )
    );
    geometry.setIndex([0, 1, 2, 1, 3, 2]);
    const mesh = new THREE.Mesh(geometry);

    applyVertexRegionAttributes(
      [mesh],
      buildAtlasIdentityBuffer([8, 8, 19, 19], [
        [8, 19, 0, 0],
        [19, 0, 0, 0],
      ])
    );

    expect(Array.from(mesh.geometry.getAttribute('atlasRegionId').array)).toEqual(
      [8, 8, 19, 8, 19, 19]
    );
    const candidates = mesh.geometry.getAttribute('atlasRegionCandidates');
    expect(candidates.itemSize).toBe(4);
    expect(Array.from(candidates.array.slice(0, 12))).toEqual([
      8, 19, 0, 0, 8, 19, 0, 0, 8, 19, 0, 0,
    ]);
    expect(Array.from(candidates.array.slice(12, 24))).toEqual([
      19, 0, 0, 0, 19, 0, 0, 0, 19, 0, 0, 0,
    ]);
  });

  it('refuses data whose counts disagree with the mesh', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    geometry.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geometry);

    const applied = applyVertexRegionAttributes(
      [mesh],
      buildAtlasIdentityBuffer([8, 8, 19, 19], [[8, 19, 0, 0]])
    );

    expect(applied).toBe(0);
    expect(mesh.geometry.getAttribute('atlasRegionId')).toBeUndefined();
  });
});

describe('decodeAtlasVertexAttributes', () => {
  it('decodes raw normalized uint16 COLOR_1 channels without interpolation', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      '_color_1',
      new THREE.Uint16BufferAttribute([
        1, 1, 0, 65535,
        19, 6, 0, 65535,
      ], 4, true)
    );

    const result = decodeAtlasVertexAttributes(geometry);

    expect(result).toEqual({ valid: true, vertexCount: 2 });
    expect(Array.from(geometry.getAttribute('regionId').array)).toEqual([1, 19]);
    expect(Array.from(geometry.getAttribute('divisionId').array)).toEqual([1, 6]);
  });

  it('rejects a present but empty COLOR_1 atlas instead of inventing labels', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'color_1',
      new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4, true)
    );

    expect(decodeAtlasVertexAttributes(geometry)).toEqual({
      valid: false,
      vertexCount: 1,
    });
    expect(geometry.getAttribute('regionId')).toBeUndefined();
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
    expect(geometry.getAttribute('regionId')).toBeUndefined();
  });
});
