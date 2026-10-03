import { describe, expect, it } from 'vitest';
import regionGeometry from './regionGeometry.json';
import baseline from './__fixtures__/regionGeometry.baseline.json';
import brainRegions from './brainRegions.json';

const LEFT_ONLY = new Set(brainRegions.gameplayNotes.lateralized);

describe('R3: regenerating region geometry only adds fields', () => {
  // The baseline is the file as it stood before M1. Every field it holds must
  // survive regeneration unchanged; M1 may only add new fields beside them.
  it('keeps every pre-existing top-level field identical', () => {
    for (const key of ['source', 'note', 'labelsPerView']) {
      expect(regionGeometry[key]).toEqual(baseline[key]);
    }
  });

  it('keeps every pre-existing region field identical', () => {
    expect(Object.keys(regionGeometry.regions).sort()).toEqual(
      Object.keys(baseline.regions).sort()
    );
    for (const [id, fields] of Object.entries(baseline.regions)) {
      for (const [field, value] of Object.entries(fields)) {
        expect(regionGeometry.regions[id][field], `region ${id} ${field}`).toEqual(value);
      }
    }
  });
});

describe('0: per-hemisphere centroids', () => {
  it('gives every bilateral region a centroid in each hemisphere (+x is anatomical left)', () => {
    for (const region of brainRegions.regions.filter(({ id }) => !LEFT_ONLY.has(id))) {
      const geometry = regionGeometry.regions[String(region.id)];
      expect(geometry.centroidLeft, `region ${region.id} centroidLeft`).toHaveLength(3);
      expect(geometry.centroidRight, `region ${region.id} centroidRight`).toHaveLength(3);
      expect(geometry.centroidLeft[0]).toBeGreaterThan(0);
      expect(geometry.centroidRight[0]).toBeLessThan(0);
    }
  });

  it("gives Broca's (6) and Wernicke's (13) a left centroid only", () => {
    expect([...LEFT_ONLY].sort((a, b) => a - b)).toEqual([6, 13]);
    for (const id of LEFT_ONLY) {
      const geometry = regionGeometry.regions[String(id)];
      expect(geometry.centroidLeft, `region ${id} centroidLeft`).toHaveLength(3);
      expect(geometry.centroidLeft[0]).toBeGreaterThan(0);
      expect(geometry).not.toHaveProperty('centroidRight');
    }
  });
});
