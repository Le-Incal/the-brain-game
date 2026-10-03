import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { compile } from '../lib/compile.js';
import { loadSystemsOfRecord } from '../lib/load.js';
import { createQuery } from '../lib/query.js';
import { runCompetency } from '../lib/competency.js';
import { loadFixture, loadYaml, KNOWLEDGE, REPO } from './helpers.js';

const sor = await loadSystemsOfRecord(REPO);
const graph = compile(loadFixture(), { sor, statuses: ['proposed', 'approved'], builtAt: 'x', dataVersion: 'fixture' });
const cqs = loadYaml(path.join(KNOWLEDGE, 'fixtures', 'competency.yaml'));

describe('fixture competency questions', () => {
  const results = runCompetency(createQuery(graph), cqs);
  for (const r of results) {
    it(`${r.id}: ${r.question}`, () => {
      expect(r.error).toBeUndefined();
      expect(r.pass, JSON.stringify(r.actual)).toBe(true);
    });
  }
});
