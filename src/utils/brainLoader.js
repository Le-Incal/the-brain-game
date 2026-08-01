/**
 * Brain Model Loader
 * 
 * Loads the brain GLB model and processes it for our two-tier architecture:
 * 1. Extracts the 8 physical meshes
 * 2. Assigns regionId vertex attributes based on vertex color data
 *    or positional classification (fallback)
 * 
 * The GLB should be placed at /public/brain.glb
 * Source: Custom Meshy AI sculpt, decimated to ~50-100K faces
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { REGIONS } from '../data/regions';

/**
 * Classify a vertex into one of 14 functional zones based on its
 * normalized position on the brain surface.
 * 
 * This is the fallback classifier when vertex colors are not painted.
 * For production, vertex colors should be painted in Blender to get
 * precise region boundaries along actual sulci.
 * 
 * Coordinate system (after centering & normalizing):
 *   x: left(-) / right(+)
 *   y: inferior(-) / superior(+)
 *   z: posterior(-) / anterior(+)
 */
export function classifyVertex(x, y, z) {
  const absX = Math.abs(x);

  // Cerebellum + brain stem (inferior-posterior)
  if (y < -0.28 && z < -0.15) return 13;
  if (y < -0.45) return 13;

  // Temporal lobe (lateral, mid-inferior) — tuned for Meshy + procedural stand-in
  if (absX > 0.22 && y < 0.12 && z > -0.35 && z < 0.45) {
    if (z > 0.18 && y < 0.05) return 10; // olfactory (anterior-inferior)
    if (x < -0.22 && z <= 0.12) return 9; // Wernicke's (left)
    if (z > 0.05 && y > -0.12) return 8; // auditory
    return 11; // temporal association
  }

  // Occipital lobe (posterior)
  if (z < -0.38) return 12;

  // Parietal lobe (superior-posterior)
  if (z < 0.12 && y > -0.05) {
    if (z > -0.12 && y > 0.05) return 5; // primary sensory
    if (y > 0.22) return 6; // somatosensory association
    return 7; // sensory association
  }

  // Frontal lobe (anterior)
  if (z > 0.22 && y > 0.15) return 0; // prefrontal
  if (z > -0.05 && z < 0.18 && y > 0.15) return 1; // motor
  if (x < -0.18 && z > 0.08 && y < 0.18) return 2; // Broca's
  if (z > 0.12 && y > 0.25) return 3; // eye motor
  if (y < 0.05 && z > 0.15) return 4; // emotional / orbitofrontal

  return 0;
}

export const CEREBELLUM_REGION_ID = 13;

/**
 * Centroid of all vertices not classified as cerebellum / brain stem.
 * Used as the specimen rotation pivot (upper brain mass).
 */
export function computeCerebrumPivot(meshes) {
  const sum = new THREE.Vector3();
  let count = 0;

  meshes.forEach((mesh) => {
    const pos = mesh.geometry.attributes.position;
    const regionAttr = mesh.geometry.attributes.regionId;
    if (!regionAttr) return;

    for (let i = 0; i < pos.count; i++) {
      if (Math.round(regionAttr.getX(i)) === CEREBELLUM_REGION_ID) continue;
      sum.x += pos.getX(i);
      sum.y += pos.getY(i);
      sum.z += pos.getZ(i);
      count += 1;
    }
  });

  if (count === 0) return new THREE.Vector3();
  return sum.divideScalar(count);
}

/**
 * Find a representative rendered surface point for each functional region.
 * The point nearest the region's vertex centroid stays within the classified
 * patch while avoiding the stale, hand-authored coordinates from the stand-in.
 */
