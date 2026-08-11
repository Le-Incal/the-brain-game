/**
 * Custom Orbit Controls
 *
 * Tailored for the brain game interaction model:
 * - A fixed, stable camera paired with specimen rotation
 * - Grab-and-drag: the surface follows the pointer in screen space
 * - Scroll / pinch to zoom
 * - Two-finger drag to pan (touch)
 * - Auto-rotation stops on first interaction
 */

import * as THREE from 'three';

export const DEFAULT_MIN_FLIP_ANGLE = 0;
export const DEFAULT_MAX_FLIP_ANGLE = Math.PI;
/** Pinch distance change → camera radius delta. Spread in = zoom in. */
export const PINCH_ZOOM_SENSITIVITY = 0.012;

export function clampFlipAngle(
  angle,
  minAngle = DEFAULT_MIN_FLIP_ANGLE,
  maxAngle = DEFAULT_MAX_FLIP_ANGLE
) {
  return Math.max(minAngle, Math.min(maxAngle, angle));
}

export function dragToSpecimenVelocity(dx, dy, sensitivity) {
  return {
    // Horizontal drag → spin around screen-vertical axis (world up).
    yaw: dx * sensitivity,
    // Vertical drag → tilt around screen-horizontal axis (camera right).
    flip: -dy * sensitivity,
  };
}

export function dragToVerticalPan(deltaY, viewportHeight) {
  return -deltaY / Math.max(1, viewportHeight);
}

export function pointerDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function pointerMidpoint(a, b) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  };
}

/** Normalized pan from a midpoint drag. Screen-up → positive Y. */
export function dragToPan(deltaX, deltaY, viewportWidth, viewportHeight) {
  return {
    x: deltaX / Math.max(1, viewportWidth),
    y: -deltaY / Math.max(1, viewportHeight),
  };
}

/**
 * Pinch spread increases distance and should zoom in (smaller orbit radius).
 */
export function pinchDistanceToRadiusDelta(
  previousDistance,
  currentDistance,
  sensitivity = PINCH_ZOOM_SENSITIVITY
) {
  return (previousDistance - currentDistance) * sensitivity;
}

export function isClickGesture(startX, startY, endX, endY, threshold = 5) {
  const dx = endX - startX;
  const dy = endY - startY;
  return dx * dx + dy * dy <= threshold * threshold;
}

export function trackballDeltaQuaternion(previous, current) {
  return new THREE.Quaternion().setFromUnitVectors(previous, current);
}

// Shoemake-style sphere/hyperbola projection. Unlike clamping to the sphere's
// rim, the hyperbolic sheet keeps producing rotation as the pointer travels.
export function projectTrackballVector(x, y, target) {
  const distanceSquared = x * x + y * y;
  const z = distanceSquared <= 0.5
    ? Math.sqrt(1 - distanceSquared)
    : 0.5 / Math.sqrt(distanceSquared);

  return target.set(x, y, z).normalize();
}

