import { describe, expect, it } from 'vitest';
import brainRegions from '../data/brainRegions.json';
import lobePanels from '../data/lobePanels.json';

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
    expect(stop.summary).toBe(lobePanels.lobes['Temporal Lobe'].description);
    expect(stop.instruction).toMatch(/^First say in one sentence what your Temporal Lobe does as a whole/);
    expect(stop.instruction).toContain("in this order, saying its name as you begin, so it lights as you name it: Primary Auditory Cortex, Superior Temporal Gyrus, Wernicke's Area, Inferior Temporal Cortex, Piriform Cortex.");
    expect(stop.instruction).toMatch(/next_tour_stop/);
  });

  it('a lobe that is one region of the same name is told in two or three sentences', () => {
    expect(tourStop(3).instruction).toBe('In two or three sentences, say what your Cerebellum does, from summary and its region. Then call next_tour_stop.');
    expect(tourStop(4).instruction).toBe('In two or three sentences, say what your Brain Stem does, from summary and its region. Then call next_tour_stop.');
  });

  it('the limbic stop names its one painted region after the lobe', () => {
    expect(tourStop(6).instruction).toContain('in this order, saying its name as you begin, so it lights as you name it: Cingulate Cortex. Then call next_tour_stop to finish the tour.');
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
