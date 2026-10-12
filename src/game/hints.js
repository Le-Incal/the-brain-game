/**
 * Hints for the word in the air (Kyle, 2026-10-11). The word keeps falling.
 * On Easy the lobe alone scores, so the ladder starts with where to look,
 * then the lobe, then the region. Where-to-look is written by hand and
 * checked against where each region is painted on our model (hints.test.js).
 */

import brainRegions from '../data/brainRegions.json';

export const HINT_LEVELS = 3;

export const SPATIAL_HINTS = {
  1: 'at my very front',
  2: 'at my front, on the underside',
  3: 'high on my side, toward the front',
  4: 'on my top, toward the front, near the midline',
  5: 'across my top, a little toward the front, in a band',
  6: 'on my left side, toward the front',
  7: 'across my top, in a band at about the middle',
  8: 'high on my side, toward the back',
  9: 'on my side, toward the back',
  10: 'on my top, toward the back, near the midline',
  11: 'low on my side',
  12: 'low on my side, toward the back',
  13: 'low on my left side, toward the back',
  14: 'on my underside, toward the side',
  15: 'on my underside, near the midline',
  16: 'on the inner surface where my halves face each other; from below, toward the front',
  17: 'at my very back',
  18: 'at my back, toward the sides',
  19: 'tucked under my back',
  20: 'the stalk on my underside',
};

const REGION_BY_ID = new Map(brainRegions.regions.map((region) => [region.id, region]));
const DIVISION_BY_ID = new Map(brainRegions.divisions.map((division) => [division.id, division]));

/** The hint at `level` (1 to 3, higher repeats the last) for a word bank entry. */
export function hintFor(entry, level) {
  const region = REGION_BY_ID.get(entry.targetRegion);
  const division = DIVISION_BY_ID.get(region.divisionId);
  const lead = `For "${entry.word}": `;
  const rung = Math.max(1, Math.min(HINT_LEVELS, Math.floor(level)));
  const named = () => ({
    text: `${lead}it is my ${region.name}${region.hemisphere === 'left' ? ', on my left side only' : ''}.`,
    final: true,
  });
  if (rung === 1) return { text: `${lead}look ${SPATIAL_HINTS[region.id]}.`, final: false };
  // Where the lobe is the region, naming the lobe names the answer.
  if (rung === 2 && division.regions.length > 1) return { text: `${lead}it lies in my ${division.name}.`, final: false };
  return named();
}
