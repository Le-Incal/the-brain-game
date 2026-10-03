import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  const commands = createSceneCommands(harness.adapter, {
    onUserInteraction: (event) => interactions.push(event),
  });
  async function settle(promise) {
    await runFrames(harness.controls, clock, MOVE_SETTLE_MS);
    return promise;
  }
  return { ...harness, commands, settle, interactions };
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
    state.mode = 'game';
    commands.clearHighlight();
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
  it('tells the guide when the player grabs and releases with no move running', async () => {
    const { commands, element, interactions } = setup();
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    expect(interactions).toEqual([{ type: 'grab', interrupted: null }]);
    expect(commands.getSceneState().userHolding).toBe(true);

    element.dispatch('pointerup', { clientX: 400, clientY: 300 });
    const scene = commands.getSceneState();
    expect(interactions[1]).toEqual({ type: 'release', view: scene.view, viewExact: scene.viewExact });
    expect(scene.userHolding).toBe(false);
  });

  it('bookmarks the move a grab interrupted', async () => {
    const { commands, controls, element, interactions } = setup();
    const pending = commands.faceRegion(6, { hemisphere: 'right' });
    await runFrames(controls, clock, 500);
    element.dispatch('pointerdown');
    await flushMicrotasks();

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
    const { commands, controls, element, settle } = setup();
    const pending = commands.faceRegion(17);
    await runFrames(controls, clock, 500);
    element.dispatch('pointerdown');
    await pending;
    element.dispatch('pointerup');
    expect(commands.getSceneState().interrupted).not.toBeNull();

    await settle(commands.faceRegion(17));
    expect(commands.getSceneState().interrupted).toBeNull();
  });

  it('starts with nothing interrupted and nobody holding', () => {
    const { commands } = setup();
    expect(commands.getSceneState()).toMatchObject({ userHolding: false, interrupted: null });
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
