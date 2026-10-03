// Validation on every load. Typed errors, never auto-corrects, never mutates input.
import { loadSchema, loadVocabulary, parseType, CLASS_PREFIX, ID_PATTERN } from './schema.js';
import { buildModel, normalizeName, statusOf, edgesOf, resolvePointer, partOfAncestors, isPositive } from './model.js';

const wordCount = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const DAY = 86400000;

export function validate(ds, { sor, asOf = new Date().toISOString().slice(0, 10), statuses = ['proposed', 'approved'] } = {}) {
  const schema = loadSchema();
  const vocab = loadVocabulary();
  const errors = [];
  const err = (code, id, message) => errors.push({ code, id: id ?? null, message, file: ds.fileOf?.[id] ?? null });

  const model = buildModel(ds, sor, { statuses });
  for (const id of model.duplicates) err('DUPLICATE_ID', id, `id ${id} is used by more than one record`);

  // Every record by id, regardless of status (for reference resolution).
  const allNodes = new Map();
  for (const n of model.nodes.values()) allNodes.set(n.id, n);
  for (const n of ds.nodes) if (n?.id && !allNodes.has(n.id)) allNodes.set(n.id, n);
  const allAssertions = new Map();
  for (const a of ds.assertions) if (a?.id && !allAssertions.has(a.id)) allAssertions.set(a.id, a);
  const exists = (id) => allNodes.has(id) || allAssertions.has(id);
  const classOf = (id) => (allNodes.get(id)?.class ?? (allAssertions.has(id) ? 'Assertion' : null));

  // ---------- typed value checking ----------
  function checkValue(value, type, ctx) {
    const ast = typeof type === 'string' ? parseType(type) : type;
    const where = `${ctx.id} ${ctx.path}`;
    switch (ast.kind) {
      case 'nullable': if (value !== null) checkValue(value, ast.of, ctx); return;
      case 'list':
        if (!Array.isArray(value)) return err('SCHEMA_SHAPE', ctx.id, `${where} must be a list`);
        value.forEach((v, i) => checkValue(v, ast.of, { ...ctx, path: `${ctx.path}[${i}]` }));
        return;
      case 'string': if (typeof value !== 'string' || !value.trim()) err('SCHEMA_SHAPE', ctx.id, `${where} must be a non-empty string`); return;
      case 'int': if (!Number.isInteger(value)) err('SCHEMA_SHAPE', ctx.id, `${where} must be an integer`); return;
      case 'number': if (typeof value !== 'number' || Number.isNaN(value)) err('SCHEMA_SHAPE', ctx.id, `${where} must be a number`); return;
      case 'bool': if (typeof value !== 'boolean') err('SCHEMA_SHAPE', ctx.id, `${where} must be true or false`); return;
      case 'date': if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) err('SCHEMA_SHAPE', ctx.id, `${where} must be a YYYY-MM-DD date`); return;
      case 'year': if (!Number.isInteger(value) || value < -3000 || value > 2100) err('SCHEMA_SHAPE', ctx.id, `${where} must be a year`); return;
      case 'object': if (!isObj(value)) err('SCHEMA_SHAPE', ctx.id, `${where} must be a map`); return;
      case 'id':
        if (typeof value !== 'string' || !ID_PATTERN.test(value)) return err('SCHEMA_SHAPE', ctx.id, `${where} is not a well-formed id`);
        if (ctx.mustExist && !exists(value)) err('UNKNOWN_ID', ctx.id, `${where} refers to unknown id ${value}`);
        return;
      case 'vocab': {
        const list = vocab[ast.name];
        if (!Array.isArray(list)) return err('SCHEMA_SHAPE', ctx.id, `${where} uses unknown vocabulary ${ast.name}`);
        if (!list.includes(value)) err('UNKNOWN_TERM', ctx.id, `${where}: "${value}" is not in vocabulary ${ast.name}`);
        return;
      }
      case 'ref': {
        if (typeof value !== 'string') return err('SCHEMA_SHAPE', ctx.id, `${where} must be an id`);
        if (!exists(value)) return err('UNKNOWN_ID', ctx.id, `${where} refers to unknown id ${value}`);
        const c = classOf(value);
        if (!ast.classes.includes(c)) err('SCHEMA_SHAPE', ctx.id, `${where} must reference ${ast.classes.join(' or ')}, got ${c}`);
        return;
      }
      case 'value': return checkValueType(value, ast.name, ctx);
      default: return err('SCHEMA_SHAPE', ctx.id, `${where} has unknown type ${ast.kind}`);
    }
  }

  function checkValueType(value, name, ctx) {
    const vt = schema.valueTypes[name];
    const where = `${ctx.id} ${ctx.path}`;
    if (!vt) return err('SCHEMA_SHAPE', ctx.id, `${where} has unknown value type ${name}`);
    const missingCode = name === 'Provenance' ? 'MISSING_PROVENANCE' : 'SCHEMA_SHAPE';
    if (!isObj(value)) return err(missingCode, ctx.id, `${where} must be a ${name} map`);
    const req = vt.required ?? {};
    const opt = vt.optional ?? {};
    for (const [k, t] of Object.entries(req)) {
      if (value[k] === undefined || value[k] === null || value[k] === '') err(missingCode, ctx.id, `${where}.${k} is required`);
      else checkValue(value[k], t, { ...ctx, path: `${ctx.path}.${k}` });
    }
    for (const [k, v] of Object.entries(value)) {
      if (k in req) continue;
      if (!(k in opt)) { err('SCHEMA_SHAPE', ctx.id, `${where}.${k} is not a ${name} field`); continue; }
      if (v !== undefined && v !== null) checkValue(v, opt[k], { ...ctx, path: `${ctx.path}.${k}` });
    }
    if (name === 'Text' && vt.limits) {
      for (const [reg, max] of Object.entries(vt.limits)) {
        if (value[reg] && wordCount(value[reg]) > max) err('TEXT_TOO_LONG', ctx.id, `${where}.${reg} has ${wordCount(value[reg])} words (max ${max})`);
      }
    }
    if (name === 'Provenance') {
      if (ctx.requiresSources && Array.isArray(value.sources) && value.sources.length === 0) {
        err('MISSING_PROVENANCE', ctx.id, `${where}.sources must cite at least one Source`);
      }
      if (value.status === 'superseded' && (!value.supersededBy || !value.supersededOn)) {
        err('ORPHAN_SUPERSEDE', ctx.id, `${ctx.id} is superseded without supersededBy and supersededOn`);
      }
      if (vocab.shareAlikeLicenses.includes(value.license)) {
        const file = ds.fileOf?.[ctx.id] ?? '';
        if (!file.includes('share-alike/')) err('SHARE_ALIKE_LEAK', ctx.id, `${ctx.id} carries ${value.license} content outside data/share-alike/`);
      }
    }
    if (name === 'Xref' && value.matchType === 'exact' && value.verified !== true) {
      err('UNSAFE_IDENTITY', ctx.id, `${where} claims an exact match to ${value.scheme} ${value.value} without verification`);
    }
  }

  // ---------- nodes ----------
  const common = schema.common;
  for (const n of ds.nodes) {
    if (!isObj(n)) { err('SCHEMA_SHAPE', null, 'node record is not a map'); continue; }
    const id = n.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) { err('SCHEMA_SHAPE', id, `node id "${id}" is not well formed`); continue; }
    const cls = schema.classes[n.class];
    if (!cls) { err('SCHEMA_SHAPE', id, `${id} has unknown class "${n.class}"`); continue; }
    if (CLASS_PREFIX[n.class] && !id.startsWith(`${CLASS_PREFIX[n.class]}:`)) err('SCHEMA_SHAPE', id, `${id} must start with ${CLASS_PREFIX[n.class]}:`);
    if (cls.idPattern && !cls.idPattern.test(id)) err('SCHEMA_SHAPE', id, `${id} does not match the ${n.class} id pattern`);

    const required = { ...common.required, ...cls.required };
    if (cls.labelRequired && !cls.synthesized) required.label = 'string';
    const optional = { ...common.optional, ...cls.optional };
    for (const [k, t] of Object.entries(required)) {
      if (k === 'provenance') continue;
      if (n[k] === undefined || n[k] === null && !String(t).startsWith('nullable')) err('SCHEMA_SHAPE', id, `${id} is missing required field ${k}`);
      else checkValue(n[k], t, { id, path: k, mustExist: true });
    }
    checkValue(n.provenance, 'Provenance', { id, path: 'provenance', requiresSources: cls.requiresSources });
    for (const [k, v] of Object.entries(n)) {
      if (k in required) continue;
      if (cls.forbidden.includes(k)) { err('REGION_REDEFINED', id, `${id} sets ${k}, which belongs to ${cls.synthesized}`); continue; }
      if (!(k in optional)) { err('SCHEMA_SHAPE', id, `${id} has unknown field ${k}`); continue; }
      if (v !== undefined && v !== null) checkValue(v, optional[k], { id, path: k, mustExist: true });
    }
    if (n.class === 'Source') {
      if (vocab.forbiddenSourceTypes.includes(n.type)) err('FORBIDDEN_SOURCE', id, `${id} is of forbidden type ${n.type}`);
      else if (!vocab.sourceType.includes(n.type)) err('UNKNOWN_TERM', id, `${id} type "${n.type}" is not in vocabulary sourceType`);
      if (n.url) {
        let host = '';
        try { host = new URL(n.url).hostname; } catch { err('SCHEMA_SHAPE', id, `${id} url is not a URL`); }
        if (vocab.forbiddenSourceHosts.some((h) => host === h || host.endsWith(`.${h}`))) err('FORBIDDEN_SOURCE', id, `${id} cites forbidden host ${host}`);
      }
    }
    if (n.class === 'Doc') {
      if (!ds.docs.some((d) => d.path === n.path)) err('UNKNOWN_ID', id, `${id} points at missing file ${n.path}`);
    }
    if (n.class === 'Condition' && n.informationalOnly !== true) err('SCHEMA_SHAPE', id, `${id} must be informationalOnly: true`);
    // Audience leaks
    const audience = n.audience ?? cls.defaultAudience;
    if (audience === 'adult' && n.text?.child) err('AUDIENCE_LEAK', id, `${id} is adult-only but has a child-register line`);
    for (const q of n.quantities ?? []) {
      if (q?.audience === 'adult' && /\d/.test(n.text?.child ?? '')) err('AUDIENCE_LEAK', id, `${id} has an adult-only quantity and numbers in its child register`);
    }
    // Living people must be re-checked
    if (n.class === 'Person' && n.living === true && ['proposed', 'approved'].includes(statusOf(n))) {
      const checked = Date.parse(n.statusCheckedOn ?? '');
      if (Number.isNaN(checked) || Date.parse(asOf) - checked > 180 * DAY) err('STALE_PERSON', id, `${id} is living and was last checked ${n.statusCheckedOn ?? 'never'}`);
    }
  }

  // ---------- assertions ----------
  const aSpec = schema.assertion;
  for (const a of ds.assertions) {
    if (!isObj(a)) { err('SCHEMA_SHAPE', null, 'assertion record is not a map'); continue; }
    const id = a.id;
    if (typeof id !== 'string' || !id.startsWith('assert:') || !ID_PATTERN.test(id)) { err('SCHEMA_SHAPE', id, `assertion id "${id}" is not well formed`); continue; }
    for (const k of Object.keys(aSpec.required)) if (a[k] === undefined && k !== 'provenance') err('SCHEMA_SHAPE', id, `${id} is missing ${k}`);
    for (const k of Object.keys(a)) if (!(k in aSpec.required) && !(k in aSpec.optional)) err('SCHEMA_SHAPE', id, `${id} has unknown field ${k}`);
    if (a.audience !== undefined) checkValue(a.audience, 'vocab:audience', { id, path: 'audience' });
    for (const k of ['validAsOf', 'reviewBy']) if (a[k] !== undefined) checkValue(a[k], 'date', { id, path: k });
    const rel = schema.relations[a.predicate];
    checkValue(a.provenance, 'Provenance', { id, path: 'provenance', requiresSources: rel ? rel.requiresSources : true });
    if (!rel) { err('BAD_DOMAIN', id, `${id} uses unknown predicate ${a.predicate}`); continue; }
    if (rel.derivedOnly) { err('BAD_DOMAIN', id, `${a.predicate} is derived by the reasoner and may not be asserted`); continue; }
    let endpointsOk = true;
    for (const end of ['subject', 'object']) {
      if (typeof a[end] !== 'string') { endpointsOk = false; continue; }
      if (!exists(a[end])) { err('UNKNOWN_ID', id, `${id} ${end} ${a[end]} does not exist`); endpointsOk = false; }
    }
    if (endpointsOk) {
      const sc = classOf(a.subject); const oc = classOf(a.object);
      const okDomain = rel.domain.includes('any') || rel.domain.includes(sc);
      const okRange = rel.range.includes('any') || rel.range.includes(oc);
      if (!okDomain || !okRange) err('BAD_DOMAIN', id, `${a.predicate} cannot join ${sc} to ${oc}`);
    }
    const props = a.props ?? {};
    if (!isObj(props)) { err('SCHEMA_SHAPE', id, `${id} props must be a map`); continue; }
    const allowed = { ...schema.universalProps, ...rel.props };
    for (const [k, spec] of Object.entries(allowed)) {
      const s = typeof spec === 'string' ? { type: spec } : spec;
      if (props[k] === undefined) { if (s.required) err('SCHEMA_SHAPE', id, `${id} is missing prop ${k}`); continue; }
      checkValue(props[k], s.type, { id, path: `props.${k}` });
      if (s.maxWords && wordCount(props[k]) > s.maxWords) err('TEXT_TOO_LONG', id, `${id} props.${k} has ${wordCount(props[k])} words (max ${s.maxWords})`);
    }
    for (const k of Object.keys(props)) if (!(k in allowed)) err('SCHEMA_SHAPE', id, `${id} has unknown prop ${k}`);
    const p = a.provenance;
    if (p?.status === 'superseded' && p.supersededBy && !exists(p.supersededBy)) err('UNKNOWN_ID', id, `${id} supersededBy ${p.supersededBy} does not exist`);
  }

  // ---------- graph rules over the active set ----------
  const leftOnly = (nid) => model.nodes.get(nid)?.lateralization === 'left';
  for (const a of model.assertions.values()) {
    const lat = a.props?.lateralization;
    if (lat && lat !== 'left' && (leftOnly(a.subject) || leftOnly(a.object))) {
      err('LATERALITY_VIOLATION', a.id, `${a.id} says ${lat}, but ${leftOnly(a.object) ? a.object : a.subject} exists only on the left`);
    }
  }

  for (const n of model.nodes.values()) {
    if (n.class === 'Function') {
      const sup = edgesOf(model, 'SUPPORTED_BY', { positiveOnly: true }).filter((a) => a.subject === n.id);
      const hasPrimary = sup.some((a) => a.props?.role === 'primary');
      if (!hasPrimary && !(n.distributed === true && sup.length >= 2)) err('NO_PRIMARY', n.id, `${n.id} has no primary region and is not marked distributed with two or more contributors`);
    }
    if (n.class === 'Structure') {
      const ptr = resolvePointer(model, n.id);
      if ((n.visibility === 'hidden' || n.visibility === 'partly') && !n.diffuse && !ptr) err('UNPOINTABLE', n.id, `${n.id} is ${n.visibility} but nothing tells the guide where to turn`);
      if (n.visibility === 'not_present' && ptr) err('FALSE_POINTER', n.id, `${n.id} is not on the model but points at ${ptr.region}`);
    }
    if (n.class === 'Myth') {
      const corrected = edgesOf(model, 'DEBUNKS').some((a) => a.object === n.id);
      if (!corrected && n.standaloneCorrection !== true) err('MYTH_UNCORRECTED', n.id, `${n.id} has no fact correcting it and is not marked standaloneCorrection`);
    }
  }

  // Region and division names belong to brainRegions.json.
  const canonNames = new Map();
  for (const n of model.nodes.values()) if (n.canon && n.class !== 'View') canonNames.set(normalizeName(n.label), n.id);
  for (const n of ds.nodes) {
    if (!n?.label || n.class === 'Region' || n.class === 'Division' || n.class === 'Source' || n.class === 'Doc') continue;
    const hit = canonNames.get(normalizeName(n.label));
    if (hit) err('REGION_REDEFINED', n.id, `${n.id} duplicates ${hit} ("${n.label}"); use the canon id instead`);
  }

  // Debates must be paired.
  const contests = edgesOf(model, 'CONTESTS');
  for (const a of model.assertions.values()) {
    if (a.props?.confidence !== 'debated') continue;
    const paired = contests.some((c) => c.subject === a.id || c.object === a.id);
    const noted = a.debateNote && (a.provenance?.sources?.length ?? 0) >= 2;
    if (!paired && !noted) err('UNPAIRED_DEBATE', a.id, `${a.id} is debated but has no contesting partner or debate note`);
  }

  // Derivation conflicts: part-of cycles and laterality inheritance.
  const reportedCycle = new Set();
  for (const n of model.nodes.values()) {
    if (n.class !== 'Structure') continue;
    const { ancestors, cycle } = partOfAncestors(model, n.id);
    if (cycle && !reportedCycle.has(n.id)) { reportedCycle.add(n.id); err('DERIVATION_CONFLICT', n.id, `${n.id} is part of itself through a PART_OF cycle`); }
    if (n.lateralization && n.lateralization !== 'left' && ancestors.some((x) => leftOnly(x.id))) {
      err('DERIVATION_CONFLICT', n.id, `${n.id} is ${n.lateralization} but sits inside a left-only node`);
    }
  }

  // KB name drift: "| 8 Superior Parietal" or "region 14 (Fusiform" style pairs.
  const regionNames = new Map();
  for (const n of model.nodes.values()) {
    if (n.class !== 'Region') continue;
    const num = Number(n.id.split(':')[1]);
    const names = [n.label, ...(n.aliases ?? []).filter((x) => x.kind !== 'misnomer').map((x) => x.text)];
    regionNames.set(num, names.map((s) => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean)));
  }
  const pair = /(?:\bregions?\s+|[|,]\s*)(\d{1,2})\s+([A-Z][A-Za-z']*(?:\s+[A-Z][A-Za-z']*)*)/g;
  for (const doc of ds.docs) {
    for (const m of doc.content.matchAll(pair)) {
      const num = Number(m[1]);
      if (!regionNames.has(num)) continue;
      const words = m[2].toLowerCase().split(/\s+/);
      const ok = regionNames.get(num).some((name) => words.every((w, i) => name[i] === w));
      if (!ok) err('NAME_DRIFT', doc.path, `${doc.path} calls region ${num} "${m[2]}"`);
    }
  }

  return { errors, model };
}
