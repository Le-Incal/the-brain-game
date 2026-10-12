/**
 * The welcome spin (Kyle, 2026-10-11). While the brain introduces itself it
 * turns all the way round, so a visitor sees at once that it is a solid thing
 * to turn. One turn with a tilt, his pick: from the left side it turns its
 * front toward us with the top tipped forward, shows the right side, the back
 * with the underside tipped up, and settles square on the left side again.
 * No stops.
 *
 * It starts on "a human brain" and settles before "turn me around", so the
 * invitation lands on a brain that is still and ready to grab. It plays once,
 * on arrival, and never for a visitor who has already turned the brain.
 */

import * as THREE from 'three';
import { WELCOME_GESTURE_SCALE } from './gestures.js';

export const WELCOME_SPIN_TILT_DEGREES = 65;
export const WELCOME_SPIN_MAX_MS = 6000;
export const WELCOME_SPIN_MIN_MS = 3000;
export const WELCOME_SPIN_SETTLE_MARGIN_MS = 800;
export const WELCOME_SPIN_FROM = 'a human brain';
export const WELCOME_SPIN_SETTLE_BEFORE = 'turn me around';

const TURN = Math.PI * 2;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// The share of the turn over which a pose that is not square is eased out.
const SQUARE_UP_SHARE = 0.25;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * When the spin runs: `{ startMs, durationMs }` within the welcome. `timeOf`
 * gives when a phrase is spoken (or null); `endMs` is the welcome's length.
 */
export function welcomeSpinWindow({ timeOf, endMs }) {
  const startMs = timeOf(WELCOME_SPIN_FROM) ?? 0;
  const settleAt = timeOf(WELCOME_SPIN_SETTLE_BEFORE) ?? endMs;
  const room = settleAt - WELCOME_SPIN_SETTLE_MARGIN_MS - startMs;
  return { startMs, durationMs: clamp(room, WELCOME_SPIN_MIN_MS, WELCOME_SPIN_MAX_MS) };
}

/**
 * The path, as `progress (0 to 1) -> orientation`. `start` is where the brain
 * is, `home` the left side square to the viewer, `frame` the live view frame
 * ({ toCamera, screenUp }), `anterior` the anatomical front in the specimen's frame.
 */
export function welcomeSpinPath({ start, home, frame, anterior, tiltDegrees = WELCOME_SPIN_TILT_DEGREES }) {
  const tilt = THREE.MathUtils.degToRad(tiltDegrees);
  const screenRight = new THREE.Vector3().crossVectors(frame.screenUp, frame.toCamera).normalize();

  // Turn the way that brings the front toward the viewer first, as the arrival turn does.
  const frontAtHome = anterior.clone().normalize().applyQuaternion(home);
  const direction = Math.sign(new THREE.Vector3().crossVectors(WORLD_UP, frontAtHome).dot(frame.toCamera)) || 1;

  // Where the brain is, relative to home: a turn about the vertical (how far
  // round it already is) and whatever else is left (a tip), eased out early.
  const relative = start.clone().multiply(home.clone().invert());
  const along = WORLD_UP.clone().multiplyScalar(new THREE.Vector3(relative.x, relative.y, relative.z).dot(WORLD_UP));
  const twist = new THREE.Quaternion(along.x, along.y, along.z, relative.w);
  if (twist.length() < 1e-9) twist.identity();
  twist.normalize();
  const tip = relative.clone().multiply(twist.clone().invert()).normalize();
  const signedTurn = 2 * Math.atan2(along.dot(WORLD_UP), relative.w);
  const already = (((direction * signedTurn) % TURN) + TURN) % TURN;
  let sweep = TURN - already;
  // Nearly round already: one more full turn, so the visitor still sees every side.
  if (sweep < Math.PI) sweep += TURN;

  const turnAbout = new THREE.Quaternion();
  const tipAbout = new THREE.Quaternion();
  const square = new THREE.Quaternion();

  return (progress) => {
    const s = easeInOutSine(clamp(progress, 0, 1));
    turnAbout.setFromAxisAngle(WORLD_UP, direction * (already + sweep * s));
    tipAbout.setFromAxisAngle(screenRight, tilt * Math.sin(TURN * s));
    const leftover = tip.clone().slerp(square, smoothstep(clamp(s / SQUARE_UP_SHARE, 0, 1)));
    return tipAbout.clone().multiply(leftover).multiply(turnAbout).multiply(home).normalize();
  };
}

/**
 * When to start the spin, from the welcome's clock. `tick` returns 'start'
 * once, when the welcome reaches `startMs`; 'home' once, if the welcome is
 * cut short mid-spin; otherwise null. A touch, reduced motion or Motion off,
 * or a welcome cut short before the spin, means it never starts.
 */
export function createSpinCue({ startMs }) {
  let state = 'waiting';
  return {
    tick({ elapsedMs, active, touched, still }) {
      if (state === 'waiting') {
        // No clock yet: the welcome has not started.
        if (elapsedMs === null || elapsedMs === undefined) return null;
        if (touched || still || !active) {
          state = 'done';
          return null;
        }
        if (elapsedMs < startMs) return null;
        state = 'spinning';
        return 'start';
      }
      if (state === 'spinning' && !active) {
        state = 'done';
        return 'home';
      }
      return null;
    },
    done() {
      state = 'done';
    },
  };
}

/**
 * What the brain's talking motion follows: the live conversation as before,
 * and the welcome while it plays, twice as large.
 */
export function gestureInput({ conversationLevel, welcomeActive, welcomeLevel }) {
  if (!welcomeActive) return { level: conversationLevel, scale: 1 };
  return { level: Math.max(conversationLevel, welcomeLevel), scale: WELCOME_GESTURE_SCALE };
}
