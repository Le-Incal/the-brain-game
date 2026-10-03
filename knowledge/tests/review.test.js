import { describe, it, expect } from 'vitest';
import { exportReview, importReview, parseCsv, toCsv } from '../lib/review.js';
import { compile } from '../lib/compile.js';
import { loadSystemsOfRecord } from '../lib/load.js';
import { loadFixture, applyPatch, REPO } from './helpers.js';

const sor = await loadSystemsOfRecord(REPO);
const valid = loadFixture();
const proposedCount = [...valid.nodes, ...valid.assertions].filter((r) => r.provenance?.status === 'proposed').length;

describe('steward review sheet', () => {
  const csv = exportReview(valid);
  const rows = parseCsv(csv);
  it('has one row per proposed record, with the source locator', () => {
    expect(rows).toHaveLength(proposedCount);
    expect(Object.keys(rows[0])).toEqual(expect.arrayContaining(['id', 'record', 'summary', 'sources', 'locator', 'conflict', 'decision', 'note']));
  });
  it('survives commas, quotes and newlines in fields', () => {
    const tricky = [{ id: 'a', note: 'says "hi", then\nleaves' }];
    expect(parseCsv(toCsv(tricky))).toEqual(tricky);
  });
  it('flags conflicting proposals for the same fact', () => {
    const conflicting = applyPatch(valid, [{ op: 'addAssertion', record: { ...valid.assertions.find((a) => a.id === 'assert:speech-production--region-5'), id: 'assert:speech-production--region-5--alt', props: { role: 'contributing', evidence: ['lesion'], lateralization: 'bilateral', confidence: 'established' } } }]);
    const r = parseCsv(exportReview(conflicting));
    expect(r.filter((x) => x.conflict).map((x) => x.id).sort()).toEqual(['assert:speech-production--region-5', 'assert:speech-production--region-5--alt']);
  });
  it('imports decisions without mutating the input, and only approved facts compile', () => {
    const decided = rows.map((r) => ({ ...r, decision: r.id === 'assert:movement--region-5' ? 'reject' : 'approve' }));
    const out = toCsv(decided);
    const before = JSON.stringify(valid);
    const next = importReview(valid, out, { steward: 'steward:kyle', on: '2026-10-03' });
    expect(JSON.stringify(valid)).toBe(before);
    const fusiform = next.assertions.find((a) => a.id === 'assert:fusiform--part-of--region-14');
    expect(fusiform.provenance).toMatchObject({ status: 'approved', approvedBy: 'steward:kyle', approvedOn: '2026-10-03' });
    expect(next.assertions.find((a) => a.id === 'assert:movement--region-5').provenance.status).toBe('rejected');
    const g = compile(next, { sor, builtAt: 'x', dataVersion: 'x' });
    expect(g.edges.some((e) => e.id === 'assert:fusiform--part-of--region-14')).toBe(true);
    expect(g.edges.some((e) => e.id === 'assert:movement--region-5')).toBe(false);
  });
  it('rejects unknown decisions instead of guessing', () => {
    const bad = toCsv(rows.map((r, i) => ({ ...r, decision: i === 0 ? 'maybe' : '' })));
    expect(() => importReview(valid, bad, { steward: 'steward:kyle', on: '2026-10-03' })).toThrow(/decision/);
  });
});
