import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createControls, installFakeClock, runFrames } from '../test/voiceHarness.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import regionGeometry from '../data/regionGeometry.json';
import { createSceneCommands } from './sceneCommands.js';
import { VIEW_AXES } from './orientation.js';

const specimenSpaceModule = await import('../utils/specimenSpace.js').catch(() => ({}));
const { createSpecimenSpace } = specimenSpaceModule;

const adapterModule = await import('./brainSceneAdapter.js').catch(() => ({}));
const { createBrainSceneAdapter } = adapterModule;

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

// Stands in for BrainScene: the real controls plus the few methods the adapter
// needs, so the wiring is tested without WebGL.
function createStubScene({ loaded = true, space = null } = {}) {
  const { controls, element } = createControls();
  let voiceHighlight = null;
  const selectionCleared = [];
  return {
    element,
    controls,
    selectionCleared,
    clearSelection: () => selectionCleared.push(true),
    setVoiceHighlight(regionId) {
      voiceHighlight = regionId;
    },
    getVoiceHighlight: () => voiceHighlight,
    toSpecimenSpace: (point) => (!loaded ? null : space ? space.toSpecimenSpace(point) : new THREE.Vector3(...point)),
    toSpecimenDirection: (direction) =>
      !loaded ? null : space ? space.toSpecimenDirection(direction) : new THREE.Vector3(...direction).normalize(),
  };
}

// The painted master's real source transform, so the adapter is tested against
// the ~8 degree rotation the scene actually draws with.
function realModelSpace() {
  const path = fileURLToPath(new URL('../../public/brain.glb', import.meta.url));
  const buffer = readFileSync(path);
  const document = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'));
  const node = document.nodes[document.scenes[0].nodes[0]];
  const sourceMatrix = new THREE.Matrix4()
    .compose(
      new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
      new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
      new THREE.Vector3(1, 1, 1)
    )
    .toArray();
  return createSpecimenSpace({
    normalization: { center: [0, 0.2, 0], maxDim: 9.5, sourceMatrix },
    scale: 1.278,
    pivot: new THREE.Vector3(0, 0.02, -0.01),
  });
}

// Colour lives in App state so the on-screen toggle stays in sync.
function createAppState(mode = 'study') {
  const app = { mode, colorMode: false };
  return {
    app,
    callbacks: {
      getMode: () => app.mode,
      getColourRegions: () => app.colorMode,
      setColourRegions: (value) => (app.colorMode = value),
    },
  };
}

describe('M2: BrainScene adapter', () => {
  it('drives the scene controls and the persistent voice highlight', () => {
    const scene = createStubScene();
    const { callbacks } = createAppState();
    const adapter = createBrainSceneAdapter({ scene, ...callbacks });

    expect(adapter.controls).toBe(scene.controls);
    adapter.setHighlight(9);
    expect(scene.getVoiceHighlight()).toBe(9);
    expect(adapter.getHighlight()).toBe(9);
    adapter.setHighlight(null);
    expect(adapter.getHighlight()).toBeNull();
  });

  it('routes colour through App state, not around it, and has no annotations', () => {
    const scene = createStubScene();
    const { app, callbacks } = createAppState();
    const adapter = createBrainSceneAdapter({ scene, ...callbacks });

    adapter.setColourRegions(true);
    expect(app).toMatchObject({ colorMode: true });
    app.colorMode = false;
    expect(adapter.getColourRegions()).toBe(false);
    expect(adapter).not.toHaveProperty('setAnnotations');
    expect(adapter).not.toHaveProperty('getAnnotations');
  });

  it('reports the mode App is in', () => {
    const scene = createStubScene();
    const { app, callbacks } = createAppState('game');
    const adapter = createBrainSceneAdapter({ scene, ...callbacks });
    expect(adapter.getMode()).toBe('game');
    app.mode = 'study';
    expect(adapter.getMode()).toBe('study');
  });

  it('maps region geometry into specimen space through the scene', () => {
    const scene = createStubScene();
    const { callbacks } = createAppState();
    const adapter = createBrainSceneAdapter({ scene, ...callbacks });
    expect(adapter.toSpecimenSpace([1, 2, 3]).toArray()).toEqual([1, 2, 3]);
  });

  it('clears the guide highlight when the player leaves Study mode', () => {
    const scene = createStubScene();
    const { callbacks } = createAppState();
    const adapter = createBrainSceneAdapter({ scene, ...callbacks });
    adapter.setHighlight(4);
    adapter.resetForGame();
    expect(scene.getVoiceHighlight()).toBeNull();
  });

  it('lets the scene commands run end to end against it', async () => {
    const scene = createStubScene();
    const { callbacks } = createAppState();
    const commands = createSceneCommands(createBrainSceneAdapter({ scene, ...callbacks }));
    const pending = commands.faceRegion(17);
    await runFrames(scene.controls, clock, 1500);
    expect((await pending).ok).toBe(true);
    expect(scene.getVoiceHighlight()).toBe(17);
    expect(commands.setColourRegions('true').ok).toBe(true);
    expect(commands.getSceneState()).toMatchObject({ colourRegions: true, highlightedRegion: 17, mode: 'study' });
  });
});

