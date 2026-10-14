import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import brainRegions from '../data/brainRegions.json';
import regionGeometry from '../data/regionGeometry.json';
import { createSceneCommands } from './sceneCommands.js';
import { createFakeSceneAdapter, installFakeClock, runFrames, screenUpDirection, toCameraDirection } from '../test/voiceHarness.js';

const sceneModule = await import('./sceneCommands.js');
const { BRAIN_STEM_VIEW_TILT_DEGREES, FOLLOW_TURN_MIN_INTERVAL_MS } = sceneModule;

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

const SETTLE_MS = 1500;
const regionsOf = (lobe) => brainRegions.divisions.find(({ name }) => name === lobe).regions;
const region = (id) => ({ kind: 'region', id });
const lobe = (name) => ({ kind: 'lobe', lobe: name });

function setup() {
  const harness = createFakeSceneAdapter();
  const commands = createSceneCommands(harness.adapter, {
    setTimeoutImpl: () => 0,
    clearTimeoutImpl: () => {},
  });
  const settle = async (promise, ms = SETTLE_MS) => {
    await runFrames(harness.controls, clock, ms);
    return promise;
  };
  return { ...harness, commands, settle };
}

// How squarely a region faces the viewer: its centroid's direction from the
// specimen's centre against the direction to the camera (1 is head-on).
function facingScore({ adapter, controls }, id) {
  const geometry = regionGeometry.regions[String(id)];
  const toCamera = toCameraDirection(controls);
  return Math.max(
    ...['centroidLeft', 'centroidRight'].map((key) =>
      adapter.toSpecimenSpace(geometry[key]).normalize().applyQuaternion(controls.orientGroup.quaternion).dot(toCamera)
    )
  );
}

// Follow the words: when the guide names a region or lobe, the app lights it,
// and turns to it if it cannot be seen and the brain is free.
describe('Following a spoken name', () => {
  it('keeps the agent contract at thirteen commands', () => {
    const { commands } = setup();
    expect(Object.keys(commands)).toHaveLength(13);
    expect(typeof commands.followName).toBe('function');
  });

  it('lights a region that is already in view, without moving', async () => {
    const harness = setup();
    const { commands, state, controls, settle } = harness;
    await settle(commands.rotateTo('left_lateral'));
    const before = controls.orientGroup.quaternion.clone();
    const result = await settle(commands.followName(region(11)));
    expect(result).toMatchObject({ did: 'lit' });
    expect(state.highlight).toBe(11);
    expect(state.focus).toBeNull();
    expect(controls.orientGroup.quaternion.angleTo(before)).toBeLessThan(1e-6);
  });

  it('turns to a region out of view and lights it', async () => {
    const harness = setup();
    const { commands, state, settle } = harness;
    await settle(commands.rotateTo('left_lateral'));
    expect(facingScore(harness, 17)).toBeLessThan(0.5);
    const result = await settle(commands.followName(region(17)));
    expect(result).toMatchObject({ did: 'turned' });
    expect(state.highlight).toBe(17);
    expect(facingScore(harness, 17)).toBeGreaterThan(0.9);
  });

  it('lights a whole lobe when a lobe is named', async () => {
    const { commands, state, settle } = setup();
    await settle(commands.rotateTo('left_lateral'));
    const result = await settle(commands.followName(lobe('Temporal Lobe')));
    expect(['lit', 'turned']).toContain(result.did);
    expect(state.highlight).toEqual(regionsOf('Temporal Lobe'));
  });

  it('turns at most once every 2.5 s; a name in between only lights', async () => {
    expect(FOLLOW_TURN_MIN_INTERVAL_MS).toBe(2500);
    const { commands, state, settle } = setup();
    await settle(commands.rotateTo('left_lateral'));
    expect((await settle(commands.followName(region(17)))).did).toBe('turned');
    const quick = await settle(commands.followName(region(1)), 500);
    expect(quick.did).toBe('lit');
    expect(state.highlight).toBe(1);
    // 2 s after the first turn began; 1 s more and a turn is allowed again.
    await settle(Promise.resolve(), 1000);
    expect((await settle(commands.followName(region(15)))).did).toBe('turned');
  });

  it('never turns while the player holds or explores the brain, but still lights', async () => {
    const { commands, state, element, settle } = setup();
    await settle(commands.rotateTo('left_lateral'));
    element.dispatch('pointerdown');
    const held = await settle(commands.followName(region(17)), 100);
    element.dispatch('pointerup');
    expect(held.did).toBe('lit');
    expect(state.highlight).toBe(17);
  });

  it('does not interrupt a move the guide asked for; it only lights', async () => {
    const { commands, state, controls, settle } = setup();
    const turning = commands.rotateTo('anterior');
    await runFrames(controls, clock, 300);
    const result = await commands.followName(region(17));
    expect(result.did).toBe('lit');
    expect((await settle(turning)).ok).toBe(true);
    expect(state.highlight).toBe(17);
  });

  it('skips a name already lit, and does nothing outside Study mode', async () => {
    const { commands, state, settle } = setup();
    await settle(commands.followName(region(11)));
    expect((await settle(commands.followName(region(11)))).did).toBe('skipped');
    state.mode = 'game';
    state.highlight = null;
    expect((await settle(commands.followName(region(6)))).did).toBe('skipped');
    expect(state.highlight).toBeNull();
  });
});

