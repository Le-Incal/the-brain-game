import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createControls, installFakeClock, runFrames } from '../test/voiceHarness.js';

const { startDrift } = await import('./drift.js').catch(() => ({}));

// Kyle, 2026-10-16: "the brain should start slowly drifting in counter
// clockwise rotate when a user enters the page." A turntable, counter-clockwise
// seen from above, at the guide's 4 degrees a second. A grab pauses it; it
// drifts on from where the visitor let go, 3 seconds after they let go.

let clock;
beforeEach(() => {
  clock = installFakeClock();
});
afterEach(() => {
  clock.restore();
});

// Timers on the fake clock, fired between frames.
function manualTimers() {
  const pending = new Set();
  return {
    schedule(fn, ms) {
      const timer = { fn, at: clock.now + ms };
      pending.add(timer);
      return () => pending.delete(timer);
    },
    fireDue() {
      for (const timer of [...pending]) {
        if (timer.at <= clock.now) {
          pending.delete(timer);
          timer.fn();
        }
      }
    },
  };
}

async function run(controls, timers, ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    await runFrames(controls, clock, 100);
    timers.fireDue();
  }
}

const degreesBetween = (a, b) => THREE.MathUtils.radToDeg(a.angleTo(b));

function setup({ reducedMotion = false } = {}) {
  const { controls, orientGroup, element } = createControls();
  const timers = manualTimers();
  const drift = startDrift({ controls, reducedMotion, schedule: timers.schedule });
  return { controls, orientGroup, element, timers, drift };
}

describe('The landing drift', () => {
  it('turns counter-clockwise seen from above, at about 4 degrees a second, from the start', async () => {
    const { controls, orientGroup, timers } = setup();
    await run(controls, timers, 5000);
    expect(degreesBetween(orientGroup.quaternion, new THREE.Quaternion())).toBeGreaterThan(17);
    expect(degreesBetween(orientGroup.quaternion, new THREE.Quaternion())).toBeLessThan(21);
    // The front (+z) swings toward +x: counter-clockwise looking down from +y.
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(orientGroup.quaternion);
    expect(front.x).toBeGreaterThan(0.25);
    expect(Math.abs(front.y)).toBeLessThan(1e-6);
  });

  it('holds still while grabbed, then drifts on 3 seconds after release', async () => {
    const { controls, orientGroup, element, timers } = setup();
    await run(controls, timers, 1000);
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    await run(controls, timers, 500);
    const held = orientGroup.quaternion.clone();
    await run(controls, timers, 1500);
    expect(degreesBetween(orientGroup.quaternion, held)).toBeLessThan(1e-4);
    element.dispatch('pointerup', { clientX: 400, clientY: 300 });
    await run(controls, timers, 2800);
    expect(degreesBetween(orientGroup.quaternion, held)).toBeLessThan(1e-4);
    await run(controls, timers, 2200);
    expect(degreesBetween(orientGroup.quaternion, held)).toBeGreaterThan(4);
  });

  it('waits the full 3 seconds again after a second grab', async () => {
    const { controls, orientGroup, element, timers } = setup();
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    element.dispatch('pointerup', { clientX: 400, clientY: 300 });
    await run(controls, timers, 2000);
    element.dispatch('pointerdown', { clientX: 400, clientY: 300 });
    element.dispatch('pointerup', { clientX: 400, clientY: 300 });
    await run(controls, timers, 500);
    const held = orientGroup.quaternion.clone();
    await run(controls, timers, 2300);
    expect(degreesBetween(orientGroup.quaternion, held)).toBeLessThan(1e-4);
    await run(controls, timers, 2000);
    expect(degreesBetween(orientGroup.quaternion, held)).toBeGreaterThan(2);
  });

  // The gaze (Kyle, 2026-10-16) holds the brain still while it looks, then
  // hands the turn back.
  it('pauses on request, and drifts on after the delay it is given', async () => {
    const { controls, orientGroup, timers, drift } = setup();
    await run(controls, timers, 1000);
    drift.pause();
    await run(controls, timers, 500);
    const held = orientGroup.quaternion.clone();
    await run(controls, timers, 2000);
    expect(degreesBetween(orientGroup.quaternion, held)).toBeLessThan(1e-4);
    drift.resume({ afterMs: 1500 });
    await run(controls, timers, 1400);
    expect(degreesBetween(orientGroup.quaternion, held)).toBeLessThan(1e-4);
    await run(controls, timers, 2000);
    expect(degreesBetween(orientGroup.quaternion, held)).toBeGreaterThan(2);
  });

  it('cancels a pending resume when paused again', async () => {
    const { controls, orientGroup, timers, drift } = setup();
    drift.pause();
    drift.resume({ afterMs: 1500 });
    await run(controls, timers, 500);
    drift.pause();
    const held = orientGroup.quaternion.clone();
    await run(controls, timers, 3000);
    expect(degreesBetween(orientGroup.quaternion, held)).toBeLessThan(1e-4);
  });

  it('keeps still for visitors who ask for reduced motion', async () => {
    const { controls, orientGroup, timers } = setup({ reducedMotion: true });
    await run(controls, timers, 5000);
    expect(degreesBetween(orientGroup.quaternion, new THREE.Quaternion())).toBeLessThan(1e-4);
  });

  it('starts on the landing once the specimen has loaded', () => {
    const landing = readFileSync(fileURLToPath(new URL('./landing.js', import.meta.url)), 'utf8');
    expect(landing).toMatch(/import \{ startDrift \} from '\.\/drift\.js';/);
    expect(landing).toMatch(/startDrift\(\{ controls: scene\.controls, reducedMotion/);
  });
});
