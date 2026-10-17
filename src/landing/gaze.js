/**
 * The landing's gaze (Kyle, 2026-10-16): "when the user draws near the Enter
 * button with the cursor, the brain rotates to look at the button and if the
 * cursor pulls away from the enter button it looks up at the user and slowly
 * rotates away."
 *
 * Near Enter (within 120 px, or keyboard focus on it) the brain turns over
 * 1.2 s so its frontal pole points three-quarters toward the button, halfway
 * between us and it, with a slight look down to wherever the button sits. It
 * holds there. When the cursor pulls away it turns to face the visitor, tilted
 * up a touch, and holds 0.5 s. Then it turns slowly away, 6 degrees
 * counter-clockwise and level again over 1.5 s, and the drift carries it on.
 * Every turn goes through the orbit controller, so a grab always wins.
 */

import * as THREE from 'three';
import { orientationFacing } from '../voice/orientation.js';

export const NOTICE_RADIUS_PX = 120;
export const TURN_MS = 1200;
// Kyle, 2026-10-16: "start to auto rotate sooner." A short hold, then a turn
// away that averages the drift's own 4 degrees a second, straight into it.
export const HOLD_ON_YOU_MS = 500;
export const AWAY_MS = 1500;
const THREE_QUARTER_DEGREES = 45;
const LOOK_UP_DEGREES = 10;
const AWAY_DEGREES = 6;

function defaultSchedule(fn, ms) {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

const identityConvert = (axis) => new THREE.Vector3(...axis).normalize();

function screenRightOf(frame) {
  return new THREE.Vector3().crossVectors(frame.screenUp, frame.toCamera).normalize();
}

/**
 * The direction the frontal pole points to look at Enter: halfway between the
 * visitor and the button, which lies `toButton` (screen pixels, y down) from
 * the brain's centre.
 */
export function lookAtButton({ frame, toButton }) {
  const inPlane = screenRightOf(frame)
    .multiplyScalar(toButton.dx)
    .add(frame.screenUp.clone().multiplyScalar(-toButton.dy));
  if (inPlane.lengthSq() < 1e-9) return frame.toCamera.clone();
  inPlane.normalize();
  const turn = THREE.MathUtils.degToRad(THREE_QUARTER_DEGREES);
  return frame.toCamera.clone().multiplyScalar(Math.cos(turn)).add(inPlane.multiplyScalar(Math.sin(turn))).normalize();
}

/** The direction to look up at the visitor: toward the camera, tilted up a touch. */
export function lookUpAtVisitor({ frame }) {
  const tilt = THREE.MathUtils.degToRad(LOOK_UP_DEGREES);
  return frame.toCamera.clone().multiplyScalar(Math.cos(tilt)).add(frame.screenUp.clone().multiplyScalar(Math.sin(tilt))).normalize();
}

/**
 * The direction it turns away to: level, 6 degrees counter-clockwise seen
 * from above (the drift's way round), from facing the visitor.
 */
export function lookAway({ frame }) {
  return frame.toCamera.clone().applyAxisAngle(frame.screenUp, THREE.MathUtils.degToRad(AWAY_DEGREES)).normalize();
}

/** The specimen's pose with its frontal pole along `direction` and its top kept up. */
export function poseLooking(direction, frame, convert = identityConvert) {
  const toward = direction.clone().normalize();
  const up = frame.screenUp.clone().sub(toward.clone().multiplyScalar(frame.screenUp.dot(toward))).normalize();
  return orientationFacing(convert([0, 0, 1]), { toCamera: toward, screenUp: up }, convert([0, 1, 0]), convert([0, 0, 1]));
}

/** Whether a point lies on the button or within `radius` of its edge. */
export function nearButton(point, rect, radius = NOTICE_RADIUS_PX) {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy) <= radius;
}

/**
 * The gaze's states: drifting, looking at the button, turning to the visitor,
 * holding on them, turning away. `poses.button()`, `poses.you()` and
 * `poses.away()` are computed at the moment of each turn, so they follow the
 * layout.
 */
export function startGaze({ controls, drift, poses, schedule = defaultSchedule }) {
  let state = 'drifting';
  let turn = 0;
  let cancelHold = null;

  // Any new turn, or the visitor taking hold, abandons the one in flight.
  function nextTurn() {
    cancelHold?.();
    cancelHold = null;
    turn += 1;
    return turn;
  }

  const unsubscribe = controls.subscribeUserInput((event) => {
    // The visitor has the brain: the drift's own rules take over.
    if (event.type === 'grab') {
      state = 'drifting';
      nextTurn();
    }
  });

  function turnAway(mine) {
    state = 'leaving';
    controls.moveTo(poses.away(), { durationMs: AWAY_MS }).then((outcome) => {
      if (mine !== turn || !outcome.completed) return;
      state = 'drifting';
      drift.resume();
    });
  }

  function setNear(near) {
    if (controls.isDragging) return;
    if (near && state !== 'looking') {
      state = 'looking';
      nextTurn();
      drift.pause();
      controls.moveTo(poses.button(), { durationMs: TURN_MS });
    } else if (!near && state === 'looking') {
      state = 'facing';
      const mine = nextTurn();
      drift.pause();
      controls.moveTo(poses.you(), { durationMs: TURN_MS }).then((outcome) => {
        if (mine !== turn || !outcome.completed) return;
        state = 'holding';
        cancelHold = schedule(() => {
          cancelHold = null;
          if (mine === turn) turnAway(mine);
        }, HOLD_ON_YOU_MS);
      });
    }
  }

  return {
    setNear,
    stop() {
      nextTurn();
      unsubscribe();
    },
  };
}
