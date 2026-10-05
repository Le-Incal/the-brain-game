import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import brainRegions from '../data/brainRegions.json';
import regionGeometry from '../data/regionGeometry.json';
import {
  createFakeSceneAdapter,
  directionFromPivot,
  flushMicrotasks,
  installFakeClock,
  rotated,
  runFrames,
  screenUpDirection,
  toCameraDirection,
} from '../test/voiceHarness.js';

// Imported defensively so each test fails on its own while the module is absent.
const sceneCommandsModule = await import('./sceneCommands.js').catch(() => ({}));
const { createSceneCommands, MEDIAL_REGION_VIEWS } = sceneCommandsModule;
const orientation = await import('./orientation.js').catch(() => ({}));
const { VIEWS, VIEW_AXES } = orientation;

const MOVE_SETTLE_MS = 1500;
const ALL_VIEWS = ['left_lateral', 'right_lateral', 'anterior', 'posterior', 'superior', 'inferior'];

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

function setup() {
  const harness = createFakeSceneAdapter();
  const interactions = [];
  const controlChanges = [];
  const timers = [];
  const commands = createSceneCommands(harness.adapter, {
    onUserInteraction: (event) => interactions.push(event),
    onControlChange: (control) => controlChanges.push(control),
    setTimeoutImpl: (fn, ms) => {
      timers.push({ fn, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeoutImpl: (id) => {
      if (timers[id]) timers[id].cleared = true;
    },
  });
  async function settle(promise) {
    await runFrames(harness.controls, clock, MOVE_SETTLE_MS);
    return promise;
  }
  function runTimers(ms) {
    const pending = timers.filter((timer) => timer.ms === ms && !timer.cleared && !timer.ran);
    for (const timer of pending) {
      timer.ran = true;
      timer.fn();
    }
    return pending.length;
  }
  // As if 2 s passed with no input.
  const endQuietPeriod = () => runTimers(2000);
  // As if the press has been held for 250 ms.
  const holdPastDebounce = () => runTimers(250);
  return { ...harness, commands, settle, interactions, controlChanges, timers, endQuietPeriod, holdPastDebounce };
}

function expectResultShape(result) {
  expect(typeof result.ok).toBe('boolean');
  expect(typeof result.did).toBe('string');
  expect(typeof result.reason).toBe('string');
}

function facing(controls, point) {
  return directionFromPivot(point).applyQuaternion(controls.orientGroup.quaternion).dot(toCameraDirection(controls));
}

describe('C7: faceRegion turns the region toward the viewer', () => {
  it("faces Broca's area (6) on the left hemisphere", async () => {
    const { commands, controls, settle } = setup();
    const result = await settle(commands.faceRegion(6));
    expectResultShape(result);
    expect(result.ok).toBe(true);
    expect(facing(controls, regionGeometry.regions['6'].centroidLeft)).toBeGreaterThan(0.99);
    expect(rotated([1, 0, 0], controls.orientGroup.quaternion).dot(toCameraDirection(controls))).toBeGreaterThan(0);
  });

  it("corrects a right-hemisphere request for Broca's area instead of failing", async () => {
    const { commands, controls, settle } = setup();
    const result = await settle(commands.faceRegion(6, { hemisphere: 'right' }));
    expect(result.ok).toBe(true);
    expect(result.did).toMatch(/left/i);
    expect(result.did).toMatch(/only/i);
    expect(facing(controls, regionGeometry.regions['6'].centroidLeft)).toBeGreaterThan(0.99);
  });

  it.each([
    ['left', 'centroidLeft'],
    ['right', 'centroidRight'],
  ])('faces the requested hemisphere of a bilateral region (11, %s), superior up', async (hemisphere, key) => {
    const { commands, controls, settle } = setup();
    const result = await settle(commands.faceRegion(11, { hemisphere }));
    expect(result.ok).toBe(true);
    expect(facing(controls, regionGeometry.regions['11'][key])).toBeGreaterThan(0.99);
    expect(rotated([0, 1, 0], controls.orientGroup.quaternion).dot(screenUpDirection(controls))).toBeGreaterThan(0.5);
  });

  it('with no hemisphere, faces whichever side is already toward the viewer', async () => {
    const { commands, controls, settle } = setup();
    await settle(commands.faceRegion(11));
    expect(facing(controls, regionGeometry.regions['11'].centroidLeft)).toBeGreaterThan(0.99);

    await settle(commands.rotateTo('right_lateral'));
    await settle(commands.faceRegion(11));
    expect(facing(controls, regionGeometry.regions['11'].centroidRight)).toBeGreaterThan(0.99);
  });

  it('resolves only after the move completes', async () => {
    const { commands, controls } = setup();
    let settled = false;
    commands.faceRegion(17).then(() => {
      settled = true;
    });
    await runFrames(controls, clock, 600);
    expect(settled).toBe(false);
    await runFrames(controls, clock, 900);
    expect(settled).toBe(true);
  });
});

describe('C8: faceRegion rejects ids outside the atlas', () => {
  it.each([99, 0, -1, 2.5, null, undefined])('faceRegion(%s) fails with the valid range', async (regionId) => {
    const { commands, controls, settle } = setup();
    const before = controls.orientGroup.quaternion.clone();
    const result = await settle(commands.faceRegion(regionId));
    expectResultShape(result);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/1/);
    expect(result.reason).toMatch(/20/);
    expect(controls.orientGroup.quaternion.angleTo(before)).toBeLessThan(1e-6);
  });
});

describe('C9: medial regions use fixed views', () => {
  it('maps Precuneus (10) and Cingulate (16) to views that actually show them', () => {
    expect(Object.keys(MEDIAL_REGION_VIEWS).map(Number).sort((a, b) => a - b)).toEqual([10, 16]);
    for (const [id, view] of Object.entries(MEDIAL_REGION_VIEWS)) {
      expect(ALL_VIEWS).toContain(view);
      const shown = regionGeometry.labelsPerView[view].map((label) => label.id);
      expect(shown, `region ${id} in ${view}`).toContain(Number(id));
    }
  });

  it.each([10, 16])('faceRegion(%i) turns to its fixed view and mentions the medial surface', async (id) => {
    const { commands, controls, settle } = setup();
    const result = await settle(commands.faceRegion(id));
    expect(result.ok).toBe(true);
    expect(result.did).toMatch(/medial/i);
    const view = MEDIAL_REGION_VIEWS[id];
    expect(rotated(VIEW_AXES[view], controls.orientGroup.quaternion).dot(toCameraDirection(controls))).toBeGreaterThan(0.99);
  });
});

describe('C10: a user grab mid-move is reported truthfully', () => {
  it('resolves ok: false when the user grabs the brain during faceRegion', async () => {
    const { commands, controls, element } = setup();
    const pending = commands.faceRegion(17);
    await runFrames(controls, clock, 500);
    element.dispatch('pointerdown');
    await flushMicrotasks();
    element.dispatch('pointerup');
    const result = await pending;
    expectResultShape(result);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/user/i);
  });

  it('resolves ok: false when the user grabs the brain during rotateTo', async () => {
    const { commands, controls, element } = setup();
    const pending = commands.rotateTo('posterior');
    await runFrames(controls, clock, 500);
    element.dispatch('pointerdown');
    await flushMicrotasks();
    element.dispatch('pointerup');
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/user/i);
  });
});

