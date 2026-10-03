// Brain Game knowledge base CLI.
//   npm run kb -- validate            typed errors, exit 1 on any
//   npm run kb -- preview             compile proposed + approved to knowledge/build/
//   npm run kb -- compile             compile approved only to src/data/brainGraph.json + knowledge/dist/
//   npm run kb -- review:export       write knowledge/review/review-<date>.csv
//   npm run kb -- review:import FILE  apply steward decisions back into knowledge/data/
import fs from 'node:fs';
import path from 'node:path';
import { stringify, parse } from 'yaml';
import { loadDataset, loadSystemsOfRecord } from '../knowledge/lib/load.js';
import { validate } from '../knowledge/lib/validate.js';
import { compile } from '../knowledge/lib/compile.js';
import { createQuery } from '../knowledge/lib/query.js';
import { runCompetency } from '../knowledge/lib/competency.js';
import { emitPls, emitCredits, emitCoverage } from '../knowledge/lib/emit.js';
import { exportReview, importReview } from '../knowledge/lib/review.js';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const K = path.join(REPO, 'knowledge');
const today = new Date().toISOString().slice(0, 10);
const [cmd, arg] = process.argv.slice(2);
const sor = await loadSystemsOfRecord(REPO);
const ds = loadDataset(K);
const write = (rel, body) => { const f = path.join(REPO, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); console.log(`wrote ${rel}`); };

function report(errors) {
  const byCode = {};
  for (const e of errors) (byCode[e.code] ??= []).push(e);
  for (const [code, list] of Object.entries(byCode)) {
    console.log(`\n${code} (${list.length})`);
    for (const e of list.slice(0, 15)) console.log(`  ${e.id ?? '-'}  ${e.message}${e.file ? `  [${e.file}]` : ''}`);
    if (list.length > 15) console.log(`  ... ${list.length - 15} more`);
  }
}

function build(statuses, outDir, graphPath) {
  const graph = compile(ds, { sor, statuses, dataVersion: `${today}${statuses.includes('proposed') ? '-preview' : ''}` });
  write(graphPath, JSON.stringify(graph));
  write(`${outDir}/pronunciations.pls`, emitPls(graph));
  write(`${outDir}/CREDITS.md`, emitCredits(graph));
  const cov = emitCoverage(graph);
  write(`${outDir}/coverage.md`, cov.markdown);
  const cq = runCompetency(createQuery(graph), parse(fs.readFileSync(path.join(K, 'competency/questions.yaml'), 'utf8')));
  const failed = cq.filter((r) => !r.pass);
  console.log(`competency: ${cq.length - failed.length}/${cq.length} pass; coverage gaps: ${cov.gaps.length}`);
  for (const r of failed) console.log(`  FAIL ${r.id} ${r.question} -> ${JSON.stringify(r.actual)}${r.error ? ` (${r.error})` : ''}`);
  return { graph, failed, cov };
}

if (cmd === 'validate') {
  const { errors } = validate(ds, { sor });
  const counts = {};
  for (const n of ds.nodes) counts[n.class] = (counts[n.class] ?? 0) + 1;
  console.log(`nodes ${ds.nodes.length}, assertions ${ds.assertions.length}, docs ${ds.docs.length}`);
  console.log(Object.entries(counts).sort().map(([c, n]) => `${c} ${n}`).join(', '));
  if (errors.length) { report(errors); console.log(`\n${errors.length} errors`); process.exit(1); }
  console.log('0 errors');
} else if (cmd === 'preview') {
  build(['proposed', 'approved'], 'knowledge/build', 'knowledge/build/brainGraph.preview.json');
} else if (cmd === 'compile') {
  build(['approved'], 'knowledge/dist', 'src/data/brainGraph.json');
} else if (cmd === 'review:export') {
  write(`knowledge/review/review-${today}.csv`, exportReview(ds));
} else if (cmd === 'review:import') {
  if (!arg) throw new Error('usage: review:import <csv>');
  const next = importReview(ds, fs.readFileSync(arg, 'utf8'), { steward: 'steward:kyle', on: today });
  const files = new Map();
  for (const r of [...next.nodes, ...next.assertions]) {
    const f = next.fileOf[r.id]; if (!f) continue;
    if (!files.has(f)) files.set(f, parse(fs.readFileSync(path.join(K, f), 'utf8')));
  }
  const byId = new Map([...next.nodes, ...next.assertions].map((r) => [r.id, r]));
  for (const [f, doc] of files) {
    for (const key of ['sources', 'nodes', 'assertions']) doc[key] = (doc[key] ?? []).map((r) => byId.get(r.id) ?? r);
    write(`knowledge/${f}`, stringify(doc, { lineWidth: 0 }));
  }
} else {
  console.log('commands: validate | preview | compile | review:export | review:import <csv>');
}
