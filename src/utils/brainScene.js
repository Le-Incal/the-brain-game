/**
 * Brain Scene Manager
 *
 * Sets up the Three.js scene, camera, renderer, and manages the
 * render loop. Handles shader material creation, region highlighting,
 * raycasting for hover detection and colour mode.
 */

import * as THREE from 'three';
import { vertexShader, fragmentShader } from '../shaders';
import {
  REGIONS,
  REGION_IDS,
  getRegionById,
} from '../data/regions';
import { BrainOrbitControls } from './orbitControls';
import {
  applyVertexRegionAttributes,
  computeCerebrumPivot,
} from './brainLoader';
import { createSpecimenSpace } from './specimenSpace';
import { mockVoiceLevel, smoothVoiceLevel } from '../voice/voiceLevel';
import {
  CENTRE_DROP_CSS_PX,
  COMPOSITION_SLIDE_MS,
  centreShiftFor,
  centresOnPage,
  phoneBrainMiddlePx,
  shiftToTop,
  composeSpecimenY,
  cssPxToWorld,
  refineBrainCentre,
  slideLift,
} from './composition.js';

// Where the orbit target sits. The camera turns about this point, so the
// specimen is displaced from it rather than moved with it.
const BRAIN_BASE_VERTICAL_OFFSET = -0.5;
// Negative moves the specimen down the page. 48 CSS pixels is half an inch.
const BRAIN_VERTICAL_SHIFT_CSS_PX = -48;
const BRAIN_SCALE = 1.278;

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

/**
 * Whether clicks and hovers pick regions. The landing page turns the brain
 * only (Kyle, 2026-10-15): "they shouldn't be able to click any of the regions".
 */