describe('C11: rotateTo', () => {
  it.each(ALL_VIEWS)('rotateTo(%s) faces that view', async (view) => {
    const { commands, controls, settle } = setup();
    const result = await settle(commands.rotateTo(view));
    expectResultShape(result);
    expect(result.ok).toBe(true);
    expect(rotated(VIEW_AXES[view], controls.orientGroup.quaternion).dot(toCameraDirection(controls))).toBeGreaterThan(0.99);
  });

  it('rejects an unknown view and lists the six valid ones', async () => {
    const { commands, controls, settle } = setup();
    const before = controls.orientGroup.quaternion.clone();
    const result = await settle(commands.rotateTo('sideways'));
    expect(result.ok).toBe(false);
    for (const view of ALL_VIEWS) expect(result.reason).toContain(view);
    expect(controls.orientGroup.quaternion.angleTo(before)).toBeLessThan(1e-6);
  });
});

describe('C12: highlight, colour and annotations', () => {
  it('highlights a region and clears it', () => {
    const { commands, state } = setup();
    const lit = commands.highlightRegion(3);
    expectResultShape(lit);
    expect(lit.ok).toBe(true);
    expect(state.highlight).toBe(3);

    const cleared = commands.clearHighlight();
    expectResultShape(cleared);
    expect(cleared.ok).toBe(true);
    expect(state.highlight).toBeNull();
  });

  it('refuses to highlight an id outside the atlas and leaves the scene alone', () => {
    const { commands, state } = setup();
    commands.highlightRegion(3);
    const result = commands.highlightRegion(42);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/20/);
    expect(state.highlight).toBe(3);
  });

  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
  ])('setColourRegions(%j) sets colour to %s', (input, expected) => {
    const { commands, state } = setup();
    state.colourRegions = !expected;
    const result = commands.setColourRegions(input);
    expectResultShape(result);
    expect(result.ok).toBe(true);
    expect(state.colourRegions).toBe(expected);
  });

  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
  ])('setAnnotations(%j) sets annotations to %s', (input, expected) => {
    const { commands, state } = setup();
    state.annotations = !expected;
    const result = commands.setAnnotations(input);
    expect(result.ok).toBe(true);
    expect(state.annotations).toBe(expected);
  });

  it('rejects a value it cannot read as a boolean, without changing anything', () => {
    const { commands, state } = setup();
    expect(commands.setColourRegions('maybe').ok).toBe(false);
    expect(commands.setAnnotations(undefined).ok).toBe(false);
    expect(state.colourRegions).toBe(false);
    expect(state.annotations).toBe(false);
  });
});

