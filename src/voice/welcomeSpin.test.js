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
  uprightFacing,
  createSpinCue,
  motionControl,
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

// The arrival pose: upright, its left side toward us, carried a little way
// round by the arrival turn (about the vertical, so still upright).
function uprightLeft(turnedDegrees = 0) {
  const toward = new THREE.Vector3(frame.toCamera.x, 0, frame.toCamera.z).normalize();
  const basis = new THREE.Matrix4().makeBasis(toward, UP, new THREE.Vector3().crossVectors(toward, UP));
  const upright = new THREE.Quaternion().setFromRotationMatrix(basis);
  return new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(turnedDegrees)).multiply(upright);
}
const tiltFromUpright = (pose) => degrees(Math.acos(Math.min(1, UP.clone().applyQuaternion(pose).dot(UP))));

describe('The tour, timed to Sylvi', () => {
  const start = uprightLeft(20);
  let cached = null;
  // Built lazily, so each test fails on its own while the module is absent.
  const endPose = () => uprightFacing({ start, anterior: new THREE.Vector3(0, 0, 1), toCamera: frame.toCamera });
  const tour = () => (cached ??= welcomeTour({ start, viewPose, tourAtMs: 3480, endPose: endPose() }));

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
    for (let i = 1; i < stops.length - 1; i += 1) {
      expect(stops[i].arriveMs - stops[i - 1].leaveMs, `turn to ${stops[i].view}`).toBe(1500);
      expect(stops[i].leaveMs - stops[i].arriveMs, `pause at ${stops[i].view}`).toBe(500);
    }
    expect(durationMs).toBe(stops.at(-1).arriveMs);
  });

  // Kyle, 2026-10-13: "it should end on its starting elevation".
  it('comes down from the underside to face us upright, as it arrived, at the same calm pace', () => {
    const { stops, poseAt } = tour();
    const [underside, last] = stops.slice(-2);
    const angle = degrees(viewPose('inferior').angleTo(endPose()));
    // More than a quarter turn: the views are squared to a camera above us.
    expect(angle).toBeGreaterThan(90);
    expect(last.arriveMs - underside.leaveMs).toBe(Math.round((1500 * angle) / 90));
    expect(degrees(poseAt(1).angleTo(endPose()))).toBeLessThan(1e-4);
    expect(tiltFromUpright(poseAt(1))).toBeCloseTo(tiltFromUpright(start), 6);
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
    expect(classifyView(poseAt(1), frame).view).toBe('anterior');
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
    const start = uprightLeft(40);
    const tour = welcomeTour({ start, viewPose, tourAtMs: 3480 });
    expect(tour.poseAt(0).angleTo(start)).toBeLessThan(1e-6);
    expect(tour.stops[0].arriveMs).toBe(1500);
    expect(degrees(tour.poseAt(1500 / tour.durationMs).angleTo(viewPose('anterior')))).toBeLessThan(1e-4);
  });
});

describe('Facing us upright, as the brain arrived', () => {
  const anterior = new THREE.Vector3(0, 0, 1);
  const front = (pose) => anterior.clone().applyQuaternion(pose);
  const heading = (v) => Math.atan2(v.x, v.z);

  it.each([
    ['upright', uprightLeft(0)],
    ['carried round', uprightLeft(35)],
    // At arrival the real brain leans 3.75 degrees from upright.
    ['leaning as it arrives', new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 1).normalize(), THREE.MathUtils.degToRad(3.75)).multiply(uprightLeft(10))],
  ])('keeps its lean exactly and turns its front toward us (%s)', (_, start) => {
    const pose = uprightFacing({ start, anterior, toCamera: frame.toCamera });
    expect(tiltFromUpright(pose)).toBeCloseTo(tiltFromUpright(start), 6);
    expect(Math.abs(degrees(heading(front(pose)) - heading(frame.toCamera)))).toBeLessThan(0.01);
  });

  it('is turned only about the vertical, so a slow turn from there never wobbles', () => {
    const start = uprightLeft(25);
    const pose = uprightFacing({ start, anterior, toCamera: frame.toCamera });
    const step = pose.clone().multiply(start.clone().invert());
    expect(Math.abs(new THREE.Vector3(step.x, step.y, step.z).normalize().dot(UP))).toBeGreaterThan(0.999999);
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

describe('The talking motion during the tour', () => {
  // The tour counts as the guide moving, which otherwise stills the talking;
  // it lasts the whole welcome, so the brain keeps talking through it.
  it('keeps talking while the welcome tour runs', () => {
    expect(motionControl({ control: 'guide_moving', touring: true })).toBe('guide_free');
  });

  it('follows the usual rules otherwise', () => {
    expect(motionControl({ control: 'guide_moving', touring: false })).toBe('guide_moving');
    expect(motionControl({ control: 'player_holding', touring: false })).toBe('player_holding');
  });

  // A grab ends the tour, so a held brain is never touring.
  it('never overrides the visitor holding it', () => {
    expect(motionControl({ control: 'player_holding', touring: true })).toBe('player_holding');
  });
});
