import path from 'node:path';
import fs from 'node:fs';
import { parse } from 'yaml';
import { loadDataset } from '../lib/load.js';

export const KNOWLEDGE = path.resolve(__dirname, '..');
export const REPO = path.resolve(KNOWLEDGE, '..');
export const FIXTURE_DIR = path.join(KNOWLEDGE, 'fixtures', 'valid');
export const INVALID_DIR = path.join(KNOWLEDGE, 'fixtures', 'invalid');
export const AS_OF = '2026-10-02';

export function loadFixture() {
  return loadDataset(FIXTURE_DIR);
}

export function loadInvalidCases() {
  return fs
    .readdirSync(INVALID_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parse(fs.readFileSync(path.join(INVALID_DIR, f), 'utf8')));
}

export function loadYaml(file) {
  return parse(fs.readFileSync(file, 'utf8'));
}

const clone = (v) => structuredClone(v);

function walk(obj, segments) {
  let cur = obj;
  for (const s of segments.slice(0, -1)) {
    if (cur[s] === undefined) cur[s] = {};
    cur = cur[s];
  }
  return [cur, segments[segments.length - 1]];
}

/** Apply a fixture patch to a copy of a dataset. Never mutates the input. */
export function applyPatch(dataset, patch) {
  const ds = clone(dataset);
  const all = () => [...ds.nodes, ...ds.assertions];
  for (const p of patch) {
    if (p.op === 'set' || p.op === 'unset') {
      const rec = all().find((r) => r.id === p.id);
      if (!rec) throw new Error(`patch target missing: ${p.id}`);
      const [parent, key] = walk(rec, String(p.path).split('.'));
      if (p.op === 'set') parent[key] = p.value;
      else delete parent[key];
    } else if (p.op === 'addNode') {
      ds.nodes.push(clone(p.record));
    } else if (p.op === 'addAssertion') {
      ds.assertions.push(clone(p.record));
    } else if (p.op === 'remove') {
      ds.nodes = ds.nodes.filter((r) => r.id !== p.id);
      ds.assertions = ds.assertions.filter((r) => r.id !== p.id);
    } else if (p.op === 'docReplace') {
      const doc = ds.docs.find((d) => d.path === p.path);
      if (!doc) throw new Error(`doc missing: ${p.path}`);
      doc.content = doc.content.replace(p.from, p.to);
    } else {
      throw new Error(`unknown patch op ${p.op}`);
    }
  }
  return ds;
}