describe('C13: getSceneState', () => {
  it('reports the untouched home view as left_lateral, not exact', () => {
    const { commands } = setup();
    const scene = commands.getSceneState();
    expect(scene.ok).toBe(true);
    expect(scene.view).toBe('left_lateral');
    expect(scene.viewExact).toBe(false);
  });

  it.each(ALL_VIEWS)('after rotateTo(%s), reports that view exactly with its visible regions', async (view) => {
    const { commands, settle } = setup();
    await settle(commands.rotateTo(view));
    const scene = commands.getSceneState();
    expect(scene.view).toBe(view);
    expect(scene.viewExact).toBe(true);
    expect(scene.visibleRegions.map((region) => region.id)).toEqual(
      regionGeometry.labelsPerView[view].map((label) => label.id)
    );
    for (const region of scene.visibleRegions) expect(typeof region.name).toBe('string');
  });

  it('reports highlight, colour, annotations and mode as the scene holds them', () => {
    const { commands, state } = setup();
    commands.highlightRegion(12);
    commands.setColourRegions(true);
    commands.setAnnotations('true');
    expect(commands.getSceneState()).toMatchObject({
      ok: true,
      highlightedRegion: 12,
      colourRegions: true,
      annotations: true,
      mode: 'study',
    });
    commands.clearHighlight();
    state.mode = 'game';
    expect(commands.getSceneState()).toMatchObject({ highlightedRegion: null, mode: 'game' });
  });
});

