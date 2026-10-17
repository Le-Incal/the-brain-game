import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const { elevationDistance } = await import('./elevation.js').catch(() => ({}));
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const pages = { B: read('../../landing/b/index.html'), C: read('../../landing/c/index.html') };
const rule = (selector) => read('./landing.css').match(new RegExp(`\\n${selector.replace('.', '\\.')} \\{[^}]*\\}`))?.[0] ?? '';

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
  it.each(Object.keys(pages))('plate %s shows the brain alone, with no leaders or labels', (plate) => {
    expect(pages[plate]).not.toMatch(/plate-leaders/);
    expect(read('./landing.js')).not.toMatch(/plate-label|plate-dot|plate-leaders/);
  });

  it("is the brain's own outline in side elevation, so the page's margins stay even", () => {
    // Measured on the rendered elevation: 624.5 x 545.9 px at 1440 wide.
    expect(read('./landing.css')).toMatch(/\.plate \{[^}]*aspect-ratio: 1\.1438;/);
  });

  // Kyle, 2026-10-16: "an ABABA situation. A is the padding of equal size, and
  // B is the content." The same space at each edge and between brain and text.
  it('keeps one measure of space at both edges and between the brain and the text', () => {
    const spread = rule('.landing-spread');
    expect(spread).toMatch(/padding: 0 var\(--a\);/);
    expect(spread).toMatch(/column-gap: var\(--a\);/);
    expect(spread).toMatch(/justify-content: space-evenly;/);
    expect(rule('.landing')).toMatch(/padding: 56px 0;/);
  });

  it('leaves a little more space between the title and its subtitle', () => {
    expect(rule('.landing-subtitle')).toMatch(/margin: 20px 0 0;/);
  });
});

// Kyle, 2026-10-16: two lines and the button. No note box, no "explore" line
// ("it's self explanatory"), no "or press Enter".
describe('The landing copy', () => {
  it.each(Object.keys(pages))('plate %s invites the visitor to speak with the brain', (plate) => {
    const html = pages[plate];
    expect(html).toMatch(/<p class="landing-voice">\s*<span>Speak and interact with the human brain\.<\/span>\s*<span>Turn on the speaker(?:&nbsp;| )and(?:&nbsp;| )mic for the best experience\.<\/span>\s*<\/p>/);
    expect(html).toMatch(/<a class="enter" href="\/">Enter<\/a>/);
    expect(html).not.toMatch(/landing-note|Explore the functions|or press|I am a human brain|A note on sound/i);
  });
});