describe('M2 addition: views use converted axes through the real adapter', () => {
  function setupReal() {
    const scene = createStubScene({ space: realModelSpace() });
    const { callbacks } = createAppState();
    const adapter = createBrainSceneAdapter({ scene, ...callbacks });
    return { scene, adapter, commands: createSceneCommands(adapter) };
  }

  function toCamera(controls) {
    const { camera, target } = controls;
    return camera.position.clone().sub(new THREE.Vector3(target.x, target.y, target.z)).normalize();
  }

  it('passes direction conversion through from the scene', () => {
    const { adapter } = setupReal();
    const converted = adapter.toSpecimenDirection([1, 0, 0]);
    expect(converted.length()).toBeCloseTo(1, 9);
    expect(converted.angleTo(new THREE.Vector3(1, 0, 0))).toBeGreaterThan(THREE.MathUtils.degToRad(3));
  });

  it.each(Object.keys(VIEW_AXES))('rotateTo(%s) turns the converted axis toward the camera', async (view) => {
    const { scene, adapter, commands } = setupReal();
    const pending = commands.rotateTo(view);
    await runFrames(scene.controls, clock, 1500);
    expect((await pending).ok).toBe(true);
    const axis = adapter.toSpecimenDirection(VIEW_AXES[view]).applyQuaternion(scene.controls.orientGroup.quaternion);
    expect(axis.dot(toCamera(scene.controls))).toBeGreaterThan(0.99);
    expect(commands.getSceneState()).toMatchObject({ view, viewExact: true });
  });

  it('still reports the untouched home view as left_lateral, not exact', () => {
    const { commands } = setupReal();
    expect(commands.getSceneState()).toMatchObject({ view: 'left_lateral', viewExact: false });
  });

  it('faces a region where the real transform draws it', async () => {
    const { scene, adapter, commands } = setupReal();
    const pending = commands.faceRegion(6);
    await runFrames(scene.controls, clock, 1500);
    expect((await pending).ok).toBe(true);
    const drawn = adapter.toSpecimenSpace(regionGeometry.regions['6'].centroidLeft).normalize();
    expect(drawn.applyQuaternion(scene.controls.orientGroup.quaternion).dot(toCamera(scene.controls))).toBeGreaterThan(0.99);
  });
});

describe('One focus at a time (after the first live run)', () => {
  it("a guide highlight clears the player's selection and its description", () => {
    const scene = createStubScene();
    const adapter = createBrainSceneAdapter({ scene, ...createAppState().callbacks });
    adapter.setHighlight(5);
    expect(scene.selectionCleared).toHaveLength(1);
    expect(scene.getVoiceHighlight()).toBe(5);
  });

  it("clearing the guide's highlight leaves the player's selection alone", () => {
    const scene = createStubScene();
    const adapter = createBrainSceneAdapter({ scene, ...createAppState().callbacks });
    adapter.setHighlight(null);
    expect(scene.selectionCleared).toHaveLength(0);
  });

  it("a player click clears the guide's highlight", () => {
    const scene = createStubScene();
    const adapter = createBrainSceneAdapter({ scene, ...createAppState().callbacks });
    adapter.setHighlight(5);
    adapter.playerSelected(12);
    expect(scene.getVoiceHighlight()).toBeNull();
  });

  it("a click that deselects leaves the guide's highlight alone", () => {
    const scene = createStubScene();
    const adapter = createBrainSceneAdapter({ scene, ...createAppState().callbacks });
    adapter.setHighlight(5);
    adapter.playerSelected(null);
    expect(scene.getVoiceHighlight()).toBe(5);
  });
});


describe('The guide focus reaches the left panel and the two-level light', () => {
  function adapterWithFocus() {
    const calls = [];
    const focus = [];
    const scene = {
      controls: {},
      clearSelection: () => calls.push(['clearSelection']),
      setVoiceHighlight: (ids, options) => calls.push(['setVoiceHighlight', ids, options]),
      getVoiceHighlight: () => null,
      toSpecimenSpace: () => null,
      toSpecimenDirection: () => null,
    };
    const adapter = createBrainSceneAdapter({
      scene,
      getMode: () => 'study',
      getColourRegions: () => true,
      setColourRegions: () => {},
      onGuideFocus: (entry) => focus.push(entry),
    });
    return { adapter, calls, focus };
  }

  it('passes the focus to the scene, so a lobe washes and the named region stands out', () => {
    const { adapter, calls } = adapterWithFocus();
    adapter.setHighlight([1, 2, 3, 4, 5, 6], { focus: [6] });
    expect(calls).toContainEqual(['setVoiceHighlight', [1, 2, 3, 4, 5, 6], { focus: [6] }]);
  });

  it('tells the panel what the guide is showing, and clears it with the light', () => {
    const { adapter, focus } = adapterWithFocus();
    adapter.setHighlight(6);
    adapter.setHighlight([1, 2, 3, 4, 5, 6]);
    adapter.setHighlight([1, 2, 3, 4, 5, 6], { focus: [5] });
    adapter.setHighlight(null);
    expect(focus.map((entry) => entry && (entry.kind === 'lobe' ? entry.lobe : entry.id))).toEqual([6, 'Frontal Lobe', 5, null]);
  });

  it('a player click clears the guide focus (one focus at a time), and so does leaving Study', () => {
    const { adapter, focus } = adapterWithFocus();
    adapter.setHighlight(6);
    adapter.playerSelected(11);
    adapter.setHighlight(6);
    adapter.resetForGame();
    expect(focus).toEqual([expect.objectContaining({ id: 6 }), null, expect.objectContaining({ id: 6 }), null]);
  });
});
