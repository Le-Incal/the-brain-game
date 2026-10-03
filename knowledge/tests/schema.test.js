import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadVocabulary, loadSchema, ERROR_CODES, typeRefs } from '../lib/schema.js';
import { KNOWLEDGE } from './helpers.js';

describe('vocabulary', () => {
  const vocab = loadVocabulary();
  it('every list is non-empty and has unique terms', () => {
    for (const [name, terms] of Object.entries(vocab)) {
      if (!Array.isArray(terms)) continue;
      expect(terms.length, name).toBeGreaterThan(0);
      expect(new Set(terms).size, name).toBe(terms.length);
    }
  });
  it('share-alike licences are real licence terms', () => {
    for (const l of vocab.shareAlikeLicenses) expect(vocab.license).toContain(l);
  });
});

describe('schema', () => {
  const vocab = loadVocabulary();
  const schema = loadSchema();
  it('has a semantic version separate from the data', () => {
    const v = fs.readFileSync(path.join(KNOWLEDGE, 'schema', 'VERSION'), 'utf8').trim();
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(schema.version).toBe(v);
  });
  it('every vocab reference in classes, relations and value types exists', () => {
    for (const ref of typeRefs(schema)) {
      if (ref.startsWith('vocab:')) expect(vocab, ref).toHaveProperty(ref.slice(6));
    }
  });
  it('every relation domain and range names a known class', () => {
    const known = new Set([...Object.keys(schema.classes), 'Assertion', 'any']);
    for (const [name, rel] of Object.entries(schema.relations)) {
      for (const c of [...rel.domain, ...rel.range]) expect(known.has(c), `${name}: ${c}`).toBe(true);
    }
  });
  it('declares exactly the 22 typed error codes', () => {
    expect(ERROR_CODES).toHaveLength(22);
    expect(new Set(ERROR_CODES).size).toBe(22);
  });
});
