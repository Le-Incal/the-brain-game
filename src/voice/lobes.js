/**
 * Lobes are the 7 divisions in brainRegions.json; the guide can light a whole
 * one and tour them in order. Stop content comes from our own vetted region
 * descriptions, so the guide talks from them rather than improvising.
 */
import brainRegions from '../data/brainRegions.json';
import lobePanels from '../data/lobePanels.json';

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

/** "short" when the player asked for a quick, short or brief tour; otherwise "full". */
export function normalizeTourLength(value) {
  return typeof value === 'string' && /\b(short|quick|brief)\b/i.test(value) ? 'short' : 'full';
}

/**
 * Kyle, 2026-10-23: a full stop lights the lobe while the guide says what it
 * does as a whole, then each region lights as she names it, in order. A short
 * tour stays at lobe level, in words a six-year-old follows.
 */
export function tourStop(index, { length = 'full' } = {}) {
  const lobe = TOUR_ORDER[index];
  const last = index === TOUR_ORDER.length - 1;
  const then = last ? 'Then call next_tour_stop to finish the tour.' : 'Then call next_tour_stop.';
  const stop = {
    stop: index + 1,
    of: TOUR_ORDER.length,
    lobe,
    // Cerebellum and Brain Stem have no lobe panel: their one region's text serves.
    summary: lobePanels.lobes[lobe]?.description ?? REGION_BY_ID.get(lobeRegionIds(lobe)[0]).clickDescription,
    next: last ? null : TOUR_ORDER[index + 1],
  };
  if (length === 'short') {
    stop.instruction = `In one or two short, simple sentences a six-year-old would follow, say what your ${lobe} does, from summary. Name none of its regions. ${then}`;
    return stop;
  }
  stop.regions = lobeRegionIds(lobe).map((id) => {
    const { name, clickDescription } = REGION_BY_ID.get(id);
    return { id, name, clickDescription };
  });
  const named = stop.regions.filter(({ name }) => name !== lobe).map(({ name }) => name);
  stop.instruction = named.length
    ? `First say in one sentence what your ${lobe} does as a whole, from summary; it is lit as a whole. Then describe each of its regions in one sentence, in this order, saying its name as you begin, so it lights as you name it: ${named.join(', ')}. ${then}`
    : `In two or three sentences, say what your ${lobe} does, from summary and its region. ${then}`;
  if (lobe === 'Limbic Lobe') stop.note = LIMBIC_NOTE;
  return stop;
}
