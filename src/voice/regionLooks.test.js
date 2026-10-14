import { describe, expect, it } from 'vitest';
import brainRegions from '../data/brainRegions.json';
import regionGeometry from '../data/regionGeometry.json';
import { findSpokenNames } from './spokenNames.js';

const looksModule = await import('./regionLooks.js').catch(() => ({}));
const { REGION_LOOKS, findRegionByLooks } = looksModule;

// Kyle, 2026-10-13: asked about "the bright yellow spot on the top of the
// brain", the guide guessed "my Primary Motor Cortex". It was never told how
// its regions are painted. Now it is, and every word is checked against the
// paint (hex) and the model (anchor points).

function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h, s: s * 100, l: l * 100 };
}

const within = (h, [from, to]) => (from <= to ? h >= from && h <= to : h >= from || h <= to);
// What each everyday colour word may mean, in hue (degrees), saturation and lightness (%).
const FAMILY = {
  red: ({ h, s }) => within(h, [330, 25]) && s >= 35,
  pink: ({ h, l }) => within(h, [290, 360]) && l >= 50,
  orange: ({ h, s }) => within(h, [15, 40]) && s >= 50,
  yellow: ({ h, s }) => within(h, [40, 65]) && s >= 50,
  gold: ({ h, s }) => within(h, [38, 50]) && s >= 80,
  green: ({ h, s }) => within(h, [65, 180]) && s >= 25,
  teal: ({ h, s }) => within(h, [155, 195]) && s >= 25,
  blue: ({ h, s }) => within(h, [175, 260]) && s >= 20,
  purple: ({ h, s }) => within(h, [225, 340]) && s >= 20,
  brown: ({ h, s, l }) => within(h, [0, 45]) && s <= 45 && l <= 75,
  tan: ({ h, s, l }) => within(h, [20, 45]) && s <= 50 && l >= 60,
  grey: ({ s, l }) => s <= 30 && l >= 40,
};

const anchor = (id) => regionGeometry.regions[String(id)].anchor;
const sideX = (id) => {
  const entry = regionGeometry.regions[String(id)];
  return Math.max(...[entry.anchor, entry.centroidLeft, entry.centroidRight].filter(Boolean).map((p) => Math.abs(p[0])));
};
// Model space: +x is my left, +y up, +z toward the front.
const WHERE = {
  top: (id) => anchor(id)[1] >= 3.4,
  underneath: (id) => anchor(id)[1] <= 0.5,
  front: (id) => anchor(id)[2] >= 2,
  back: (id) => anchor(id)[2] <= -1.5,
  side: (id) => sideX(id) >= 2,
  left: (id) => anchor(id)[0] >= 2 && brainRegions.gameplayNotes.lateralized.includes(id),
  middle: (id) => Math.abs(anchor(id)[0]) <= 0.5,
};

describe('How each region is painted, and where it lies', () => {
  it('describes all 20 regions', () => {
    expect(Object.keys(REGION_LOOKS ?? {}).map(Number).sort((a, b) => a - b)).toEqual(brainRegions.regions.map(({ id }) => id));
    for (const [id, looks] of Object.entries(REGION_LOOKS)) {
      expect(looks.colour, id).toMatch(/^[a-z][a-z -]+$/);
      expect(looks.families.length, id).toBeGreaterThan(0);
      expect(looks.place, id).toMatch(/^[a-z]/);
      expect(looks.where.length, id).toBeGreaterThan(0);
    }
  });

  it.each(brainRegions.regions.map(({ id, name, hex }) => [id, name, hex]))(
    'region %i (%s, %s): every colour word fits the paint',
    (id, _name, hex) => {
      const colour = hsl(hex);
      for (const family of REGION_LOOKS[id].families) {
        expect(FAMILY[family], family).toBeDefined();
        expect(FAMILY[family](colour), `${family} for h${Math.round(colour.h)} s${Math.round(colour.s)} l${Math.round(colour.l)}`).toBe(true);
      }
    }
  );

  it.each(brainRegions.regions.map(({ id, name }) => [id, name]))('region %i (%s): every place word fits the model', (id) => {
    for (const where of REGION_LOOKS[id].where) {
      expect(WHERE[where], where).toBeDefined();
      expect(WHERE[where](id), `${where} at ${anchor(id).map((v) => v.toFixed(2)).join(',')}`).toBe(true);
    }
  });

  // Kyle, 2026-10-13: "talks around the green strip but shows the red orange
  // primary motor cortex". The guide read out "just behind my motor strip",
  // and following its words lit region 5. A place never names a region or lobe.
  it('never names a region or a lobe the guide\'s words would light', () => {
    for (const [id, looks] of Object.entries(REGION_LOOKS)) {
      expect(findSpokenNames(looks.place), `${id}: ${looks.place}`).toEqual([]);
      expect(findSpokenNames(looks.colour), `${id}: ${looks.colour}`).toEqual([]);
    }
  });

  it('paints the Supplementary Motor Area golden yellow, at the very top', () => {
    expect(REGION_LOOKS[4]).toMatchObject({ colour: 'golden yellow', families: expect.arrayContaining(['yellow']), where: expect.arrayContaining(['top']) });
  });
});

describe('Finding a region by how it looks', () => {
  it.each([
    ['the bright yellow spot on the top of the brain', 4],
    ['the yellow one underneath', 19],
    ['the red orange region', 5],
    ['the grey part underneath', 20],
    ['the pale pink bit underneath at the front', 2],
    ['the brown area at the back', 17],
    // Kyle, 2026-10-13: "What is the bright green spot?" found three greens.
    ['the bright green spot', 7],
    ['the pale green one', 10],
    ['the dark green bit', 9],
  ])('%j is region %i', (text, id) => {
    const found = findRegionByLooks(text);
    expect(found.error).toBeUndefined();
    expect(found.region.id).toBe(id);
  });

  it('asks which, naming the colour and place of each, when the words fit several', () => {
    const found = findRegionByLooks('the yellow one');
    expect(found.region).toBeUndefined();
    expect(found.error).toContain('Supplementary Motor Area (golden yellow');
    expect(found.error).toContain('Cerebellum (pale yellow');
    // Named aloud, each would light in turn: the guide asks by colour and place.
    expect(found.error).toMatch(/by colour and place, without naming them/);
  });

  it('says so when no region is painted that way', () => {
    expect(findRegionByLooks('the bright blue one on top').error).toMatch(/No region of mine/);
  });

  it('is not used without a colour word', () => {
    expect(findRegionByLooks('the spot on top')).toBeNull();
    expect(findRegionByLooks('spleen')).toBeNull();
  });
});
