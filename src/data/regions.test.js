import { describe, expect, it } from 'vitest';
import atlas from './brainRegions.json';
import colorCodes from './colorCodes.json';
import regionGeometry from './regionGeometry.json';
import {
  ATLAS,
  LATERALIZED_REGION_IDS,
  REGION_BY_ID,
  REGION_IDS,
  REGIONS,
  VIEW_LABEL_IDS,
  WORD_BANK,
  getRegionById,
  hexToRgb,
} from './regions.js';

describe('painted atlas taxonomy', () => {
  const expectedIds = Array.from({ length: 20 }, (_, index) => index + 1);

  it('sources all region metadata directly from the authored handoff', () => {
    expect(ATLAS).toBe(atlas);
    expect(REGION_IDS).toEqual(expectedIds);
    expect(REGIONS).toHaveLength(atlas.regions.length);

    atlas.regions.forEach((canonical) => {
      const region = getRegionById(canonical.id);
      expect(region).toBe(REGION_BY_ID.get(canonical.id));
      expect(region).toMatchObject(canonical);
      // The panel copy is authored, never composed at runtime.
      expect(region.description).toBe(canonical.clickDescription);
      expect(region.subtitle).toBe(canonical.subtitle);
      expect(region.color).toEqual(
        hexToRgb(canonical.hex).map((channel) => channel / 255)
      );
    });
  });

  it('agrees with the published palette on every region', () => {
    Object.entries(colorCodes.palette).forEach(([id, hex]) => {
      expect(getRegionById(Number(id)).hex).toBe(hex);
    });
  });

  it('anchors annotations on geometry measured from the painted model', () => {
    REGIONS.forEach((region) => {
      const measured = regionGeometry.regions[String(region.id)];
      expect(region.centroid).toEqual(measured.anchor);
      expect(region.vertices).toBe(measured.vertexCount);
      expect(region.vertices).toBeGreaterThan(0);
      // The paint and the taxonomy must agree on which lobe owns a region.
      expect(measured.divisionId).toBe(region.divisionId);
    });
  });

  it('keeps every division roster consistent with its regions', () => {
    atlas.divisions.forEach((division) => {
      division.regions.forEach((id) => {
        expect(getRegionById(id).divisionId).toBe(division.id);
        expect(getRegionById(id).division).toBe(division.name);
      });
    });
  });

  it('does not treat IDs as array indices', () => {
    expect(getRegionById(9)?.name).toBe('Angular Gyrus');
    expect(getRegionById(20)?.name).toBe('Brain Stem');
    expect(getRegionById(30)).toBeNull();
  });

  it('labels only real regions in each canonical view', () => {
    Object.entries(VIEW_LABEL_IDS).forEach(([view, ids]) => {
      expect(ids.length, view).toBeGreaterThan(0);
      ids.forEach((id) => expect(getRegionById(id), view).not.toBeNull());
    });
    // Occipital cortex is what you see from behind; prefrontal is not.
    expect(VIEW_LABEL_IDS.posterior).toContain(17);
    expect(VIEW_LABEL_IDS.posterior).not.toContain(1);
    expect(VIEW_LABEL_IDS.anterior).toContain(1);
  });

  it('carries the handoff lateralization rule', () => {
    // Language regions are painted on the left hemisphere only.
    expect([...LATERALIZED_REGION_IDS].sort((a, b) => a - b)).toEqual([6, 13]);
  });

  it('maps every gameplay target and alternate to a real region', () => {
    WORD_BANK.forEach((entry) => {
      expect(getRegionById(entry.targetRegion), entry.word).not.toBeNull();
      (entry.acceptAlternates || []).forEach((id) => {
        expect(getRegionById(id), `${entry.word} alternate ${id}`).not.toBeNull();
        // An alternate that repeats the target would silently do nothing.
        expect(id, entry.word).not.toBe(entry.targetRegion);
      });
    });
  });

  it('uses exact semantic targets for representative migrated words', () => {
    const byWord = new Map(WORD_BANK.map((entry) => [entry.word, entry]));
    expect(byWord.get('VISION')?.targetRegion).toBe(17);
    expect(byWord.get('SEEING COLOUR')?.targetRegion).toBe(18);
    expect(byWord.get('SMELL')?.targetRegion).toBe(15);
    expect(byWord.get('BALANCE')?.targetRegion).toBe(19);
    expect(byWord.get('LOCKED-IN SYNDROME')?.targetRegion).toBe(20);
    // The old atlas had no inferior temporal cortex, so face recognition sat
    // on the fusiform gyrus; the painted taxonomy folds it into region 14.
    expect(byWord.get('RECOGNISING A FACE')?.targetRegion).toBe(14);
    // The retired temporal catch-all is split by what each word is about.
    expect(byWord.get('PROSODY OF SPEECH')?.targetRegion).toBe(12);
    expect(byWord.get('NAMING AN OBJECT')?.targetRegion).toBe(14);
    expect(byWord.has('LOOKING LEFT')).toBe(false);
  });

  it('never presents a retired region as if it were selectable', () => {
    // Naming the fusiform gyrus or the pons as anatomy is fine; naming them as
    // regions is not, because the player can no longer click one.
    const retired =
      /fusiform gyrus|superior parietal (cortex|lobule)|cerebellar cortex|\bthe pons\b/i;
    WORD_BANK.forEach((entry) => {
      expect(entry.factoid, entry.word).not.toMatch(retired);
    });
  });
});
