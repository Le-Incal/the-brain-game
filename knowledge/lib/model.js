// Shared model: synthesizes canon nodes from systems of record, merges region
// annotations, indexes records and resolves pointer paths.
import { loadVocabulary } from './schema.js';

const CANON_PROVENANCE = Object.freeze({
  sources: [], locator: 'src/data/brainRegions.json', license: 'own', method: 'human',
  assertedBy: 'system:join', assertedOn: '1970-01-01', status: 'approved',
});

export const normalizeName = (s) => String(s ?? '').toLowerCase().replace(/'s\b/g, 's').replace(/[^a-z0-9]/g, '');

export function canonNodes(sor) {
  const vocab = loadVocabulary();
  const out = [];
  for (const r of sor.brainRegions.regions) {
    out.push({
      id: `region:${r.id}`, class: 'Region', label: r.name, canon: true,
      hemisphere: r.hemisphere, divisionId: r.divisionId,
      ...(r.hemisphere === 'left' || r.hemisphere === 'right' ? { lateralization: r.hemisphere } : {}),
      provenance: CANON_PROVENANCE,
    });
  }
  for (const d of sor.brainRegions.divisions) {
    out.push({ id: `division:${d.id}`, class: 'Division', label: d.name, canon: true, provenance: CANON_PROVENANCE });
  }
  for (const v of vocab.viewId) {
    out.push({ id: `view:${v}`, class: 'View', label: v.replace('_', ' '), canon: true, provenance: { ...CANON_PROVENANCE, locator: 'vocabulary.viewId' } });
  }
  return out;
}

export const statusOf = (r) => r?.provenance?.status;
export const isPositive = (a) => a.props?.stance !== 'disputes' && a.props?.confidence !== 'debated';

/**
 * Build an indexed model. `statuses` decides which data records are active.
 * Returns { nodes: Map, assertions: Map, all: Map, dataIds: Set, duplicates: [] }.
 */
export function buildModel(ds, sor, { statuses = ['proposed', 'approved'] } = {}) {
  const canon = canonNodes(sor);
  const nodes = new Map(canon.map((n) => [n.id, { ...n }]));
  const assertions = new Map();
  const duplicates = [];
  const seen = new Set();
  const active = (r) => statuses.includes(statusOf(r));

  for (const n of ds.nodes) {
    if (!n || typeof n !== 'object' || !n.id) continue;
    if (seen.has(n.id)) { duplicates.push(n.id); continue; }
    seen.add(n.id);
    const base = nodes.get(n.id);
    if (base?.canon) {
      if (base.class !== n.class) { duplicates.push(n.id); continue; }
      if (active(n)) {
        const { id, class: _c, provenance, ...annotation } = n;
        Object.assign(base, annotation, { annotationProvenance: provenance });
      }
      continue;
    }
    if (active(n)) nodes.set(n.id, { ...n });
  }
  for (const a of ds.assertions) {
    if (!a || typeof a !== 'object' || !a.id) continue;
    if (seen.has(a.id)) { duplicates.push(a.id); continue; }
    seen.add(a.id);
    if (active(a)) assertions.set(a.id, a);
  }
  return { nodes, assertions, duplicates, statuses };
}

/** Edges of a predicate from the model, optionally positive only. */
export function edgesOf(model, predicate, { positiveOnly = false } = {}) {
  const out = [];
  for (const a of model.assertions.values()) {
    if (a.predicate !== predicate) continue;
    if (positiveOnly && !isPositive(a)) continue;
    out.push(a);
  }
  return out;
}

/**
 * Pointer resolution (rule R3): a structure points at the region reached by its
 * PART_OF chain or by LIES_BENEATH. Returns { region, hint, path } or null.
 */
export function resolvePointer(model, id, seen = new Set()) {
  if (seen.has(id)) return null;
  seen.add(id);
  const node = model.nodes.get(id);
  if (!node) return null;
  if (node.class === 'Region') return { region: id, hint: null, path: [] };
  const partOf = edgesOf(model, 'PART_OF', { positiveOnly: true }).filter((a) => a.subject === id);
  for (const a of partOf) {
    const target = model.nodes.get(a.object);
    if (target?.class === 'Region') return { region: a.object, hint: null, path: [a.id] };
  }
  const beneath = edgesOf(model, 'LIES_BENEATH', { positiveOnly: true }).find((a) => a.subject === id && model.nodes.get(a.object)?.class === 'Region');
  if (beneath) return { region: beneath.object, hint: beneath.props?.hint ?? null, path: [beneath.id] };
  for (const a of partOf) {
    const up = resolvePointer(model, a.object, seen);
    if (up) return { region: up.region, hint: up.hint, path: [a.id, ...up.path] };
  }
  // Fallbacks: a structure that straddles regions, then a sulcus or fissure that bounds one.
  const overlap = edgesOf(model, 'OVERLAPS', { positiveOnly: true }).find((a) => a.subject === id && model.nodes.get(a.object)?.class === 'Region');
  if (overlap) return { region: overlap.object, hint: null, path: [overlap.id] };
  const bounds = edgesOf(model, 'BOUNDS', { positiveOnly: true }).filter((a) => a.subject === id);
  const boundsRegion = bounds.find((a) => model.nodes.get(a.object)?.class === 'Region');
  if (boundsRegion) return { region: boundsRegion.object, hint: null, path: [boundsRegion.id] };
  for (const a of bounds) {
    const up = resolvePointer(model, a.object, seen);
    if (up) return { region: up.region, hint: up.hint, path: [a.id, ...up.path] };
  }
  return null;
}

/** Ancestors through PART_OF (structures and regions), with cycle detection. */
export function partOfAncestors(model, id) {
  const ancestors = [];
  const stack = [[id, []]];
  const visited = new Set([id]);
  let cycle = false;
  const partOf = edgesOf(model, 'PART_OF', { positiveOnly: true });
  while (stack.length) {
    const [cur, via] = stack.pop();
    for (const a of partOf.filter((e) => e.subject === cur)) {
      if (a.object === id) { cycle = true; continue; }
      if (visited.has(a.object)) continue;
      visited.add(a.object);
      const path = [...via, a.id];
      ancestors.push({ id: a.object, path });
      stack.push([a.object, path]);
    }
  }
  return { ancestors, cycle };
}
