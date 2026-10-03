import { describe, it, expect } from 'vitest';
import { compile } from '../lib/compile.js';
import { loadSystemsOfRecord } from '../lib/load.js';
import { loadFixture, loadInvalidCases, applyPatch, REPO } from './helpers.js';

const sor = await loadSystemsOfRecord(REPO);
const valid = loadFixture();
const opts = { sor, statuses: ['proposed', 'approved'], builtAt: '2026-10-02T00:00:00Z', dataVersion: 'fixture' };
const graph = compile(valid, opts);
const edge = (type, from, to) => graph.edges.find((e) => e.type === type && e.from === from && e.to === to);

describe('compiled graph contract', () => {
  it('carries versions and the four indexes', () => {
    expect(graph.schemaVersion).toBe('0.4.0');
    expect(graph.dataVersion).toBe('fixture');
    for (const k of ['nodes', 'edges', 'byRegion', 'aliases', 'words', 'debates']) expect(graph).toHaveProperty(k);
  });
  it('joins region names from brainRegions.json instead of copying them', () => {
    expect(graph.nodes['region:6'].label).toBe("Broca's Area");
    expect(Object.keys(graph.byRegion)).toHaveLength(20);
  });
  it('marks every derived edge with method, rule and origin', () => {
    const derived = graph.edges.filter((e) => e.derived);
    expect(derived.length).toBeGreaterThan(0);
    for (const e of derived) {
      expect(e.rule).toMatch(/^R\d+$/);
      expect(Array.isArray(e.derivedFrom) && e.derivedFrom.length > 0, e.id).toBe(true);
    }
  });
  it('never mutates the dataset it compiles', () => {
    const before = JSON.stringify(valid);
    compile(valid, opts);
    expect(JSON.stringify(valid)).toBe(before);
  });
  it('refuses to compile invalid data', () => {
    const cycle = loadInvalidCases().find((c) => c.code === 'DERIVATION_CONFLICT');
    expect(() => compile(applyPatch(valid, cycle.patch), opts)).toThrow(/DERIVATION_CONFLICT/);
  });
  it('compiles only approved facts by default', () => {
    const g = compile(valid, { sor, builtAt: opts.builtAt, dataVersion: 'x' });
    expect(g.edges.filter((e) => !e.derived && !e.canon)).toEqual([]);
  });
});

describe('reasoner rules', () => {
  it('R1 transitive part-of', () => {
    expect(edge('PART_OF', 'structure:substantia-nigra', 'region:20')).toMatchObject({ derived: true, rule: 'R1' });
  });
  it('R2 inverses', () => {
    expect(edge('HAS_PART', 'region:14', 'structure:fusiform-gyrus')).toMatchObject({ derived: true, rule: 'R2' });
    expect(edge('SUPPORTS', 'region:6', 'function:speech-production')).toMatchObject({ derived: true, rule: 'R2' });
  });
  it('R3 point-to and hint for every structure that has one', () => {
    expect(graph.nodes['structure:substantia-nigra'].pointTo).toBe('region:20');
    expect(graph.nodes['structure:hippocampus'].hint).toBe('deep inside my temporal lobe, on its inner side');
    expect(graph.nodes['structure:spinal-cord'].pointTo).toBeNull();
  });
  it('R4 laterality inheritance', () => {
    expect(graph.nodes['structure:pars-opercularis']).toMatchObject({ lateralization: 'left', derivedFields: { lateralization: 'R4' } });
  });
  it('R5 network involvement is approximate, never primary', () => {
    const e = edge('INVOLVED_IN', 'region:10', 'function:episodic-memory');
    expect(e).toMatchObject({ derived: true, rule: 'R5', props: { confidence: 'approximate' } });
    expect(e.props.role).toBeUndefined();
  });
  it('R6 tract adjacency', () => {
    expect(edge('CONNECTED_VIA', 'region:6', 'tract:arcuate-fasciculus')).toMatchObject({ rule: 'R6' });
  });
  it('R7 word targets and reconciliation with the word bank', () => {
    expect(graph.words['word:speech'].derivedTargets).toContain('region:6');
    expect(graph.words['word:speech'].bank).toMatchObject({ targetRegion: 6 });
    expect(graph.words['word:speech'].reconciliation).toBe('consistent');
  });
  it('R8 prominent visibility per view from the geometry', () => {
    const n = graph.edges.filter((e) => e.type === 'VISIBLE_FROM').length;
    const expected = Object.values(sor.regionGeometry.labelsPerView).reduce((a, l) => a + l.length, 0);
    expect(n).toBe(expected);
  });
  it('R9 reverse-inference caveat on imaging-only evidence', () => {
    expect(graph.edges.find((e) => e.id === 'assert:episodic-memory--region-10').inferenceCaveat).toBe('reverse_inference');
  });
  it('R10 myths indexed by the regions their corrections touch', () => {
    expect(graph.byRegion['6'].myths).toContain('myth:left-right-brain');
  });
  it('disputed claims are kept as debates, never as positive facts', () => {
    expect(graph.debates).toHaveLength(1);
    expect(graph.edges.find((e) => e.id === 'assert:hippocampus--adult-neurogenesis--disputes').positive).toBe(false);
  });
});