export function computeRegionLabelAnchors(meshes, regionCount, root = null) {
  const sums = Array.from({ length: regionCount }, () => new THREE.Vector3());
  const counts = new Uint32Array(regionCount);
  const anchors = Array(regionCount).fill(null);
  const nearestDistance = new Float64Array(regionCount);
  nearestDistance.fill(Infinity);
  const sampleDirections = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  const candidateScores = Array.from(
    { length: regionCount },
    () => new Float64Array(sampleDirections.length).fill(-Infinity)
  );
  const surfaceCandidates = Array.from(
    { length: regionCount },
    () => Array(sampleDirections.length).fill(null)
  );

  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const rootInverse = new THREE.Matrix4();
  if (root) {
    root.updateMatrixWorld(true);
    rootInverse.copy(root.matrixWorld).invert();
  }

  const readPoint = (mesh, position, index) => {
    point.fromBufferAttribute(position, index);
    if (root) {
      point.applyMatrix4(mesh.matrixWorld).applyMatrix4(rootInverse);
    }
    return point;
  };

  meshes.forEach((mesh) => {
    const position = mesh.geometry.getAttribute('position');
    const regionIds = mesh.geometry.getAttribute('regionId');
    if (!position || !regionIds) return;

    for (let i = 0; i < position.count; i++) {
      const regionId = Math.round(regionIds.getX(i));
      if (regionId < 0 || regionId >= regionCount) continue;
      sums[regionId].add(readPoint(mesh, position, i));
      counts[regionId] += 1;
    }
  });

  sums.forEach((sum, regionId) => {
    if (counts[regionId] > 0) sum.divideScalar(counts[regionId]);
  });

  meshes.forEach((mesh) => {
    const position = mesh.geometry.getAttribute('position');
    const regionIds = mesh.geometry.getAttribute('regionId');
    const normals = mesh.geometry.getAttribute('normal');
    if (!position || !regionIds) return;
    const normalMatrix = root
      ? new THREE.Matrix3().getNormalMatrix(
        new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld)
      )
      : null;

    for (let i = 0; i < position.count; i++) {
      const regionId = Math.round(regionIds.getX(i));
      if (regionId < 0 || regionId >= regionCount) continue;
      const candidate = readPoint(mesh, position, i);
      if (normals) {
        normal.fromBufferAttribute(normals, i);
        if (normalMatrix) normal.applyNormalMatrix(normalMatrix);
      } else {
        normal.subVectors(candidate, sums[regionId]);
        if (normal.lengthSq() < 0.000001) normal.copy(candidate);
        normal.normalize();
      }

      const distance = candidate.distanceToSquared(sums[regionId]);
      if (distance < nearestDistance[regionId]) {
        nearestDistance[regionId] = distance;
        const anchor = candidate.clone();
        anchor.surfaceNormal = normal.clone().normalize();
        anchors[regionId] = anchor;
      }

      sampleDirections.forEach((direction, directionIndex) => {
        const score = normal.dot(direction);
        if (score <= candidateScores[regionId][directionIndex]) return;
        candidateScores[regionId][directionIndex] = score;
        const surfaceCandidate = candidate.clone();
        surfaceCandidate.surfaceNormal = normal.clone().normalize();
        surfaceCandidates[regionId][directionIndex] = surfaceCandidate;
      });
    }
  });

  anchors.forEach((anchor, regionId) => {
    if (!anchor) return;
    anchor.candidates = [anchor, ...surfaceCandidates[regionId].filter(Boolean)];
  });

  return anchors;
}

/**
 * Load and process the brain model.
 * Returns a Three.js Group containing the processed meshes.
 */
export async function loadBrainModel(url = '/brain.glb') {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const brainGroup = new THREE.Group();
        const meshes = [];

        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            meshes.push(child);
          }
        });

        if (meshes.length === 0) {
          reject(new Error('No meshes found in GLB file'));
          return;
        }

        // Compute the aggregate bounds directly from typed arrays. Avoid building
        // an array-of-arrays for every GLB vertex: on the production specimen that
        // causes a large allocation and browser pause on each reload.
        const bbox = new THREE.Box3();
        let vertexCount = 0;
        meshes.forEach((mesh) => {
          const pos = mesh.geometry.attributes.position;
          vertexCount += pos.count;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);
            bbox.min.x = Math.min(bbox.min.x, x);
            bbox.min.y = Math.min(bbox.min.y, y);
            bbox.min.z = Math.min(bbox.min.z, z);
            bbox.max.x = Math.max(bbox.max.x, x);
            bbox.max.y = Math.max(bbox.max.y, y);
            bbox.max.z = Math.max(bbox.max.z, z);
          }
        });

        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        meshes.forEach((mesh) => {
          const geo = mesh.geometry;
          const pos = geo.attributes.position;
          const regionIds = new Float32Array(pos.count);

          for (let i = 0; i < pos.count; i++) {
            // Center and normalize
            const x = (pos.getX(i) - center.x) / maxDim;
            const y = (pos.getY(i) - center.y) / maxDim;
            const z = (pos.getZ(i) - center.z) / maxDim;

            pos.setXYZ(i, x, y, z);
            regionIds[i] = classifyVertex(x, y, z);
          }

          pos.needsUpdate = true;
          // Meshy GLBs ship normals. Uniform centering/scaling leaves them valid;
          // recomputing them on a high-poly mesh blocks the main thread for no gain.
          if (!geo.attributes.normal) geo.computeVertexNormals();

          // Attach region IDs as a vertex attribute
          geo.setAttribute('regionId', new THREE.BufferAttribute(regionIds, 1));

          brainGroup.add(mesh);
        });

        resolve({
          group: brainGroup,
          meshes,
          vertexCount,
          faceCount: meshes.reduce((sum, m) => {
            const idx = m.geometry.index;
            return sum + (idx ? idx.count / 3 : m.geometry.attributes.position.count / 3);
          }, 0),
        });
      },
      undefined,
      reject
    );
  });
}

/**
 * Alternative: load brain from raw binary data (embedded or fetched).
 * This is what we used in the single-file JSX version.
 * 
 * Binary format:
 * [numVerts: uint32][numFaces: uint32]
 * [positions: float32 * 3 * numVerts]
 * [normals: float32 * 3 * numVerts]
 * [regionIds: float32 * numVerts]
 * [indices: uint32 * 3 * numFaces]
 */
export function loadBrainFromBinary(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const nv = view.getUint32(0, true);
  const nf = view.getUint32(4, true);
  let offset = 8;

  const positions = new Float32Array(arrayBuffer, offset, nv * 3);
  offset += nv * 3 * 4;

  const normals = new Float32Array(arrayBuffer, offset, nv * 3);
  offset += nv * 3 * 4;

  const regionIds = new Float32Array(arrayBuffer, offset, nv);
  offset += nv * 4;

  const indices = new Uint32Array(arrayBuffer, offset, nf * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('regionId', new THREE.BufferAttribute(regionIds, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  return { geometry, vertexCount: nv, faceCount: nf };
}
