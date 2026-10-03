import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadDataset, loadSystemsOfRecord } from '../lib/load.js';
import { validate } from '../lib/validate.js';
import { compile } from '../lib/compile.js';
import { createQuery } from '../lib/query.js';
import { runCompetency } from '../lib/competency.js';
import { emitCoverage } from '../lib/emit.js';
import { KNOWLEDGE, REPO, AS_OF, loadYaml } from './helpers.js';

const sor = await loadSystemsOfRecord(REPO);
const data = loadDataset(KNOWLEDGE);
const count = (cls) => data.nodes.filter((n) => n.class === cls).length;

describe('real knowledge base', () => {
  it('validates with zero errors', () => {
    const { errors } = validate(data, { sor, asOf: AS_OF });
    expect(errors.slice(0, 20)).toEqual([]);
  });

  it('meets minimum extraction coverage per class', () => {
    const minimums = { Structure: 50, Function: 25, Phenomenon: 4, Network: 8, Tract: 15, Circuit: 10, CellType: 8, Molecule: 12, Process: 6, Artery: 5, Condition: 6, Myth: 15, Person: 20, Source: 60, Doc: 21, Guide: 2 };
    for (const [cls, min] of Object.entries(minimums)) expect(count(cls), cls).toBeGreaterThanOrEqual(min);
  });

  it('every word-bank entry has a Word node that expresses something', () => {
    const words = data.nodes.filter((n) => n.class === 'Word');
    expect(words.map((w) => w.text).sort()).toEqual(sor.wordBank.map((w) => w.word).sort());
    const expressing = new Set(data.assertions.filter((a) => a.predicate === 'EXPRESSES').map((a) => a.subject));
    for (const w of words) expect(expressing.has(w.id), w.id).toBe(true);
  });

  it('the extractor never approves its own facts', () => {
    for (const r of [...data.nodes, ...data.assertions]) {
      if (r.provenance?.assertedBy === 'extractor:claude') expect(r.provenance.status, r.id).not.toBe('approved');
    }
  });

  it('every extracted record says where in the sources it came from', () => {
    for (const r of [...data.nodes, ...data.assertions]) {
      if (r.provenance?.method === 'ai_extracted') expect(r.provenance.locator, r.id).toMatch(/\S{3,}/);
    }
  });

  describe('preview compile (proposed + approved)', () => {
    const graph = compile(data, { sor, statuses: ['proposed', 'approved'], builtAt: 'test', dataVersion: 'preview' });
    const results = runCompetency(createQuery(graph), loadYaml(path.join(KNOWLEDGE, 'competency', 'questions.yaml')));
    for (const r of results) {
      it(`${r.id}: ${r.question}`, () => {
        expect(r.error).toBeUndefined();
        expect(r.pass, JSON.stringify(r.actual)).toBe(true);
      });
    }
    it('every region meets the release coverage gate', () => {
      expect(emitCoverage(graph).gaps).toEqual([]);
    });
  });
});
