/**
 * The welcome tour (Kyle, 2026-10-13; it replaced a continuous spin that
 * "rotates too fast, like it's doing somersaults").
 *
 * On "Welcome." the brain turns to look at the visitor, its front where a
 * character's face would be, and holds there while it says its name. From
 * "You can study" it shows each side and below, turning deliberately from one
 * standard view to the next: the right side, the back, the left side, facing
 * us, the underside, and facing us again. Every turn is 90 degrees about one
 * axis, takes 1.5 s eased on a sine (about 94 degrees a second at the
 * fastest), and is followed by a 0.5 s pause square on the view.
 *
 * It plays once, on arrival, and never for a visitor who has already turned
 * the brain. A grab stops it where it is; a welcome cut short turns the brain
 * calmly back to face us. It finishes facing us at the elevation it arrived
 * with, so the slow turn while it waits never wobbles (Kyle, 2026-10-13).
 */

import * as THREE from 'three';

export const WELCOME_TOUR_TURN_MS = 1500;
export const WELCOME_TOUR_PAUSE_MS = 500;
export const WELCOME_FACE_VIEW = 'anterior';
export const WELCOME_TOUR_VIEWS = [WELCOME_FACE_VIEW, 'right_lateral', 'posterior', 'left_lateral', WELCOME_FACE_VIEW, 'inferior', WELCOME_FACE_VIEW];
export const WELCOME_TOUR_FROM = 'You can study';
export const WELCOME_TOUR_DEFAULT_AT_MS = 3500;

const QUARTER_TURN = Math.PI / 2;
// A short turn still takes a moment, so it reads as deliberate.
const SHORTEST_TURN_SHARE = 1 / 3;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));

// The tour's pace for any angle: a quarter turn in 1.5 s, longer turns take longer.
function turnMs(radians, shortestShare) {
  return Math.round(WELCOME_TOUR_TURN_MS * Math.max(shortestShare, radians / QUARTER_TURN));
}

const ease = (from, to, t) => new THREE.Quaternion().slerpQuaternions(from, to, easeInOutSine(t));

/** When the tour moves on from the greeting, in ms into the welcome. */
export function welcomeTourTiming({ timeOf }) {
  return { tourAtMs: timeOf(WELCOME_TOUR_FROM) ?? WELCOME_TOUR_DEFAULT_AT_MS };
}

/**
 * The tour from `start`: `{ durationMs, stops, poseAt(progress) }`. `viewPose`
 * gives the orientation that squares a standard view to the viewer; `stops`
 * are `{ view, arriveMs, leaveMs }`. The greeting turns at the tour's pace,
 * taking longer from far round, and holds until `tourAtMs` with at least a pause.
 * `endPose` is where it finishes (Kyle, 2026-10-13: facing us upright, as it
 * arrived); the last turn takes as long as its angle needs at the same pace.
 */
export function welcomeTour({ start, viewPose, tourAtMs, endPose = null }) {
  const poses = WELCOME_TOUR_VIEWS.map((view) => viewPose(view).clone().normalize());
  if (endPose) poses[poses.length - 1] = endPose.clone().normalize();
  const from = start.clone().normalize();
  const greetMs = turnMs(from.angleTo(poses[0]), 1);
  const stops = [{ view: WELCOME_TOUR_VIEWS[0], arriveMs: greetMs, leaveMs: Math.max(tourAtMs, greetMs + WELCOME_TOUR_PAUSE_MS) }];
  for (let i = 1; i < poses.length; i += 1) {
    const arriveMs = stops[i - 1].leaveMs + turnMs(poses[i - 1].angleTo(poses[i]), 1);
    const last = i === poses.length - 1;
    stops.push({ view: WELCOME_TOUR_VIEWS[i], arriveMs, leaveMs: last ? arriveMs : arriveMs + WELCOME_TOUR_PAUSE_MS });
  }
  const durationMs = stops.at(-1).arriveMs;

  function poseAtMs(ms) {
    if (ms <= greetMs) return ease(from, poses[0], ms / greetMs);
    for (let i = 0; i < stops.length; i += 1) {
      if (ms <= stops[i].leaveMs || i === stops.length - 1) return poses[i].clone();
      const next = stops[i + 1];
      if (ms <= next.arriveMs) return ease(poses[i], poses[i + 1], (ms - stops[i].leaveMs) / (next.arriveMs - stops[i].leaveMs));
    }
    return poses.at(-1).clone();
  }

  return { durationMs, stops, poseAt: (progress) => poseAtMs(clamp(progress, 0, 1) * durationMs) };
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
