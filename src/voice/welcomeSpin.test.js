import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createControls } from '../test/voiceHarness.js';
import { classifyView, getViewFrame, orientationForView } from './orientation.js';

// Imported defensively so each test fails on its own while the module is absent.
const spinModule = await import('./welcomeSpin.js').catch(() => ({}));
const {
  WELCOME_SPIN_TILT_DEGREES,
  WELCOME_SPIN_MAX_MS,
  WELCOME_SPIN_MIN_MS,
  WELCOME_SPIN_SETTLE_MARGIN_MS,
  WELCOME_SPIN_FROM,
  WELCOME_SPIN_SETTLE_BEFORE,
  welcomeSpinWindow,
  welcomeSpinPath,
  createSpinCue,
  gestureInput,
} = spinModule;

// Kyle, 2026-10-11: while the brain introduces itself it turns all the way
// around, right, left, back, top and under, so a visitor understands at once
// that it is a solid thing to turn. One turn with a tilt (his pick): the top
// tips toward us on the way round, the underside on the way back, no stops.
// It starts on "a human brain" and settles before "turn me around", so the
// invitation lands on a brain that is still and ready to grab.

const UP = new THREE.Vector3(0, 1, 0);
const FRAMES_PER_SECOND = 60;
const degrees = (radians) => (radians * 180) / Math.PI;

function liveFrame() {
  // The page's own camera: the harness builds it exactly as the scene does.
  const { controls } = createControls();
  return getViewFrame(controls.camera, controls.target);
}

function sample(path, durationMs) {
  const frames = Math.round((durationMs / 1000) * FRAMES_PER_SECOND);
  return Array.from({ length: frames + 1 }, (_, i) => path(i / frames));
}

function viewsAlong(poses, frame) {
  const views = [];
  for (const pose of poses) {
    const { view } = classifyView(pose, frame);
    if (views.at(-1) !== view) views.push(view);
  }
  return views;
}

function containsInOrder(sequence, wanted) {
  let at = 0;
  for (const item of sequence) if (item === wanted[at]) at += 1;
  return at === wanted.length;
}

describe('The welcome spin: its settings', () => {
  it('tilts 65 degrees and takes at most 6 s, never less than 3 s', () => {
    expect(WELCOME_SPIN_TILT_DEGREES).toBe(65);
    expect(WELCOME_SPIN_MAX_MS).toBe(6000);
    expect(WELCOME_SPIN_MIN_MS).toBe(3000);
  });

  it('starts on "a human brain" and settles before "turn me around"', () => {
    expect(WELCOME_SPIN_FROM).toBe('a human brain');
    expect(WELCOME_SPIN_SETTLE_BEFORE).toBe('turn me around');
    expect(WELCOME_SPIN_SETTLE_MARGIN_MS).toBe(800);
  });
});

describe('When in the welcome the spin runs', () => {
  // Measured on staging, 2026-10-11, from each recording's letter timings.
  const SYLVI = { 'a human brain': 2040, 'turn me around': 9960 };
  const ROLLO = { 'a human brain': 1880, 'turn me around': 8920 };
  const timeOfIn = (marks) => (phrase) => marks[phrase] ?? null;

  it.each([
    ['Sylvi', SYLVI, 12480],
    ['Rollo', ROLLO, 11200],
  ])("fits %s's welcome: 6 s from 'a human brain', settled before 'turn me around'", (_, marks, endMs) => {
    const window = welcomeSpinWindow({ timeOf: timeOfIn(marks), endMs });
    expect(window.startMs).toBe(marks['a human brain']);
    expect(window.durationMs).toBe(6000);
    expect(window.startMs + window.durationMs).toBeLessThanOrEqual(marks['turn me around'] - 800);
  });

  it('shortens to settle in time when the words come closer together', () => {
    const window = welcomeSpinWindow({ timeOf: timeOfIn({ 'a human brain': 2000, 'turn me around': 7000 }), endMs: 9000 });
    expect(window).toEqual({ startMs: 2000, durationMs: 4200 });
  });

  it('never rushes below 3 s', () => {
    const window = welcomeSpinWindow({ timeOf: timeOfIn({ 'a human brain': 2000, 'turn me around': 4000 }), endMs: 6000 });
    expect(window.durationMs).toBe(3000);
  });

  it('starts at the beginning and settles before the end when a welcome lacks the phrases', () => {
    expect(welcomeSpinWindow({ timeOf: () => null, endMs: 12000 })).toEqual({ startMs: 0, durationMs: 6000 });
    expect(welcomeSpinWindow({ timeOf: () => null, endMs: 5000 })).toEqual({ startMs: 0, durationMs: 4200 });
  });
});