describe('C14: lookupRegion', () => {
  const broca = brainRegions.regions.find(({ id }) => id === 6);

  it('returns the exact contract shape for an id', () => {
    expect(createSceneCommands(createFakeSceneAdapter().adapter).lookupRegion({ regionId: 6 })).toEqual({
      ok: true,
      region: {
        id: 6,
        name: broca.name,
        division: broca.division,
        hemisphere: broca.hemisphere,
        subtitle: broca.subtitle,
        description: broca.clickDescription,
        factoid: broca.factoid,
      },
    });
  });

  it.each([
    ["broca's area", 6],
    ["Broca’s Area", 6],
    ['BROCAS AREA', 6],
    ['the little brain', 19],
    ['Wernicke', 13],
  ])('resolves the name %j to region %i', (name, id) => {
    const { commands } = setup();
    const result = commands.lookupRegion({ name });
    expect(result.ok).toBe(true);
    expect(result.region.id).toBe(id);
  });

  it.each([{ name: 'spleen' }, { regionId: 99 }, {}])('fails truthfully for %j', (query) => {
    const { commands } = setup();
    const result = commands.lookupRegion(query);
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('region');
  });
});

describe('C15: listRegions', () => {
  it('matches brainRegions.json divisions and ids exactly', () => {
    const { commands } = setup();
    const nameById = new Map(brainRegions.regions.map((region) => [region.id, region.name]));
    expect(commands.listRegions()).toEqual({
      ok: true,
      divisions: brainRegions.divisions.map((division) => ({
        name: division.name,
        regions: division.regions.map((id) => [id, nameById.get(id)]),
      })),
    });
  });
});

describe('C17: the player can take hold at any time', () => {
  // Motion stops the instant the player grabs; the conversation does not.
  // The app tells the guide what was interrupted so it can offer to resume.
  it('tells the guide when the player grabs, and hands back once after the quiet period', async () => {
    const { commands, element, interactions, endQuietPeriod, holdPastDebounce } = setup();
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    expect(commands.getSceneState().userHolding).toBe(true);
    holdPastDebounce();
    expect(interactions).toEqual([{ type: 'grab', interrupted: null }]);

    element.dispatch('pointermove', { clientX: 470, clientY: 300 });
    element.dispatch('pointerup', { clientX: 470, clientY: 300 });
    expect(interactions).toHaveLength(1);
    expect(commands.getSceneState().userHolding).toBe(false);

    endQuietPeriod();
    const scene = commands.getSceneState();
    expect(interactions[1]).toEqual({ type: 'handoff', view: scene.view, viewExact: scene.viewExact });
    expect(interactions).toHaveLength(2);
  });

  it('bookmarks the move a grab interrupted', async () => {
    const { commands, controls, element, interactions, holdPastDebounce } = setup();
    const pending = commands.faceRegion(6, { hemisphere: 'right' });
    await runFrames(controls, clock, 500);
    element.dispatch('pointerdown');
    await flushMicrotasks();
    holdPastDebounce();

    const bookmark = { command: 'faceRegion', regionId: 6, hemisphere: 'left' };
    expect(interactions[0]).toEqual({ type: 'grab', interrupted: bookmark });
    expect((await pending).ok).toBe(false);

    element.dispatch('pointerup');
    expect(commands.getSceneState().interrupted).toEqual(bookmark);
  });

  it('bookmarks an interrupted rotateTo', async () => {
    const { commands, controls, element } = setup();
    const pending = commands.rotateTo('posterior');
    await runFrames(controls, clock, 500);
    element.dispatch('pointerdown');
    await pending;
    element.dispatch('pointerup');
    expect(commands.getSceneState().interrupted).toEqual({ command: 'rotateTo', view: 'posterior' });
  });

  it('refuses to move while the player is holding the brain', async () => {
    const { commands, controls, element, settle } = setup();
    element.dispatch('pointerdown');
    const held = controls.orientGroup.quaternion.clone();

    for (const result of [await settle(commands.faceRegion(17)), await settle(commands.rotateTo('superior'))]) {
      expectResultShape(result);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/holding/i);
    }
    expect(controls.orientGroup.quaternion.angleTo(held)).toBeLessThan(1e-6);
    element.dispatch('pointerup');
  });

  it('keeps talking tools working while the player holds the brain', () => {
    const { commands, element, state } = setup();
    element.dispatch('pointerdown');
    expect(commands.highlightRegion(9).ok).toBe(true);
    expect(state.highlight).toBe(9);
    expect(commands.lookupRegion({ regionId: 9 }).ok).toBe(true);
    expect(commands.listRegions().ok).toBe(true);
    expect(commands.getSceneState().ok).toBe(true);
    element.dispatch('pointerup');
  });

  it('clears the bookmark once a later move completes', async () => {
    const { commands, controls, element, settle, endQuietPeriod } = setup();
    const pending = commands.faceRegion(17);
    await runFrames(controls, clock, 500);
    element.dispatch('pointerdown');
    await pending;
    element.dispatch('pointerup');
    expect(commands.getSceneState().interrupted).not.toBeNull();
    endQuietPeriod();

    await settle(commands.faceRegion(17));
    expect(commands.getSceneState().interrupted).toBeNull();
  });

  it('starts with nothing interrupted and nobody holding', () => {
    const { commands } = setup();
    expect(commands.getSceneState()).toMatchObject({ userHolding: false, interrupted: null });
  });
});

