import { describe, it, expect } from 'vitest';
import { validate } from '../lib/validate.js';
import { loadSystemsOfRecord } from '../lib/load.js';
import { ERROR_CODES } from '../lib/schema.js';
import { loadFixture, loadInvalidCases, applyPatch, REPO, AS_OF } from './helpers.js';

const sor = await loadSystemsOfRecord(REPO);
const valid = loadFixture();
const cases = loadInvalidCases();

describe('valid fixtures', () => {
  it('validate with zero errors', () => {
    const { errors } = validate(valid, { sor, asOf: AS_OF });
    expect(errors).toEqual([]);
  });
  it('validation never auto-corrects (input is not mutated)', () => {
    const before = JSON.stringify(valid);
    validate(applyPatch(valid, cases[0].patch), { sor, asOf: AS_OF });
    validate(valid, { sor, asOf: AS_OF });
    expect(JSON.stringify(valid)).toBe(before);
  });
});

describe('invalid fixtures', () => {
  it('cover every error code exactly once', () => {
    expect(cases.map((c) => c.code).sort()).toEqual([...ERROR_CODES].sort());
  });
  for (const c of cases) {
    it(`${c.code}: ${c.why}`, () => {
      const { errors } = validate(applyPatch(valid, c.patch), { sor, asOf: AS_OF });
      expect(errors.length, 'expected at least one error').toBeGreaterThan(0);
      expect([...new Set(errors.map((e) => e.code))]).toEqual([c.code]);
      for (const e of errors) {
        expect(typeof e.message).toBe('string');
        expect(e).toHaveProperty('id');
      }
    });
  }
});
