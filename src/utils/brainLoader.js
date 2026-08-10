/**
 * Brain Model Loader
 * 
 * Loads the brain GLB model and decodes canonical atlas attributes when valid.
 * 
 * The GLB should be placed at /public/brain.glb
 * Source: Custom Meshy AI sculpt, decimated to ~50-100K faces
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { REGION_ID_SET, getRegionById } from '../data/regions';

const COLOR_1_ATTRIBUTE_NAMES = [
  '_color_1',
  'color_1',
  'COLOR_1',
  '_COLOR_1',
];

/**
 * Decode the atlas' raw uint16 COLOR_1 channels. Reading the typed array is
 * intentional: BufferAttribute.getX/getY normalise integer attributes to 0–1.
 */
export function decodeAtlasVertexAttributes(geometry) {
  const encoded = COLOR_1_ATTRIBUTE_NAMES
    .map((name) => geometry.getAttribute(name))
    .find(Boolean);
  const vertexCount = encoded?.count ?? geometry.getAttribute('position')?.count ?? 0;

  if (
    !encoded ||
    !(encoded.array instanceof Uint16Array) ||
    encoded.itemSize < 2
  ) {
    return { valid: false, vertexCount };
  }

  const regionIds = new Float32Array(encoded.count);
  const divisionIds = new Float32Array(encoded.count);
  let recognized = 0;

  for (let i = 0; i < encoded.count; i++) {
    const offset = i * encoded.itemSize;
    const regionId = encoded.array[offset];
    regionIds[i] = regionId;
    divisionIds[i] = encoded.array[offset + 1];
    if (
      REGION_ID_SET.has(regionId) &&
      getRegionById(regionId)?.divisionId === divisionIds[i]
    ) {
      recognized += 1;
    }
  }

  if (recognized !== encoded.count) {
    return { valid: false, vertexCount: encoded.count };
  }

  geometry.setAttribute('regionId', new THREE.BufferAttribute(regionIds, 1));
  geometry.setAttribute('divisionId', new THREE.BufferAttribute(divisionIds, 1));
  return { valid: true, vertexCount: encoded.count };
}

export const TRIANGLE_CANDIDATE_SLOTS = 4;

/**
 * Attach the authoritative atlas identity produced by
 * `scripts/generate-region-identity.py` from the painted master's COLOR_1.
 *
 * Binary layout:
 *   [uint32 vertexCount][uint8 regionId × vertexCount]
 *   [uint32 triangleCount][uint8 candidates × 4 × triangleCount]
 *
 * The candidate set is per triangle, so the geometry is de-indexed to give each
 * triangle its own corners. That is what lets a fragment reject a texel lookup
 * that strayed across a chart border onto unrelated cortex.
 */
export function applyVertexRegionAttributes(meshes, buffer) {
  if (!buffer || buffer.byteLength < 8) return 0;
  const view = new DataView(buffer);
  const vertexCount = view.getUint32(0, true);
  const triangleOffset = 4 + vertexCount;
  if (buffer.byteLength < triangleOffset + 4) return 0;
  const triangleCount = view.getUint32(triangleOffset, true);
  const candidateOffset = triangleOffset + 4;
  if (
    buffer.byteLength <
    candidateOffset + triangleCount * TRIANGLE_CANDIDATE_SLOTS
  ) {
    return 0;
  }

  const regionBytes = new Uint8Array(buffer, 4, vertexCount);
  const candidateBytes = new Uint8Array(
    buffer,
    candidateOffset,
    triangleCount * TRIANGLE_CANDIDATE_SLOTS
  );

  const totalMeshVertices = meshes.reduce(
    (sum, mesh) => sum + (mesh.geometry.getAttribute('position')?.count ?? 0),
    0
  );
  const totalMeshTriangles = meshes.reduce((sum, mesh) => {
    const index = mesh.geometry.index;
    const positions = mesh.geometry.getAttribute('position');
    return sum + (index ? index.count : (positions?.count ?? 0)) / 3;
  }, 0);
  if (totalMeshVertices !== vertexCount) return 0;
  if (totalMeshTriangles !== triangleCount) return 0;

  let vertexOffset = 0;
  let triangleIndex = 0;
  let applied = 0;
  meshes.forEach((mesh) => {
    const positions = mesh.geometry.getAttribute('position');
    if (!positions) return;
    const index = mesh.geometry.index;
    const meshTriangles = (index ? index.count : positions.count) / 3;
    const corners = new Uint32Array(meshTriangles * 3);
    for (let i = 0; i < corners.length; i++) {
      corners[i] = (index ? index.getX(i) : i) + vertexOffset;
    }

    const expanded = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry;
    if (expanded !== mesh.geometry) {
      mesh.geometry.dispose();
      mesh.geometry = expanded;
    }

    const regionIds = new Float32Array(meshTriangles * 3);
    const candidates = new Float32Array(
      meshTriangles * 3 * TRIANGLE_CANDIDATE_SLOTS
    );
    for (let triangle = 0; triangle < meshTriangles; triangle++) {
      const source = (triangleIndex + triangle) * TRIANGLE_CANDIDATE_SLOTS;
      for (let corner = 0; corner < 3; corner++) {
        const vertex = triangle * 3 + corner;
        regionIds[vertex] = regionBytes[corners[vertex]];
        for (let slot = 0; slot < TRIANGLE_CANDIDATE_SLOTS; slot++) {
          candidates[vertex * TRIANGLE_CANDIDATE_SLOTS + slot] =
            candidateBytes[source + slot];
        }
      }
    }

    expanded.setAttribute(
      'atlasRegionId',
      new THREE.BufferAttribute(regionIds, 1)
    );
    expanded.setAttribute(
      'atlasRegionCandidates',
      new THREE.BufferAttribute(candidates, TRIANGLE_CANDIDATE_SLOTS)
    );
    vertexOffset += positions.count;
    triangleIndex += meshTriangles;
    applied += meshTriangles * 3;
  });

  return applied;
}

