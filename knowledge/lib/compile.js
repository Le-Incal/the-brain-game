// Compile: validate, then run the reasoner (R1 to R10) and emit the runtime graph.
// Derived facts are recomputed every build and never written back to sources.
import { loadSchema } from './schema.js';
import { validate } from './validate.js';
import { buildModel, edgesOf, resolvePointer, partOfAncestors, isPositive } from './model.js';

const uniq = (xs) => [...new Set(xs)];

export function compile(ds, { sor, statuses = ['approved'], builtAt = new Date().toISOString(), dataVersion = 'dev', asOf } = {}) {
  const { errors } = validate(ds, { sor, asOf });
  if (errors.length) {
    const codes = uniq(errors.map((e) => e.code));
    const err = new Error(`Refusing to compile: ${errors.length} validation errors (${codes.join(', ')})`);
    err.errors = errors;
    throw err;
  }
  const schema = loadSchema();
  const model = buildModel(ds, sor, { statuses });
  const include = (id) => model.nodes.has(id) || model.assertions.has(id);

  // ---------- nodes ----------
  const nodes = {};
  for (const n of model.nodes.values()) {
    const { provenance, annotationProvenance, ...rest } = n;
    nodes[n.id] = {
      ...rest,
      status: provenance?.status,
      sources: provenance?.sources ?? [],
      derivedFields: {},
    };
  }
  for (const r of sor.brainRegions.regions) {
    const g = sor.regionGeometry.regions[String(r.id)];
    Object.assign(nodes[`region:${r.id}`], {
      subtitle: r.subtitle, description: r.clickDescription, factoid: r.factoid, hex: r.hex,
      centroid: g?.anchor ?? null,
    });
  }

  // ---------- asserted and canon edges ----------
  const edges = [];
  const edgeKey = new Set();
  const push = (e) => {
    const k = `${e.type}|${e.from}|${e.to}|${e.id ?? ''}`;
    if (edgeKey.has(k)) return;
    edgeKey.add(k);
    edges.push(e);
  };
  for (const r of sor.brainRegions.regions) {
    push({ id: `canon:region-${r.id}--part-of--division-${r.divisionId}`, type: 'PART_OF', from: `region:${r.id}`, to: `division:${r.divisionId}`, props: {}, canon: true, derived: false, positive: true });
  }
  const asserted = [];
  for (const a of model.assertions.values()) {
    if (!include(a.subject) || !include(a.object)) continue;
    const e = {
      id: a.id, type: a.predicate, from: a.subject, to: a.object, props: { ...(a.props ?? {}) },
      sources: a.provenance?.sources ?? [], status: a.provenance?.status, audience: a.audience ?? 'all',
      positive: isPositive(a), derived: false,
    };
    // R9: reverse-inference caveat on imaging-only evidence.
    const ev = e.props.evidence;
    if (Array.isArray(ev) && ev.length && ev.every((x) => x === 'imaging')) e.inferenceCaveat = 'reverse_inference';
    asserted.push(e);
    push(e);
  }
  const derive = (type, from, to, rule, derivedFrom, props = {}) =>
    push({ id: `derived:${rule}:${type}:${from}--${to}`, type, from, to, props, derived: true, rule, derivedFrom, positive: true });

  // ---------- R1 transitive part-of ----------
  for (const n of model.nodes.values()) {
    if (n.class !== 'Structure') continue;
    const direct = new Set(edgesOf(model, 'PART_OF', { positiveOnly: true }).filter((a) => a.subject === n.id).map((a) => a.object));
    for (const anc of partOfAncestors(model, n.id).ancestors) {
      if (!direct.has(anc.id)) derive('PART_OF', n.id, anc.id, 'R1', anc.path);
      const region = model.nodes.get(anc.id);
      if (region?.class === 'Region' && region.divisionId) derive('PART_OF', n.id, `division:${region.divisionId}`, 'R1', [...anc.path, `canon:region-${anc.id.split(':')[1]}--part-of--division-${region.divisionId}`]);
    }
  }

  // ---------- R2 inverses ----------
  for (const e of edges.filter((x) => !x.derived && x.positive)) {
    const inv = schema.inverses[e.type];
    if (inv) derive(inv, e.to, e.from, 'R2', [e.id]);
  }

  // ---------- R3 point-to and R4 laterality inheritance ----------
  for (const n of model.nodes.values()) {
    if (n.class !== 'Structure') continue;
    const ptr = resolvePointer(model, n.id);
    nodes[n.id].pointTo = ptr?.region ?? null;
    nodes[n.id].hint = ptr?.hint ?? null;
    nodes[n.id].derivedFields.pointTo = 'R3';
    if (!n.lateralization) {
      const leftAncestor = partOfAncestors(model, n.id).ancestors.find((x) => model.nodes.get(x.id)?.lateralization === 'left');
      if (leftAncestor) {
        nodes[n.id].lateralization = 'left';
        nodes[n.id].derivedFields.lateralization = 'R4';
      }
    }
  }
  const regionOf = (id) => (nodes[id]?.class === 'Region' ? id : nodes[id]?.pointTo ?? null);

  // ---------- R5 network involvement ----------
  const subserves = asserted.filter((e) => e.type === 'SUBSERVES' && e.positive);
  for (const m of asserted.filter((e) => e.type === 'MEMBER_OF' && e.positive)) {
    for (const s of subserves.filter((x) => x.from === m.to)) {
      derive('INVOLVED_IN', m.from, s.to, 'R5', [m.id, s.id], { confidence: 'approximate', via: m.to });
    }
  }

  // ---------- R6 tract adjacency ----------
  for (const c of asserted.filter((e) => e.type === 'CONNECTS' && e.positive)) {
    derive('CONNECTED_VIA', c.to, c.from, 'R6', [c.id], { endpoint: c.props.endpoint });
  }

  // ---------- R8 prominent visibility ----------
  for (const [view, list] of Object.entries(sor.regionGeometry.labelsPerView)) {
    for (const item of list) derive('VISIBLE_FROM', `region:${item.id}`, `view:${view}`, 'R8', ['src/data/regionGeometry.json'], { fraction: item.visibleFraction });
  }

  // ---------- helpers for R7 and indexes ----------
  const out = (type, from) => edges.filter((e) => e.type === type && e.from === from && e.positive);
  const into = (type, to) => edges.filter((e) => e.type === type && e.to === to && e.positive);
  const regionsForFunction = (fid, role) => uniq(out('SUPPORTED_BY', fid).filter((e) => !role || e.props.role === role).map((e) => regionOf(e.to)).filter(Boolean));

  // ---------- R7 word targets ----------
  const words = {};
  const bank = new Map(sor.wordBank.map((w) => [w.word, w]));
  for (const n of Object.values(nodes).filter((x) => x.class === 'Word')) {
    const targets = new Set();
    const alternates = new Set();
    const expresses = out('EXPRESSES', n.id).map((e) => e.to);
    for (const t of expresses) {
      const cls = nodes[t]?.class;
      if (cls === 'Function') {
        regionsForFunction(t, 'primary').forEach((r) => targets.add(r));
        regionsForFunction(t, 'contributing').forEach((r) => alternates.add(r));
      } else if (cls === 'Phenomenon') {
        for (const e of out('EXPLAINED_BY', t)) {
          if (nodes[e.to]?.class === 'Function') regionsForFunction(e.to, 'primary').forEach((r) => targets.add(r));
          else if (regionOf(e.to)) targets.add(regionOf(e.to));
        }
      } else if (cls === 'Condition') {
        out('AFFECTS', t).map((e) => regionOf(e.to)).filter(Boolean).forEach((r) => targets.add(r));
      }
    }
    for (const t of targets) alternates.delete(t);
    const b = bank.get(n.text);
    let reconciliation = 'unmapped';
    if (b && expresses.length) {
      const all = new Set([...targets, ...alternates]);
      const targetOk = all.has(`region:${b.targetRegion}`);
      const altsOk = (b.acceptAlternates ?? []).every((x) => all.has(`region:${x}`));
      reconciliation = targetOk && altsOk ? 'consistent' : !targetOk ? 'target-unsupported' : 'alternates-unsupported';
    }
    words[n.id] = {
      text: n.text, tier: n.tier, expresses,
      derivedTargets: [...targets].sort(), derivedAlternates: [...alternates].sort(),
      bank: b ? { targetRegion: b.targetRegion, acceptAlternates: b.acceptAlternates ?? [] } : null,
      reconciliation, rule: 'R7',
    };
  }

  // ---------- debates ----------
  const debates = edges.filter((e) => e.type === 'CONTESTS').map((c) => {
    const a = model.assertions.get(c.from); const b = model.assertions.get(c.to);
    return { id: c.id, assertions: [c.from, c.to], subject: b?.subject ?? a?.subject, object: b?.object ?? a?.object, predicate: b?.predicate ?? a?.predicate, sources: c.sources };
  });

  // ---------- R10 myths per region, and the per-region index ----------
  const mythRegions = new Map();
  for (const d of edges.filter((e) => e.type === 'DEBUNKS')) {
    const touched = [];
    const a = model.assertions.get(d.from);
    if (a) touched.push(a.subject, a.object); else touched.push(d.from);
    for (const t of touched) {
      const r = regionOf(t);
      if (!r) continue;
      if (!mythRegions.has(r)) mythRegions.set(r, new Set());
      mythRegions.get(r).add(d.to);
    }
  }
  const byRegion = {};
  for (const r of sor.brainRegions.regions) {
    const rid = `region:${r.id}`;
    const inside = Object.values(nodes).filter((x) => x.class === 'Structure' && x.pointTo === rid).map((x) => x.id);
    const targets = new Set([rid, ...inside]);
    const sup = edges.filter((e) => e.type === 'SUPPORTED_BY' && e.positive && targets.has(e.to));
    byRegion[r.id] = {
      name: r.name,
      structures: inside.sort(),
      functions: sup.map((e) => ({ id: e.from, via: e.to === rid ? null : e.to, role: e.props.role, evidence: e.props.evidence, lateralization: e.props.lateralization, confidence: e.props.confidence, caveat: e.inferenceCaveat ?? null })),
      networks: out('MEMBER_OF', rid).map((e) => ({ id: e.to, role: e.props.role, confidence: e.props.confidence })),
      tracts: uniq(edges.filter((e) => e.type === 'CONNECTS' && e.positive && targets.has(e.to)).map((e) => e.from)),
      conditions: uniq(edges.filter((e) => e.type === 'AFFECTS' && e.positive && targets.has(e.to)).map((e) => e.from)),
      arteries: uniq(out('SUPPLIED_BY', rid).map((e) => e.to)),
      people: uniq([...into('DESCRIBED', rid).map((e) => e.from), ...out('NAMED_AFTER', rid).map((e) => e.to)]),
      myths: [...(mythRegions.get(rid) ?? [])].sort(),
      views: out('VISIBLE_FROM', rid).map((e) => e.to),
      coverageExemptions: nodes[rid].coverageExemptions ?? [],
    };
  }

  // ---------- aliases ----------
  const aliases = {};
  const aliasConflicts = [];
  const addAlias = (text, id) => {
    const k = String(text).toLowerCase().trim();
    if (!k) return;
    if (aliases[k] && aliases[k] !== id) { aliasConflicts.push({ text: k, ids: [aliases[k], id] }); return; }
    aliases[k] = id;
  };
  for (const n of Object.values(nodes)) {
    if (['Source', 'Doc', 'View'].includes(n.class)) continue;
    if (n.label) addAlias(n.label, n.id);
    for (const al of n.aliases ?? []) addAlias(al.text, n.id);
  }

  return { schemaVersion: schema.version, dataVersion, builtAt, statuses, nodes, edges, byRegion, words, debates, aliases, aliasConflicts };
}