// Kyle, 2026-10-13: "talks around the green strip but shows the red orange
// primary motor cortex". Regions the guide looked up or showed in answer to
// the visitor are its subject until the visitor's next turn: following its
// words lights them, never a neighbour it names in passing.
describe('Following names keeps to the subject the guide chose', () => {
  it('after showing a region, a neighbour named in passing does not replace it', async () => {
    const { commands, state, settle } = setup();
    await settle(commands.faceRegion(7));
    expect(state.highlight).toBe(7);
    expect((await settle(commands.followName(region(5)))).did).toBe('skipped');
    expect((await settle(commands.followName(lobe('Frontal Lobe')))).did).toBe('skipped');
    expect(state.highlight).toBe(7);
  });

  it('after looking a region up, its name lights and a neighbour\'s does not', async () => {
    const { commands, state, settle } = setup();
    expect(commands.lookupRegion({ name: 'the yellow spot on top' }).region.id).toBe(4);
    expect(['lit', 'turned']).toContain((await settle(commands.followName(region(4)))).did);
    expect((await settle(commands.followName(region(5)))).did).toBe('skipped');
    expect(state.highlight).toBe(4);
  });

  it('within a lobe the guide showed, names its regions on top of it', async () => {
    const { commands, state, settle } = setup();
    await settle(commands.faceLobe('Frontal Lobe'));
    expect(['lit', 'turned']).toContain((await settle(commands.followName(region(4)))).did);
    // As at a tour stop: the lobe stays lit and the named region stands out on top.
    expect(state.highlight).toEqual(regionsOf('Frontal Lobe'));
    expect(state.focus).toEqual([4]);
    expect((await settle(commands.followName(region(7)))).did).toBe('skipped');
  });

  it("follows every name again from the visitor's next turn", async () => {
    const { commands, state, settle } = setup();
    await settle(commands.faceRegion(7));
    commands.visitorTurn();
    expect(['lit', 'turned']).toContain((await settle(commands.followName(region(5)))).did);
    expect(state.highlight).toBe(5);
  });

  it('follows every name again once the guide clears the highlight', async () => {
    const { commands, state, settle } = setup();
    await settle(commands.faceRegion(7));
    commands.clearHighlight();
    expect(['lit', 'turned']).toContain((await settle(commands.followName(region(5)))).did);
    expect(state.highlight).toBe(5);
  });

  it('follows every name when the guide used no tool since the visitor spoke', async () => {
    const { commands, state, settle } = setup();
    await settle(commands.followName(region(4)));
    await settle(commands.followName(region(5)));
    expect(state.highlight).toBe(5);
  });

  it('keeps visitorTurn off the agent contract', () => {
    const { commands } = setup();
    expect(Object.keys(commands)).not.toContain('visitorTurn');
    expect(typeof commands.visitorTurn).toBe('function');
  });
});

describe('Following names during a tour stop', () => {
  async function atFrontalStop() {
    const harness = setup();
    await harness.settle(harness.commands.startTour());
    await harness.settle(harness.commands.nextTourStop());
    return harness;
  }

  it('keeps the lobe lit and gives the named region full emphasis on top', async () => {
    const { commands, state, settle } = await atFrontalStop();
    const result = await settle(commands.followName(region(6)));
    expect(['lit', 'turned']).toContain(result.did);
    expect(state.highlight).toEqual(regionsOf('Frontal Lobe'));
    expect(state.focus).toEqual([6]);
  });

  it('ignores regions and lobes outside the current stop', async () => {
    const { commands, state, settle } = await atFrontalStop();
    expect((await settle(commands.followName(region(17)))).did).toBe('skipped');
    expect((await settle(commands.followName(lobe('Temporal Lobe')))).did).toBe('skipped');
    expect(state.highlight).toEqual(regionsOf('Frontal Lobe'));
    expect(state.focus).toBeNull();
  });

  it('follows every name again once the tour has ended', async () => {
    const { commands, state, settle } = await atFrontalStop();
    await settle(commands.endTour());
    await settle(commands.followName(region(17)));
    expect(state.highlight).toBe(17);
    expect(state.focus).toBeNull();
  });
});

