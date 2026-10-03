import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createControls, flushMicrotasks, FRAME_MS, installFakeClock, runFrames } from '../test/voiceHarness.js';

const MOVE_MS = 1200;

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

function quarterTurn() {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
}

function progress(start, current, target) {
  return current.angleTo(start) / target.angleTo(start);
}

describe('R2: with no command issued, update() is unchanged', () => {
  // Characterisation of the pre-M1 update(): auto-rotate premultiplies a
  // world-up spin, then the specimen slerps toward the target with an
  // exponential blend of rotationSmoothing over a delta clamped to 50 ms.
  function expectedOrientations({ autoRotate, frames, frameMs, start }) {
    const orientation = start.clone();
    const target = start.clone();
    const spin = new THREE.Quaternion();
    const results = [];
    for (let i = 0; i < frames; i += 1) {
      const deltaSeconds = Math.min(frameMs / 1000, 0.05);
      if (autoRotate) {
        spin.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.003);
        target.premultiply(spin).normalize();
      }
      orientation.slerp(target, 1 - Math.exp(-55 * deltaSeconds)).normalize();
      results.push(orientation.clone());
    }
    return results;
  }

  it.each([
    [true, FRAME_MS],
    [false, FRAME_MS],
    [true, 120],
  ])('autoRotate %s at %f ms frames', (autoRotate, frameMs) => {
    const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, -0.4, 0.1));
    const { controls, orientGroup } = createControls({ autoRotate });
    orientGroup.quaternion.copy(start);
    controls.targetQuaternion.copy(start);
    const expected = expectedOrientations({ autoRotate, frames: 90, frameMs, start });

    expected.forEach((orientation, frame) => {
      clock.advance(frameMs);
      controls.update();
      expect(orientGroup.quaternion.angleTo(orientation), `frame ${frame}`).toBeLessThan(1e-6);
    });
  });
});

describe('B3: a programmatic move is eased and takes about 1.2 s', () => {
  it('reaches the target (angle < 0.01 rad) by 1.2 s, eased rather than linear or instant', async () => {
    const { controls, orientGroup } = createControls();
    const start = orientGroup.quaternion.clone();
    const target = quarterTurn();
    controls.moveTo(target);

    await runFrames(controls, clock, MOVE_MS * 0.1);
    expect(progress(start, orientGroup.quaternion, target)).toBeLessThan(0.08);

    await runFrames(controls, clock, MOVE_MS * 0.4);
    const halfway = progress(start, orientGroup.quaternion, target);
    expect(halfway).toBeGreaterThan(0.3);
    expect(halfway).toBeLessThan(0.7);

    await runFrames(controls, clock, MOVE_MS * 0.3);
    expect(orientGroup.quaternion.angleTo(target)).toBeGreaterThan(0.01);

    await runFrames(controls, clock, MOVE_MS * 0.2 + FRAME_MS);
    expect(orientGroup.quaternion.angleTo(target)).toBeLessThan(0.01);
  });

  it('exposes isMoving only while the move runs', async () => {
    const { controls } = createControls();
    expect(controls.isMoving).toBe(false);
    controls.moveTo(quarterTurn());
    expect(controls.isMoving).toBe(true);
    await runFrames(controls, clock, MOVE_MS + 100);
    expect(controls.isMoving).toBe(false);
  });
});

describe('B4: a completed move resolves', () => {
  it('resolves { completed: true } and stays at the target afterwards', async () => {
    const { controls, orientGroup } = createControls();
    const target = quarterTurn();
    const result = controls.moveTo(target);
    await runFrames(controls, clock, MOVE_MS + 100);
    await expect(result).resolves.toEqual({ completed: true });

    await runFrames(controls, clock, 500);
    expect(orientGroup.quaternion.angleTo(target)).toBeLessThan(0.01);
  });

  it('does not resolve before the move finishes', async () => {
    const { controls } = createControls();
    let settled = false;
    controls.moveTo(quarterTurn()).then(() => {
      settled = true;
    });
    await runFrames(controls, clock, MOVE_MS * 0.5);
    expect(settled).toBe(false);
  });
});

describe('B5: any grab mid-move hands control back instantly', () => {
  it('resolves { completed: false, reason: "user" } and leaves the specimen where it was grabbed', async () => {
    const { controls, orientGroup, element } = createControls();
    const target = quarterTurn();
    const result = controls.moveTo(target);
    await runFrames(controls, clock, MOVE_MS * 0.5);
    const grabbed = orientGroup.quaternion.clone();

    element.dispatch('pointerdown');
    await flushMicrotasks();
    await expect(result).resolves.toEqual({ completed: false, reason: 'user' });
    expect(controls.isMoving).toBe(false);

    await runFrames(controls, clock, 500);
    expect(orientGroup.quaternion.angleTo(grabbed)).toBeLessThan(1e-6);
    element.dispatch('pointerup');
  });

  it('leaves the drag itself working exactly as before', async () => {
    const { controls, orientGroup, element } = createControls();
    controls.moveTo(quarterTurn());
    await runFrames(controls, clock, MOVE_MS * 0.5);

    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    const grabbed = orientGroup.quaternion.clone();
    element.dispatch('pointermove', { clientX: 460, clientY: 300 });
    await runFrames(controls, clock, 200);
    element.dispatch('pointerup', { clientX: 460, clientY: 300 });

    expect(orientGroup.quaternion.angleTo(grabbed)).toBeGreaterThan(0.05);
    expect(controls.isDragging).toBe(false);
  });
});

