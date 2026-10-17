import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const gaze = await import('./gaze.js').catch(() => ({}));
const { lookAtButton, lookUpAtVisitor, lookAway, poseLooking, nearButton, startGaze, NOTICE_RADIUS_PX, TURN_MS, HOLD_ON_YOU_MS, AWAY_MS } = gaze;

// Kyle, 2026-10-16: "when the user draws near the Enter button with the cursor,
// the brain rotates to look at the button and if the cursor pulls away from
// the enter button it looks up at the user and slowly rotates away." The look
// is a three-quarter turn toward the button with a slight look down to it.

// The landing's camera: on +x looking at the brain, screen-up +y, so
// screen-right is -z.
const frame = { toCamera: new THREE.Vector3(1, 0, 0), screenUp: new THREE.Vector3(0, 1, 0) };
const screenRight = new THREE.Vector3(0, 0, -1);
const ANTERIOR = new THREE.Vector3(0, 0, 1);
const SUPERIOR = new THREE.Vector3(0, 1, 0);
const degrees = (radians) => THREE.MathUtils.radToDeg(radians);
const pitchOf = (direction) => degrees(Math.asin(direction.y));

describe('Where the brain looks', () => {
  // At 1440 the button's centre sits 525 px right of and 195 px below the brain's.
  const toButton = { dx: 525, dy: 195 };

  it('looks three-quarters toward the button: halfway between us and it', () => {
    const look = lookAtButton({ frame, toButton });
    expect(degrees(look.angleTo(frame.toCamera))).toBeCloseTo(45, 0);
    expect(look.dot(screenRight)).toBeGreaterThan(0.6);
  });

  it('looks down to the button a little, by where the button sits', () => {
    const pitch = pitchOf(lookAtButton({ frame, toButton }));
    expect(pitch).toBeLessThan(-8);
    expect(pitch).toBeGreaterThan(-20);
  });

  it('looks straight down toward a button below it, as on a stacked page', () => {
    const look = lookAtButton({ frame, toButton: { dx: 0, dy: 300 } });
    expect(Math.abs(look.dot(screenRight))).toBeLessThan(1e-6);
    expect(pitchOf(look)).toBeCloseTo(-45, 0);
  });

  it('looks up at the visitor: toward us, tilted up a touch', () => {
    const look = lookUpAtVisitor({ frame });
    expect(look.dot(frame.toCamera)).toBeGreaterThan(0.97);
    expect(pitchOf(look)).toBeGreaterThan(5);
    expect(pitchOf(look)).toBeLessThan(15);
  });

  // Turning away levels it again, so the drift after a gaze is not tipped up.
  it('turns away level, a little counter-clockwise seen from above', () => {
    const look = lookAway({ frame });
    expect(Math.abs(pitchOf(look))).toBeLessThan(1e-6);
    expect(degrees(look.angleTo(frame.toCamera))).toBeCloseTo(12, 0);
    // Counter-clockwise from above swings the front from us toward screen-right.
    expect(look.dot(screenRight)).toBeGreaterThan(0);
  });
});

describe('The pose for a look', () => {
  // Regression checks in the manner of "cerebellum must not be visible from above".
  it('looking at the button, the frontal pole is on the button side and the top stays up', () => {
    const pose = poseLooking(lookAtButton({ frame, toButton: { dx: 525, dy: 195 } }), frame);
    const anterior = ANTERIOR.clone().applyQuaternion(pose);
    expect(anterior.dot(screenRight)).toBeGreaterThan(0.6);
    expect(anterior.dot(frame.toCamera)).toBeGreaterThan(0.6);
    expect(SUPERIOR.clone().applyQuaternion(pose).dot(frame.screenUp)).toBeGreaterThan(0.9);
  });

  it('facing the visitor, the frontal pole is the nearest point to the camera', () => {
    const pose = poseLooking(lookUpAtVisitor({ frame }), frame);
    const anterior = ANTERIOR.clone().applyQuaternion(pose);
    expect(anterior.dot(frame.toCamera)).toBeGreaterThan(0.97);
    expect(SUPERIOR.clone().applyQuaternion(pose).dot(frame.screenUp)).toBeGreaterThan(0.95);
  });
});

describe('Drawing near the button', () => {
  const rect = { left: 875, top: 600, right: 1050, bottom: 654 };

  it('counts the button itself and about 120 px round it', () => {
    expect(NOTICE_RADIUS_PX).toBe(120);
    expect(nearButton({ x: 960, y: 627 }, rect)).toBe(true);
    expect(nearButton({ x: 875 - 119, y: 627 }, rect)).toBe(true);
    expect(nearButton({ x: 875 - 121, y: 627 }, rect)).toBe(false);
    expect(nearButton({ x: 960, y: 654 + 119 }, rect)).toBe(true);
    // Off a corner the distance is to the corner: 90 and 90 make 127.
    expect(nearButton({ x: 1050 + 90, y: 600 - 90 }, rect)).toBe(false);
    expect(nearButton({ x: 1050 + 80, y: 600 - 80 }, rect)).toBe(true);
  });
});

