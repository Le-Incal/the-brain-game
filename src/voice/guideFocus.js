/**
 * What the left panel shows while the guide is showing something: the same
 * entry a click opens for a region, and a lobe's own entry for a lobe. The
 * Cerebellum and the Brain Stem are each one painted region, so they reuse
 * that region's entry.
 */
import brainRegions from '../data/brainRegions.json';
import lobePanels from '../data/lobePanels.json';

export const LOBE_PANELS = lobePanels.lobes;

const REGION_BY_ID = new Map(brainRegions.regions.map((region) => [region.id, region]));
const sameIds = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((id, i) => id === [...b].sort((x, y) => x - y)[i]);

function regionEntry(id) {
  const region = REGION_BY_ID.get(id);
  if (!region) return null;
  return { kind: 'region', id, name: region.name, subtitle: region.subtitle, description: region.clickDescription };
}

/** The panel entry for what the guide has lit (a region, or a whole lobe), or null. */
export function guideFocusEntry(lit, focus = null) {
  const ids = lit === null || lit === undefined ? [] : [].concat(lit);
  const focused = focus === null || focus === undefined ? [] : [].concat(focus);
  if (focused.length === 1) return regionEntry(focused[0]);
  if (ids.length === 1) return regionEntry(ids[0]);
  if (ids.length === 0) return null;
  const division = brainRegions.divisions.find(({ regions }) => sameIds(regions, ids));
  const panel = division && LOBE_PANELS[division.name];
  if (!panel) return null;
  return { kind: 'lobe', lobe: division.name, name: division.name, subtitle: panel.subtitle, description: panel.description };
}
