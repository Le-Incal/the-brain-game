import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyVertexRegionAttributes,
  bakeAndNormalizeMesh,
  computeAtlasAnnotationAnchors,
  computeRegionLabelAnchors,
  createAtlasAnnotationDefinitions,
  decodeAtlasVertexAttributes,
} from './brainLoader.js';
import { REGIONS, getRegionById } from '../data/regions.js';

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
    geometry.setAttribute('regionId', new THREE.Float32BufferAttribute([1, 1, 1, 19, 19, 19], 1));

    const anchors = computeRegionLabelAnchors(
      [new THREE.Mesh(geometry)],
      [1, 19]
    );

    expect(anchors.get(1).x).toBeLessThan(0);
    expect(anchors.get(19).x).toBeGreaterThan(0);
    expect(anchors.get(1).distanceTo(anchors.get(19))).toBeGreaterThan(0.7);
    expect(anchors.get(1).surfaceNormal.length()).toBeCloseTo(1);
    expect(anchors.get(19).surfaceNormal.length()).toBeCloseTo(1);
    expect(anchors.get(1).candidates.length).toBeGreaterThan(1);
    expect(anchors.get(19).candidates.length).toBeGreaterThan(1);
  });

  it('creates annotations from UV mask IDs when COLOR_1 is zeroed', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        -0.5, 0, 0,
        -0.4, 0.1, 0,
        -0.45, -0.1, 0,
        0.4, 0, 0,
        0.5, 0.1, 0,
        0.45, -0.1, 0,
      ], 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([
        -1, 0, 0, -1, 0, 0, -1, 0, 0,
        1, 0, 0, 1, 0, 0, 1, 0, 0,
      ], 3)
    );
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute([
        0.1, 0.5, 0.2, 0.5, 0.3, 0.5,
        0.7, 0.5, 0.8, 0.5, 0.9, 0.5,
      ], 2)
    );
    geometry.setAttribute(
      'color_1',
      new THREE.Uint16BufferAttribute(
        new Array(24).fill(0),
        4,
        true
      )
    );
    const mesh = new THREE.Mesh(geometry);

    expect(decodeAtlasVertexAttributes(geometry).valid).toBe(false);
    const anchors = computeAtlasAnnotationAnchors({
      meshes: [mesh],
      regions: [getRegionById(1), getRegionById(19)],
      normalization: { center: [0, 0, 0], maxDim: 10 },
      sampleRegionIdAtUv: (uv) => (uv.x < 0.5 ? 1 : 19),
    });

    expect(anchors.size).toBe(2);
    expect(anchors.get(1).candidates.length).toBeGreaterThan(1);
    expect(anchors.get(19).candidates.length).toBeGreaterThan(1);
    expect(
      createAtlasAnnotationDefinitions(
        [getRegionById(1), getRegionById(19)],
        anchors
      )
    ).toHaveLength(2);
    expect(geometry.getAttribute('regionId')).toBeUndefined();
    expect(geometry.getAttribute('maskRegionId')).toBeDefined();
  });

  it('always supplies one usable anchor per canonical annotation', () => {
    const anchors = computeAtlasAnnotationAnchors({
      meshes: [],
      regions: REGIONS,
      normalization: { center: [0, 0, 0], maxDim: 10 },
    });

    expect(anchors.size).toBe(REGIONS.length);
    REGIONS.forEach(({ id }) => {
      expect(anchors.get(id)?.candidates.length).toBeGreaterThan(0);
    });
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
