/**
 * The welcome tour (Kyle, 2026-10-13; it replaced a continuous spin that
 * "rotates too fast, like it's doing somersaults").
 *
 * The brain greets the visitor like a puppet recognizing someone (Kyle,
 * 2026-10-13): from its side it turns idly a little way toward us, notices
 * us, snaps past us with its head lifted as it says "Hello!", and settles
 * facing us, its front where a character's face would be. It holds there
 * while it says its name. From
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
 * the brain. A grab is a peek (Kyle, 2026-10-15): the brain is the visitor's
 * while held, and on release it goes back onto the tour where the tour has
 * reached. A welcome cut short turns the brain calmly back to face us. It
 * finishes facing us at the elevation it arrived with, so the slow turn while
 * it waits never wobbles.
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
// The greeting, a puppet's recognition (Kyle, 2026-10-13): an idle turn, a
// snap past us with the head lifted, a settle. "Hello!" lands on the snap.
export const WELCOME_GREETING = Object.freeze({ idleMs: 600, idleDegrees: 25, snapMs: 500, overshootDegrees: 7, liftDegrees: 5, settleMs: 500 });

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

// The idle turn's speed as it notices us, for a full quarter-turn greeting (degrees a second).
const NOTICING_SPEED = 60;
// The 0.5 s snap is sized for this much turn; a longer one takes longer, at the same speed.
const SNAP_SPAN_DEGREES = 65;

// A cubic between two values and their speeds (seconds), so each phase flows into the next.
function hermite(p0, v0, p1, v1, seconds, t) {
  const s = t / seconds;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * seconds * v0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * seconds * v1;
}

function greetingPhases(totalDegrees) {
  const g = WELCOME_GREETING;
  const idleDegrees = Math.min(g.idleDegrees, (g.idleDegrees * totalDegrees) / 90);
  const snapMs = g.snapMs * Math.max(1, (totalDegrees - idleDegrees) / SNAP_SPAN_DEGREES);
  return { idleDegrees, noticing: (NOTICING_SPEED * idleDegrees) / g.idleDegrees, snapMs, totalMs: g.idleMs + snapMs + g.settleMs };
}

/**
 * The greeting's motion at `ms`, for a turn of `totalDegrees` to face us:
 * `{ turn, lift }` in degrees. It turns idly a little way, notices us and
 * snaps past us with its head lifted, then settles square on, head level.
 */
export function recognition(ms, totalDegrees) {
  const g = WELCOME_GREETING;
  const { idleDegrees, noticing, snapMs, totalMs } = greetingPhases(totalDegrees);
  if (ms <= 0) return { turn: 0, lift: 0 };
  if (ms >= totalMs) return { turn: totalDegrees, lift: 0 };
  const peak = totalDegrees + g.overshootDegrees;
  if (ms <= g.idleMs) return { turn: hermite(0, 0, idleDegrees, noticing, g.idleMs / 1000, ms / 1000), lift: 0 };
  const intoSnap = ms - g.idleMs;
  if (intoSnap <= snapMs) {
    return {
      turn: hermite(idleDegrees, noticing, peak, 0, snapMs / 1000, intoSnap / 1000),
      lift: hermite(0, 0, g.liftDegrees, 0, snapMs / 1000, intoSnap / 1000),
    };
  }
  const intoSettle = (intoSnap - snapMs) / 1000;
  return {
    turn: hermite(peak, 0, totalDegrees, 0, g.settleMs / 1000, intoSettle),
    lift: hermite(g.liftDegrees, 0, 0, 0, g.settleMs / 1000, intoSettle),
  };
}
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
  // The greeting turns about the one axis that carries the brain from its side to face us.
  const toFace = poses[0].clone().multiply(from.clone().invert()).normalize();
  if (toFace.w < 0) toFace.set(-toFace.x, -toFace.y, -toFace.z, -toFace.w);
  const faceDegrees = THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, toFace.w)));
  const faceAxis = new THREE.Vector3(toFace.x, toFace.y, toFace.z);
  if (faceAxis.lengthSq() < 1e-12) faceAxis.copy(frame.screenUp);
  faceAxis.normalize();
  const greetMs = Math.round(greetingPhases(faceDegrees).totalMs);
  const greeting = (ms) => {
    if (ms >= greetMs) return poses[0].clone();
    const { turn, lift } = recognition(ms, faceDegrees);
    // A lifted head: the top tips away from us.
    return new THREE.Quaternion()
      .setFromAxisAngle(screenRight, -THREE.MathUtils.degToRad(lift))
      .multiply(new THREE.Quaternion().setFromAxisAngle(faceAxis, THREE.MathUtils.degToRad(turn)))
      .multiply(from)
      .normalize();
  };
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
    if (ms <= greetMs) return greeting(ms);
    for (let i = 0; i < stops.length; i += 1) {
      if (ms <= stops[i].leaveMs || i === stops.length - 1) return poses[i].clone();
      const next = stops[i + 1];
      if (ms <= next.arriveMs) return ease(poses[i], poses[i + 1], (ms - stops[i].leaveMs) / (next.arriveMs - stops[i].leaveMs));
    }
    return poses.at(-1).clone();
  }

  return { durationMs, stops, events, poseAtMs, poseAt: (progress) => poseAtMs(clamp(progress, 0, 1) * durationMs) };
}

/**
 * Kyle, 2026-10-15: "if I grab the brain while it's talking and then let go,
 * it should keep going right back to where it would have been in its motion".
 * From `from` (where the visitor let go) back onto a motion whose pose at each
 * moment is `poseAtMs(ms)`, from `startMs` (now, on its clock) to `endMs`.
 * It eases onto the moving pose at the tour's pace (a quarter turn in 1.5 s,
 * at least 0.5 s) and follows it from there. `{ durationMs, catchMs, poseAt(progress) }`.
 */
export function catchUp({ from, poseAtMs, startMs, endMs }) {
  const start = from.clone().normalize();
  const catchMs = turnMs(start.angleTo(poseAtMs(startMs)), SHORTEST_TURN_SHARE);
  const durationMs = Math.max(endMs - startMs, catchMs);
  return {
    durationMs,
    catchMs,
    poseAt(progress) {
      const ms = clamp(progress, 0, 1) * durationMs;
      const on = poseAtMs(Math.min(endMs, startMs + ms)).clone().normalize();
      return ms >= catchMs ? on : ease(start, on, ms / catchMs);
    },
  };
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
