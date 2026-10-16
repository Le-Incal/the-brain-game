import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const { elevationDistance } = await import('./elevation.js').catch(() => ({}));
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

// Kyle, 2026-10-15: plates B and C as working pages. The landing page shows the
// real engraved brain in side elevation and the visitor may turn it.

describe("Fitting the side elevation into the plate", () => {
  it("sets the camera's distance so the brain spans the plate's width", () => {
    // 1 degree of view on an 800 x 400 canvas; the plate is half the canvas wide.
    const distance = elevationDistance({ brainWidth: 1.6, canvasWidth: 800, frameWidth: 400, fovDeg: 1, aspect: 2 });
    const visibleWidth = 2 * distance * Math.tan(THREE.MathUtils.degToRad(0.5)) * 2;
    expect(1.6 / visibleWidth).toBeCloseTo(400 / 800, 6);
  });
});

// Kyle, 2026-10-16: "Let's remove the labels." The brain alone, with no tags.
describe('The landing plates', () => {
  const pages = { B: read('../../landing/b/index.html'), C: read('../../landing/c/index.html') };

  it.each(Object.keys(pages))('plate %s shows the brain alone, with no leaders or labels', (plate) => {
    expect(pages[plate]).not.toMatch(/plate-leaders/);
    expect(read('./landing.js')).not.toMatch(/plate-label|plate-dot|plate-leaders/);
  });

  it("is the brain's own outline in side elevation, so the page's margins stay even", () => {
    // Measured on the rendered elevation: 624.5 x 545.9 px at 1440 wide.
    expect(read('./landing.css')).toMatch(/\.plate \{[^}]*aspect-ratio: 1\.1438;/);
  });
});
