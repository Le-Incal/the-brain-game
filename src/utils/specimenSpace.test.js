import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bakeAndNormalizeMesh, describeNormalization } from './brainLoader.js';

const specimenSpaceModule = await import('./specimenSpace.js').catch(() => ({}));
const { createSpecimenSpace } = specimenSpaceModule;

// The painted master's only node, as authored in public/brain.glb.
function readModelNode() {
  const path = fileURLToPath(new URL('../../public/brain.glb', import.meta.url));
  const buffer = readFileSync(path);
  const jsonLength = buffer.readUInt32LE(12);
  const document = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  return document.nodes[document.scenes[0].nodes[0]];
}

function meshWithTransform({ rotation, translation }, points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  const mesh = new THREE.Mesh(geometry);
  mesh.quaternion.fromArray(rotation);
  mesh.position.fromArray(translation);
  mesh.updateMatrixWorld(true);
  return mesh;
}

const RAW_POINTS = [
  [3.2467, 0.3642, 1.9301],
  [-3.4061, 0.3732, 1.8239],
  [0.0, 4.1, -2.2],
  [0.5, -3.6, -1.5],
];

describe('the painted model carries a source transform', () => {
  // regionGeometry.json is measured from raw mesh positions; the loader bakes
  // the node transform into the vertices. Ignoring it turns faceRegion ~8 degrees off.
  it('has a node rotation of more than 5 degrees', () => {
    const node = readModelNode();
    const rotation = new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]);
    expect(THREE.MathUtils.radToDeg(rotation.angleTo(new THREE.Quaternion()))).toBeGreaterThan(5);
  });
});

describe('describeNormalization', () => {
  it('records the bounds of the transformed mesh and its source matrix', () => {
    const node = readModelNode();
    const mesh = meshWithTransform(node, RAW_POINTS);
    const bounds = new THREE.Box3();
    RAW_POINTS.forEach((point) => bounds.expandByPoint(new THREE.Vector3(...point).applyMatrix4(mesh.matrixWorld)));
    const size = bounds.getSize(new THREE.Vector3());

    const normalization = describeNormalization([mesh]);
    expect(normalization.center).toEqual(bounds.getCenter(new THREE.Vector3()).toArray());
    expect(normalization.maxDim).toBeCloseTo(Math.max(size.x, size.y, size.z), 12);
    expect(normalization.sourceMatrix).toEqual(mesh.matrixWorld.toArray());
  });
});

describe('createSpecimenSpace', () => {
  it('maps a raw geometry point to where the scene draws that vertex inside the specimen', () => {
    const node = readModelNode();
    const mesh = meshWithTransform(node, RAW_POINTS);
    const normalization = describeNormalization([mesh]);
    const scale = 1.278;
    const pivot = new THREE.Vector3(0.01, 0.12, -0.03);

    bakeAndNormalizeMesh(mesh, new THREE.Vector3(...normalization.center), normalization.maxDim);
    const space = createSpecimenSpace({ normalization, scale, pivot });
    const baked = mesh.geometry.getAttribute('position');

    RAW_POINTS.forEach((point, index) => {
      // BrainScene: brainGroup scaled by `scale` and offset by -pivot * scale.
      const drawn = new THREE.Vector3().fromBufferAttribute(baked, index).sub(pivot).multiplyScalar(scale);
      expect(space.toSpecimenSpace(point).distanceTo(drawn), `point ${index}`).toBeLessThan(1e-5);
    });
  });

  it('treats a missing source matrix as identity', () => {
    const space = createSpecimenSpace({
      normalization: { center: [1, 2, 3], maxDim: 10 },
      scale: 2,
      pivot: new THREE.Vector3(0, 0, 0),
    });
    expect(space.toSpecimenSpace([11, 2, 3]).toArray()).toEqual([2, 0, 0]);
  });
});
