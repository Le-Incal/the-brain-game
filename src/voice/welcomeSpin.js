/**
 * The welcome tour (Kyle, 2026-10-13; it replaced a continuous spin that
 * "rotates too fast, like it's doing somersaults").
 *
 * On "Welcome." the brain turns to look at the visitor, its front where a
 * character's face would be, and holds there while it says its name. From
 * "You can study" it turns deliberately from one standard view to the next,
 * each a quarter turn about one axis in 1.5 s eased on a sine (about 94
 * degrees a second at the fastest): the left side, the back and the right
 * side without pausing, then a flip to show the underside.
 *
 * At "turn me around and select any of my regions" it shows what selecting
 * looks like (Kyle, later that day): it rises from the underside to a view
 * from the front-right, a little above, selects the prefrontal cortex for 2 s,
 * lets it go, and turns back to face us upright, as it arrived.
 *
 * It plays once, on arrival, and never for a visitor who has already turned
 * the brain. A grab stops it where it is; a welcome cut short turns the brain
 * calmly back to face us. It finishes facing us at the elevation it arrived
 * with, so the slow turn while it waits never wobbles.
 */

import * as THREE from 'three';
import { orientationFacing } from './orientation.js';

export const WELCOME_TOUR_TURN_MS = 1500;
// "We spend a little too much time at the back": no pause at the sides.
export const WELCOME_TOUR_PAUSE_MS = 0;
export const WELCOME_UNDERSIDE_PAUSE_MS = 250;
export const WELCOME_FACE_VIEW = 'anterior';
export const WELCOME_TOUR_VIEWS = [WELCOME_FACE_VIEW, 'left_lateral', 'posterior', 'right_lateral', 'inferior', 'front_right_above', WELCOME_FACE_VIEW];
export const WELCOME_TOUR_FROM = 'You can study';
export const WELCOME_TOUR_DEFAULT_AT_MS = 3500;
// The demonstration: the prefrontal cortex, seen from the front-right a little above.
export const WELCOME_SELECT_REGION_ID = 1;
export const WELCOME_SELECT_HOLD_MS = 2000;
export const WELCOME_AFTER_SELECT_PAUSE_MS = 250;
export const WELCOME_THREE_QUARTER = Object.freeze({ aroundDegrees: 40, aboveDegrees: 25 });

const QUARTER_TURN = Math.PI / 2;
// A short turn still takes a moment, so it reads as deliberate.
const SHORTEST_TURN_SHARE = 1 / 3;
// The greeting is held at least this long, even when the words come early.
const GREETING_MIN_HOLD_MS = 500;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));

// The tour's pace for any angle: a quarter turn in 1.5 s, longer turns take longer.
function turnMs(radians, shortestShare) {
  return Math.round(WELCOME_TOUR_TURN_MS * Math.max(shortestShare, radians / QUARTER_TURN));
}

const ease = (from, to, t) => new THREE.Quaternion().slerpQuaternions(from, to, easeInOutSine(t));
const rawAxis = (axis) => new THREE.Vector3(...axis).normalize();

/**
 * When the tour moves on from the greeting, in ms from the tour's start.
 * `startedAtMs` is how far into the welcome the tour starts, so a late first
 * frame never leaves the brain behind her words.
 */
export function welcomeTourTiming({ timeOf, startedAtMs = 0 }) {
  const atMs = timeOf(WELCOME_TOUR_FROM) ?? WELCOME_TOUR_DEFAULT_AT_MS;
  return { tourAtMs: Math.max(0, atMs - startedAtMs) };
}

/**
 * The tour from `start`: `{ durationMs, stops, events, poseAt(progress) }`.
 * `frame` is the live view frame ({ toCamera, screenUp }); `viewPose` squares a
 * standard view to the viewer; `axis` turns an anatomical axis (+x left, +y
 * up, +z front) into the specimen's frame. `stops` are `{ view, arriveMs,
 * leaveMs }`; `events` are the demonstration's select and deselect. `endPose`
 * is where it finishes: facing us upright, as it arrived.
 */
