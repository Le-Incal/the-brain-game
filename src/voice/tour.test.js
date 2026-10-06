import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import brainRegions from '../data/brainRegions.json';
import regionGeometry from '../data/regionGeometry.json';
import { createSceneCommands } from './sceneCommands.js';
import { createFakeSceneAdapter, installFakeClock, runFrames, toCameraDirection } from '../test/voiceHarness.js';

const lobesModule = await import('./lobes.js').catch(() => ({}));
const { TOUR_ORDER = [], LIMBIC_NOTE } = lobesModule;

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

const SETTLE_MS = 1500;
const SHOWCASE_MS = 6000;

function setup({ showcase = false, reducedMotion = false } = {}) {
  const harness = createFakeSceneAdapter();
  const tourEvents = [];
  const commands = createSceneCommands(harness.adapter, {
    showcase,
    reducedMotion: () => reducedMotion,
    onTourEvent: (event) => tourEvents.push(event),
    setTimeoutImpl: () => 0,
    clearTimeoutImpl: () => {},
  });
  const settle = async (promise, ms = SETTLE_MS) => {
    await runFrames(harness.controls, clock, ms);
    return promise;
  };
  return { ...harness, commands, settle, tourEvents };
}

const regionsOf = (lobe) => brainRegions.divisions.find(({ name }) => name === lobe).regions;

describe('face_lobe lights a whole lobe and turns to it', () => {
  it('lights every region of the lobe at once', async () => {
    const { commands, state, settle } = setup();
    const result = await settle(commands.faceLobe('Temporal Lobe'));
    expect(result.ok).toBe(true);
    expect(state.highlight).toEqual(regionsOf('Temporal Lobe'));
    expect(commands.getSceneState()).toMatchObject({
      highlightedRegions: regionsOf('Temporal Lobe'),
      highlightedRegion: null,
    });
  });

  it('turns the middle of the lobe toward the viewer', async () => {
    const { commands, controls, adapter, settle } = setup();
    await settle(commands.faceLobe('Parietal Lobe'));
    const points = regionsOf('Parietal Lobe').map((id) => adapter.toSpecimenSpace(regionGeometry.regions[String(id)].centroidLeft));
    const middle = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length).normalize();
    expect(middle.applyQuaternion(controls.orientGroup.quaternion).dot(toCameraDirection(controls))).toBeGreaterThan(0.99);
  });

  it('accepts a spoken lobe name and refuses an unknown one with the valid list', async () => {
    const { commands, settle } = setup();
    expect((await settle(commands.faceLobe('the temporal lobe'))).ok).toBe(true);
    const refused = await settle(commands.faceLobe('hippocampus'));
    expect(refused.ok).toBe(false);
    for (const lobe of TOUR_ORDER) expect(refused.reason).toContain(lobe);
  });

  it('shows the limbic lobe from its fixed view and says only the cingulate is painted', async () => {
    const { commands, settle } = setup();
    const result = await settle(commands.faceLobe('Limbic Lobe'));
    expect(result.ok).toBe(true);
    expect(result.did).toMatch(/cingulate/i);
  });

  it('acts only in Study mode', async () => {
    const { commands, state, settle } = setup();
    state.mode = 'game';
    expect((await settle(commands.faceLobe('Frontal Lobe'))).reason).toMatch(/study/i);
  });
});

