// Loads the closed vocabulary and the declarative schema, and parses the
// field-type grammar used by classes.yaml, relations.yaml and value-types.yaml.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KNOWLEDGE_DIR = path.resolve(HERE, '..');

const readYaml = (rel) => parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, rel), 'utf8'), { merge: true });

export const ERROR_CODES = [
  'SCHEMA_SHAPE', 'UNKNOWN_TERM', 'UNKNOWN_ID', 'DUPLICATE_ID', 'BAD_DOMAIN',
  'MISSING_PROVENANCE', 'FORBIDDEN_SOURCE', 'NO_PRIMARY', 'LATERALITY_VIOLATION',
  'UNPOINTABLE', 'FALSE_POINTER', 'REGION_REDEFINED', 'NAME_DRIFT', 'UNPAIRED_DEBATE',
  'MYTH_UNCORRECTED', 'TEXT_TOO_LONG', 'AUDIENCE_LEAK', 'STALE_PERSON', 'SHARE_ALIKE_LEAK',
  'UNSAFE_IDENTITY', 'ORPHAN_SUPERSEDE', 'DERIVATION_CONFLICT',
];

export const CLASS_PREFIX = {
  Region: 'region', Division: 'division', View: 'view', Structure: 'structure', Function: 'function',
  Phenomenon: 'phenomenon', Network: 'network', Tract: 'tract', Circuit: 'circuit', CellType: 'celltype',
  Molecule: 'molecule', Process: 'process', Artery: 'artery', Condition: 'condition', Myth: 'myth',
  Person: 'person', Source: 'source', Doc: 'doc', Word: 'word', Guide: 'guide',
};

export const ID_PATTERN = /^[a-z0-9]+:[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;

let cachedVocab;
export function loadVocabulary() {
  if (!cachedVocab) cachedVocab = readYaml('vocabulary/vocabulary.yaml');
  return cachedVocab;
}

let cachedSchema;
export function loadSchema() {
  if (cachedSchema) return cachedSchema;
  const classesDoc = readYaml('schema/classes.yaml');
  const relationsDoc = readYaml('schema/relations.yaml');
  const valueTypes = readYaml('schema/value-types.yaml');
  const version = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'schema', 'VERSION'), 'utf8').trim();
  const defaults = classesDoc.defaults ?? {};
  const classes = {};
  for (const [name, spec] of Object.entries(classesDoc.classes)) {
    classes[name] = {
      required: spec?.required ?? {},
      optional: spec?.optional ?? {},
      forbidden: spec?.forbidden ?? [],
      idPattern: spec?.idPattern ? new RegExp(spec.idPattern) : null,
      synthesized: spec?.synthesized ?? null,
      labelRequired: spec?.labelRequired ?? defaults.labelRequired ?? true,
      requiresSources: spec?.requiresSources ?? defaults.requiresSources ?? true,
      defaultAudience: spec?.defaultAudience ?? 'all',
    };
  }
  const relations = {};
  for (const [name, spec] of Object.entries(relationsDoc.relations)) {
    relations[name] = {
      domain: spec.domain,
      range: spec.range,
      props: spec.props ?? {},
      symmetric: !!spec.symmetric,
      derivedOnly: !!spec.derivedOnly,
      requiresSources: spec.requiresSources ?? true,
    };
  }
  cachedSchema = {
    version,
    common: classesDoc.common,
    classes,
    relations,
    universalProps: relationsDoc.universalProps ?? {},
    assertion: relationsDoc.assertion,
    inverses: relationsDoc.inverses ?? {},
    valueTypes,
  };
  return cachedSchema;
}

/** Parse a field type string into a small AST. */
export function parseType(t) {
  const s = String(t).trim();
  let m;
  if ((m = s.match(/^list<(.+)>$/))) return { kind: 'list', of: parseType(m[1]) };
  if ((m = s.match(/^nullable<(.+)>$/))) return { kind: 'nullable', of: parseType(m[1]) };
  if (s.startsWith('vocab:')) return { kind: 'vocab', name: s.slice(6) };
  if (s.startsWith('ref:')) return { kind: 'ref', classes: s.slice(4).split('|') };
  if (['string', 'int', 'number', 'bool', 'date', 'year', 'id', 'object'].includes(s)) return { kind: s };
  return { kind: 'value', name: s };
}

/** Every type string used anywhere in the schema, flattened (for self-consistency tests). */
export function typeRefs(schema) {
  const out = [];
  const visit = (t) => {
    const ast = typeof t === 'string' ? parseType(t) : t;
    if (ast.kind === 'list' || ast.kind === 'nullable') return visit(ast.of);
    if (ast.kind === 'vocab') out.push(`vocab:${ast.name}`);
    else if (ast.kind === 'ref') out.push(`ref:${ast.classes.join('|')}`);
    else if (ast.kind === 'value') out.push(ast.name);
  };
  const fields = (o) => Object.values(o ?? {}).forEach((v) => visit(typeof v === 'string' ? v : v.type));
  fields(schema.common.required); fields(schema.common.optional);
  for (const c of Object.values(schema.classes)) { fields(c.required); fields(c.optional); }
  for (const r of Object.values(schema.relations)) fields(r.props);
  fields(schema.universalProps);
  fields(schema.assertion.required); fields(schema.assertion.optional);
  for (const [name, vt] of Object.entries(schema.valueTypes)) {
    if (name === 'limits') continue;
    fields(vt.required); fields(vt.optional);
  }
  return out;
}