describe('C18: faceRegion lights the region it faces', () => {
  it('highlights the region and says so', async () => {
    const { commands, state, settle } = setup();
    const result = await settle(commands.faceRegion(6));
    expect(result.ok).toBe(true);
    expect(state.highlight).toBe(6);
    expect(result.did).toMatch(/light|highlight/i);
  });

  it('turns the light on as the move starts', async () => {
    const { commands, controls, state } = setup();
    commands.faceRegion(17);
    await flushMicrotasks();
    expect(controls.isMoving).toBe(true);
    expect(state.highlight).toBe(17);
  });

  it('keeps the light on when the player grabs mid-move, and says so', async () => {
    const { commands, controls, element, state } = setup();
    const pending = commands.faceRegion(17);
    await runFrames(controls, clock, 500);
    element.dispatch('pointerdown');
    const result = await pending;
    element.dispatch('pointerup');
    expect(result.ok).toBe(false);
    expect(state.highlight).toBe(17);
    expect(result.did).toMatch(/light|highlight/i);
  });

  it('changes nothing for a rejected id', async () => {
    const { commands, state, settle } = setup();
    commands.highlightRegion(3);
    await settle(commands.faceRegion(99));
    expect(state.highlight).toBe(3);
  });
});

describe('C19: scene commands act only in Study mode', () => {
  const SCENE_CALLS = [
    ['faceRegion', (c) => c.faceRegion(6)],
    ['rotateTo', (c) => c.rotateTo('posterior')],
    ['highlightRegion', (c) => c.highlightRegion(9)],
    ['clearHighlight', (c) => c.clearHighlight()],
    ['setColourRegions', (c) => c.setColourRegions(true)],
    ['setAnnotations', (c) => c.setAnnotations(true)],
  ];

  it.each(SCENE_CALLS)('%s refuses outside Study mode and changes nothing', async (_name, call) => {
    const { commands, controls, state, settle } = setup();
    commands.highlightRegion(3);
    state.mode = 'game';
    const before = controls.orientGroup.quaternion.clone();

    const result = await settle(call(commands));
    expectResultShape(result);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/study/i);
    expect(state).toMatchObject({ highlight: 3, colourRegions: false, annotations: false });
    expect(controls.orientGroup.quaternion.angleTo(before)).toBeLessThan(1e-6);
  });

  it('still answers lookups, the region list and scene state outside Study mode', () => {
    const { commands, state } = setup();
    state.mode = 'game';
    expect(commands.lookupRegion({ regionId: 6 }).ok).toBe(true);
    expect(commands.listRegions().ok).toBe(true);
    expect(commands.getSceneState()).toMatchObject({ ok: true, mode: 'game' });
  });
});