export class BrainOrbitControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.orientGroup = options.orientGroup ?? options.specimen ?? null;

    this.theta = options.theta ?? Math.PI * 0.5;
    this.phi = options.phi ?? Math.PI * 0.44;
    this.radius = options.radius ?? 4.2;

    this.minRadius = options.minRadius ?? 2.5;
    this.maxRadius = options.maxRadius ?? 8.0;

    this.target = options.target ?? { x: 0, y: -0.06, z: 0 };

    this.isDragging = false;
    this.autoRotate = options.autoRotate ?? true;
    this.autoRotateSpeed = options.autoRotateSpeed ?? 0.003;
    this.activePointerId = null;
    /** @type {Map<number, { x: number, y: number }>} */
    this._pointers = new Map();
    // High enough to track the pointer within roughly one frame, while the
    // render-loop interpolation still filters uneven pointer-event timing.
    this.rotationSmoothing = options.rotationSmoothing ?? 55;
    this.targetQuaternion = this.orientGroup
      ? this.orientGroup.quaternion.clone()
      : new THREE.Quaternion();
    this._lastUpdateTime = performance.now();

    this._onInteraction = options.onFirstInteraction ?? null;
    this._onClick = options.onClick ?? null;
    this._onPan = options.onPan ?? null;
    this._hasInteracted = false;
    this._dragMode = null;
    this._lastPointerX = 0;
    this._lastPointerY = 0;
    this._pointerStartX = 0;
    this._pointerStartY = 0;
    this._maxPointerDistanceSquared = 0;
    this._pinchPreviousDistance = 0;
    this._pinchPreviousMidpoint = { x: 0, y: 0 };

    this._previousTrackball = new THREE.Vector3();
    this._currentTrackball = new THREE.Vector3();
    this._pivotWorld = new THREE.Vector3();
    this._pivotNdc = new THREE.Vector3();
    this._cameraInverse = new THREE.Quaternion();
    this._deltaCamera = new THREE.Quaternion();
    this._deltaWorld = new THREE.Quaternion();
    this._worldUp = new THREE.Vector3(0, 1, 0);
    this._autoRotation = new THREE.Quaternion();

    this._pointerDownHandler = this._onPointerDown.bind(this);
    this._pointerMoveHandler = this._onPointerMove.bind(this);
    this._pointerUpHandler = this._onPointerUp.bind(this);
    this._wheelHandler = this._onWheel.bind(this);

    this._bindEvents();
    this.updateCamera();
  }

  _bindEvents() {
    const el = this.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this._pointerDownHandler);
    el.addEventListener('pointermove', this._pointerMoveHandler);
    el.addEventListener('pointerup', this._pointerUpHandler);
    el.addEventListener('pointercancel', this._pointerUpHandler);
    el.addEventListener('wheel', this._wheelHandler, { passive: false });
  }

  _markInteracted() {
    if (this._hasInteracted) return;
    this._hasInteracted = true;
    this.autoRotate = false;
    if (this._onInteraction) this._onInteraction();
  }

  _primaryPointers() {
    return [...this._pointers.values()].slice(0, 2);
  }

  _beginPinchGesture() {
    const [a, b] = this._primaryPointers();
    if (!a || !b) return;
    this._dragMode = 'pinch';
    this.activePointerId = null;
    this.isDragging = true;
    // A second finger means this was never a region click.
    this._maxPointerDistanceSquared = Number.POSITIVE_INFINITY;
    this._pinchPreviousDistance = pointerDistance(a, b);
    this._pinchPreviousMidpoint = pointerMidpoint(a, b);
  }

  _beginRotateGesture(pointerId, clientX, clientY, { shiftPan = false } = {}) {
    this.activePointerId = pointerId;
    this.isDragging = true;
    this._dragMode = shiftPan ? 'pan' : 'rotate';
    this._lastPointerX = clientX;
    this._lastPointerY = clientY;
    this._pointerStartX = clientX;
    this._pointerStartY = clientY;
    this._maxPointerDistanceSquared = 0;
    this.targetQuaternion.copy(this.orientGroup.quaternion);
    if (this._dragMode === 'rotate') {
      this._trackballVector(clientX, clientY, this._previousTrackball);
    }
  }

  _trackballVector(clientX, clientY, target) {
    const rect = this.domElement.getBoundingClientRect();

    this.orientGroup.getWorldPosition(this._pivotWorld);
    this._pivotNdc.copy(this._pivotWorld).project(this.camera);

    const centerX = rect.left + (this._pivotNdc.x * 0.5 + 0.5) * rect.width;
    const centerY = rect.top + (-this._pivotNdc.y * 0.5 + 0.5) * rect.height;
    const trackballRadius = Math.max(80, Math.min(rect.width, rect.height) * 0.28);
    const x = (clientX - centerX) / trackballRadius;
    const y = (centerY - clientY) / trackballRadius;

    return projectTrackballVector(x, y, target);
  }

  _applyRadiusDelta(delta) {
    this.radius = Math.max(
      this.minRadius,
      Math.min(this.maxRadius, this.radius + delta)
    );
    this.updateCamera();
  }

  _onPointerDown(e) {
    e.preventDefault();
    if (!this.orientGroup || this._pointers.has(e.pointerId)) return;

    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.domElement.setPointerCapture?.(e.pointerId);
    this._markInteracted();

    if (this._pointers.size >= 2) {
      this._beginPinchGesture();
      return;
    }

    this._beginRotateGesture(e.pointerId, e.clientX, e.clientY, {
      shiftPan: e.shiftKey,
    });
  }

  _onPointerMove(e) {
    if (!this._pointers.has(e.pointerId)) return;
    e.preventDefault();
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._dragMode === 'pinch') {
      if (this._pointers.size < 2) return;
      const [a, b] = this._primaryPointers();
      const distance = pointerDistance(a, b);
      const midpoint = pointerMidpoint(a, b);
      const rect = this.domElement.getBoundingClientRect();

      this._applyRadiusDelta(
        pinchDistanceToRadiusDelta(this._pinchPreviousDistance, distance)
      );

      const pan = dragToPan(
        midpoint.x - this._pinchPreviousMidpoint.x,
        midpoint.y - this._pinchPreviousMidpoint.y,
        rect.width,
        rect.height
      );
      this._onPan?.(pan);

      this._pinchPreviousDistance = distance;
      this._pinchPreviousMidpoint = midpoint;
      return;
    }

    if (!this.isDragging || e.pointerId !== this.activePointerId) return;

    const totalDx = e.clientX - this._pointerStartX;
    const totalDy = e.clientY - this._pointerStartY;
    this._maxPointerDistanceSquared = Math.max(
      this._maxPointerDistanceSquared,
      totalDx * totalDx + totalDy * totalDy
    );

    if (this._dragMode === 'pan') {
      const rect = this.domElement.getBoundingClientRect();
      const deltaX = e.clientX - this._lastPointerX;
      const deltaY = e.clientY - this._lastPointerY;
      this._lastPointerX = e.clientX;
      this._lastPointerY = e.clientY;
      this._onPan?.(dragToPan(deltaX, deltaY, rect.width, rect.height));
      return;
    }

    this._trackballVector(e.clientX, e.clientY, this._currentTrackball);

    this._deltaCamera.setFromUnitVectors(
      this._previousTrackball,
      this._currentTrackball
    );

    // Convert the camera-space trackball rotation into world space, then apply
    // it before the specimen's existing orientation. The grabbed surface point
    // therefore follows the pointer in both screen axes.
    this._cameraInverse.copy(this.camera.quaternion).invert();
    this._deltaWorld
      .copy(this.camera.quaternion)
      .multiply(this._deltaCamera)
      .multiply(this._cameraInverse)
      .normalize();
    this.targetQuaternion.premultiply(this._deltaWorld).normalize();

    this._previousTrackball.copy(this._currentTrackball);
  }

  _onPointerUp(e) {
    if (!this._pointers.has(e.pointerId)) return;
    this.domElement.releasePointerCapture?.(e.pointerId);
    this._pointers.delete(e.pointerId);

    if (this._dragMode === 'pinch') {
      if (this._pointers.size >= 2) {
        this._beginPinchGesture();
        return;
      }
      if (this._pointers.size === 1) {
        const [pointerId, point] = this._pointers.entries().next().value;
        this._beginRotateGesture(pointerId, point.x, point.y);
        return;
      }
      this.activePointerId = null;
      this.isDragging = false;
      this._dragMode = null;
      return;
    }

    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.isDragging = false;
    const completedMode = this._dragMode;
    this._dragMode = null;
    if (
      completedMode === 'rotate' &&
      this._onClick &&
      this._maxPointerDistanceSquared <= 25 &&
      isClickGesture(
        this._pointerStartX,
        this._pointerStartY,
        e.clientX,
        e.clientY
      )
    ) {
      this._onClick(e);
    }
  }

  _onWheel(e) {
    e.preventDefault();
    this._applyRadiusDelta(e.deltaY * 0.005);
    this._markInteracted();
  }

  update() {
    if (!this.orientGroup) return;

    const now = performance.now();
    const deltaSeconds = Math.min((now - this._lastUpdateTime) / 1000, 0.05);
    this._lastUpdateTime = now;

    if (this.autoRotate) {
      this._autoRotation.setFromAxisAngle(
        this._worldUp,
        this.autoRotateSpeed
      );
      this.targetQuaternion.premultiply(this._autoRotation).normalize();
    }

    // Pointer events arrive at uneven intervals. Interpolating on render frames
    // removes visible stepping while still converging quickly to the cursor.
    const blend = 1 - Math.exp(-this.rotationSmoothing * deltaSeconds);
    this.orientGroup.quaternion.slerp(this.targetQuaternion, blend).normalize();
  }

  updateCamera() {
    this.camera.position.set(
      this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * Math.sin(this.phi) * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target.x, this.target.y, this.target.z);
  }

  dispose() {
    const el = this.domElement;
    el.removeEventListener('pointerdown', this._pointerDownHandler);
    el.removeEventListener('pointermove', this._pointerMoveHandler);
    el.removeEventListener('pointerup', this._pointerUpHandler);
    el.removeEventListener('pointercancel', this._pointerUpHandler);
    el.removeEventListener('wheel', this._wheelHandler);
  }
}