export function bakeAndNormalizeMesh(mesh, center, maxDim) {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const point = new THREE.Vector3();
  const transformedNormal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);

  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    const x = (point.x - center.x) / maxDim;
    const y = (point.y - center.y) / maxDim;
    const z = (point.z - center.z) / maxDim;
    positions.setXYZ(i, x, y, z);
    if (normals) {
      transformedNormal
        .fromBufferAttribute(normals, i)
        .applyNormalMatrix(normalMatrix);
      normals.setXYZ(
        i,
        transformedNormal.x,
        transformedNormal.y,
        transformedNormal.z
      );
    }
  }

  positions.needsUpdate = true;
  if (normals) {
    normals.needsUpdate = true;
  } else {
    geometry.computeVertexNormals();
  }
  // The former world transform now lives in the vertex data.
  mesh.matrixAutoUpdate = true;
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
  mesh.matrixWorld.identity();
}

export const NON_CEREBRUM_REGION_IDS = new Set([20, 22]);

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
      if (NON_CEREBRUM_REGION_IDS.has(Math.round(regionAttr.getX(i)))) continue;
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
export function computeRegionLabelAnchors(
  meshes,
  regionIds,
  root = null,
  attributeName = 'regionId'
) {
  const validIds = new Set(regionIds);
  const sums = new Map(regionIds.map((id) => [id, new THREE.Vector3()]));
  const counts = new Map(regionIds.map((id) => [id, 0]));
  const anchors = new Map();
  const nearestDistance = new Map(regionIds.map((id) => [id, Infinity]));
  const sampleDirections = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  const candidateScores = new Map(
    regionIds.map((id) => [
      id,
      new Float64Array(sampleDirections.length).fill(-Infinity),
    ])
  );
  const surfaceCandidates = new Map(
    regionIds.map((id) => [id, Array(sampleDirections.length).fill(null)])
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
    const regionIds = mesh.geometry.getAttribute(attributeName);
    if (!position || !regionIds) return;

    for (let i = 0; i < position.count; i++) {
      const regionId = Math.round(regionIds.getX(i));
      if (!validIds.has(regionId)) continue;
      sums.get(regionId).add(readPoint(mesh, position, i));
      counts.set(regionId, counts.get(regionId) + 1);
    }
  });

  sums.forEach((sum, regionId) => {
    if (counts.get(regionId) > 0) sum.divideScalar(counts.get(regionId));
  });

  meshes.forEach((mesh) => {
    const position = mesh.geometry.getAttribute('position');
    const regionIds = mesh.geometry.getAttribute(attributeName);
    const normals = mesh.geometry.getAttribute('normal');
    if (!position || !regionIds) return;
    const normalMatrix = root
      ? new THREE.Matrix3().getNormalMatrix(
        new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld)
      )
      : null;

    for (let i = 0; i < position.count; i++) {
      const regionId = Math.round(regionIds.getX(i));
      if (!validIds.has(regionId)) continue;
      const candidate = readPoint(mesh, position, i);
      if (normals) {
        normal.fromBufferAttribute(normals, i);
        if (normalMatrix) normal.applyNormalMatrix(normalMatrix);
      } else {
        normal.subVectors(candidate, sums.get(regionId));
        if (normal.lengthSq() < 0.000001) normal.copy(candidate);
        normal.normalize();
      }

      const distance = candidate.distanceToSquared(sums.get(regionId));
      if (distance < nearestDistance.get(regionId)) {
        nearestDistance.set(regionId, distance);
        const anchor = candidate.clone();
        anchor.surfaceNormal = normal.clone().normalize();
        anchors.set(regionId, anchor);
      }

      sampleDirections.forEach((direction, directionIndex) => {
        const score = normal.dot(direction);
        if (score <= candidateScores.get(regionId)[directionIndex]) return;
        candidateScores.get(regionId)[directionIndex] = score;
        const surfaceCandidate = candidate.clone();
        surfaceCandidate.surfaceNormal = normal.clone().normalize();
        surfaceCandidates.get(regionId)[directionIndex] = surfaceCandidate;
      });
    }
  });

  anchors.forEach((anchor, regionId) => {
    anchor.candidates = [
      anchor,
      ...surfaceCandidates.get(regionId).filter(Boolean),
    ];
  });

  return anchors;
}