describe('C20: numeric strings are read as ids', () => {
  it("faceRegion('6') behaves like faceRegion(6)", async () => {
    const { commands, controls, state, settle } = setup();
    const result = await settle(commands.faceRegion('6'));
    expect(result.ok).toBe(true);
    expect(facing(controls, regionGeometry.regions['6'].centroidLeft)).toBeGreaterThan(0.99);
    expect(state.highlight).toBe(6);
  });

  it("highlightRegion('6') behaves like highlightRegion(6)", () => {
    const { commands, state } = setup();
    expect(commands.highlightRegion('6').ok).toBe(true);
    expect(state.highlight).toBe(6);
    expect(commands.getSceneState().highlightedRegion).toBe(6);
  });

  it.each(['2.5', 'six'])('%j still fails with the valid range', async (value) => {
    const { commands, controls, state, settle } = setup();
    const before = controls.orientGroup.quaternion.clone();
    for (const result of [await settle(commands.faceRegion(value)), commands.highlightRegion(value)]) {
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/1/);
      expect(result.reason).toMatch(/20/);
    }
    expect(state.highlight).toBeNull();
    expect(controls.orientGroup.quaternion.angleTo(before)).toBeLessThan(1e-6);
  });
});

describe('C21: a move replaced by a later one says so', () => {
  it.each([
    ['faceRegion', (c) => c.faceRegion(17), (c) => c.rotateTo('anterior')],
    ['rotateTo', (c) => c.rotateTo('posterior'), (c) => c.faceRegion(1)],
  ])('a %s replaced mid-move resolves ok: false as replaced, not as the user', async (_name, first, second) => {
    const { commands, controls, settle } = setup();
    const pending = first(commands);
    await runFrames(controls, clock, 400);
    const later = second(commands);
    const result = await pending;
    expectResultShape(result);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/replaced/i);
    expect(result.reason).not.toMatch(/user/i);
    expect((await settle(later)).ok).toBe(true);
    expect(commands.getSceneState().interrupted).toBeNull();
  });
});