describe('B6: moves and the existing controls', () => {
  it('pauses auto-rotate only for the move, then resumes it', async () => {
    const { controls, orientGroup } = createControls({ autoRotate: true });
    const target = quarterTurn();
    const result = controls.moveTo(target);
    await runFrames(controls, clock, MOVE_MS + 50);
    await expect(result).resolves.toEqual({ completed: true });
    expect(orientGroup.quaternion.angleTo(target)).toBeLessThan(0.01);
    expect(controls.autoRotate).toBe(true);

    const settled = orientGroup.quaternion.clone();
    await runFrames(controls, clock, 500);
    expect(orientGroup.quaternion.angleTo(settled)).toBeGreaterThan(0.01);
  });

  it('does not count a move as the first user interaction', async () => {
    let interactions = 0;
    const { controls } = createControls({ autoRotate: true, onFirstInteraction: () => (interactions += 1) });
    controls.moveTo(quarterTurn());
    await runFrames(controls, clock, MOVE_MS + 50);
    expect(interactions).toBe(0);
  });

  it('lets scroll-zoom run without cancelling the move', async () => {
    const { controls, orientGroup, element } = createControls();
    const target = quarterTurn();
    const radiusBefore = controls.radius;
    const result = controls.moveTo(target);
    await runFrames(controls, clock, MOVE_MS * 0.4);

    element.dispatch('wheel', { deltaY: 100 });
    expect(controls.radius).not.toBe(radiusBefore);

    await runFrames(controls, clock, MOVE_MS * 0.6 + 100);
    await expect(result).resolves.toEqual({ completed: true });
    expect(orientGroup.quaternion.angleTo(target)).toBeLessThan(0.01);
  });

  it('supersedes an earlier move with a later one', async () => {
    const { controls, orientGroup } = createControls();
    const first = controls.moveTo(quarterTurn());
    await runFrames(controls, clock, MOVE_MS * 0.3);
    const second = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 3);
    const secondResult = controls.moveTo(second);

    await expect(first).resolves.toEqual({ completed: false, reason: 'superseded' });
    await runFrames(controls, clock, MOVE_MS + 100);
    await expect(secondResult).resolves.toEqual({ completed: true });
    expect(orientGroup.quaternion.angleTo(second)).toBeLessThan(0.01);
  });
});

describe('B7: the player taking hold is observable', () => {
  it('reports a grab on pointerdown and a release on pointerup', () => {
    const { controls, element } = createControls();
    const events = [];
    controls.subscribeUserInput((event) => events.push(event));

    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    expect(events).toEqual([{ type: 'grab', mode: 'rotate' }]);

    element.dispatch('pointermove', { clientX: 470, clientY: 300 });
    element.dispatch('pointerup', { clientX: 470, clientY: 300 });
    expect(events[1]).toEqual({ type: 'release', mode: 'rotate', wasClick: false });
  });

  it('marks a click and a shift-drag pan for what they are', () => {
    const { controls, element } = createControls();
    const events = [];
    controls.subscribeUserInput((event) => events.push(event));

    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    element.dispatch('pointerup', { clientX: 401, clientY: 300 });
    element.dispatch('pointerdown', { clientX: 400, clientY: 300, shiftKey: true });
    element.dispatch('pointerup', { clientX: 400, clientY: 340 });

    expect(events).toEqual([
      { type: 'grab', mode: 'rotate' },
      { type: 'release', mode: 'rotate', wasClick: true },
      { type: 'grab', mode: 'pan' },
      { type: 'release', mode: 'pan', wasClick: false },
    ]);
  });

  it('does not treat scroll-zoom as taking hold', () => {
    const { controls, element } = createControls();
    const events = [];
    controls.subscribeUserInput((event) => events.push(event));
    element.dispatch('wheel', { deltaY: 100 });
    expect(events).toEqual([]);
  });

  it('stops reporting after unsubscribing', () => {
    const { controls, element } = createControls();
    const events = [];
    const unsubscribe = controls.subscribeUserInput((event) => events.push(event));
    unsubscribe();
    element.dispatch('pointerdown');
    element.dispatch('pointerup');
    expect(events).toEqual([]);
  });

  it('reports the grab after the move has already been cancelled', async () => {
    const { controls, element } = createControls();
    const seen = [];
    controls.subscribeUserInput(() => seen.push(controls.isMoving));
    controls.moveTo(quarterTurn());
    await runFrames(controls, clock, MOVE_MS * 0.5);
    element.dispatch('pointerdown');
    expect(seen).toEqual([false]);
    element.dispatch('pointerup');
  });
});
