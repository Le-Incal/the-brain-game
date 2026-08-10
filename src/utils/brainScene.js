/**
 * Brain Scene Manager
 *
 * Sets up the Three.js scene, camera, renderer, and manages the
 * render loop. Handles shader material creation, region highlighting,
 * raycasting for hover detection, colour mode, and CSS2D annotations.
 */

import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { vertexShader, fragmentShader } from '../shaders';
import {
  REGIONS,
  REGION_IDS,
  VIEW_LABEL_IDS,
  getRegionById,
} from '../data/regions';
import { BrainOrbitControls } from './orbitControls';
import {
  applyVertexRegionAttributes,
  computeAtlasAnnotationAnchors,
  computeCerebrumPivot,
  createAtlasAnnotationDefinitions,
} from './brainLoader';

// Where the orbit target sits. The camera turns about this point, so the
// specimen is displaced from it rather than moved with it.
const BRAIN_BASE_VERTICAL_OFFSET = -0.5;
// Negative moves the specimen down the page. 48 CSS pixels is half an inch.
const BRAIN_VERTICAL_SHIFT_CSS_PX = -48;
const BRAIN_SCALE = 1.278;
const LABEL_GUTTER_PX = 40;

function configureMap(texture, anisotropy, colorSpace) {
  texture.colorSpace = colorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  return texture;
}

export function configureColorMap(texture, anisotropy) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 1;
  return texture;
}

export function configureRegionIdMap(texture) {
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.anisotropy = 1;
  return texture;
}

const hitBarycoord = new THREE.Vector3();
const hitLocalPoint = new THREE.Vector3();
const hitCornerA = new THREE.Vector3();
const hitCornerB = new THREE.Vector3();
const hitCornerC = new THREE.Vector3();
const hitTextureUv = new THREE.Vector2();

/**
 * Resolve which region a raycast hit belongs to.
 *
 * COLOR_1 is the painted identity of the vertex and cannot drift, so it decides
 * the triangle's vocabulary. The id texture is the visual authority and decides
 * which of those the player actually sees, but only when it names a region the
 * triangle genuinely touches: charts abut without a gutter, so a lookup near a
 * chart border can return unrelated cortex.
 */
export function resolveHitRegionId(hit, sampleRegionIdAtUv = null) {
  const geometry = hit?.object?.geometry;
  const face = hit?.face;
  if (!geometry || !face || !hit.point) return null;
  const regionIds = geometry.getAttribute('atlasRegionId');
  const positions = geometry.getAttribute('position');
  if (!regionIds || !positions) return null;

  hitLocalPoint.copy(hit.point);
  hit.object.worldToLocal(hitLocalPoint);
  hitCornerA.fromBufferAttribute(positions, face.a);
  hitCornerB.fromBufferAttribute(positions, face.b);
  hitCornerC.fromBufferAttribute(positions, face.c);
  const barycoord = THREE.Triangle.getBarycoord(
    hitLocalPoint,
    hitCornerA,
    hitCornerB,
    hitCornerC,
    hitBarycoord
  );
  if (!barycoord) return null;

  const corners = [face.a, face.b, face.c];
  const weights = [barycoord.x, barycoord.y, barycoord.z];
  let nearest = corners[0];
  let nearestWeight = weights[0];
  for (let i = 1; i < corners.length; i++) {
    if (weights[i] > nearestWeight) {
      nearestWeight = weights[i];
      nearest = corners[i];
    }
  }
  const vertexRegionId = Math.round(regionIds.getX(nearest));
  if (!sampleRegionIdAtUv) return vertexRegionId || null;

  const uv3 = geometry.getAttribute('uv3');
  if (!uv3) return vertexRegionId || null;
  hitTextureUv.set(0, 0);
  for (let i = 0; i < corners.length; i++) {
    hitTextureUv.x += uv3.getX(corners[i]) * weights[i];
    hitTextureUv.y += uv3.getY(corners[i]) * weights[i];
  }

  const textureRegionId = sampleRegionIdAtUv(hitTextureUv);
  const painted = corners.map((corner) => Math.round(regionIds.getX(corner)));
  if (textureRegionId && painted.includes(textureRegionId)) {
    return textureRegionId;
  }
  return vertexRegionId || null;
}

