import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildIndex, longestSharedRun, textFields } from '../lib/originality.js';
import { loadDataset } from '../lib/load.js';
import { KNOWLEDGE } from './helpers.js';

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : []));
const sourceTexts = [...walk(path.join(KNOWLEDGE, 'sources')), ...walk(path.join(KNOWLEDGE, 'kb'))].map((f) => fs.readFileSync(f, 'utf8'));
const index = buildIndex(sourceTexts, 8);

describe('originality guard', () => {
  it('detects a sentence lifted from the source material', () => {
    const lifted = sourceTexts[0].split('\n').find((l) => l.split(' ').length > 20);
    expect(longestSharedRun(lifted, index)).toBeGreaterThanOrEqual(8);
  });
  it('passes our own wording', () => {
    expect(longestSharedRun('Both halves of your brain team up on nearly every job you give them.', index)).toBe(0);
  });
  it('no text field in the knowledge base shares 8 or more consecutive words with the sources', () => {
    const ds = loadDataset(KNOWLEDGE);
    const copied = [];
    for (const r of [...ds.nodes, ...ds.assertions]) {
      for (const [p, t] of textFields(r)) {
        const run = longestSharedRun(t, index);
        if (run >= 8) copied.push(`${r.id} ${p} (${run} words)`);
      }
    }
    expect(copied).toEqual([]);
  });
});