describe('The app runs the tour; the guide narrates it', () => {
  it('start_tour clears any highlight, turns the colours on, shows the whole brain and returns the stops', async () => {
    const { commands, state, settle } = setup();
    commands.highlightRegion(11);
    state.colourRegions = false;
    const result = await settle(commands.startTour());
    expect(result).toMatchObject({ ok: true, stops: TOUR_ORDER });
    expect(result.instruction).toMatch(/one-sentence welcome/i);
    expect(result.instruction).toMatch(/next_tour_stop/);
    expect(state.highlight).toBeNull();
    expect(state.colourRegions).toBe(true);
    expect(commands.getSceneState().tour).toEqual({ stop: 0, of: 7 });
  });

  it('next_tour_stop lights each lobe in turn and hands over its regions', async () => {
    const { commands, state, settle, tourEvents } = setup();
    await settle(commands.startTour());
    for (let i = 0; i < TOUR_ORDER.length; i += 1) {
      const stop = await settle(commands.nextTourStop());
      expect(stop).toMatchObject({ ok: true, stop: i + 1, of: 7, lobe: TOUR_ORDER[i], next: TOUR_ORDER[i + 1] ?? null });
      expect(stop.regions.map(({ id }) => id)).toEqual(regionsOf(TOUR_ORDER[i]));
      expect(state.highlight).toEqual(regionsOf(TOUR_ORDER[i]));
    }
    expect(tourEvents.filter((e) => e.type === 'stop').map((e) => e.stop)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('says the limbic stop is only partly painted', async () => {
    const { commands, settle } = setup();
    await settle(commands.startTour());
    let stop;
    for (let i = 0; i < 7; i += 1) stop = await settle(commands.nextTourStop());
    expect(stop.note).toBe(LIMBIC_NOTE);
  });

  it('ends itself after the last stop: highlight cleared, colours on, whole brain, done', async () => {
    const { commands, state, settle, tourEvents } = setup();
    await settle(commands.startTour());
    for (let i = 0; i < 7; i += 1) await settle(commands.nextTourStop());
    state.colourRegions = false;
    const done = await settle(commands.nextTourStop());
    expect(done).toMatchObject({ ok: true, done: true });
    expect(state.highlight).toBeNull();
    expect(state.colourRegions).toBe(true);
    expect(commands.getSceneState().tour).toBeNull();
    expect(tourEvents.at(-1)).toEqual({ type: 'end' });
  });

  it('end_tour stops it cleanly at any point', async () => {
    const { commands, state, settle, tourEvents } = setup();
    await settle(commands.startTour());
    await settle(commands.nextTourStop());
    const ended = await settle(commands.endTour());
    expect(ended).toMatchObject({ ok: true, done: true });
    expect(state.highlight).toBeNull();
    expect(state.colourRegions).toBe(true);
    expect(commands.getSceneState().tour).toBeNull();
    expect(tourEvents.at(-1)).toEqual({ type: 'end' });
  });

  it('next_tour_stop without a tour says how to start one', async () => {
    const { commands, settle } = setup();
    const result = await settle(commands.nextTourStop());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/start_tour/);
  });

  it('a grab during a stop pauses the tour with the pick-up bookmark', async () => {
    const { commands, controls, element, settle } = setup();
    await settle(commands.startTour());
    const pending = commands.nextTourStop();
    await runFrames(controls, clock, 300);
    element.dispatch('pointerdown');
    const result = await pending;
    element.dispatch('pointerup');
    expect(result.ok).toBe(false);
    expect(commands.getSceneState().interrupted).toEqual({ command: 'tourStop', stop: 1, lobe: 'Frontal Lobe' });
    expect(commands.getSceneState().tour).toEqual({ stop: 1, of: 7 });
  });
});

describe('Safety net: a broad move never leaves a region lit', () => {
  it('rotate_to_view clears the highlight first', async () => {
    const { commands, state, settle } = setup();
    commands.highlightRegion(11);
    await settle(commands.rotateTo('posterior'));
    expect(state.highlight).toBeNull();
  });
});

describe('Showcase: after arriving, the brain shows the shape of what it lit', () => {
  it('answers the agent on arrival, then glides through about 6 s of angles and settles on the best view', async () => {
    const { commands, controls, settle } = setup({ showcase: true });
    const result = await settle(commands.faceRegion(17));
    expect(result.ok).toBe(true);
    const best = controls.orientGroup.quaternion.clone();
    expect(commands.getSceneState().control).toBe('guide_moving');
    let furthest = 0;
    for (let t = 0; t < SHOWCASE_MS + 500; t += 250) {
      await runFrames(controls, clock, 250);
      furthest = Math.max(furthest, controls.orientGroup.quaternion.angleTo(best));
    }
    expect(THREE.MathUtils.radToDeg(furthest)).toBeGreaterThan(12);
    expect(THREE.MathUtils.radToDeg(furthest)).toBeLessThan(25);
    expect(controls.orientGroup.quaternion.angleTo(best)).toBeLessThan(0.01);
    expect(commands.getSceneState().control).toBe('guide_free');
  });

  it('plays once and then holds still', async () => {
    const { commands, controls, settle } = setup({ showcase: true });
    await settle(commands.faceRegion(17), SETTLE_MS + SHOWCASE_MS + 500);
    const held = controls.orientGroup.quaternion.clone();
    await runFrames(controls, clock, 5000);
    expect(controls.orientGroup.quaternion.angleTo(held)).toBeLessThan(1e-6);
  });

  it('runs for face_lobe and tour stops too', async () => {
    const { commands, settle } = setup({ showcase: true });
    await settle(commands.faceLobe('Occipital Lobe'));
    expect(commands.getSceneState().control).toBe('guide_moving');
  });

  it('is cancelled by a grab, leaving the brain where it was taken', async () => {
    const { commands, controls, element, settle } = setup({ showcase: true });
    await settle(commands.faceRegion(17));
    await runFrames(controls, clock, 700);
    element.dispatch('pointerdown');
    const grabbed = controls.orientGroup.quaternion.clone();
    await runFrames(controls, clock, 3000);
    expect(controls.orientGroup.quaternion.angleTo(grabbed)).toBeLessThan(1e-6);
    element.dispatch('pointerup');
  });

  it('is replaced by the next move', async () => {
    const { commands, controls, settle } = setup({ showcase: true });
    await settle(commands.faceRegion(17));
    const next = await settle(commands.rotateTo('anterior'));
    expect(next.ok).toBe(true);
    await runFrames(controls, clock, SHOWCASE_MS);
    const anterior = controls.orientGroup.quaternion.clone();
    await runFrames(controls, clock, 1000);
    expect(controls.orientGroup.quaternion.angleTo(anterior)).toBeLessThan(1e-6);
  });

  it('is skipped when the player prefers reduced motion', async () => {
    const { commands, settle } = setup({ showcase: true, reducedMotion: true });
    await settle(commands.faceRegion(17));
    expect(commands.getSceneState().control).toBe('guide_free');
  });

  it('is off unless the app turns it on', async () => {
    const { commands, settle } = setup();
    await settle(commands.faceRegion(17));
    expect(commands.getSceneState().control).toBe('guide_free');
  });
});