describe('C22: guide and player share the brain like an agent and a user share a cursor', () => {
  const QUIET_MS = 2000;

  async function grabDragRelease(element) {
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    element.dispatch('pointermove', { clientX: 460, clientY: 300 });
    element.dispatch('pointerup', { clientX: 460, clientY: 300 });
    await flushMicrotasks();
  }

  it('starts with the brain free for the guide', () => {
    const { commands } = setup();
    expect(commands.getSceneState().control).toBe('guide_free');
  });

  it('reports guide_moving during a guide move, then guide_free', async () => {
    const { commands, controlChanges, settle } = setup();
    const pending = commands.rotateTo('posterior');
    expect(commands.getSceneState().control).toBe('guide_moving');
    await settle(pending);
    expect(commands.getSceneState().control).toBe('guide_free');
    expect(controlChanges).toEqual(['guide_moving', 'guide_free']);
  });

  it('reports player_holding while held and player_exploring after letting go', async () => {
    const { commands, element } = setup();
    element.dispatch('pointerdown');
    expect(commands.getSceneState().control).toBe('player_holding');
    element.dispatch('pointermove', { clientX: 460, clientY: 300 });
    element.dispatch('pointerup', { clientX: 460, clientY: 300 });
    expect(commands.getSceneState().control).toBe('player_exploring');
  });

  it('returns control 2 s after the last input', async () => {
    const { commands, element, timers, endQuietPeriod } = setup();
    await grabDragRelease(element);
    expect(timers.filter((t) => !t.cleared).map((t) => t.ms)).toEqual([QUIET_MS]);
    endQuietPeriod();
    expect(commands.getSceneState().control).toBe('guide_free');
  });

  it('refuses guide moves while the player is still exploring, with a plain reason', async () => {
    const { commands, controls, element, settle } = setup();
    await grabDragRelease(element);
    const before = controls.orientGroup.quaternion.clone();
    for (const result of [await settle(commands.faceRegion(17)), await settle(commands.rotateTo('superior'))]) {
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/exploring/i);
    }
    expect(controls.orientGroup.quaternion.angleTo(before)).toBeLessThan(1e-6);
  });

  it.each([
    ['a new grab', (element) => { element.dispatch('pointerdown'); element.dispatch('pointerup'); }],
    ['a drag', (element) => { element.dispatch('pointerdown'); element.dispatch('pointermove', { clientX: 300, clientY: 300 }); element.dispatch('pointerup', { clientX: 300, clientY: 300 }); }],
    ['a zoom', (element) => element.dispatch('wheel', { deltaY: 80 })],
  ])('restarts the clock on %s', async (_label, input) => {
    const { commands, element, timers } = setup();
    await grabDragRelease(element);
    const first = timers.length - 1;
    input(element);
    expect(timers[first].cleared).toBe(true);
    expect(timers.at(-1)).toMatchObject({ ms: QUIET_MS, cleared: false });
    expect(commands.getSceneState().control).toBe('player_exploring');
  });

  it('never counts a hover', async () => {
    const { commands, element, timers } = setup();
    element.dispatch('pointermove', { clientX: 420, clientY: 310 });
    expect(commands.getSceneState().control).toBe('guide_free');
    expect(timers).toHaveLength(0);
  });

  it('sends one handoff when the brain is free, not a release and a handoff', async () => {
    const { element, interactions, endQuietPeriod } = setup();
    await grabDragRelease(element);
    element.dispatch('wheel', { deltaY: 50 });
    endQuietPeriod();
    expect(interactions.map(({ type }) => type)).toEqual(['grab', 'handoff']);
  });

  it('frees the brain at once after a plain click, with no quiet period and no handoff', async () => {
    const { commands, element, interactions, timers } = setup();
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    element.dispatch('pointerup', { clientX: 401, clientY: 300 });
    expect(commands.getSceneState().control).toBe('guide_free');
    expect(timers.filter((t) => !t.cleared)).toHaveLength(0);
    expect(interactions).toEqual([]);
  });

  it('lets a zoom ride along with a guide turn without cancelling it, then waits out the quiet period', async () => {
    const { commands, controls, element, settle, endQuietPeriod } = setup();
    const pending = commands.rotateTo('posterior');
    await runFrames(controls, clock, 400);
    element.dispatch('wheel', { deltaY: 80 });
    const result = await settle(pending);
    expect(result.ok).toBe(true);
    expect(commands.getSceneState().control).toBe('player_exploring');
    endQuietPeriod();
    expect(commands.getSceneState().control).toBe('guide_free');
  });

  it('never moves the brain by itself when control returns', async () => {
    const { commands, controls, element, endQuietPeriod } = setup();
    const pending = commands.faceRegion(17);
    await runFrames(controls, clock, 400);
    element.dispatch('pointerdown');
    await pending;
    element.dispatch('pointermove', { clientX: 460, clientY: 300 });
    element.dispatch('pointerup', { clientX: 460, clientY: 300 });
    await runFrames(controls, clock, 300); // let the drag's own smoothing finish
    const settledByPlayer = controls.orientGroup.quaternion.clone();
    endQuietPeriod();
    await runFrames(controls, clock, 1500);
    expect(controls.isMoving).toBe(false);
    expect(controls.orientGroup.quaternion.angleTo(settledByPlayer)).toBeLessThan(1e-6);
  });
});