export function assignUvMaskRegionIds(meshes, sampleRegionIdAtUv) {
  let assignedVertexCount = 0;
  if (!sampleRegionIdAtUv) return assignedVertexCount;

  const uvPoint = new THREE.Vector2();
  meshes.forEach((mesh) => {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    const uvs = geometry.getAttribute('uv');
    if (!positions || !uvs || uvs.count !== positions.count) return;

    const maskRegionIds = new Float32Array(positions.count);
    for (let i = 0; i < uvs.count; i++) {
      uvPoint.fromBufferAttribute(uvs, i);
      const regionId = sampleRegionIdAtUv(uvPoint);
      maskRegionIds[i] = REGION_ID_SET.has(regionId) ? regionId : -1;
      if (maskRegionIds[i] >= 0) assignedVertexCount += 1;
    }
    geometry.setAttribute(
      'maskRegionId',
      new THREE.BufferAttribute(maskRegionIds, 1)
    );
  });

  return assignedVertexCount;
}

/**
 * Build one annotation anchor per canonical region. Valid COLOR_1 geometry is
 * preferred; the exact UV mask supplies surface anchors when COLOR_1 is empty.
 * Canonical centroids guarantee labels can still be constructed while the mask
 * image is loading.
 */
export function computeAtlasAnnotationAnchors({
  meshes,
  regions,
  normalization,
  root = null,
  sampleRegionIdAtUv = null,
}) {
  assignUvMaskRegionIds(meshes, sampleRegionIdAtUv);
  const hasAtlasGeometryIds =
    meshes.length > 0 &&
    meshes.every((mesh) => mesh.geometry.getAttribute('regionId'));
  const attributeName = hasAtlasGeometryIds ? 'regionId' : 'maskRegionId';
  const anchors = computeRegionLabelAnchors(
    meshes,
    regions.map(({ id }) => id),
    root,
    attributeName
  );
  const center = normalization?.center ?? [0, 0, 0];
  const maxDim = normalization?.maxDim || 10;

  regions.forEach((region) => {
    if (anchors.has(region.id)) return;
    const anchor = new THREE.Vector3(
      (region.centroid[0] - center[0]) / maxDim,
      (region.centroid[1] - center[1]) / maxDim,
      (region.centroid[2] - center[2]) / maxDim
    );
    const normal = anchor.clone().normalize();
    if (normal.lengthSq() === 0) normal.set(0, 1, 0);
    anchor.surfaceNormal = normal;
    anchor.candidates = [anchor];
    anchors.set(region.id, anchor);
  });

  return anchors;
}

export function createAtlasAnnotationDefinitions(regions, anchors) {
  return regions.flatMap((region) => {
    const anchor = anchors.get(region.id);
    return anchor ? [{ region, anchor }] : [];
  });
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

        gltf.scene.updateMatrixWorld(true);

        // Compute the aggregate bounds directly from typed arrays. Avoid building
        // an array-of-arrays for every GLB vertex: on the production specimen that
        // causes a large allocation and browser pause on each reload.
        const bbox = new THREE.Box3();
        const transformedPoint = new THREE.Vector3();
        let vertexCount = 0;
        meshes.forEach((mesh) => {
          const pos = mesh.geometry.attributes.position;
          vertexCount += pos.count;
          for (let i = 0; i < pos.count; i++) {
            transformedPoint
              .fromBufferAttribute(pos, i)
              .applyMatrix4(mesh.matrixWorld);
            bbox.expandByPoint(transformedPoint);
          }
        });

        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        const atlasAttributeResults = meshes.map((mesh) =>
          decodeAtlasVertexAttributes(mesh.geometry)
        );
        const atlasVertexAttributesValid = atlasAttributeResults.every(
          ({ valid }) => valid
        );

        meshes.forEach((mesh) => {
          bakeAndNormalizeMesh(mesh, center, maxDim);
          brainGroup.add(mesh);
        });
        brainGroup.userData.atlasVertexAttributesValid =
          atlasVertexAttributesValid;
        brainGroup.userData.normalization = {
          center: center.toArray(),
          maxDim,
        };

        resolve({
          group: brainGroup,
          meshes,
          vertexCount,
          atlasVertexAttributesValid,
          atlasAttributeResults,
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
