import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createControls } from '../test/voiceHarness.js';
import { classifyView, getViewFrame, orientationForView } from './orientation.js';

// Imported defensively so each test fails on its own while the module is absent.
const spinModule = await import('./welcomeSpin.js').catch(() => ({}));
const {
  WELCOME_TOUR_TURN_MS,
  WELCOME_TOUR_PAUSE_MS,
  WELCOME_TOUR_VIEWS,
  WELCOME_TOUR_FROM,
  WELCOME_TOUR_DEFAULT_AT_MS,
  welcomeTourTiming,
  welcomeTour,
  faceTurn,
  createSpinCue,
  gestureInput,
} = spinModule;

// Kyle, 2026-10-13: the continuous spin "rotates too fast, like it's doing
// somersaults". On the open the brain turns to look at the visitor, its front
// where a character's face would be; then it shows each side and below by
// turning deliberately from one standard view to the next. His picks: all
// sides and below, ending facing us; 1.5 s turns with 0.5 s pauses.

const UP = new THREE.Vector3(0, 1, 0);
const FRAMES_PER_SECOND = 60;
const FRAME_MS = 1000 / FRAMES_PER_SECOND;
const degrees = (radians) => (radians * 180) / Math.PI;
// 90 degrees in 1.5 s, eased on a sine: about 94 degrees a second at the fastest.
const PEAK_DEGREES_PER_FRAME = 1.6;

function liveFrame() {
  // The page's own camera: the harness builds it exactly as the scene does.
  const { controls } = createControls();
  return getViewFrame(controls.camera, controls.target);
}

const frame = liveFrame();
const viewPose = (view) => orientationForView(view, frame);
const screenRight = new THREE.Vector3().crossVectors(frame.screenUp, frame.toCamera).normalize();

function sampleMs(move, fromMs = 0, toMs = move.durationMs) {
  const poses = [];
  for (let at = fromMs; at <= toMs + 1e-6; at += FRAME_MS) poses.push(move.poseAt(Math.min(1, at / move.durationMs)));
  return poses;
}

function viewsAlong(poses) {
  const views = [];
  for (const pose of poses) {
    const { view } = classifyView(pose, frame);
    if (views.at(-1) !== view) views.push(view);
  }
  return views;
}

function largestStep(poses) {
  let largest = 0;
  for (let i = 1; i < poses.length; i += 1) largest = Math.max(largest, poses[i].angleTo(poses[i - 1]));
  return degrees(largest);
}

describe('The welcome tour: its settings', () => {
  it('turns in 1.5 s and pauses 0.5 s at each view', () => {
    expect(WELCOME_TOUR_TURN_MS).toBe(1500);
    expect(WELCOME_TOUR_PAUSE_MS).toBe(500);
  });

  it('faces us, then shows the right side, the back, the left side, faces us, shows the underside and faces us again', () => {
    expect(WELCOME_TOUR_VIEWS).toEqual(['anterior', 'right_lateral', 'posterior', 'left_lateral', 'anterior', 'inferior', 'anterior']);
  });

  it('holds its greeting until "You can study"', () => {
    expect(WELCOME_TOUR_FROM).toBe('You can study');
    expect(WELCOME_TOUR_DEFAULT_AT_MS).toBe(3500);
  });
});

describe('When the tour moves on from the greeting', () => {
  it.each([
    ['Sylvi', 3480],
    ['Rollo', 3200],
  ])("on %s's \"You can study\"", (_, atMs) => {
    expect(welcomeTourTiming({ timeOf: (phrase) => (phrase === 'You can study' ? atMs : null) })).toEqual({ tourAtMs: atMs });
  });

  it('at 3.5 s when a welcome does not say it', () => {
    expect(welcomeTourTiming({ timeOf: () => null })).toEqual({ tourAtMs: 3500 });
  });
});

