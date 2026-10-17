import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const { elevationDistance } = await import('./elevation.js').catch(() => ({}));
const at = (path) => fileURLToPath(new URL(path, import.meta.url));
const read = (path) => readFileSync(at(path), 'utf8');
// Kyle, 2026-10-17: plate C is the landing; B is retired.
const pages = { C: existsSync(at('../../landing/index.html')) ? read('../../landing/index.html') : '' };
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

// Kyle, 2026-10-17: "this version is ready let's commit push and merge to
// production." Plate C is brain-game.io's front door; Enter goes into the app.
describe('The landing in production', () => {
  it('is plate C, at /landing/ in the build, and B is gone', () => {
    expect(pages.C).toMatch(/data-plate="tinted"/);
    expect(existsSync(at('../../landing/b/index.html'))).toBe(false);
    expect(existsSync(at('../../landing/c/index.html'))).toBe(false);
    const vite = read('../../vite.config.js');
    expect(vite).toMatch(/landing: page\('\.\/landing\/index\.html'\)/);
    expect(vite).not.toMatch(/landingB|landingC/);
  });

  it('goes into the app at /app, and may be found by search engines', () => {
    expect(pages.C).toMatch(/<a class="enter" href="\/app">/);
    expect(pages.C).not.toMatch(/noindex/);
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
    // Kyle, 2026-10-16: the new body text.
    expect(html).toMatch(/<p class="landing-voice">\s*<span>This is embodied AI as the Human Brain\. Speak and interact to explore the anatomy and functional regions of the brain\.<\/span>\s*<span>Turn on your speaker(?:&nbsp;| )and(?:&nbsp;| )mic for the best experience\.<\/span>\s*<\/p>/);
    // Kyle, 2026-10-16: the frameless pointing hand ("I like this one!").
    expect(html).toMatch(/<a class="enter" href="\/app"><span class="enter-hand" aria-hidden="true">☞<\/span><span class="enter-word">Enter<\/span><\/a>/);
    expect(html).toContain('family=Noto+Sans+Symbols+2&amp;text=%E2%98%9E');
    expect(html).not.toMatch(/landing-note|Explore the functions|or press|I am a human brain|A note on sound/i);
  });

  // Kyle, 2026-10-16: "Remove the line and plate 1 tag. Update the Fig. 1 to my
  // text and left side justify to the padding." The copy at 19 px, as he set it.
  it.each(Object.keys(pages))('plate %s has no plate number, and his caption', (plate) => {
    const html = pages[plate];
    expect(html).not.toMatch(/plate-number|Plate I/);
    // Kyle, 2026-10-16: the caption's latest wording.
    expect(html).toContain('<figcaption>Fig. 1. The functional regions of the Cerebrum</figcaption>');
  });

  it('draws Enter without a frame: the hand moves toward the word and the rule draws under it', () => {
    expect(rule('.enter')).not.toMatch(/box-shadow/);
    expect(read('./landing.css')).toMatch(/\.enter:hover \.enter-hand,\s*\.enter:focus-visible \.enter-hand,\s*\.enter:active \.enter-hand \{\s*transform: translateX\(8px\);/);
    expect(read('./landing.css')).toMatch(/\.enter:hover \.enter-word::after,\s*\.enter:focus-visible \.enter-word::after,\s*\.enter:active \.enter-word::after \{\s*transform: scaleX\(1\);/);
  });

  // Kyle, 2026-10-17: on the phone, "remove the fig. 1 text under the brain to
  // bring the brain and title closer". Desktop keeps it.
  it('drops the caption on phones, so the title sits under the brain', () => {
    const css = read('./landing.css');
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(phone).toMatch(/\.plate-figure figcaption \{ display: none; \}/);
    expect(rule('.plate-figure figcaption')).not.toMatch(/display: none/);
  });

  it('sets the caption flush with the left padding, and the copy at 19 px', () => {
    const caption = rule('.plate-figure figcaption');
    expect(caption).toMatch(/align-self: flex-start;/);
    expect(caption).toMatch(/text-align: left;/);
    expect(rule('.landing-voice')).toMatch(/font-size: 19px;/);
    expect(read('./landing.css')).not.toMatch(/\.plate-number/);
  });
});
