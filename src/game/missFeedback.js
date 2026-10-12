/**
 * Teaching a miss (Kyle, 2026-10-11): the guide names the region the word
 * belonged to, says where it lies and why the word belongs there, while the
 * region still glows. The app hands it the facts (the region, our tested
 * spatial phrase, the word bank's sourced factoid) so it answers at once
 * without looking anything up, and adds nothing of its own.
 */

import brainRegions from '../data/brainRegions.json';
import { SPATIAL_HINTS } from './hints.js';

export const MISS_GLOW_WITH_GUIDE_MS = 6000;
// The glow as it was before the guide spoke about misses.
const MISS_GLOW_MS = { wrong: 2500, miss: 2000 };

const REGION_BY_ID = new Map(brainRegions.regions.map((region) => [region.id, region]));
const DIVISION_BY_ID = new Map(brainRegions.divisions.map((division) => [division.id, division]));

/** What, where and why for a missed word bank entry. */
export function missDetails(entry) {
  const region = REGION_BY_ID.get(entry.targetRegion);
  const division = DIVISION_BY_ID.get(region.divisionId);
  const spatial = SPATIAL_HINTS[region.id];
  // Where the lobe is the region, naming the lobe would say it twice.
  const where = division.regions.length > 1 ? `in my ${division.name}, ${spatial}` : spatial;
  return { word: entry.word, region: region.name, where, why: entry.factoid };
}

/** Long enough to still glow while the guide explains it; as before without a conversation. */
export function missGlowMs({ conversation, outcome }) {
  if (conversation) return MISS_GLOW_WITH_GUIDE_MS;
  return MISS_GLOW_MS[outcome] ?? MISS_GLOW_MS.wrong;
}
