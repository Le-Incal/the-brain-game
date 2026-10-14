import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createControls } from '../test/voiceHarness.js';
import { classifyView, getViewFrame, orientationForView } from './orientation.js';

// Imported defensively so each test fails on its own while the module is absent.
const spinModule = await import('./welcomeSpin.js').catch(() => ({}));
const {
  WELCOME_TOUR_TURN_MS,
  WELCOME_TOUR_PAUSE_MS,
  WELCOME_UNDERSIDE_PAUSE_MS,
  WELCOME_TOUR_VIEWS,
  WELCOME_TOUR_FROM,
  WELCOME_TOUR_DEFAULT_AT_MS,
  WELCOME_SELECT_REGION_ID,
  WELCOME_SELECT_HOLD_MS,
  WELCOME_AFTER_SELECT_PAUSE_MS,
  WELCOME_THREE_QUARTER,
  WELCOME_GREETING,
  recognition,
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
// turning deliberately from one standard view to the next, 1.5 s a turn.
//
// Kyle, 2026-10-13 (later): at "turn me around and select any of my regions"
// it shows what selecting looks like. "We spend a little too much time at
// the back... shorten the time we spend on each side, flip to the bottom and
// then rotate back to the top to select and then back to the front." So: the
// left side, the back and the right side with no pause, a flip to the
// underside, up to a view from the front-right a little above, the
// prefrontal cortex selected for 2 s, then upright facing us.

const UP = new THREE.Vector3(0, 1, 0);
const FRAMES_PER_SECOND = 60;
const FRAME_MS = 1000 / FRAMES_PER_SECOND;
const degrees = (radians) => (radians * 180) / Math.PI;
// 90 degrees in 1.5 s, eased on a sine: about 94 degrees a second at the fastest.
const PEAK_DEGREES_PER_FRAME = 1.6;
// The greeting's snap: about 200 degrees a second at the fastest, for a moment.
const SNAP_DEGREES_PER_FRAME = 3.5;

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

// Every step between two poses turns about the screen's vertical or its horizontal.
function turnsAboutOneScreenAxis(poses) {
  for (let i = 1; i < poses.length; i += 1) {
    const step = poses[i].clone().multiply(poses[i - 1].clone().invert());
    if (step.w < 0) step.set(-step.x, -step.y, -step.z, -step.w);
    if (2 * Math.acos(Math.min(1, step.w)) < 1e-4) continue;
    const axis = new THREE.Vector3(step.x, step.y, step.z).normalize();
    if (Math.max(Math.abs(axis.dot(frame.screenUp)), Math.abs(axis.dot(screenRight))) < 0.999) return false;
  }
  return true;
}

describe('The welcome tour: its settings', () => {
  it('turns in 1.5 s, with no pause at the sides and a quarter second to see the underside', () => {
    expect(WELCOME_TOUR_TURN_MS).toBe(1500);
    expect(WELCOME_TOUR_PAUSE_MS).toBe(0);
    expect(WELCOME_UNDERSIDE_PAUSE_MS).toBe(250);
  });

  it('faces us, shows the left side, the back, the right side, the underside, rises to the front-right, then faces us', () => {
    expect(WELCOME_TOUR_VIEWS).toEqual(['anterior', 'left_lateral', 'posterior', 'right_lateral', 'inferior', 'front_right_above', 'anterior']);
  });

  it('selects the prefrontal cortex for 2 s, then pauses a quarter second before turning back', () => {
    expect(WELCOME_SELECT_REGION_ID).toBe(1);
    expect(WELCOME_SELECT_HOLD_MS).toBe(2000);
    expect(WELCOME_AFTER_SELECT_PAUSE_MS).toBe(250);
  });

  it('sees the brain from 40 degrees round from the front toward the right, 25 degrees above', () => {
    expect(WELCOME_THREE_QUARTER).toEqual({ aroundDegrees: 40, aboveDegrees: 25 });
  });

  it('holds its greeting until "You can study"', () => {
    expect(WELCOME_TOUR_FROM).toBe('You can study');
    expect(WELCOME_TOUR_DEFAULT_AT_MS).toBe(3500);
  });
});

// Kyle, 2026-10-13 (evening): "The brain should start at side elevation but
// then turn and look at the user as if animated as a puppet... as if the puppet
// is turning and suddenly recognizing that a user has arrived." His pick: a
// casual turn, then a snap. It turns idly a little way toward us, notices us,
// snaps the rest of the way past us with its head lifted in surprise, and
// settles facing us. "Hello!" lands on the snap.
describe("The greeting: a puppet's recognition", () => {
  const FRAME_S = 1 / 60;
  const speeds = (total, fromMs, toMs) => {
    const out = [];
    for (let ms = fromMs + FRAME_S * 1000; ms <= toMs; ms += FRAME_S * 1000) {
      out.push(Math.abs(recognition(ms, total).turn - recognition(ms - FRAME_S * 1000, total).turn) / FRAME_S);
    }
    return out;
  };

  it('turns idly for 0.6 s, snaps for 0.5 s past us by 7 degrees with a 5 degree lift, and settles in 0.5 s', () => {
    expect(WELCOME_GREETING).toEqual({ idleMs: 600, idleDegrees: 25, snapMs: 500, overshootDegrees: 7, liftDegrees: 5, settleMs: 500 });
  });

  it('starts still, square on its side', () => {
    expect(recognition(0, 90)).toEqual({ turn: 0, lift: 0 });
  });

  it('turns idly about 25 degrees toward us first, slowly, without lifting', () => {
    expect(recognition(600, 90).turn).toBeCloseTo(25, 6);
    expect(recognition(600, 90).lift).toBe(0);
    expect(Math.max(...speeds(90, 0, 600))).toBeLessThanOrEqual(61);
  });

  it('notices us and snaps past us by 7 degrees, lifting its head 5 degrees, at about 200 degrees a second at most', () => {
    expect(recognition(1100, 90).turn).toBeCloseTo(97, 6);
    expect(recognition(1100, 90).lift).toBeCloseTo(5, 6);
    const fastest = Math.max(...speeds(90, 600, 1100));
    expect(fastest).toBeGreaterThan(180);
    expect(fastest).toBeLessThanOrEqual(205);
  });

  it('settles facing us, its head level again, and stays there', () => {
    expect(recognition(1600, 90)).toEqual({ turn: 90, lift: 0 });
    expect(recognition(4000, 90)).toEqual({ turn: 90, lift: 0 });
  });

  it('flows: no jump between frames, and it never stops dead mid-turn', () => {
    const turns = speeds(90, 0, 1600);
    for (let i = 1; i < turns.length; i += 1) expect(Math.abs(turns[i] - turns[i - 1]) * FRAME_S).toBeLessThan(0.5);
    // Still moving as it notices us: the idle turn runs into the snap.
    expect(speeds(90, 580, 620).every((v) => v > 40)).toBe(true);
  });

  it('keeps the idle turn a share of a shorter turn, and snaps no faster from far round', () => {
    expect(recognition(600, 45).turn).toBeCloseTo(12.5, 6);
    expect(recognition(1600, 45)).toEqual({ turn: 45, lift: 0 });
    const far = Math.max(...speeds(180, 600, 3000));
    expect(far).toBeLessThanOrEqual(205);
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

  // Measured in a slow browser, 2026-10-13: the tour's first frame came 450 ms
  // after "Welcome.", and every move after it ran that much behind her words.
  it('counts from where the welcome has reached when the tour starts, so a late first frame never leaves the brain behind her words', () => {
    const timeOf = (phrase) => (phrase === 'You can study' ? 3480 : null);
    expect(welcomeTourTiming({ timeOf, startedAtMs: 450 })).toEqual({ tourAtMs: 3030 });
    expect(welcomeTourTiming({ timeOf, startedAtMs: 5000 })).toEqual({ tourAtMs: 0 });
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
  const tour = () => (cached ??= welcomeTour({ start, frame, viewPose, tourAtMs: 3480, endPose: endPose() }));
  const stop = (view) => tour().stops.find((s) => s.view === view);
  const poseAtMs = (ms) => tour().poseAt(ms / tour().durationMs);

  it('turns to face us first, settled 1.6 s after it starts to turn', () => {
    const [greeting] = tour().stops;
    expect(greeting.view).toBe('anterior');
    expect(greeting.arriveMs).toBe(1600);
  });

  it('greets like a puppet: an idle turn, then a snap past us with its head lifted, then settles facing us', () => {
    const face = viewPose('anterior');
    const total = degrees(start.angleTo(face));
    // A third of the way round after the idle turn.
    expect(degrees(start.angleTo(poseAtMs(600)))).toBeCloseTo(Math.min(25, (25 * total) / 90), 0);
    // At the end of the snap it has gone past us and lifted its head.
    const overshot = poseAtMs(1100);
    expect(degrees(overshot.angleTo(face))).toBeGreaterThan(7);
    expect(UP.clone().applyQuaternion(overshot).dot(frame.toCamera)).toBeLessThan(UP.clone().applyQuaternion(face).dot(frame.toCamera));
    // Then it settles, square on.
    expect(degrees(poseAtMs(1600).angleTo(face))).toBeLessThan(1e-4);
  });

  it('snaps at about 200 degrees a second at the fastest, for a moment only', () => {
    const snap = largestStep(sampleMs(tour(), 0, 1600));
    expect(snap).toBeGreaterThan(2.5);
    expect(snap).toBeLessThanOrEqual(SNAP_DEGREES_PER_FRAME);
  });

  it('holds the greeting while she says her name, until "You can study"', () => {
    expect(tour().stops[0].leaveMs).toBe(3480);
  });

  it('turns from side to side without pausing: 1.5 s for each, half a second less than before', () => {
    const { stops } = tour();
    expect(stops.map(({ view }) => view)).toEqual(WELCOME_TOUR_VIEWS);
    for (let i = 1; i <= 3; i += 1) {
      expect(stops[i].arriveMs - stops[i - 1].leaveMs, `turn to ${stops[i].view}`).toBe(1500);
      expect(stops[i].leaveMs, `no pause at ${stops[i].view}`).toBe(stops[i].arriveMs);
    }
    expect(stop('right_lateral').arriveMs).toBe(3480 + 3 * 1500);
  });

  it('flips from the right side to the underside with a single quarter tip, and looks for a quarter second', () => {
    const right = stop('right_lateral');
    const under = stop('inferior');
    expect(under.arriveMs - right.leaveMs).toBe(1500);
    expect(under.leaveMs - under.arriveMs).toBe(250);
    expect(degrees(poseAtMs(right.arriveMs).angleTo(poseAtMs(under.arriveMs)))).toBeCloseTo(90, 3);
    expect(turnsAboutOneScreenAxis(sampleMs(tour(), right.leaveMs, under.arriveMs))).toBe(true);
    expect(classifyView(poseAtMs(under.arriveMs), frame).view).toBe('inferior');
  });

  it('rises from the underside to see the brain from the front-right, a little above, at the same pace', () => {
    const under = stop('inferior');
    const top = stop('front_right_above');
    const angle = degrees(poseAtMs(under.arriveMs).angleTo(poseAtMs(top.arriveMs)));
    expect(top.arriveMs - under.leaveMs).toBe(Math.round((1500 * angle) / 90));
    // Which way the viewer lies, in the brain's own frame (+x left, +y up, +z front).
    const toViewer = frame.toCamera.clone().applyQuaternion(poseAtMs(top.arriveMs).clone().invert());
    const a = THREE.MathUtils.degToRad(40);
    const e = THREE.MathUtils.degToRad(25);
    const expected = new THREE.Vector3(-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    expect(degrees(toViewer.angleTo(expected))).toBeLessThan(0.5);
  });

  it('selects the prefrontal cortex as it arrives, holds it 2 s, then lets it go', () => {
    const top = stop('front_right_above');
    expect(tour().events).toEqual([
      { type: 'select', regionId: 1, atMs: top.arriveMs },
      { type: 'deselect', atMs: top.arriveMs + 2000 },
    ]);
    // It holds still while the region is selected, and a quarter second after.
    expect(top.leaveMs).toBe(top.arriveMs + 2000 + 250);
    expect(degrees(poseAtMs(top.arriveMs).angleTo(poseAtMs(top.leaveMs)))).toBeLessThan(1e-4);
  });

  // Kyle, 2026-10-13: "it should end on its starting elevation".
  it('turns back to face us upright, as it arrived, at the same calm pace', () => {
    const { stops, poseAt } = tour();
    const [top, last] = stops.slice(-2);
    const angle = degrees(poseAtMs(top.leaveMs).angleTo(endPose()));
    expect(last.arriveMs - top.leaveMs).toBe(Math.round(1500 * Math.max(1, angle / 90)));
    expect(degrees(poseAt(1).angleTo(endPose()))).toBeLessThan(1e-4);
    expect(tiltFromUpright(poseAt(1))).toBeCloseTo(tiltFromUpright(start), 6);
    expect(tour().durationMs).toBe(last.arriveMs);
  });

  it('sits square on each standard view as it reaches it', () => {
    for (const view of ['left_lateral', 'posterior', 'right_lateral']) {
      expect(degrees(poseAtMs(stop(view).arriveMs).angleTo(viewPose(view))), view).toBeLessThan(1e-4);
    }
    expect(degrees(poseAtMs(2500).angleTo(viewPose('anterior')))).toBeLessThan(1e-4);
  });

  it('shows the sides and the underside in order', () => {
    expect(viewsAlong(sampleMs(tour(), 0, stop('inferior').leaveMs))).toEqual([
      'left_lateral',
      'anterior',
      'left_lateral',
      'posterior',
      'right_lateral',
      'inferior',
    ]);
  });

  it('begins exactly where the brain is and ends facing us', () => {
    const { poseAt } = tour();
    expect(poseAt(0).angleTo(start)).toBeLessThan(1e-6);
    expect(classifyView(poseAt(1), frame).view).toBe('anterior');
  });

  it('turns round for the sides and tips for the underside, one axis at a time', () => {
    expect(turnsAboutOneScreenAxis(sampleMs(tour(), tour().stops[0].leaveMs, stop('inferior').arriveMs))).toBe(true);
  });

  it('never moves faster than about 94 degrees a second after the greeting', () => {
    expect(largestStep(sampleMs(tour(), tour().stops[0].arriveMs))).toBeLessThanOrEqual(PEAK_DEGREES_PER_FRAME);
  });

  it('eases into and out of every turn: no motion jumps at a stop', () => {
    const { stops, durationMs, poseAt } = tour();
    for (const s of stops) {
      const at = s.arriveMs / durationMs;
      const before = poseAt(at - FRAME_MS / durationMs);
      expect(degrees(before.angleTo(poseAt(at))), s.view).toBeLessThan(0.05);
    }
  });
});

describe('The greeting from other poses', () => {
  it('snaps at the same speed from far round, taking longer rather than going faster', () => {
    const tour = welcomeTour({ start: viewPose('posterior'), frame, viewPose, tourAtMs: 3480 });
    expect(tour.stops[0].arriveMs).toBeGreaterThan(1600);
    expect(largestStep(sampleMs(tour, 0, tour.stops[0].arriveMs))).toBeLessThanOrEqual(SNAP_DEGREES_PER_FRAME);
    expect(largestStep(sampleMs(tour, tour.stops[0].arriveMs))).toBeLessThanOrEqual(PEAK_DEGREES_PER_FRAME);
  });

  it('keeps a pause after the greeting when the words come early', () => {
    const tour = welcomeTour({ start: viewPose('posterior'), frame, viewPose, tourAtMs: 1000 });
    expect(tour.stops[0].leaveMs).toBe(tour.stops[0].arriveMs + 500);
  });

  it('starts from wherever the arrival turn has carried it', () => {
    const start = uprightLeft(40);
    const tour = welcomeTour({ start, frame, viewPose, tourAtMs: 3480 });
    expect(tour.poseAt(0).angleTo(start)).toBeLessThan(1e-6);
    expect(tour.stops[0].arriveMs).toBe(1600);
    expect(degrees(tour.poseAt(1600 / tour.durationMs).angleTo(viewPose('anterior')))).toBeLessThan(1e-4);
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
