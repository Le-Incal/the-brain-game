import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import brainRegions from '../data/brainRegions.json';

const plateTagsModule = await import('./plateTags.js').catch(() => ({}));
const { elevationDistance, projectTag, tagOpacity, followSpot, PLATE_FRAME, PLATE_TAGS } = plateTagsModule;

// Kyle, 2026-10-15: plates B and C as working pages. The landing page shows the
// real engraved brain in side elevation, framed where the mockup's plate sat;
// the visitor may turn it, and its analytical tags stay pinned to the anatomy.

describe("Fitting the side elevation into the plate's frame", () => {
  it("sets the camera's distance so the brain spans the frame's width", () => {
    // 1 degree of view on an 800 x 400 canvas; the frame is half the canvas wide.
    const distance = elevationDistance({ brainWidth: 1.6, canvasWidth: 800, frameWidth: 400, fovDeg: 1, aspect: 2 });
    const visibleWidth = 2 * distance * Math.tan(THREE.MathUtils.degToRad(0.5)) * 2;
    expect(1.6 / visibleWidth).toBeCloseTo(400 / 800, 6);
  });

  it("knows the plate's frame from the mockup, in percent of the plate", () => {
    expect(PLATE_FRAME).toEqual({ left: 4.41, top: 7.54, width: 91.18, height: 90.78 });
  });
});

describe('A tag pinned to the brain', () => {
  function scene() {
    const camera = new THREE.PerspectiveCamera(50, 1000 / 800, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const group = new THREE.Group();
    group.updateMatrixWorld();
    return { camera, group };
  }
  const tag = { local: new THREE.Vector3(0, 0, 1), normal: new THREE.Vector3(0, 0, 1) };

  it('lands where its spot projects on the canvas, and faces us', () => {
    const { camera, group } = scene();
    const at = projectTag({ ...tag, group, camera, width: 1000, height: 800 });
    expect(at.x).toBeCloseTo(500, 3);
    expect(at.y).toBeCloseTo(400, 3);
    expect(at.facing).toBeCloseTo(1, 3);
  });

  it('follows the brain as it turns', () => {
    const { camera, group } = scene();
    group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    group.updateMatrixWorld();
    const at = projectTag({ ...tag, group, camera, width: 1000, height: 800 });
    expect(at.x).toBeGreaterThan(540);
    expect(at.facing).toBeGreaterThan(0.6);
    expect(at.facing).toBeLessThan(0.8);
  });

  it('faces away once its side of the brain is turned from us', () => {
    const { camera, group } = scene();
    group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    group.updateMatrixWorld();
    expect(projectTag({ ...tag, group, camera, width: 1000, height: 800 }).facing).toBeLessThan(-0.9);
  });
});

// Kyle, 2026-10-15: "The labels do not rotate with the brain." Each label
// travels with its spot, keeping the leader it has in the elevation.
describe('A label travelling with its spot', () => {
  const tag = { anchor: [10, 20], label: [1, 5], end: [3, 7] };

  it('stays where the mockup placed it while the brain holds its elevation', () => {
    expect(followSpot(tag, [10, 20])).toEqual({ label: [1, 5], end: [3, 7] });
  });

  it('moves with its spot as the brain turns, its leader unchanged', () => {
    expect(followSpot(tag, [30, 42])).toEqual({ label: [21, 27], end: [23, 29] });
  });

  // A label never leaves the plate: past the right edge it would run into the
  // text, past the left edge it would break the page's even margins. `size` is
  // the label's width and height in percent of the plate.
  it('stops at the right edge, its leader stretching to meet it', () => {
    const wernicke = { align: 'right', anchor: [80, 50], label: [100, 12], end: [86, 12] };
    expect(followSpot(wernicke, [90, 50], [20, 3])).toEqual({ label: [100, 12], end: [86, 12] });
  });

  it('stops at the left edge', () => {
    const prefrontal = { align: 'left', anchor: [15, 36], label: [0, 13], end: [2, 15] };
    expect(followSpot(prefrontal, [5, 36], [20, 3])).toEqual({ label: [0, 13], end: [2, 15] });
  });

  it('stops at the top and bottom edges, measured from its middle', () => {
    const motor = { align: 'center', anchor: [50, 25], label: [64, 3.5], end: [53, 5] };
    expect(followSpot(motor, [50, 20], [30, 3])).toEqual({ label: [64, 1.5], end: [53, 3] });
    const stem = { align: 'right', anchor: [62, 85], label: [58, 95.5], end: [54, 94] };
    expect(followSpot(stem, [62, 90], [10, 3])).toEqual({ label: [58, 98.5], end: [54, 97] });
  });
});

describe('How a tag fades as its spot turns away', () => {
  it('shows fully while the spot faces us, and is gone once it faces away', () => {
    expect(tagOpacity(1)).toBe(1);
    expect(tagOpacity(0.3)).toBe(1);
    expect(tagOpacity(0)).toBe(0);
    expect(tagOpacity(-0.5)).toBe(0);
  });

  it('fades smoothly in between', () => {
    const middle = tagOpacity(0.12);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(tagOpacity(0.15)).toBeGreaterThan(middle);
  });
});

describe("The plate's tags", () => {
  it("names eight regions by the game's own names, in the mockup's order", () => {
    expect(PLATE_TAGS.map((tag) => tag.text)).toEqual([
      'Prefrontal Cortex',
      "Broca's Area",
      'Primary Motor Cortex',
      'Primary Somatosensory Cortex',
      "Wernicke's Area",
      'Primary Visual Cortex',
      'Cerebellum',
      'Brain Stem',
    ]);
    const names = new Map(brainRegions.regions.map((region) => [region.id, region.name]));
    for (const tag of PLATE_TAGS) expect(names.get(tag.id)).toBe(tag.text);
  });

  it('places every label and every leader inside the plate', () => {
    for (const tag of PLATE_TAGS) {
      for (const [x, y] of [tag.label, tag.anchor, tag.end]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
      expect(['left', 'right', 'center']).toContain(tag.align);
    }
  });
});
