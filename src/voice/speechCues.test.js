import { describe, expect, it } from 'vitest';

// Imported defensively so each test fails on its own while the module is absent.
const cuesModule = await import('./speechCues.js').catch(() => ({}));
const { analyseSpeech, createCueTracker, createLevelCues } = cuesModule;

// Kyle, 2026-10-13: the brain speaks like a puppet, a beat on every syllable
// and a tilt on each phrase. For the welcome we know when every letter is
// spoken, so syllables and phrases come from its text; for the live guide we
// hear only her voice level, so beats come from its rises.

const FRAME = 1 / 60;

describe('Syllables and phrases in a text', () => {
  const syllablesIn = (word) => analyseSpeech(word).syllablesUpTo(word.length - 1);

  it.each([
    ['Welcome', 2],
    ['Sylvi', 2],
    ['human', 2],
    ['brain', 1],
    ['knowledge', 2],
    ['explore', 2],
    ['regions', 2],
    ['study', 2],
    ['Game', 1],
    ['the', 1],
    ['me', 1],
    ['my', 1],
    ['you', 1],
    ['your', 1],
    ['around', 2],
    ['any', 2],
  ])('hears %s as %i syllables', (word, count) => {
    expect(syllablesIn(word)).toBe(count);
  });

  it('starts a phrase at the first word and after every stop', () => {
    const text = 'Welcome. I am Sylvi, a human brain.';
    const speech = analyseSpeech(text);
    expect(speech.phrasesUpTo(0)).toBe(1);
    expect(speech.phrasesUpTo(text.indexOf('I am'))).toBe(2);
    expect(speech.phrasesUpTo(text.indexOf('a human'))).toBe(3);
    expect(speech.phrasesUpTo(text.length - 1)).toBe(3);
  });

  it('counts a syllable from the moment its vowel is spoken', () => {
    const text = 'Welcome.';
    const speech = analyseSpeech(text);
    expect(speech.syllablesUpTo(0)).toBe(0); // "W"
    expect(speech.syllablesUpTo(1)).toBe(1); // "e"
    expect(speech.syllablesUpTo(4)).toBe(2); // "o"
    expect(speech.syllablesUpTo(6)).toBe(2); // the silent "e"
  });

  it('is speaking within a phrase, spaces included, and pausing at a stop and the space after it', () => {
    const text = 'I am Sylvi, a human.';
    const speech = analyseSpeech(text);
    expect(speech.speakingAt(text.indexOf('am'))).toBe(true);
    expect(speech.speakingAt(text.indexOf(' am'))).toBe(true);
    expect(speech.speakingAt(text.indexOf(','))).toBe(false);
    expect(speech.speakingAt(text.indexOf(', ') + 1)).toBe(false);
    expect(speech.speakingAt(text.indexOf('a human'))).toBe(true);
    expect(speech.speakingAt(text.length - 1)).toBe(false);
  });

  it('counts nothing before the first letter', () => {
    const speech = analyseSpeech('Hello.');
    expect(speech.syllablesUpTo(-1)).toBe(0);
    expect(speech.phrasesUpTo(-1)).toBe(0);
    expect(speech.speakingAt(-1)).toBe(false);
  });
});

describe('Turning counts into cues', () => {
  it('gives one beat for each new syllable and one phrase start for each new phrase', () => {
    const tracker = createCueTracker();
    const steps = [
      { syllables: 0, phrases: 0, speaking: false },
      { syllables: 1, phrases: 1, speaking: true },
      { syllables: 1, phrases: 1, speaking: true },
      { syllables: 2, phrases: 1, speaking: true },
      { syllables: 2, phrases: 1, speaking: false },
      { syllables: 3, phrases: 2, speaking: true },
    ].map((counts) => tracker.step(counts));
    expect(steps).toEqual([
      { beat: false, phraseStart: false, speaking: false },
      { beat: true, phraseStart: true, speaking: true },
      { beat: false, phraseStart: false, speaking: true },
      { beat: true, phraseStart: false, speaking: true },
      { beat: false, phraseStart: false, speaking: false },
      { beat: true, phraseStart: true, speaking: true },
    ]);
  });
});