describe('The path of the spin', () => {
  const frame = liveFrame();
  const home = orientationForView('left_lateral', frame);
  const anterior = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(frame.screenUp, frame.toCamera).normalize();
  const starts = {
    'the left side': home.clone(),
    // The arrival turn has already carried it part way round.
    'part way round from the arrival turn': new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(40)).multiply(home),
    'a slightly tipped pose': new THREE.Quaternion()
      .setFromAxisAngle(right, 0.1)
      .multiply(new THREE.Quaternion().setFromAxisAngle(UP, 0.5))
      .multiply(home),
  };

  describe.each(Object.entries(starts))('from %s', (_, start) => {
    // Built lazily, so each test fails on its own while the module is absent.
    let cached = null;
    const poses = () => (cached ??= sample(welcomeSpinPath({ start, home, frame, anterior, tiltDegrees: 65 }), 6000));

    it('begins exactly where the brain is, so nothing jumps', () => {
      expect(poses()[0].angleTo(start)).toBeLessThan(1e-6);
    });

    it('shows the top, the right side, the back and the underside, then the left side again', () => {
      const views = viewsAlong(poses(), frame);
      expect(views[0]).toBe(classifyView(start, frame).view);
      expect(containsInOrder(views, ['superior', 'right_lateral', 'posterior', 'inferior', 'left_lateral'])).toBe(true);
      expect(views.at(-1)).toBe('left_lateral');
    });

    it('settles square on the left side, where the visitor met it', () => {
      expect(degrees(poses().at(-1).angleTo(home))).toBeLessThan(0.5);
    });

    it('is quick but never jumps: at most 2.5 degrees between frames at 60 fps', () => {
      const all = poses();
      let largest = 0;
      for (let i = 1; i < all.length; i += 1) largest = Math.max(largest, all[i].angleTo(all[i - 1]));
      expect(degrees(largest)).toBeLessThanOrEqual(2.5);
    });

    it('eases in and out: the first and last frames barely move', () => {
      const all = poses();
      expect(degrees(all[1].angleTo(all[0]))).toBeLessThan(0.2);
      expect(degrees(all.at(-1).angleTo(all.at(-2)))).toBeLessThan(0.2);
    });
  });

  it('tips the top toward the viewer on the way round, the underside on the way back', () => {
    const path = welcomeSpinPath({ start: home.clone(), home, frame, anterior, tiltDegrees: 65 });
    const superiorFacing = (pose) => UP.clone().applyQuaternion(pose).dot(frame.toCamera);
    const poses = sample(path, 6000);
    const half = Math.floor(poses.length / 2);
    expect(Math.max(...poses.slice(0, half).map(superiorFacing))).toBeGreaterThan(0.9);
    expect(Math.min(...poses.slice(half).map(superiorFacing))).toBeLessThan(-0.75);
  });

  it('turns the front toward the viewer first, the way the arrival turn already goes', () => {
    const path = welcomeSpinPath({ start: home.clone(), home, frame, anterior, tiltDegrees: 65 });
    const frontFacing = (pose) => anterior.clone().applyQuaternion(pose).dot(frame.toCamera);
    expect(frontFacing(path(0.15))).toBeGreaterThan(frontFacing(path(0)));
  });
});

describe('When the spin starts, and when it does not', () => {
  const START_MS = 2040;
  const tickAll = (cue, steps) => steps.map((step) => cue.tick({ active: true, touched: false, still: false, ...step }));

  it("starts once, when the welcome reaches 'a human brain'", () => {
    const cue = createSpinCue({ startMs: START_MS });
    expect(tickAll(cue, [{ elapsedMs: 0 }, { elapsedMs: 2000 }, { elapsedMs: 2050 }, { elapsedMs: 2100 }, { elapsedMs: 4000 }])).toEqual([
      null,
      null,
      'start',
      null,
      null,
    ]);
  });

  it('never starts for a visitor who has already turned the brain', () => {
    const cue = createSpinCue({ startMs: START_MS });
    expect(tickAll(cue, [{ elapsedMs: 1000, touched: true }, { elapsedMs: 2100 }, { elapsedMs: 3000 }])).toEqual([null, null, null]);
  });

  it('never starts with reduced motion or Motion off', () => {
    const cue = createSpinCue({ startMs: START_MS });
    expect(tickAll(cue, [{ elapsedMs: 2100, still: true }, { elapsedMs: 3000 }])).toEqual([null, null]);
  });

  it('never starts once the welcome has been cut short', () => {
    const cue = createSpinCue({ startMs: START_MS });
    expect(tickAll(cue, [{ elapsedMs: 1000, active: false }, { elapsedMs: 2100 }])).toEqual([null, null]);
  });

  it('brings the brain home once if the welcome is cut short mid-spin', () => {
    const cue = createSpinCue({ startMs: START_MS });
    expect(tickAll(cue, [{ elapsedMs: 2100 }, { elapsedMs: 3000, active: false }, { elapsedMs: 3100, active: false }])).toEqual([
      'start',
      'home',
      null,
    ]);
  });

  it('asks for nothing more once the spin has ended', () => {
    const cue = createSpinCue({ startMs: START_MS });
    expect(cue.tick({ elapsedMs: 2100, active: true, touched: false, still: false })).toBe('start');
    cue.done();
    expect(cue.tick({ elapsedMs: 3000, active: false, touched: false, still: false })).toBeNull();
  });

  it('waits when the welcome has no clock yet', () => {
    const cue = createSpinCue({ startMs: 0 });
    expect(cue.tick({ elapsedMs: null, active: true, touched: false, still: false })).toBeNull();
  });
});

describe("What the brain's talking motion listens to", () => {
  it('follows the live conversation as before, at its usual size', () => {
    expect(gestureInput({ conversationLevel: 0.4, welcomeActive: false, welcomeLevel: 0 })).toEqual({ level: 0.4, scale: 1 });
  });

  // Kyle, 2026-10-11: stronger for the welcome only.
  it('follows the welcome while it plays, twice as large', () => {
    expect(gestureInput({ conversationLevel: 0, welcomeActive: true, welcomeLevel: 0.6 })).toEqual({ level: 0.6, scale: 2 });
  });

  it('holds the larger size through the pauses between words', () => {
    expect(gestureInput({ conversationLevel: 0, welcomeActive: true, welcomeLevel: 0 })).toEqual({ level: 0, scale: 2 });
  });
});