describe('The tour, timed to Sylvi', () => {
  const start = viewPose('left_lateral');
  let cached = null;
  // Built lazily, so each test fails on its own while the module is absent.
  const tour = () => (cached ??= welcomeTour({ start, viewPose, tourAtMs: 3480 }));

  it('turns to face us first, within 1.5 s of "Welcome."', () => {
    const [greeting] = tour().stops;
    expect(greeting.view).toBe('anterior');
    expect(greeting.arriveMs).toBe(1500);
  });

  it('holds the greeting while she says her name, until "You can study"', () => {
    expect(tour().stops[0].leaveMs).toBe(3480);
  });

  it('then stops at each view in turn: 1.5 s to turn, 0.5 s to look', () => {
    const { stops, durationMs } = tour();
    expect(stops.map(({ view }) => view)).toEqual(WELCOME_TOUR_VIEWS);
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i].arriveMs - stops[i - 1].leaveMs, `turn to ${stops[i].view}`).toBe(1500);
    }
    for (let i = 1; i < stops.length - 1; i += 1) {
      expect(stops[i].leaveMs - stops[i].arriveMs, `pause at ${stops[i].view}`).toBe(500);
    }
    // Facing us again, about 15 s in.
    expect(stops.at(-1).arriveMs).toBe(3480 + 6 * 1500 + 5 * 500);
    expect(durationMs).toBe(stops.at(-1).arriveMs);
  });

  it('sits square on each view while it pauses', () => {
    const { stops, durationMs, poseAt } = tour();
    for (const stop of stops.slice(0, -1)) {
      const middle = (stop.arriveMs + stop.leaveMs) / 2;
      expect(degrees(poseAt(middle / durationMs).angleTo(viewPose(stop.view))), stop.view).toBeLessThan(1e-4);
    }
  });

  it('shows exactly those views, in that order, and nothing in between', () => {
    expect(viewsAlong(sampleMs(tour()))).toEqual([
      'left_lateral',
      'anterior',
      'right_lateral',
      'posterior',
      'left_lateral',
      'anterior',
      'inferior',
      'anterior',
    ]);
  });

  it('begins exactly where the brain is and ends facing us', () => {
    const { poseAt } = tour();
    expect(poseAt(0).angleTo(start)).toBeLessThan(1e-6);
    expect(degrees(poseAt(1).angleTo(viewPose('anterior')))).toBeLessThan(1e-4);
  });

  it('turns about one axis at a time: round for the sides, a tip for the underside', () => {
    const { stops } = tour();
    const poses = sampleMs(tour(), stops[0].leaveMs);
    for (let i = 1; i < poses.length; i += 1) {
      const step = poses[i].clone().multiply(poses[i - 1].clone().invert());
      if (step.w < 0) step.set(-step.x, -step.y, -step.z, -step.w);
      if (2 * Math.acos(Math.min(1, step.w)) < 1e-4) continue;
      const axis = new THREE.Vector3(step.x, step.y, step.z).normalize();
      const aligned = Math.max(Math.abs(axis.dot(frame.screenUp)), Math.abs(axis.dot(screenRight)));
      expect(aligned).toBeGreaterThan(0.999);
    }
  });

  it('never moves faster than about 94 degrees a second', () => {
    expect(largestStep(sampleMs(tour()))).toBeLessThanOrEqual(PEAK_DEGREES_PER_FRAME);
  });

  it('eases into and out of every turn: no motion jumps at a stop', () => {
    const { stops, durationMs, poseAt } = tour();
    for (const stop of stops) {
      const at = stop.arriveMs / durationMs;
      const before = poseAt(at - FRAME_MS / durationMs);
      expect(degrees(before.angleTo(poseAt(at))), stop.view).toBeLessThan(0.05);
    }
  });
});

describe('The greeting from other poses', () => {
  it('turns at the same calm pace from far round, taking longer rather than going faster', () => {
    const tour = welcomeTour({ start: viewPose('posterior'), viewPose, tourAtMs: 3480 });
    expect(tour.stops[0].arriveMs).toBe(3000);
    expect(largestStep(sampleMs(tour))).toBeLessThanOrEqual(PEAK_DEGREES_PER_FRAME);
  });

  it('keeps a pause after the greeting when the words come early', () => {
    const tour = welcomeTour({ start: viewPose('posterior'), viewPose, tourAtMs: 1000 });
    expect(tour.stops[0].leaveMs).toBe(3500);
  });

  it('starts from wherever the arrival turn has carried it', () => {
    const start = new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(40)).multiply(viewPose('left_lateral'));
    const tour = welcomeTour({ start, viewPose, tourAtMs: 3480 });
    expect(tour.poseAt(0).angleTo(start)).toBeLessThan(1e-6);
    expect(tour.stops[0].arriveMs).toBe(1500);
    expect(degrees(tour.poseAt(1500 / tour.durationMs).angleTo(viewPose('anterior')))).toBeLessThan(1e-4);
  });
});

