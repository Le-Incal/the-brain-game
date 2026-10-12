import { describe, expect, it } from 'vitest';
import brainRegions from '../data/brainRegions.json';
import regionGeometry from '../data/regionGeometry.json';

const hintsModule = await import('./hints.js').catch(() => ({}));
const { SPATIAL_HINTS, hintFor, HINT_LEVELS } = hintsModule;

// Kyle, 2026-10-11: the guide can give hints during the game; the word keeps
// falling. On Easy the lobe alone scores, so the ladder starts with where to
// look, then the lobe, then the region.

const REGIONS = brainRegions.regions;
const regionById = new Map(REGIONS.map((region) => [region.id, region]));
const divisionById = new Map(brainRegions.divisions.map((division) => [division.id, division]));

// Positions on our painted model, centred and scaled to -1..1 per axis
// (+x anatomical left, +y superior, +z anterior).
const position = (() => {
  const entries = Object.entries(regionGeometry.regions);
  const total = entries.reduce((sum, [, r]) => sum + r.vertexCount, 0);
  const centre = [0, 1, 2].map((axis) => entries.reduce((sum, [, r]) => sum + r.centroid[axis] * r.vertexCount, 0) / total);
  const extent = [0, 1, 2].map((axis) => Math.max(...entries.map(([, r]) => Math.abs(r.centroidLeft[axis] - centre[axis]))));
  return new Map(entries.map(([id, r]) => [Number(id), r.centroidLeft.map((v, axis) => (v - centre[axis]) / extent[axis])]));
})();

const word = (target, text = 'SPEECH') => ({ word: text, targetRegion: target });

describe('Where to look: the first hint', () => {
  it('exists for every region', () => {
    expect(Object.keys(SPATIAL_HINTS).map(Number).sort((a, b) => a - b)).toEqual(REGIONS.map((r) => r.id).sort((a, b) => a - b));
  });

  it('never names the region, its lobe or any lobe', () => {
    const lobeWords = /frontal|parietal|temporal|occipital|limbic|cerebell|brain stem|cortex|lobe/i;
    for (const region of REGIONS) {
      const hint = SPATIAL_HINTS[region.id];
      expect(hint, region.name).not.toMatch(lobeWords);
      expect(hint.toLowerCase(), region.name).not.toContain(region.name.toLowerCase());
    }
  });

  // Every direction word must be true of where the region is painted on our model.
  it('agrees with where each region lies on our model', () => {
    for (const region of REGIONS) {
      const hint = SPATIAL_HINTS[region.id];
      const [x, y, z] = position.get(region.id);
      const label = `${region.id} ${region.name}: "${hint}"`;
      if (/\bfront\b/.test(hint)) expect(z, label).toBeGreaterThan(0);
      if (/\bback\b/.test(hint)) expect(z, label).toBeLessThan(0);
      if (/\b(top|high)\b/.test(hint)) expect(y, label).toBeGreaterThan(0);
      if (/\b(underside|low|below|under)\b/.test(hint)) expect(y, label).toBeLessThan(0);
      if (/\bsides?\b/.test(hint)) expect(Math.abs(x), label).toBeGreaterThanOrEqual(0.5);
      if (/midline|halves/.test(hint)) expect(Math.abs(x), label).toBeLessThan(0.3);
      expect(/\bleft side\b/.test(hint), label).toBe(region.hemisphere === 'left');
    }
  });
});

describe('The hint ladder', () => {
  it('has three rungs', () => {
    expect(HINT_LEVELS).toBe(3);
  });

  it('starts with where to look', () => {
    expect(hintFor(word(6), 1)).toEqual({ text: 'For "SPEECH": look on my left side, toward the front.', final: false });
  });

  it('then names the lobe', () => {
    expect(hintFor(word(6), 2)).toEqual({ text: 'For "SPEECH": it lies in my Frontal Lobe.', final: false });
  });

  it('then names the region, and says when it exists on one side only', () => {
    expect(hintFor(word(6), 3)).toEqual({ text: `For "SPEECH": it is my Broca's Area, on my left side only.`, final: true });
    expect(hintFor(word(17, 'VISION'), 3)).toEqual({ text: 'For "VISION": it is my Primary Visual Cortex.', final: true });
  });

  it('ends at the lobe when the lobe is the region', () => {
    const division = divisionById.get(regionById.get(19).divisionId);
    expect(division.regions).toEqual([19]);
    expect(hintFor(word(19, 'BALANCE'), 2)).toEqual({ text: 'For "BALANCE": it is my Cerebellum.', final: true });
  });

  it('repeats the last rung when asked again', () => {
    expect(hintFor(word(6), 5)).toEqual(hintFor(word(6), 3));
  });
});
