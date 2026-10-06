import { describe, expect, it } from 'vitest';
import brainRegions from '../data/brainRegions.json';

const lobesModule = await import('./lobes.js').catch(() => ({}));
const { LOBE_NAMES, TOUR_ORDER, LIMBIC_NOTE, normalizeLobe, lobeRegionIds, tourStop } = lobesModule;

describe('Lobes: the 7 divisions in brainRegions.json', () => {
  it('names exactly the divisions in the data', () => {
    expect(LOBE_NAMES).toEqual(brainRegions.divisions.map(({ name }) => name));
    expect(LOBE_NAMES).toHaveLength(7);
  });

  it('lists each lobe’s regions from the data', () => {
    for (const division of brainRegions.divisions) {
      expect(lobeRegionIds(division.name)).toEqual(division.regions);
    }
  });

  it.each([
    ['Temporal Lobe', 'Temporal Lobe'],
    ['temporal lobe', 'Temporal Lobe'],
    ['the Temporal lobe', 'Temporal Lobe'],
    ['temporal', 'Temporal Lobe'],
    ['cerebellum', 'Cerebellum'],
    ['Brain stem', 'Brain Stem'],
  ])('reads %j as %j', (input, expected) => {
    expect(normalizeLobe(input)).toBe(expected);
  });

  it.each(['', 'the whole brain', 'hippocampus', null, 7])('rejects %j', (input) => {
    expect(normalizeLobe(input)).toBeNull();
  });
});

describe('The tour: 7 stops in the order of least travel', () => {
  it('visits every lobe once, in the agreed order', () => {
    expect(TOUR_ORDER).toEqual([
      'Frontal Lobe',
      'Parietal Lobe',
      'Occipital Lobe',
      'Cerebellum',
      'Brain Stem',
      'Temporal Lobe',
      'Limbic Lobe',
    ]);
    expect([...TOUR_ORDER].sort()).toEqual([...LOBE_NAMES].sort());
  });

  it('hands the guide our own vetted descriptions for each stop', () => {
    const stop = tourStop(5);
    const temporal = brainRegions.divisions.find(({ name }) => name === 'Temporal Lobe');
    expect(stop).toMatchObject({ stop: 6, of: 7, lobe: 'Temporal Lobe', next: 'Limbic Lobe' });
    expect(stop.regions).toEqual(
      temporal.regions.map((id) => {
        const region = brainRegions.regions.find((r) => r.id === id);
        return { id, name: region.name, clickDescription: region.clickDescription };
      })
    );
    expect(stop.instruction).toMatch(/two or three sentences/i);
    expect(stop.instruction).toMatch(/next_tour_stop/);
  });

  it('frames the limbic stop honestly: only the cingulate is painted', () => {
    expect(LIMBIC_NOTE).toMatch(/cingulate/i);
    expect(LIMBIC_NOTE).toMatch(/Broca/);
    expect(LIMBIC_NOTE).toMatch(/parahippocampal/i);
    expect(LIMBIC_NOTE).toMatch(/hippocampal/i);
    expect(LIMBIC_NOTE).toMatch(/not painted/i);
    expect(tourStop(6)).toMatchObject({ stop: 7, lobe: 'Limbic Lobe', next: null, note: LIMBIC_NOTE });
    expect(tourStop(0).note).toBeUndefined();
  });

  it('tells the guide the last stop finishes the tour', () => {
    expect(tourStop(6).instruction).toMatch(/finish/i);
  });
});