describe('Turning back to face us when the welcome is cut short', () => {
  it('turns at the same calm pace, and ends facing us', () => {
    const turn = faceTurn({ start: viewPose('posterior'), face: viewPose('anterior') });
    expect(turn.durationMs).toBe(3000);
    expect(largestStep(sampleMs(turn))).toBeLessThanOrEqual(PEAK_DEGREES_PER_FRAME);
    expect(turn.poseAt(0).angleTo(viewPose('posterior'))).toBeLessThan(1e-6);
    expect(degrees(turn.poseAt(1).angleTo(viewPose('anterior')))).toBeLessThan(1e-4);
  });

  it('takes half a second when it is nearly facing us already', () => {
    const nearly = new THREE.Quaternion().setFromAxisAngle(frame.screenUp, THREE.MathUtils.degToRad(10)).multiply(viewPose('anterior'));
    expect(faceTurn({ start: nearly, face: viewPose('anterior') }).durationMs).toBe(500);
  });
});

describe('When the tour starts, and when it does not', () => {
  const ticks = (cue, steps) => steps.map((step) => cue.tick({ active: true, cut: false, touched: false, still: false, ...step }));

  it('starts once, on "Welcome."', () => {
    const cue = createSpinCue({ startMs: 0 });
    expect(ticks(cue, [{ elapsedMs: null }, { elapsedMs: 0 }, { elapsedMs: 100 }, { elapsedMs: 4000 }])).toEqual([
      null,
      'start',
      null,
      null,
    ]);
  });

  it('can wait for a later moment', () => {
    const cue = createSpinCue({ startMs: 2000 });
    expect(ticks(cue, [{ elapsedMs: 1000 }, { elapsedMs: 2050 }])).toEqual([null, 'start']);
  });

  it('never starts for a visitor who has already turned the brain', () => {
    const cue = createSpinCue({ startMs: 0 });
    expect(ticks(cue, [{ elapsedMs: 0, touched: true }, { elapsedMs: 100 }])).toEqual([null, null]);
  });

  it('never starts with reduced motion or Motion off', () => {
    const cue = createSpinCue({ startMs: 0 });
    expect(ticks(cue, [{ elapsedMs: 0, still: true }, { elapsedMs: 100 }])).toEqual([null, null]);
  });

  it('never starts once the welcome has been cut short', () => {
    const cue = createSpinCue({ startMs: 0 });
    expect(ticks(cue, [{ elapsedMs: 0, active: false, cut: true }, { elapsedMs: 100 }])).toEqual([null, null]);
  });

  it('turns back to face us once if the welcome is cut short mid-tour', () => {
    const cue = createSpinCue({ startMs: 0 });
    expect(ticks(cue, [{ elapsedMs: 0 }, { elapsedMs: 5000, active: false, cut: true }, { elapsedMs: 5100, active: false, cut: true }])).toEqual([
      'start',
      'home',
      null,
    ]);
  });

  // The tour (about 15 s) outlasts the welcome (12.5 s for Sylvi).
  it('carries on when the welcome simply finishes', () => {
    const cue = createSpinCue({ startMs: 0 });
    expect(ticks(cue, [{ elapsedMs: 0 }, { elapsedMs: 12500, active: false }, { elapsedMs: 13000, active: false }])).toEqual([
      'start',
      null,
      null,
    ]);
    expect(cue.running()).toBe(true);
  });

  it('knows whether the tour is running', () => {
    const cue = createSpinCue({ startMs: 0 });
    expect(cue.running()).toBe(false);
    cue.tick({ elapsedMs: 0, active: true, cut: false, touched: false, still: false });
    expect(cue.running()).toBe(true);
    cue.done();
    expect(cue.running()).toBe(false);
    expect(cue.tick({ elapsedMs: 3000, active: false, cut: true, touched: false, still: false })).toBeNull();
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

  // The tour counts as the guide moving, which otherwise stills the talking
  // motion; it lasts the whole welcome, so the brain keeps talking through it.
  it('keeps talking while the welcome tour runs', () => {
    expect(gestureInput({ conversationLevel: 0, welcomeActive: true, welcomeLevel: 0.6, control: 'guide_moving', touring: true }))
      .toMatchObject({ control: 'guide_free' });
    expect(gestureInput({ conversationLevel: 0.3, welcomeActive: false, welcomeLevel: 0, control: 'guide_moving', touring: false }))
      .toMatchObject({ control: 'guide_moving' });
  });
});