describe('C23: the took-hold message waits 250 ms; the stop does not', () => {
  // Kyle: a click must not read to the guide as a grab. Motion stops on the
  // press, locally; only the message waits to see if the press is a click.
  it('stops a guide move on the press itself', async () => {
    const { commands, controls, element } = setup();
    const pending = commands.faceRegion(17);
    await runFrames(controls, clock, 400);
    element.dispatch('pointerdown');
    expect(controls.isMoving).toBe(false);
    expect(commands.getSceneState().control).toBe('player_holding');
    expect((await pending).ok).toBe(false);
    element.dispatch('pointerup');
  });

  it('sends nothing for a click: the region click is reported on its own', async () => {
    const { element, interactions, timers } = setup();
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    expect(timers.filter((t) => !t.cleared).map((t) => t.ms)).toEqual([250]);
    element.dispatch('pointerup', { clientX: 401, clientY: 300 });
    expect(timers.every((t) => t.cleared)).toBe(true);
    expect(interactions).toEqual([]);
  });

  it('announces a press held past 250 ms, with what it interrupted', async () => {
    const { commands, controls, element, interactions, holdPastDebounce } = setup();
    const pending = commands.rotateTo('anterior');
    await runFrames(controls, clock, 300);
    element.dispatch('pointerdown');
    await pending;
    expect(interactions).toEqual([]);
    holdPastDebounce();
    expect(interactions).toEqual([{ type: 'grab', interrupted: { command: 'rotateTo', view: 'anterior' } }]);
    element.dispatch('pointerup');
  });

  it('announces a quick drag when it ends, then hands back after the quiet period', async () => {
    const { element, interactions, endQuietPeriod } = setup();
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    element.dispatch('pointermove', { clientX: 470, clientY: 300 });
    element.dispatch('pointerup', { clientX: 470, clientY: 300 });
    expect(interactions.map(({ type }) => type)).toEqual(['grab']);
    endQuietPeriod();
    expect(interactions.map(({ type }) => type)).toEqual(['grab', 'handoff']);
  });

  it('never announces the same press twice', async () => {
    const { element, interactions, holdPastDebounce, endQuietPeriod } = setup();
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    holdPastDebounce();
    element.dispatch('pointermove', { clientX: 470, clientY: 300 });
    element.dispatch('pointerup', { clientX: 470, clientY: 300 });
    endQuietPeriod();
    expect(interactions.map(({ type }) => type)).toEqual(['grab', 'handoff']);
  });
});

describe('C: every command reports truthfully', () => {
  it('exposes exactly the nine contract commands', () => {
    const { commands } = setup();
    expect(Object.keys(commands).sort()).toEqual(
      [
        'clearHighlight',
        'faceRegion',
        'getSceneState',
        'highlightRegion',
        'listRegions',
        'lookupRegion',
        'rotateTo',
        'setAnnotations',
        'setColourRegions',
      ].sort()
    );
    expect(VIEWS).toEqual(ALL_VIEWS);
  });
});

describe('M2: faceRegion works in specimen space', () => {
  // The adapter maps generated region geometry into the space the specimen is
  // drawn in (the painted model carries a source rotation). Facing must use it.
  it('faces the region where the adapter says it is drawn', async () => {
    const { adapter, controls } = createFakeSceneAdapter();
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6);
    const pivot = adapter.getPivot();
    adapter.toSpecimenSpace = (point) =>
      new THREE.Vector3(point[0] - pivot[0], point[1] - pivot[1], point[2] - pivot[2]).applyQuaternion(tilt);
    const commands = createSceneCommands(adapter);

    const pending = commands.faceRegion(11, { hemisphere: 'left' });
    await runFrames(controls, clock, MOVE_SETTLE_MS);
    expect((await pending).ok).toBe(true);

    const drawn = adapter.toSpecimenSpace(regionGeometry.regions['11'].centroidLeft).normalize();
    expect(drawn.applyQuaternion(controls.orientGroup.quaternion).dot(toCameraDirection(controls))).toBeGreaterThan(0.99);
  });

  it('fails truthfully before the specimen has loaded', async () => {
    const { adapter, controls, state } = createFakeSceneAdapter();
    adapter.toSpecimenSpace = () => null;
    const commands = createSceneCommands(adapter);
    const before = controls.orientGroup.quaternion.clone();

    const pending = commands.faceRegion(11);
    await runFrames(controls, clock, MOVE_SETTLE_MS);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/loaded/i);
    expect(state.highlight).toBeNull();
    expect(controls.orientGroup.quaternion.angleTo(before)).toBeLessThan(1e-6);
  });
});

describe('M4: moves stopped by the page say why', () => {
  it.each([
    ['hidden', /hidden/i],
    ['timeout', /too long/i],
  ])('a move cancelled for %s resolves ok: false with a plain reason', async (reason, pattern) => {
    const { commands, controls } = setup();
    const pending = commands.faceRegion(17);
    await runFrames(controls, clock, 400);
    controls.cancelMove(reason);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(pattern);
    expect(result.reason).not.toMatch(/user/i);
  });
});