export function welcomeTour({ start, frame, viewPose, axis = rawAxis, tourAtMs, endPose = null }) {
  const square = (view) => viewPose(view).clone().normalize();
  const screenRight = new THREE.Vector3().crossVectors(frame.screenUp, frame.toCamera).normalize();
  const rightSide = square('right_lateral');
  // The flip: from the right side, the bottom tips toward us.
  const underside = new THREE.Quaternion().setFromAxisAngle(screenRight, -QUARTER_TURN).multiply(rightSide).normalize();
  const around = THREE.MathUtils.degToRad(WELCOME_THREE_QUARTER.aroundDegrees);
  const above = THREE.MathUtils.degToRad(WELCOME_THREE_QUARTER.aboveDegrees);
  const towardViewer = axis([0, 0, 1])
    .multiplyScalar(Math.cos(around) * Math.cos(above))
    .add(axis([-1, 0, 0]).multiplyScalar(Math.sin(around) * Math.cos(above)))
    .add(axis([0, 1, 0]).multiplyScalar(Math.sin(above)))
    .normalize();
  const frontRightAbove = orientationFacing(towardViewer, frame, axis([0, 1, 0]), axis([0, 0, 1])).normalize();
  const poses = [
    square(WELCOME_FACE_VIEW),
    square('left_lateral'),
    square('posterior'),
    rightSide,
    underside,
    frontRightAbove,
    (endPose ?? square(WELCOME_FACE_VIEW)).clone().normalize(),
  ];
  const pauses = [
    null,
    WELCOME_TOUR_PAUSE_MS,
    WELCOME_TOUR_PAUSE_MS,
    WELCOME_TOUR_PAUSE_MS,
    WELCOME_UNDERSIDE_PAUSE_MS,
    WELCOME_SELECT_HOLD_MS + WELCOME_AFTER_SELECT_PAUSE_MS,
    0,
  ];

  const from = start.clone().normalize();
  const greetMs = turnMs(from.angleTo(poses[0]), 1);
  const stops = [{ view: WELCOME_TOUR_VIEWS[0], arriveMs: greetMs, leaveMs: Math.max(tourAtMs, greetMs + GREETING_MIN_HOLD_MS) }];
  for (let i = 1; i < poses.length; i += 1) {
    const arriveMs = stops[i - 1].leaveMs + turnMs(poses[i - 1].angleTo(poses[i]), 1);
    stops.push({ view: WELCOME_TOUR_VIEWS[i], arriveMs, leaveMs: arriveMs + pauses[i] });
  }
  const durationMs = stops.at(-1).arriveMs;
  const selectAt = stops[5].arriveMs;
  const events = [
    { type: 'select', regionId: WELCOME_SELECT_REGION_ID, atMs: selectAt },
    { type: 'deselect', atMs: selectAt + WELCOME_SELECT_HOLD_MS },
  ];

  function poseAtMs(ms) {
    if (ms <= greetMs) return ease(from, poses[0], ms / greetMs);
    for (let i = 0; i < stops.length; i += 1) {
      if (ms <= stops[i].leaveMs || i === stops.length - 1) return poses[i].clone();
      const next = stops[i + 1];
      if (ms <= next.arriveMs) return ease(poses[i], poses[i + 1], (ms - stops[i].leaveMs) / (next.arriveMs - stops[i].leaveMs));
    }
    return poses.at(-1).clone();
  }

  return { durationMs, stops, events, poseAt: (progress) => poseAtMs(clamp(progress, 0, 1) * durationMs) };
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Facing us at the elevation it arrived with (Kyle, 2026-10-13): `start`
 * turned about the vertical only, until its front (`anterior`, in the
 * specimen's frame) heads toward the camera. Its lean is kept exactly, so a
 * slow turn from there never wobbles.
 */
export function uprightFacing({ start, anterior, toCamera }) {
  const front = anterior.clone().normalize().applyQuaternion(start);
  const heading = (v) => Math.atan2(v.x, v.z);
  const turn = heading(toCamera) - heading(front);
  return new THREE.Quaternion().setFromAxisAngle(WORLD_UP, turn).multiply(start).normalize();
}

/** A calm turn from `start` back to `face` at the tour's pace: `{ durationMs, poseAt(progress) }`. */
export function faceTurn({ start, face }) {
  const from = start.clone().normalize();
  const to = face.clone().normalize();
  return { durationMs: turnMs(from.angleTo(to), SHORTEST_TURN_SHARE), poseAt: (progress) => ease(from, to, progress) };
}

/**
 * When to start the tour, from the welcome's clock. `tick` returns 'start'
 * once, when the welcome reaches `startMs`; 'home' once, if the welcome is
 * cut short mid-tour; otherwise null. A welcome that simply finishes leaves
 * the tour running (it outlasts the welcome). A touch, reduced motion or
 * Motion off, or a welcome cut short before the tour, means it never starts.
 */
export function createSpinCue({ startMs = 0 } = {}) {
  let state = 'waiting';
  return {
    tick({ elapsedMs, active, cut = false, touched, still }) {
      if (state === 'waiting') {
        // No clock yet: the welcome has not started.
        if (elapsedMs === null || elapsedMs === undefined) return null;
        if (touched || still || cut || !active) {
          state = 'done';
          return null;
        }
        if (elapsedMs < startMs) return null;
        state = 'running';
        return 'start';
      }
      if (state === 'running' && cut) {
        state = 'done';
        return 'home';
      }
      return null;
    },
    running: () => state === 'running',
    done() {
      state = 'done';
    },
  };
}

/**
 * Who the speaking motion answers to. The tour counts as the guide moving,
 * which otherwise stills the motion; it lasts the whole welcome, so the brain
 * keeps talking through it. A held brain is never overridden.
 */
export function motionControl({ control, touring = false }) {
  return touring && control === 'guide_moving' ? 'guide_free' : control;
}
