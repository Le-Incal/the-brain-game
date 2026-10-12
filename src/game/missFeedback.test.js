import { describe, expect, it } from 'vitest';
import { WORD_BANK } from '../data/regions';

const missModule = await import('./missFeedback.js').catch(() => ({}));
const { missDetails, missGlowMs, MISS_GLOW_WITH_GUIDE_MS } = missModule;

// Kyle, 2026-10-11: when the player misses, the guide names the region the
// word belonged to, says briefly where it is, what it is and why it matters,
// while the region is still glowing. The app hands it the facts so it can
// answer at once, without looking anything up.

const word = (text) => WORD_BANK.find((entry) => entry.word === text);

describe('What the guide is told about a miss', () => {
  it('names the region, where it lies on me, and why the word belongs there', () => {
    expect(missDetails(word('SPEECH'))).toEqual({
      word: 'SPEECH',
      region: "Broca's Area",
      where: 'in my Frontal Lobe, on my left side, toward the front',
      why: word('SPEECH').factoid,
    });
  });

  it('does not name the lobe twice when the lobe is the region', () => {
    expect(missDetails(word('BALANCE'))).toMatchObject({ region: 'Cerebellum', where: 'tucked under my back' });
  });

  it('takes the why from the word bank, so nothing is invented', () => {
    for (const entry of WORD_BANK) expect(missDetails(entry).why, entry.word).toBe(entry.factoid);
  });
});

describe('How long the right region glows after a miss', () => {
  it('lasts 6 s when the guide can explain it, so it is still lit as the guide speaks', () => {
    expect(MISS_GLOW_WITH_GUIDE_MS).toBe(6000);
    expect(missGlowMs({ conversation: true, outcome: 'wrong' })).toBe(6000);
    expect(missGlowMs({ conversation: true, outcome: 'miss' })).toBe(6000);
  });

  it('stays as before without a conversation', () => {
    expect(missGlowMs({ conversation: false, outcome: 'wrong' })).toBe(2500);
    expect(missGlowMs({ conversation: false, outcome: 'miss' })).toBe(2000);
  });
});
