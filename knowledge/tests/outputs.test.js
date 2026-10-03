import { describe, it, expect } from 'vitest';
import { compile } from '../lib/compile.js';
import { loadSystemsOfRecord } from '../lib/load.js';
import { emitPls, emitCredits, emitCoverage } from '../lib/emit.js';
import { loadFixture, REPO } from './helpers.js';

const sor = await loadSystemsOfRecord(REPO);
const graph = compile(loadFixture(), { sor, statuses: ['proposed', 'approved'], builtAt: 'x', dataVersion: 'fixture' });

describe('generated outputs', () => {
  it('pronunciation dictionary is a W3C PLS lexicon with our respellings', () => {
    const pls = emitPls(graph);
    expect(pls).toContain('<lexicon');
    expect(pls).toContain('<grapheme>Paul Broca</grapheme>');
    expect(pls).toContain('<alias>broh-kuh</alias>');
    expect(pls).not.toMatch(/&(?!amp;|lt;|gt;|apos;|quot;)/);
  });
  it('credits list every source cited by a compiled fact, with its licence', () => {
    const credits = emitCredits(graph);
    expect(credits).toContain('Dronkers NF');
    expect(credits).toContain('all-rights-reserved');
  });
  it('coverage report flags regions below the release gate', () => {
    const { markdown, gaps } = emitCoverage(graph);
    expect(markdown).toContain('# Coverage');
    expect(gaps.map((g) => g.region)).toContain('region:1');
    expect(gaps.map((g) => g.region)).not.toContain('region:6');
  });
});
