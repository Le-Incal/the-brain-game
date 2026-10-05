import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createControls, installFakeClock, runFrames } from '../test/voiceHarness.js';
import { createSceneCommands } from './sceneCommands.js';

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
function createStubScene({ loaded = true } = {}) {
  const { controls, element } = createControls();
  let voiceHighlight = null;
  return {
    element,
    controls,
    setVoiceHighlight(regionId) {
      voiceHighlight = regionId;
    },
    getVoiceHighlight: () => voiceHighlight,
    toSpecimenSpace: (point) => (loaded ? new THREE.Vector3(...point) : null),
  };
}

// Colour and labels live in App state so the on-screen toggles stay in sync.
function createAppState(mode = 'study') {
  const app = { mode, colorMode: false, showLabels: false };
  return {
    app,
    callbacks: {
      getMode: () => app.mode,
      getColourRegions: () => app.colorMode,
      setColourRegions: (value) => (app.colorMode = value),
      getAnnotations: () => app.showLabels,
      setAnnotations: (value) => (app.showLabels = value),
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

  it('routes colour and labels through App state, not around it', () => {
    const scene = createStubScene();
    const { app, callbacks } = createAppState();
    const adapter = createBrainSceneAdapter({ scene, ...callbacks });

    adapter.setColourRegions(true);
    adapter.setAnnotations(true);
    expect(app).toMatchObject({ colorMode: true, showLabels: true });
    app.colorMode = false;
    expect(adapter.getColourRegions()).toBe(false);
    expect(adapter.getAnnotations()).toBe(true);
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