describe('The brain stem is shown from the front right, tilted up', () => {
  // Kyle: from below the brain stem is hard to see.
  const tilt = () => THREE.MathUtils.degToRad(BRAIN_STEM_VIEW_TILT_DEGREES);
  // Toward the viewer: anterior and anatomical right (-x), and a little inferior.
  const frontRightUp = () =>
    new THREE.Vector3(-Math.SQRT1_2 * Math.cos(tilt()), -Math.sin(tilt()), Math.SQRT1_2 * Math.cos(tilt())).normalize();

  it('tilts about 15 degrees', () => {
    expect(BRAIN_STEM_VIEW_TILT_DEGREES).toBe(15);
  });

  it.each([
    ['face_region 20', (commands) => commands.faceRegion(20)],
    ['the Brain Stem tour stop (face_lobe)', (commands) => commands.faceLobe('Brain Stem')],
  ])('%s turns the front-right, tilted-up view toward the viewer', async (_label, act) => {
    const harness = setup();
    const result = await harness.settle(act(harness.commands));
    expect(result.ok).toBe(true);
    const facing = frontRightUp().applyQuaternion(harness.controls.orientGroup.quaternion);
    expect(facing.dot(toCameraDirection(harness.controls))).toBeGreaterThan(0.99);
    // Superior stays up on screen.
    const superior = new THREE.Vector3(0, 1, 0).applyQuaternion(harness.controls.orientGroup.quaternion);
    expect(superior.dot(screenUpDirection(harness.controls))).toBeGreaterThan(0.95);
  });

  it('shows more of the brain stem than the plain front or side views', async () => {
    const harness = setup();
    const scores = {};
    for (const view of ['anterior', 'right_lateral']) {
      await harness.settle(harness.commands.rotateTo(view));
      scores[view] = facingScore(harness, 20);
    }
    await harness.settle(harness.commands.faceRegion(20));
    const stem = facingScore(harness, 20);
    expect(stem).toBeGreaterThan(0);
    expect(stem).toBeGreaterThan(scores.anterior);
    expect(stem).toBeGreaterThan(scores.right_lateral);
  });
});

// Kyle: a subregion Sylvi talked about flashed on and off. In the live run she
// called rotate_to_view mid-answer, and its safety net cleared the light her
// words had just set. A followed highlight now holds until the next followed
// name, a tool that lights something else, or the player.
describe('A followed highlight holds', () => {
  function counting(harness) {
    const calls = [];
    const original = harness.adapter.setHighlight;
    harness.adapter.setHighlight = (...args) => {
      calls.push(args);
      return original(...args);
    };
    return calls;
  }

  it('survives rotate_to_view', async () => {
    const { commands, state, settle } = setup();
    await settle(commands.followName(region(11)));
    expect((await settle(commands.rotateTo('posterior'))).ok).toBe(true);
    expect(state.highlight).toBe(11);
  });

  it('a region a tool lit is still cleared by rotate_to_view, as before', async () => {
    const { commands, state, settle } = setup();
    commands.highlightRegion(11);
    await settle(commands.rotateTo('posterior'));
    expect(state.highlight).toBeNull();
  });

  it('never goes out on its own, through 20 s of showcase, drift and stillness', async () => {
    const harness = setup();
    const { commands, state, controls } = harness;
    await harness.settle(commands.followName(region(17)));
    await runFrames(controls, clock, 20_000);
    expect(state.highlight).toBe(17);
  });

  it('naming the lit region again leaves the light alone', async () => {
    const harness = setup();
    const calls = counting(harness);
    await harness.settle(harness.commands.followName(region(11)));
    await harness.settle(harness.commands.followName(region(11)));
    expect(calls).toHaveLength(1);
  });

  it('naming the focused region again during a tour stop leaves it alone', async () => {
    const harness = setup();
    await harness.settle(harness.commands.startTour());
    await harness.settle(harness.commands.nextTourStop());
    const calls = counting(harness);
    await harness.settle(harness.commands.followName(region(6)));
    await harness.settle(harness.commands.followName(region(6)));
    expect(calls).toHaveLength(1);
    expect(harness.state.focus).toEqual([6]);
  });

  it('naming a region a tool already lit leaves it alone', async () => {
    const harness = setup();
    await harness.settle(harness.commands.faceRegion(17));
    const calls = counting(harness);
    expect((await harness.settle(harness.commands.followName(region(17)))).did).toBe('skipped');
    expect(calls).toHaveLength(0);
  });

  it('the next followed name replaces it', async () => {
    const { commands, state, settle } = setup();
    await settle(commands.followName(region(11)));
    await settle(commands.followName(region(12)));
    expect(state.highlight).toBe(12);
  });
});
