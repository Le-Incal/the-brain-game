/**
 * Lobes are the 7 divisions in brainRegions.json; the guide can light a whole
 * one and tour them in order. Stop content comes from our own vetted region
 * descriptions, so the guide talks from them rather than improvising.
 */
import brainRegions from '../data/brainRegions.json';

export const LOBE_NAMES = brainRegions.divisions.map(({ name }) => name);

// Least travel around the specimen.
export const TOUR_ORDER = [
  'Frontal Lobe',
  'Parietal Lobe',
  'Occipital Lobe',
  'Cerebellum',
  'Brain Stem',
  'Temporal Lobe',
  'Limbic Lobe',
];

// We paint only the cingulate; the limbic lobe is more than that.
export const LIMBIC_NOTE =
  'Only my cingulate cortex is painted here. It is part of what Broca called the limbic lobe; its parahippocampal and hippocampal parts are not painted on me.';

const REGION_BY_ID = new Map(brainRegions.regions.map((region) => [region.id, region]));
const simplify = (text) => text.toLowerCase().replace(/^the\s+/, '').replace(/\s+lobe$/, '').replace(/\s+/g, ' ').trim();

export function normalizeLobe(input) {
  if (typeof input !== 'string') return null;
  const wanted = simplify(input);
  if (!wanted) return null;
  return LOBE_NAMES.find((name) => simplify(name) === wanted) ?? null;
}

export function lobeRegionIds(lobe) {
  return brainRegions.divisions.find(({ name }) => name === lobe)?.regions ?? [];
}

export function tourStop(index) {
  const lobe = TOUR_ORDER[index];
  const last = index === TOUR_ORDER.length - 1;
  const stop = {
    stop: index + 1,
    of: TOUR_ORDER.length,
    lobe,
    regions: lobeRegionIds(lobe).map((id) => {
      const { name, clickDescription } = REGION_BY_ID.get(id);
      return { id, name, clickDescription };
    }),
    next: last ? null : TOUR_ORDER[index + 1],
    instruction: last
      ? 'In two or three sentences (about 30 seconds), describe this part of me from these regions, then call next_tour_stop to finish the tour.'
      : 'In two or three sentences (about 30 seconds), describe this part of me from these regions, then call next_tour_stop.',
  };
  if (lobe === 'Limbic Lobe') stop.note = LIMBIC_NOTE;
  return stop;
}