export function regionPickingEnabled(options = {}) {
  return options?.selectable !== false;
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

/**
 * Desktop/laptop composition drop in CSS pixels. Phones keep the pre-drop
 * height so the specimen is not pushed further down a short viewport.
 */
export function getCompositionVerticalShiftCssPx(viewportWidth) {
  if (viewportWidth <= 480) return 0;
  return BRAIN_VERTICAL_SHIFT_CSS_PX;
}

/**
 * Catch/miss feedback pulse for the highlighted region's colour wash.
 * Returns 0–1; never fully extinguishes the target colour.
 */
export function computeHighlightPulse(elapsedMs) {
  const wave = 0.5 + 0.5 * Math.sin((elapsedMs / 1000) * Math.PI * 2 * 1.25);
  return 0.35 + 0.65 * wave;
}

// The guide's highlight is the region's own Colour Regions tint at full
// strength under unchanged linework, held steadily until cleared.
export const VOICE_HIGHLIGHT_PULSE = 1;
// The rest of a lit lobe while one of its regions has the guide's focus: a
// paler wash of its own colour, so the named region stands out.
export const VOICE_WASH_LEVEL = 0.4;

/**
 * Which region is lit and how strongly. Game feedback wins while it runs and
 * is unchanged from before; otherwise the guide's highlight holds steadily.
 */
export function resolveHighlight({ now, feedback, voiceRegionId }) {
  if (feedback && now < feedback.until) {
    return { regionId: feedback.regionId, pulse: computeHighlightPulse(now - feedback.startedAt) };
  }
  if (voiceRegionId !== null && voiceRegionId !== undefined) {
    return { regionId: voiceRegionId, pulse: VOICE_HIGHLIGHT_PULSE };
  }
  return { regionId: -1, pulse: 0 };
}

/**
 * Game feedback drives uHighlight (it isolates the answer and dims the rest).
 * The guide's highlight has its own uniform so it never dims other regions.
 */
export function toHighlightUniforms({ now, feedback, voiceRegionIds, voiceFocusIds = null }) {
  const ids = Array.isArray(voiceRegionIds) ? voiceRegionIds : [];
  const focus = Array.isArray(voiceFocusIds) && voiceFocusIds.length > 0 ? voiceFocusIds : null;
  const feedbackActive = Boolean(feedback && now < feedback.until);
  if (feedbackActive) {
    const resolved = resolveHighlight({ now, feedback, voiceRegionId: null });
    return {
      uHighlight: resolved.regionId,
      uHighlightPulse: resolved.pulse,
      uVoiceMask: REGION_IDS.map(() => 0),
      uVoiceActive: 0,
    };
  }
  // A mask in the painted-region order of uRegionIds, so a lobe lights at once.
  // With a focus, the focus is full and the rest of the lit regions wash.
  const level = (id) => {
    if (!ids.includes(id)) return 0;
    return !focus || focus.includes(id) ? 1 : VOICE_WASH_LEVEL;
  };
  return {
    uHighlight: -1,
    uHighlightPulse: 0,
    uVoiceMask: REGION_IDS.map(level),
    uVoiceActive: ids.length > 0 ? 1 : 0,
  };
}

const GESTURE_UP = new THREE.Vector3(0, 1, 0);
const gestureAxis = new THREE.Vector3();
const gestureTurn = new THREE.Quaternion();

/**
 * The guide's gesture as a turn of its own group: a sway about the vertical,
 * a nod about the screen's horizontal and (Kyle, 2026-10-13, puppet speech) a
 * tilt about the line of sight, applied in that order. Radians.
 */
export function gestureQuaternion({ yaw = 0, pitch = 0, roll = 0 } = {}, cameraQuaternion, out = new THREE.Quaternion()) {
  out.setFromAxisAngle(GESTURE_UP, yaw);
  gestureAxis.set(1, 0, 0).applyQuaternion(cameraQuaternion).normalize();
  out.multiply(gestureTurn.setFromAxisAngle(gestureAxis, pitch));
  gestureAxis.set(0, 0, 1).applyQuaternion(cameraQuaternion).normalize();
  out.multiply(gestureTurn.setFromAxisAngle(gestureAxis, roll));
  return out;
}

export function createVoiceUniforms() {
  return { uVoiceLevel: { value: 0 } };
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
      uVoiceMask: { value: REGION_IDS.map(() => 0) },
      uVoiceActive: { value: 0 },
      ...createVoiceUniforms(),
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
    // The guide's gestures (a slight sway and nod while it speaks) live on
    // their own group, so the orientation the controls and the voice layer
    // read and drive is never touched by them.
    this.specimenGestureGroup = new THREE.Group();
    this.specimenRotationGroup.add(this.specimenGestureGroup);
    this.specimenGestureGroup.add(this.specimenOrientGroup);
    this.specimenGroup.add(this.specimenRotationGroup);
    this.scene.add(this.specimenGroup);
    this._specimenPanY = 0;
    // The brain's height (Kyle, 2026-10-16): 1 is centred on the page, 0 the
    // game's lower height. Centred from arrival; the brain's own centre is
    // measured once it loads.
    this._lift = 1;
    this._slide = null;
    this._brainCentre = null;
    // A quarter inch below the middle (Kyle, 2026-10-17); 0 while the centre is measured.
    this._centreDropPx = CENTRE_DROP_CSS_PX;
    // On a phone, in the app only, the brain's top sits under the title (Kyle,
    // 2026-10-17). Measured once it loads, and again when the page resizes.
    this._phoneCentred = Boolean(options.phoneTop);
    this._phoneShift = null;
    // A little lower again for the game (Kyle, 2026-10-17).
    this._phoneGameShift = null;

    this._regionPicking = regionPickingEnabled(options);
    this.controls = new BrainOrbitControls(this.camera, this.renderer.domElement, {
      orientGroup: this.specimenOrientGroup,
      onFirstInteraction: options.onFirstInteraction,
      onClick: this._regionPicking ? (event) => this._selectRegionAtEvent(event) : null,
      onPan: (normalizedDelta) => this._panSpecimenVertical(normalizedDelta),
      zoom: options.zoom,
      pan: options.pan,
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
    this._feedback = null;
    this._voiceHighlight = null;
    this._voiceFocus = null;
    this._voiceLevel = 0;
    this._voiceLevelTarget = 0;
    this._useMockVoiceLevel = false;
    this._lastVoiceFrameAt = performance.now();
    this._specimenSpace = null;

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
    if (this.brainNormalization) {
      this._specimenSpace = createSpecimenSpace({
        normalization: this.brainNormalization,
        scale: BRAIN_SCALE,
        pivot,
      });
    }
    const pivotOffset = pivot.clone().multiplyScalar(-BRAIN_SCALE);
    brainGroup.position.copy(pivotOffset);
    brainGroup.updateMatrixWorld(true);

    this._brainCentre = this._measureBrainCentre();
    // Twice: the second pass takes up what perspective leaves of the first.
    for (let pass = 0; pass < 2; pass += 1) this._brainCentre = this._landedBrainCentre(this._brainCentre);
    this._phoneShift = this._landedPhoneShift();
    this._positionSpecimen();
  }

  /**
   * The specimen's offset that puts a phone's brain between the title and the
   * conversation, in its current pose, or null on a wider page or outside the
   * app. Sets the game's offset, a little lower, beside it.
   */
  _landedPhoneShift() {
    this._phoneGameShift = null;
    if (!this._phoneCentred || centresOnPage(this.width) || !this.brainMeshes.length) return null;
    const safeBottom = this._safeAreaBottom();
    const held = { lift: this._lift, shift: this._phoneShift };
    const viewportHeight = this._viewportHeightAtTarget();
    let shift = (getCompositionVerticalShiftCssPx(this.width) / this.height) * viewportHeight;
    this._lift = 1;
    let brainPx = 0;
    // Three passes: the brain's size on screen changes a little as it rises.
    for (let pass = 0; pass < 3; pass += 1) {
      this._phoneShift = shift;
      this._positionSpecimen();
      const { minY, maxY } = this._silhouetteNdc();
      const middlePx = ((1 - (minY + maxY) / 2) / 2) * this.height;
      brainPx = ((maxY - minY) / 2) * this.height;
      const targetPx = phoneBrainMiddlePx({ height: this.height, safeBottom, brainPx });
      shift = shiftToTop({ shift, topPx: middlePx, targetTopPx: targetPx, height: this.height, viewportHeight });
    }
    const lower = phoneBrainMiddlePx({ height: this.height, safeBottom, brainPx, game: true })
      - phoneBrainMiddlePx({ height: this.height, safeBottom, brainPx });
    this._phoneGameShift = shift - cssPxToWorld(lower, { height: this.height, viewportHeight });
    this._lift = held.lift;
    this._phoneShift = held.shift;
    this._positionSpecimen();
    return shift;
  }

  /** The page's bottom safe area (an iPhone's home bar in full screen), in CSS px. */
  _safeAreaBottom() {
    try {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom, 0px)';
      this.container.appendChild(probe);
      const px = probe.getBoundingClientRect().height;
      probe.remove();
      return px || 0;
    } catch {
      return 0;
    }
  }

  /** The height the camera sees at its target's depth, in world units. */
  _viewportHeightAtTarget() {
    const distance = this.camera.position.distanceTo(this.controls.target);
    return 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
  }

  /** The brain's silhouette, top and bottom, in normalized device units. */
  _silhouetteNdc() {
    this.specimenGroup.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    let minY = Infinity;
    let maxY = -Infinity;
    const point = new THREE.Vector3();
    for (const mesh of this.brainMeshes) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 2) {
        point.fromBufferAttribute(positions, i);
        mesh.localToWorld(point).project(this.camera);
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
      }
    }
    return { minY, maxY };
  }

  /**
   * The brain's centre corrected by where its silhouette lands on screen when
   * centred, so it sits on the page's middle as the landing's does. Phones,
   * which are not centred, keep the measured centre.
   */
  _landedBrainCentre(brainCentre) {
    if (brainCentre === null || !centresOnPage(this.width)) return brainCentre;
    const held = { centre: this._brainCentre, lift: this._lift, drop: this._centreDropPx };
    this._brainCentre = brainCentre;
    this._lift = 1;
    // Measured against the true middle; the drop is added after.
    this._centreDropPx = 0;
    this._positionSpecimen();
    const { minY, maxY } = this._silhouetteNdc();
    this._brainCentre = held.centre;
    this._lift = held.lift;
    this._centreDropPx = held.drop;
    const distance = this.camera.position.distanceTo(this.controls.target);
    const viewportHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return refineBrainCentre({
      brainCentre,
      ndcCentre: (minY + maxY) / 2,
      viewportHeight,
      scale: this.specimenRotationGroup.scale.y || 1,
    });
  }

  /**
   * The brain's centre (its box, stem included, in the arrival pose) above or
   * below the specimen's origin, at a scale of 1. The brain hangs from its
   * cerebrum's centre, so the stem pulls this below the origin.
   */
  _measureBrainCentre() {
    const held = this.specimenGroup.position.y;
    this.specimenGroup.position.y = 0;
    this.specimenGroup.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const mesh of this.brainMeshes) box.expandByObject(mesh, true);
    this.specimenGroup.position.y = held;
    this.specimenGroup.updateMatrixWorld(true);
    if (box.isEmpty()) return null;
    const scale = this.specimenRotationGroup.scale.y || 1;
    return (box.min.y + box.max.y) / 2 / scale;
  }

  /**
   * 'centre' (Explore and Study) or 'game': slides the brain to that height
   * over 0.9 s, eased, or moves it at once with `immediate`.
   */
  setComposition(name, { immediate = false, durationMs = COMPOSITION_SLIDE_MS } = {}) {
    const to = name === 'game' ? 0 : 1;
    if (immediate) {
      this._slide = null;
      this._lift = to;
      this._positionSpecimen();
      this._raycastDirty = true;
      return;
    }
    if (this._slide ? this._slide.to === to : this._lift === to) return;
    this._slide = { from: this._lift, to, startedAt: performance.now(), durationMs };
  }

  _stepComposition() {
    if (!this._slide) return;
    const now = performance.now();
    this._lift = slideLift({ ...this._slide, now });
    if (now - this._slide.startedAt >= this._slide.durationMs) this._slide = null;
    this._positionSpecimen();
    this._raycastDirty = true;
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
    this._feedback = { regionId: regionId ?? -1, startedAt: now, until: now + durationMs };
    this._applyHighlightUniforms(now);
  }

  _updateHighlightFeedback() {
    const now = performance.now();
    if (this._feedback && now >= this._feedback.until) {
      this._feedback = null;
      this._highlightUntil = 0;
      this._highlightStartedAt = 0;
    }
    this._applyHighlightUniforms(now);
  }

  _applyHighlightUniforms(now) {
    const next = toHighlightUniforms({
      now,
      feedback: this._feedback,
      voiceRegionIds: this._voiceHighlight,
      voiceFocusIds: this._voiceFocus,
    });
    this.uniforms.uHighlight.value = next.uHighlight;
    this.uniforms.uHighlightPulse.value = next.uHighlightPulse;
    this.uniforms.uVoiceMask.value = next.uVoiceMask;
    this.uniforms.uVoiceActive.value = next.uVoiceActive;
  }

  /** Sway (about world up) and nod (about the screen's horizontal), in radians. */
  setGesture(gesture = {}) {
    gestureQuaternion(gesture, this.camera.quaternion, this.specimenGestureGroup.quaternion);
  }

  /** Clears the player's selection, as a click on the selected region would. */
  clearSelection({ demo = false } = {}) {
    if (this.selectedRegionId < 0) return;
    this.selectedRegionId = -1;
    this.uniforms.uSelectedRegion.value = -1;
    this.onRegionSelect?.(null, { demo });
  }

  /**
   * Selects a region exactly as a click on it would. `demo` marks the
   * welcome's demonstration (Kyle, 2026-10-13), which is not the visitor's click.
   */
  selectRegion(regionId, { demo = false } = {}) {
    const region = getRegionById(regionId);
    if (!region) return;
    this.selectedRegionId = region.id;
    this.uniforms.uSelectedRegion.value = region.id;
    this.onRegionSelect?.(region, { demo });
  }

  /**
   * The guide's highlight: one region id, a list (a whole lobe), or null.
   * Held until cleared; isolates its regions like a selection.
   */
  setVoiceHighlight(regionIds, { focus = null } = {}) {
    const ids = regionIds === null || regionIds === undefined ? [] : [].concat(regionIds);
    this._voiceHighlight = ids.length > 0 ? ids : null;
    this._voiceFocus = this._voiceHighlight && focus ? [].concat(focus) : null;
    this._applyHighlightUniforms(performance.now());
  }

  getVoiceHighlight() {
    return this._voiceHighlight;
  }

  /** Raw model frame to the specimen's frame; null until the brain loads. */
  toSpecimenSpace(point) {
    return this._specimenSpace ? this._specimenSpace.toSpecimenSpace(point) : null;
  }

  toSpecimenDirection(direction) {
    return this._specimenSpace ? this._specimenSpace.toSpecimenDirection(direction) : null;
  }

  /**
   * Where the brain's surface falls on screen: a sample of its vertices,
   * projected, in page pixels. The midline section plate is laid over it.
   */
  projectedPoints(step = 7) {
    const mesh = this.brainMeshes[0];
    if (!mesh) return [];
    mesh.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const position = mesh.geometry.attributes.position;
    const point = new THREE.Vector3();
    const points = [];
    for (let i = 0; i < position.count; i += step) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(this.camera);
      points.push({ x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height });
    }
    return points;
  }

  /** Study mode keeps the specimen on what the guide shows. */
  enterStudyMode() {
    this.controls.stopAutoRotate();
  }

  /** Target speaking level, 0 to 1 (M4 feeds the guide's output volume). */
  setVoiceLevel(level) {
    this._voiceLevelTarget = Number.isFinite(level) ? level : 0;
  }

  /** Drives the voice level from a deterministic stand-in until M4. */
  useMockVoiceLevel(enabled) {
    this._useMockVoiceLevel = Boolean(enabled);
    if (!enabled) this._voiceLevelTarget = 0;
  }

  _updateVoiceLevel() {
    const now = performance.now();
    const dt = Math.min((now - this._lastVoiceFrameAt) / 1000, 0.1);
    this._lastVoiceFrameAt = now;
    const target = this._useMockVoiceLevel ? mockVoiceLevel(now) : this._voiceLevelTarget;
    this._voiceLevel = smoothVoiceLevel(this._voiceLevel, target, dt);
    this.uniforms.uVoiceLevel.value = this._voiceLevel;
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
    if (!this._regionPicking) return;
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
    this._phoneShift = this._landedPhoneShift();
    this._positionSpecimen();
    this.renderer.setSize(this.width, this.height);
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
    const shift =
      (getCompositionVerticalShiftCssPx(this.width) / this.height) *
      viewportHeight;
    const baseY = BRAIN_BASE_VERTICAL_OFFSET;
    // On a phone the game sits a little below Explore and Study, once measured.
    const gameShift = !centresOnPage(this.width) && this._phoneGameShift !== null ? this._phoneGameShift : shift;
    // The game keeps this height; Explore and Study lift the brain's own
    // centre onto the page's middle (Kyle, 2026-10-16).
    const centreShift = centreShiftFor({
      width: this.width,
      brainCentre: this._brainCentre,
      scale: getResponsiveSpecimenScale(this.width),
      gameShift,
      drop: cssPxToWorld(-this._centreDropPx, { height: this.height, viewportHeight }),
      phoneShift: this._phoneShift,
    });
    this.specimenGroup.position.y = composeSpecimenY({
      baseY,
      gameShift,
      centreShift,
      lift: this._lift,
      panY: this._specimenPanY,
      responsiveOffset: getResponsiveSpecimenVerticalOffset(this.width),
    });
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

    this._stepComposition();
    this.controls.update();
    this._syncNavigatingState();
    this._updateHighlightFeedback();
    this._updateVoiceLevel();
    this._updateRaycast();

    this.renderer.render(this.scene, this.camera);
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
  }
}