function fakeScene() {
  let listener = null;
  const moves = [];
  const timers = [];
  const schedule = (fn, ms) => {
    const timer = { fn, ms, cancelled: false };
    timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };
  const fireTimers = () => {
    for (const timer of timers.splice(0)) if (!timer.cancelled) timer.fn();
  };
  const controls = {
    isDragging: false,
    moveTo: vi.fn((pose, options) => new Promise((resolve) => moves.push({ pose, options, resolve }))),
    subscribeUserInput: (fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  };
  const drift = { pause: vi.fn(), resume: vi.fn() };
  const poses = { button: () => 'at the button', you: () => 'at you', away: () => 'turning away' };
  const g = startGaze({ controls, drift, poses, schedule });
  return { g, controls, drift, moves, timers, fireTimers, input: (event) => listener?.(event) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('The gaze', () => {
  it('turns to the button when the cursor comes near, and holds there', () => {
    const { g, controls, drift, moves } = fakeScene();
    g.setNear(true);
    g.setNear(true);
    expect(drift.pause).toHaveBeenCalled();
    expect(moves.map((m) => m.pose)).toEqual(['at the button']);
    expect(moves[0].options).toEqual({ durationMs: TURN_MS });
    expect(controls.moveTo).toHaveBeenCalledTimes(1);
  });

  it('looks up at the visitor when the cursor pulls away, holds, turns slowly away, then drifts on', async () => {
    const { g, drift, moves, timers, fireTimers } = fakeScene();
    g.setNear(true);
    g.setNear(false);
    expect(moves.map((m) => m.pose)).toEqual(['at the button', 'at you']);
    moves[1].resolve({ completed: true });
    await settle();
    expect(HOLD_ON_YOU_MS).toBe(1500);
    expect(timers.map((t) => t.ms)).toEqual([HOLD_ON_YOU_MS]);
    expect(drift.resume).not.toHaveBeenCalled();
    fireTimers();
    expect(moves.map((m) => m.pose)).toEqual(['at the button', 'at you', 'turning away']);
    expect(AWAY_MS).toBe(3000);
    expect(moves[2].options).toEqual({ durationMs: AWAY_MS });
    moves[2].resolve({ completed: true });
    await settle();
    expect(drift.resume).toHaveBeenCalledWith();
  });

  it('coming back while it holds on the visitor looks at the button again, and never turns away', async () => {
    const { g, drift, moves, fireTimers } = fakeScene();
    g.setNear(true);
    g.setNear(false);
    moves[1].resolve({ completed: true });
    await settle();
    g.setNear(true);
    fireTimers();
    expect(moves.map((m) => m.pose)).toEqual(['at the button', 'at you', 'at the button']);
    expect(drift.resume).not.toHaveBeenCalled();
  });

  it('coming back during the turn to the visitor looks at the button again, without resuming the drift', async () => {
    const { g, drift, moves } = fakeScene();
    g.setNear(true);
    g.setNear(false);
    g.setNear(true);
    moves[1].resolve({ completed: false, reason: 'superseded' });
    await settle();
    expect(moves.map((m) => m.pose)).toEqual(['at the button', 'at you', 'at the button']);
    expect(drift.resume).not.toHaveBeenCalled();
  });

  it('never moves the brain for a cursor that stays away', () => {
    const { g, controls } = fakeScene();
    g.setNear(false);
    expect(controls.moveTo).not.toHaveBeenCalled();
  });

  it('gives way to a grab: the visitor has the brain, and the drift rules take over', () => {
    const { g, controls, moves, input } = fakeScene();
    g.setNear(true);
    input({ type: 'grab' });
    controls.isDragging = true;
    g.setNear(false);
    g.setNear(true);
    expect(moves.map((m) => m.pose)).toEqual(['at the button']);
    controls.isDragging = false;
    g.setNear(false);
    expect(moves.map((m) => m.pose)).toEqual(['at the button']);
  });
});

describe('The landing', () => {
  const landing = readFileSync(fileURLToPath(new URL('./landing.js', import.meta.url)), 'utf8');

  it('starts the gaze for a mouse, not a phone, and not with reduced motion', () => {
    expect(landing).toMatch(/import \{[^}]*startGaze[^}]*\} from '\.\/gaze\.js';/);
    expect(landing).toMatch(/\(hover: hover\) and \(pointer: fine\)/);
    expect(landing).toMatch(/startGaze\(\{/);
  });

  it('watches the cursor, and keyboard focus on Enter', () => {
    expect(landing).toMatch(/addEventListener\('pointermove'/);
    expect(landing).toMatch(/enter\.addEventListener\('focus'/);
    expect(landing).toMatch(/enter\.addEventListener\('blur'/);
  });
});
