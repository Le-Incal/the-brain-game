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
import { REGIONS } from '../data/regions';
import { BrainOrbitControls } from './orbitControls';
import {
  classifyVertex,
  computeCerebrumPivot,
  computeRegionLabelAnchors,
} from './brainLoader';

// Keep the specimen at the lower base composition. This is 96 CSS pixels
// below the previous presentation, which added a 96-pixel upward shift.
const BRAIN_BASE_VERTICAL_OFFSET = -0.5;
const BRAIN_VERTICAL_SHIFT_CSS_PX = 0;
const BRAIN_SCALE = 0.88 * 1.1;
const LABEL_GUTTER_PX = 40;

export function getResponsiveSpecimenScale(viewportWidth) {
  if (viewportWidth <= 480) return 0.68;
  if (viewportWidth <= 640) return 0.8;
  return 1;
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

    const textureLoader = new THREE.TextureLoader();
    const configureMap = (texture) => {
      texture.colorSpace = THREE.NoColorSpace;
      texture.flipY = false;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return texture;
    };

    const aoMap = configureMap(textureLoader.load('/maps/brain_ao.png'));
    const cavityMap = configureMap(textureLoader.load('/maps/brain_cavity.png'));
    const curvatureMap = configureMap(textureLoader.load('/maps/brain_curvature.png'));
    const etchingMap = configureMap(textureLoader.load('/maps/brain_etching.png'));

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

    const regionColorArray = REGIONS.map((r) => new THREE.Vector3(...r.color));

    this.uniforms = {
      uAoMap: { value: aoMap },
      uCavityMap: { value: cavityMap },
      uCurvatureMap: { value: curvatureMap },
      uEtchingMap: { value: etchingMap },
      uLightDir1: { value: new THREE.Vector3(1.5, 1.8, 2.0).normalize() },
      uLightDir2: { value: new THREE.Vector3(-1.0, 0.5, -0.8).normalize() },
      uColorMode: { value: 0.0 },
      uRegionColors: { value: regionColorArray },
      uHighlight: { value: -1.0 },
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
    this._hitLocalPoint = new THREE.Vector3();
    this._raycastDirty = true;
    // Pointer events can arrive at display-frame cadence; cap hover picking so
    // a high-poly specimen is never raycast every rendered frame.
    this._hoverRaycastInterval = 1000 / 20;
    this._lastHoverRaycastAt = -Infinity;
    this.brainMeshes = [];
    this.hoveredRegion = null;
    this.onHoverChange = options.onHoverChange || null;
    this.onRegionSelect = options.onRegionSelect || null;
    this.selectedRegionId = -1;
    this._highlightUntil = 0;
    this.labelObjects = [];
    this._labelWorldPosition = new THREE.Vector3();
    this._labelCenterWorld = new THREE.Vector3();
    this._labelWorldNormal = new THREE.Vector3();
    this._labelSurfaceDirection = new THREE.Vector3();
    this._labelViewDirection = new THREE.Vector3();
    this._labelCameraDirection = new THREE.Vector3();
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

    brainGroup.scale.setScalar(BRAIN_SCALE);
    this.brainGroup = brainGroup;
    this.specimenOrientGroup.add(brainGroup);

    const pivot = computeCerebrumPivot(this.brainMeshes);
    const pivotOffset = pivot.clone().multiplyScalar(-BRAIN_SCALE);
    brainGroup.position.copy(pivotOffset);
    this.labelGroup.position.copy(pivotOffset);
    this.regionLabelAnchors = computeRegionLabelAnchors(
      this.brainMeshes,
      REGIONS.length,
      brainGroup
    );
    brainGroup.updateMatrixWorld(true);
    new THREE.Box3()
      .setFromObject(brainGroup)
      .getBoundingSphere(this._brainBoundingSphere);
    this.brainBoundingRadius = this._brainBoundingSphere.radius;

    this._buildLabels();
    this._positionSpecimen();
  }

  _buildLabels() {
    this.labelObjects.forEach((obj) => this.labelGroup.remove(obj));
    this.labelObjects = [];

    REGIONS.forEach((region) => {
      const wrap = document.createElement('div');
      wrap.className = 'brain-annotation';
      wrap.innerHTML = `
        <span class="brain-annotation__leader"></span>
        <span class="brain-annotation__text">${region.name}</span>
      `;

      const label = new CSS2DObject(wrap);
      const anchor = this.regionLabelAnchors?.[region.id];
      if (anchor) {
        label.position.copy(anchor).multiplyScalar(BRAIN_SCALE);
      } else {
        const [x, y, z] = region.labelPosition;
        label.position.set(x * BRAIN_SCALE, y * BRAIN_SCALE, z * BRAIN_SCALE);
      }
      label.userData.screenSide = null;
      label.userData.regionId = region.id;
      label.userData.regionCenter = anchor
        ? anchor.clone().multiplyScalar(BRAIN_SCALE)
        : label.position.clone();
      label.userData.candidates = (anchor?.candidates || [anchor])
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

    this.labelObjects.forEach((label) => {
      label.visible = false;
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

      const region = REGIONS[label.userData.regionId];
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
    if (!hit?.point || !hit.object) return null;
    this._hitLocalPoint.copy(hit.point);
    hit.object.worldToLocal(this._hitLocalPoint);
    const regionId = classifyVertex(
      this._hitLocalPoint.x,
      this._hitLocalPoint.y,
      this._hitLocalPoint.z
    );
    return regionId >= 0 && regionId < REGIONS.length ? regionId : null;
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
    const region = hitRegionId === null ? null : REGIONS[hitRegionId];

    const nextRegionId =
      region && region.id !== this.selectedRegionId ? region.id : -1;
    this.selectedRegionId = nextRegionId;
    this.uniforms.uSelectedRegion.value = nextRegionId;
    if (this.onRegionSelect) {
      this.onRegionSelect(nextRegionId >= 0 ? REGIONS[nextRegionId] : null);
    }
  }

  beginHighlightFeedback(regionId, durationMs = 2000, _options = {}) {
    this._highlightUntil = performance.now() + durationMs;
    this.uniforms.uHighlight.value = regionId ?? -1.0;
  }

  _clearExpiredFeedback() {
    const now = performance.now();
    if (this._highlightUntil && now >= this._highlightUntil) {
      this.uniforms.uHighlight.value = -1.0;
      this._highlightUntil = 0;
    }
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
      newRegion = regionId === null ? null : REGIONS[regionId];
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
    const shift = (BRAIN_VERTICAL_SHIFT_CSS_PX / this.height) * viewportHeight;
    const baseY = BRAIN_BASE_VERTICAL_OFFSET + shift;
    this.specimenGroup.position.y = baseY + this._specimenPanY;
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
    this._clearExpiredFeedback();
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