export function createRegionPaletteUniforms() {
  return {
    regionColors: REGIONS.map((region) => new THREE.Color(region.hex)),
    regionIds: [...REGION_IDS],
  };
}

export function matchRegionColorSrgb(rgb) {
  if (!rgb || Math.max(...rgb) < 64) return null;
  let bestId = null;
  let bestDistance = Infinity;
  let tied = false;

  REGIONS.forEach((region) => {
    const distance = region.rgb.reduce(
      (sum, channel, index) => sum + (rgb[index] - channel) ** 2,
      0
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = region.id;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  });

  return tied ? null : bestId;
}

export function sampleRegionIdPixelsAtUv(pixels, width, height, uv) {
  if (!uv || !pixels || !width || !height) return null;
  const x = THREE.MathUtils.clamp(
    Math.floor(uv.x * width),
    0,
    width - 1
  );
  const y = THREE.MathUtils.clamp(
    Math.floor(uv.y * height),
    0,
    height - 1
  );
  const regionId = pixels[(y * width + x) * 4];
  return getRegionById(regionId) ? regionId : null;
}

export function getAtlasViewForDirection(direction) {
  const absolute = {
    x: Math.abs(direction.x),
    y: Math.abs(direction.y),
    z: Math.abs(direction.z),
  };
  if (absolute.x >= absolute.y && absolute.x >= absolute.z) {
    return direction.x >= 0 ? 'left_lateral' : 'right_lateral';
  }
  if (absolute.y >= absolute.z) {
    return direction.y >= 0 ? 'superior' : 'inferior';
  }
  return direction.z >= 0 ? 'anterior' : 'posterior';
}

export function getResponsiveSpecimenScale(viewportWidth) {
  if (viewportWidth <= 480) return 0.73;
  if (viewportWidth <= 640) return 0.8;
  return 1;
}

export function getResponsiveSpecimenVerticalOffset(viewportWidth) {
  if (viewportWidth <= 480) return -0.2;
  if (viewportWidth <= 640) return -0.12;
  return 0;
}

export function computeLabelLeaderWidth(
  side,
  anchorX,
  leftEdge,
  rightEdge,
  brainRadiusPx
) {
  const widthToEdge =
    side === 'left' ? anchorX - leftEdge : rightEdge - anchorX;
  return THREE.MathUtils.clamp(
    widthToEdge + LABEL_GUTTER_PX,
    28,
    brainRadiusPx + 56
  );
}

/**
 * Catch/miss feedback pulse for the highlighted region's colour wash.
 * Returns 0–1; never fully extinguishes the target colour.
 */
export function computeHighlightPulse(elapsedMs) {
  const wave = 0.5 + 0.5 * Math.sin((elapsedMs / 1000) * Math.PI * 2 * 1.25);
  return 0.35 + 0.65 * wave;
}

export class BrainScene {
  constructor(container, options = {}) {
    this.container = container;
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.scene = new THREE.Scene();

    // Low FOV for flatter perspective (engraving-like)
    this.camera = new THREE.PerspectiveCamera(28, this.width / this.height, 0.1, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xf3eee4, 0);
    // The anatomical GLB is high-poly; a modest pixel-ratio cap keeps orbit
    // interaction responsive on retina displays without a visible quality loss.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    container.appendChild(this.renderer.domElement);

    this._regionMaskPixels = null;
    this._regionMaskWidth = 0;
    this._regionMaskHeight = 0;
    const textureLoader = new THREE.TextureLoader();
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const configureDataMap = (texture) =>
      configureMap(texture, maxAnisotropy, THREE.NoColorSpace);

    const aoMap = configureDataMap(textureLoader.load('/maps/brain_ao.png'));
    const cavityMap = configureDataMap(textureLoader.load('/maps/brain_cavity.png'));
    const curvatureMap = configureDataMap(textureLoader.load('/maps/brain_curvature.png'));
    const etchingMap = configureDataMap(textureLoader.load('/maps/brain_etching.png'));
    const regionIdMap = configureRegionIdMap(
      textureLoader.load('/maps/brain_region_ids_4096.png', (texture) => {
        this._setRegionMaskImage(texture.image);
      })
    );

    this._vertexRegionBuffer = null;
    this._loadVertexRegionAttributes();

    // CSS2D overlay for annotations
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.width, this.height);
    Object.assign(this.labelRenderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    container.appendChild(this.labelRenderer.domElement);

    // THREE.Color converts authored sRGB hex values to the linear working
    // colour space expected by shader uniforms.
    const { regionColors, regionIds } = createRegionPaletteUniforms();

    this.uniforms = {
      uAoMap: { value: aoMap },
      uCavityMap: { value: cavityMap },
      uCurvatureMap: { value: curvatureMap },
      uEtchingMap: { value: etchingMap },
      uRegionIdMap: { value: regionIdMap },
      uLightDir1: { value: new THREE.Vector3(1.5, 1.8, 2.0).normalize() },
      uLightDir2: { value: new THREE.Vector3(-1.0, 0.5, -0.8).normalize() },
      uColorMode: { value: 0.0 },
      uRegionColors: { value: regionColors },
      uRegionIds: { value: regionIds },
      uHighlight: { value: -1.0 },
      uHighlightPulse: { value: 0.0 },
      uSelectedRegion: { value: -1.0 },
      uInkColor: { value: new THREE.Color(0x1a1a1a) },
      uPaperColor: { value: new THREE.Color(0xf3eee4) },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      derivatives: true,
    });

    // Pivot anchor + a single orientation group driven by camera-aligned axes.
    this.specimenGroup = new THREE.Group();
    this.specimenRotationGroup = new THREE.Group();
    this.specimenOrientGroup = new THREE.Group();
    this.specimenRotationGroup.add(this.specimenOrientGroup);
    this.specimenGroup.add(this.specimenRotationGroup);
    this.scene.add(this.specimenGroup);
    this._specimenPanY = 0;

    this.controls = new BrainOrbitControls(this.camera, this.renderer.domElement, {
      orientGroup: this.specimenOrientGroup,
      onFirstInteraction: options.onFirstInteraction,
      onClick: (event) => this._selectRegionAtEvent(event),
      onPan: (normalizedDelta) => this._panSpecimenVertical(normalizedDelta),
    });
    this._positionSpecimen();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-9, -9);
    this._pickVec = new THREE.Vector2();
    this._raycastDirty = true;
    // Pointer events can arrive at display-frame cadence; cap hover picking so
    // a high-poly specimen is never raycast every rendered frame.
    this._hoverRaycastInterval = 1000 / 20;
    this._lastHoverRaycastAt = -Infinity;
    this.brainMeshes = [];
    this.hoveredRegion = null;
    this.onHoverChange = options.onHoverChange || null;
    this.onRegionSelect = options.onRegionSelect || null;
    this.onNavigatingChange = options.onNavigatingChange || null;
    this._isNavigating = false;
    this.selectedRegionId = -1;
    this._highlightUntil = 0;
    this._highlightStartedAt = 0;
    this.labelObjects = [];
    this._labelWorldPosition = new THREE.Vector3();
    this._labelCenterWorld = new THREE.Vector3();
    this._labelWorldNormal = new THREE.Vector3();
    this._labelSurfaceDirection = new THREE.Vector3();
    this._labelViewDirection = new THREE.Vector3();
    this._labelCameraDirection = new THREE.Vector3();
    this._atlasViewDirection = new THREE.Vector3();
    this._labelWorldInverse = new THREE.Matrix4();
    this._labelProjected = new THREE.Vector3();
    this._labelCenterProjected = new THREE.Vector3();
    this._brainBoundsProjected = new THREE.Vector3();
    this._brainBoundingSphere = new THREE.Sphere();
    this.labelsVisible = false;
    this.labelGroup = new THREE.Group();
    this.labelGroup.visible = false;
    this.specimenOrientGroup.add(this.labelGroup);

    this._resizeHandler = this._onResize.bind(this);
    window.addEventListener('resize', this._resizeHandler);

    this._mouseMoveHandler = this._onMouseMove.bind(this);
    this.renderer.domElement.addEventListener('mousemove', this._mouseMoveHandler);

    this._animating = true;
    this._animate();
  }

  async _loadVertexRegionAttributes(url = '/maps/brain_vertex_regions.bin') {
    if (typeof fetch !== 'function') return;
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      this._vertexRegionBuffer = await response.arrayBuffer();
      this._applyVertexRegionAttributes();
    } catch {
      // The shader falls back to the categorical texture when identity data is
      // unavailable, so a failed fetch degrades quality rather than breaking.
    }
  }

  _applyVertexRegionAttributes() {
    if (!this._vertexRegionBuffer || this.brainMeshes.length === 0) return 0;
    return applyVertexRegionAttributes(
      this.brainMeshes,
      this._vertexRegionBuffer
    );
  }

  _setRegionMaskImage(image) {
    if (!image?.width || !image?.height) return;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0);
    this._regionMaskPixels = context.getImageData(
      0,
      0,
      image.width,
      image.height
    ).data;
    this._regionMaskWidth = image.width;
    this._regionMaskHeight = image.height;
    if (this.brainGroup) {
      this._refreshRegionLabelAnchors();
      this._buildLabels();
    }
  }

  _getMaskRegionIdAtUv(uv) {
    return sampleRegionIdPixelsAtUv(
      this._regionMaskPixels,
      this._regionMaskWidth,
      this._regionMaskHeight,
      uv
    );
  }

  addBrainGeometry(input) {
    const brainGroup = new THREE.Group();

    if (input.isBufferGeometry || input instanceof THREE.BufferGeometry) {
      const mesh = new THREE.Mesh(input, this.material);
      brainGroup.add(mesh);
      this.brainMeshes.push(mesh);
    } else if (input.isGroup || input instanceof THREE.Group) {
      input.traverse((child) => {
        if (child.isMesh) {
          child.material = this.material;
          this.brainMeshes.push(child);
        }
      });
      brainGroup.add(input);
    } else if (Array.isArray(input)) {
      input.forEach((mesh) => {
        mesh.material = this.material;
        brainGroup.add(mesh);
        this.brainMeshes.push(mesh);
      });
    }

    this._applyVertexRegionAttributes();
    brainGroup.scale.setScalar(BRAIN_SCALE);
    this.brainGroup = brainGroup;
    this.brainNormalization = input?.userData?.normalization ?? null;
    this.specimenOrientGroup.add(brainGroup);

    const pivot = computeCerebrumPivot(this.brainMeshes);
    const pivotOffset = pivot.clone().multiplyScalar(-BRAIN_SCALE);
    brainGroup.position.copy(pivotOffset);
    this.labelGroup.position.copy(pivotOffset);
    this._refreshRegionLabelAnchors();
    brainGroup.updateMatrixWorld(true);
    new THREE.Box3()
      .setFromObject(brainGroup)
      .getBoundingSphere(this._brainBoundingSphere);
    this.brainBoundingRadius = this._brainBoundingSphere.radius;

    this._buildLabels();
    this._positionSpecimen();
  }

  _refreshRegionLabelAnchors() {
    this.regionLabelAnchors = computeAtlasAnnotationAnchors({
      meshes: this.brainMeshes,
      regions: REGIONS,
      normalization: this.brainNormalization,
      root: this.brainGroup,
      sampleRegionIdAtUv: this._regionMaskPixels
        ? (uv) => this._getMaskRegionIdAtUv(uv)
        : null,
    });
  }

  _buildLabels() {
    this.labelObjects.forEach((obj) => this.labelGroup.remove(obj));
    this.labelObjects = [];

    createAtlasAnnotationDefinitions(
      REGIONS,
      this.regionLabelAnchors
    ).forEach(({ region, anchor }) => {
      const wrap = document.createElement('div');
      wrap.className = 'brain-annotation';
      const leader = document.createElement('span');
      leader.className = 'brain-annotation__leader';
      const text = document.createElement('span');
      text.className = 'brain-annotation__text';
      // The authored annotation names the region and what it does; it carries
      // punctuation, so it is set as text rather than markup.
      text.textContent = region.annotationLabel ?? region.name;
      wrap.append(leader, text);

      const label = new CSS2DObject(wrap);
      label.position.copy(anchor).multiplyScalar(BRAIN_SCALE);
      label.userData.screenSide = null;
      label.userData.regionId = region.id;
      label.userData.regionCenter = anchor.clone().multiplyScalar(BRAIN_SCALE);
      label.userData.candidates = (anchor.candidates || [anchor])
        .filter(Boolean)
        .map((candidate) => ({
          position: candidate.clone().multiplyScalar(BRAIN_SCALE),
          normal: candidate.surfaceNormal
            ? candidate.surfaceNormal.clone()
            : candidate.clone().normalize(),
        }));
      label.userData.leader = wrap.querySelector('.brain-annotation__leader');
      this.labelGroup.add(label);
      this.labelObjects.push(label);
    });
  }

  _updateLabelLayout() {
    if (!this.labelsVisible) return;

    this.specimenGroup.updateMatrixWorld(true);
    this.specimenOrientGroup.getWorldPosition(this._labelCenterWorld);
    this._labelCenterProjected
      .copy(this._labelCenterWorld)
      .project(this.camera);

    const centerX =
      (this._labelCenterProjected.x * 0.5 + 0.5) * this.width;
    const distance = this.camera.position.distanceTo(this._labelCenterWorld);
    const viewportWorldHeight =
      2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const brainRadiusPx =
      (this.brainBoundingRadius / viewportWorldHeight) * this.height;
    let leftEdge = centerX - brainRadiusPx;
    let rightEdge = centerX + brainRadiusPx;
    let anchorCloudLeft = Infinity;
    let anchorCloudRight = -Infinity;
    this.labelObjects.forEach((label) => {
      label.userData.candidates.forEach((candidate) => {
        this._brainBoundsProjected
          .copy(candidate.position)
          .applyMatrix4(this.labelGroup.matrixWorld)
          .project(this.camera);
        const screenX =
          (this._brainBoundsProjected.x * 0.5 + 0.5) * this.width;
        anchorCloudLeft = Math.min(anchorCloudLeft, screenX);
        anchorCloudRight = Math.max(anchorCloudRight, screenX);
      });
    });
    if (
      Number.isFinite(anchorCloudLeft) &&
      Number.isFinite(anchorCloudRight)
    ) {
      const cloudWidth = anchorCloudRight - anchorCloudLeft;
      const silhouettePadding = Math.max(24, cloudWidth * 0.1);
      leftEdge = anchorCloudLeft - silhouettePadding;
      rightEdge = anchorCloudRight + silhouettePadding;
    }
    const projectedBrainRadiusPx = Math.max(
      centerX - leftEdge,
      rightEdge - centerX
    );
    const candidates = [];
    this._labelCameraDirection
      .subVectors(this.camera.position, this._labelCenterWorld)
      .normalize();
    this._labelWorldInverse.copy(this.labelGroup.matrixWorld).invert();
    this._atlasViewDirection
      .copy(this._labelCameraDirection)
      .transformDirection(this._labelWorldInverse);
    const atlasView = getAtlasViewForDirection(this._atlasViewDirection);
    const visibleAtlasIds = new Set(VIEW_LABEL_IDS[atlasView]);

    this.labelObjects.forEach((label) => {
      label.visible = false;
      if (!visibleAtlasIds.has(label.userData.regionId)) return;
      this._labelWorldPosition
        .copy(label.userData.regionCenter)
        .applyMatrix4(this.labelGroup.matrixWorld);
      this._labelSurfaceDirection
        .subVectors(this._labelWorldPosition, this._labelCenterWorld)
        .normalize();
      const regionHemisphere =
        this._labelSurfaceDirection.dot(this._labelCameraDirection);
      if (regionHemisphere <= 0.02) return;

      let bestCandidate = null;
      let bestFacing = -Infinity;

      label.userData.candidates.forEach((candidate) => {
        this._labelWorldPosition
          .copy(candidate.position)
          .applyMatrix4(this.labelGroup.matrixWorld);
        this._labelWorldNormal
          .copy(candidate.normal)
          .transformDirection(this.labelGroup.matrixWorld);
        this._labelViewDirection
          .subVectors(this.camera.position, this._labelWorldPosition)
          .normalize();
        this._labelSurfaceDirection
          .subVectors(this._labelWorldPosition, this._labelCenterWorld)
          .normalize();
        const facing = this._labelWorldNormal.dot(this._labelViewDirection);
        const hemisphere =
          this._labelSurfaceDirection.dot(this._labelCameraDirection);
        if (hemisphere <= 0.02) return;
        const visibilityScore = facing + hemisphere * 0.35;
        if (visibilityScore > bestFacing) {
          bestFacing = visibilityScore;
          bestCandidate = candidate;
        }
      });

      if (!bestCandidate || bestFacing <= 0.12) return;

      label.position.copy(bestCandidate.position);
      this._labelWorldPosition
        .copy(bestCandidate.position)
        .applyMatrix4(this.labelGroup.matrixWorld);

      this._labelProjected
        .copy(this._labelWorldPosition)
        .project(this.camera);
      const anchorX = (this._labelProjected.x * 0.5 + 0.5) * this.width;
      const anchorY = (-this._labelProjected.y * 0.5 + 0.5) * this.height;
      const side = anchorX < centerX ? 'left' : 'right';

      if (label.userData.screenSide !== side) {
        label.userData.screenSide = side;
        label.center.set(side === 'left' ? 1 : 0, 0.5);
        label.element.style.flexDirection =
          side === 'left' ? 'row-reverse' : 'row';
        label.element.style.textAlign = side === 'left' ? 'right' : 'left';
      }

      const leaderWidth = computeLabelLeaderWidth(
        side,
        anchorX,
        leftEdge,
        rightEdge,
        projectedBrainRadiusPx
      );
      label.userData.leader.style.width = `${leaderWidth}px`;

      const region = getRegionById(label.userData.regionId);
      if (!region) return;
      const textWidth = Math.max(70, region.name.length * 6.4);
      const textLeft = side === 'left'
        ? anchorX - leaderWidth - textWidth
        : anchorX + leaderWidth;

      candidates.push({
        label,
        box: {
          left: textLeft,
          right: textLeft + textWidth,
          top: anchorY - 10,
          bottom: anchorY + 10,
        },
        priority: label.userData.regionId === this.selectedRegionId ? 1 : 0,
      });
    });

    candidates.sort((a, b) => b.priority - a.priority);
    const accepted = [];
    candidates.forEach((candidate) => {
      const overlaps = accepted.some((box) =>
        candidate.box.left < box.right + 6 &&
        candidate.box.right > box.left - 6 &&
        candidate.box.top < box.bottom + 6 &&
        candidate.box.bottom > box.top - 6
      );
      if (overlaps) return;
      candidate.label.visible = true;
      accepted.push(candidate.box);
    });
  }

  setLabelsVisible(visible) {
    this.labelsVisible = !!visible;
    this.labelGroup.visible = this.labelsVisible;
  }

  setColorMode(enabled) {
    this.uniforms.uColorMode.value = enabled ? 1.0 : 0.0;
  }

  _getHitRegionId(hit) {
    return resolveHitRegionId(
      hit,
      this._regionMaskPixels ? (uv) => this._getMaskRegionIdAtUv(uv) : null
    );
  }

  _selectRegionAtEvent(event) {
    if (this.brainMeshes.length === 0) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pickVec.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this._updateRaycastMatrices();
    this.raycaster.setFromCamera(this._pickVec, this.camera);
    const hit = this.raycaster.intersectObjects(this.brainMeshes)[0];

    const hitRegionId = this._getHitRegionId(hit);
    const region = hitRegionId === null ? null : getRegionById(hitRegionId);

    const nextRegionId =
      region && region.id !== this.selectedRegionId ? region.id : -1;
    this.selectedRegionId = nextRegionId;
    this.uniforms.uSelectedRegion.value = nextRegionId;
    if (this.onRegionSelect) {
      this.onRegionSelect(nextRegionId >= 0 ? getRegionById(nextRegionId) : null);
    }
  }

  beginHighlightFeedback(regionId, durationMs = 2000, _options = {}) {
    const now = performance.now();
    this._highlightUntil = now + durationMs;
    this._highlightStartedAt = now;
    this.uniforms.uHighlight.value = regionId ?? -1.0;
    this.uniforms.uHighlightPulse.value = computeHighlightPulse(0);
  }

  _updateHighlightFeedback() {
    if (!this._highlightUntil) return;

    const now = performance.now();
    if (now >= this._highlightUntil) {
      this.uniforms.uHighlight.value = -1.0;
      this.uniforms.uHighlightPulse.value = 0.0;
      this._highlightUntil = 0;
      this._highlightStartedAt = 0;
      return;
    }

    this.uniforms.uHighlightPulse.value = computeHighlightPulse(
      now - this._highlightStartedAt
    );
  }

  getRegionIdAtNormalized(nx, ny) {
    if (this.brainMeshes.length === 0) return null;
    const ndcX = nx * 2 - 1;
    const ndcY = -(ny * 2 - 1);
    this._pickVec.set(ndcX, ndcY);
    this._updateRaycastMatrices();
    this.raycaster.setFromCamera(this._pickVec, this.camera);
    const intersects = this.raycaster.intersectObjects(this.brainMeshes);
    if (intersects.length === 0) return null;
    return this._getHitRegionId(intersects[0]);
  }

  _onMouseMove(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycastDirty = true;
  }

  _updateRaycastMatrices() {
    // Rotation is applied to the specimen, not the camera. Raycasts may run
    // between render frames (the game loop has its own cadence), so propagate
    // the current transforms before intersecting the anatomical meshes.
    this.specimenGroup.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
  }

  _syncNavigatingState() {
    const navigating = Boolean(this.controls?.isDragging);
    if (navigating === this._isNavigating) return;
    this._isNavigating = navigating;
    // Gripping to orbit should never pin a hover title over falling words.
    if (navigating && this.hoveredRegion) {
      this.hoveredRegion = null;
      if (this.onHoverChange) this.onHoverChange(null);
    }
    if (this.onNavigatingChange) this.onNavigatingChange(navigating);
  }

  _updateRaycast() {
    if (this.brainMeshes.length === 0 || !this._raycastDirty) return;
    // Full-mesh picking on the high-poly anatomical model can stall a frame.
    // Hover feedback is not needed mid-drag, so defer it until rotation ends.
    if (this.controls.isDragging) return;
    const now = performance.now();
    if (now - this._lastHoverRaycastAt < this._hoverRaycastInterval) return;

    this._raycastDirty = false;
    this._lastHoverRaycastAt = now;

    this._updateRaycastMatrices();
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.brainMeshes);

    let newRegion = null;
    if (intersects.length > 0) {
      const regionId = this._getHitRegionId(intersects[0]);
      newRegion = regionId === null ? null : getRegionById(regionId);
    }

    if (newRegion !== this.hoveredRegion) {
      this.hoveredRegion = newRegion;
      if (this.onHoverChange) this.onHoverChange(newRegion);
    }
  }

  _onResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this._positionSpecimen();
    this.renderer.setSize(this.width, this.height);
    this.labelRenderer.setSize(this.width, this.height);
  }

  _positionSpecimen() {
    this.specimenRotationGroup.scale.setScalar(
      getResponsiveSpecimenScale(this.width)
    );
    const distance = this.camera.position.distanceTo(
      new THREE.Vector3(this.controls.target.x, this.controls.target.y, this.controls.target.z)
    );
    const viewportHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // Moving the orbit target would carry the camera with it and leave the
    // specimen where it was, so the composition shift offsets the specimen from
    // the target, as the responsive offset and pan already do.
    const shift = (BRAIN_VERTICAL_SHIFT_CSS_PX / this.height) * viewportHeight;
    const baseY = BRAIN_BASE_VERTICAL_OFFSET;
    this.specimenGroup.position.y =
      baseY +
      shift +
      this._specimenPanY +
      getResponsiveSpecimenVerticalOffset(this.width);
    this.controls.target.x = 0;
    this.controls.target.y = baseY;
    this.controls.target.z = 0;
    this.controls.updateCamera();
  }

  _panSpecimenVertical(normalizedDelta) {
    const distance = this.camera.position.distanceTo(
      new THREE.Vector3(
        this.controls.target.x,
        this.controls.target.y,
        this.controls.target.z
      )
    );
    const viewportHeight =
      2 *
      distance *
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this._specimenPanY = THREE.MathUtils.clamp(
      this._specimenPanY + normalizedDelta * viewportHeight,
      -0.9,
      0.9
    );
    this._positionSpecimen();
    this._raycastDirty = true;
  }

  _animate() {
    if (!this._animating) return;
    requestAnimationFrame(() => this._animate());

    this.controls.update();
    this._syncNavigatingState();
    this._updateHighlightFeedback();
    this._updateRaycast();
    this._updateLabelLayout();

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  dispose() {
    this._animating = false;
    window.removeEventListener('resize', this._resizeHandler);
    this.renderer.domElement.removeEventListener('mousemove', this._mouseMoveHandler);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.labelRenderer.domElement.parentNode) {
      this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
    }
  }
}
