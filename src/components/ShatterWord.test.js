import { describe, expect, it } from 'vitest';
import { splitWordLines } from './ShatterWord.jsx';

describe('splitWordLines', () => {
  it('keeps one-word prompts on one line', () => {
    expect(splitWordLines('VISION')).toEqual(['VISION']);
  });

  it('stacks multi-word prompts into a compact target', () => {
    expect(splitWordLines('CATCHING A BALL')).toEqual([
      'CATCHING',
      'A',
      'BALL',
    ]);
  });
});