describe("Cues from the live guide's voice level", () => {
  // Phrases of syllables, about four a second, with quiet between phrases.
  // A little deterministic flutter keeps the detector honest.
  function voice({ phrases = [[0, 2], [2.5, 4.25], [4.75, 6]], rate = 4, peak = 0.3 } = {}) {
    return (t) => {
      const phrase = phrases.find(([a, b]) => t >= a && t < b);
      const flutter = 0.004 * Math.sin(t * 157) + 0.003 * Math.sin(t * 89);
      if (!phrase) return Math.max(0, 0.005 + flutter);
      const within = (t - phrase[0]) * rate;
      const bump = Math.sin(Math.PI * (within % 1)) ** 1.5;
      return Math.max(0, 0.04 + peak * bump + flutter);
    };
  }

  function listen(level, seconds) {
    const cues = createLevelCues();
    const out = [];
    for (let i = 0; i < Math.round(seconds / FRAME); i += 1) {
      const t = i * FRAME;
      out.push({ t, ...cues.step({ dtSeconds: FRAME, level: level(t) }) });
    }
    return out;
  }

  it('beats once on each syllable', () => {
    const heard = listen(voice(), 6.5);
    const phrases = [[0, 2], [2.5, 4.25], [4.75, 6]];
    const expected = [8, 7, 5];
    phrases.forEach(([a, b], i) => {
      const beats = heard.filter(({ t, beat }) => beat && t >= a && t < b + 0.1).length;
      expect(Math.abs(beats - expected[i]), `phrase ${i + 1}: ${beats} beats`).toBeLessThanOrEqual(1);
    });
  });

  it('never beats in the quiet between phrases', () => {
    const heard = listen(voice(), 6.5);
    const quiet = heard.filter(({ t }) => (t >= 2.1 && t < 2.5) || (t >= 4.35 && t < 4.75) || t >= 6.1);
    expect(quiet.some(({ beat }) => beat)).toBe(false);
  });

  it('starts a phrase when she speaks again after a pause, once per phrase', () => {
    const heard = listen(voice(), 6.5);
    const starts = heard.filter(({ phraseStart }) => phraseStart).map(({ t }) => t);
    expect(starts).toHaveLength(3);
    [0, 2.5, 4.75].forEach((t, i) => expect(Math.abs(starts[i] - t)).toBeLessThan(0.15));
  });

  it('is speaking through a phrase and its small gaps, and not in the pauses', () => {
    const heard = listen(voice(), 6.5);
    const at = (t) => heard[Math.round(t / FRAME)].speaking;
    expect(at(1)).toBe(true);
    expect(at(1.49)).toBe(true);
    expect(at(2.4)).toBe(false);
    expect(at(6.4)).toBe(false);
  });

  it('never beats more than about eight times a second', () => {
    const heard = listen(voice({ phrases: [[0, 4]], rate: 14 }), 4);
    const beatTimes = heard.filter(({ beat }) => beat).map(({ t }) => t);
    for (let i = 1; i < beatTimes.length; i += 1) expect(beatTimes[i] - beatTimes[i - 1]).toBeGreaterThanOrEqual(0.12 - 1e-9);
  });

  it('hears a quiet voice as well as a loud one', () => {
    const heard = listen(voice({ peak: 0.08 }), 6.5);
    const beats = heard.filter(({ beat }) => beat).length;
    expect(beats).toBeGreaterThanOrEqual(17);
    expect(beats).toBeLessThanOrEqual(23);
  });

  it('is silent when there is no voice', () => {
    const heard = listen(() => 0, 3);
    expect(heard.every(({ beat, phraseStart, speaking }) => !beat && !phraseStart && !speaking)).toBe(true);
  });
});
