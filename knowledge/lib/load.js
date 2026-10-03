// Loads a dataset (fixture or real) and the systems of record it joins to.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const readYamlFile = (file) => parse(fs.readFileSync(file, 'utf8'), { merge: true }) ?? {};

function walkFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out.sort();
}

/**
 * A dataset directory holds either `dataset.yaml` (fixtures) or `data/**.yaml`
 * (the real knowledge base), plus narrative markdown under `kb/`.
 * Returns { nodes, assertions, docs, fileOf, meta }.
 */
export function loadDataset(dir) {
  const single = path.join(dir, 'dataset.yaml');
  const files = fs.existsSync(single) ? [single] : walkFiles(path.join(dir, 'data'), '.yaml');
  const ds = { nodes: [], assertions: [], docs: [], fileOf: {}, meta: { requests: [], openQuestions: [] } };
  for (const file of files) {
    const doc = readYamlFile(file);
    const rel = path.relative(dir, file).split(path.sep).join('/');
    for (const n of [...(doc.sources ?? []), ...(doc.nodes ?? [])]) {
      ds.nodes.push(n);
      if (n?.id) ds.fileOf[n.id] ??= rel;
    }
    for (const a of doc.assertions ?? []) {
      ds.assertions.push(a);
      if (a?.id) ds.fileOf[a.id] ??= rel;
    }
    for (const r of doc.requests ?? []) ds.meta.requests.push({ ...r, file: rel });
    for (const q of doc.openQuestions ?? []) ds.meta.openQuestions.push({ ...q, file: rel });
  }
  for (const file of walkFiles(path.join(dir, 'kb'), '.md')) {
    ds.docs.push({ path: path.relative(dir, file).split(path.sep).join('/'), content: fs.readFileSync(file, 'utf8') });
  }
  return ds;
}

/** brainRegions.json, regionGeometry.json and the word bank, read from the repo. */
export async function loadSystemsOfRecord(repoRoot) {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
  const brainRegions = read('src/data/brainRegions.json');
  const regionGeometry = read('src/data/regionGeometry.json');
  const { WORD_BANK } = await import(path.join(repoRoot, 'src/data/regions.js'));
  return {
    brainRegions,
    regionGeometry,
    wordBank: WORD_BANK,
    regionsById: new Map(brainRegions.regions.map((r) => [r.id, r])),
  };
}
