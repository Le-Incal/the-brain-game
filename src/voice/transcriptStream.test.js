import { describe, expect, it } from 'vitest';

const streamModule = await import('./transcriptStream.js').catch(() => ({}));
const {
  createTranscriptStream,
  completedSentences,
  READING_CHARS_PER_SECOND,
  PLAYBACK_WAIT_MS,
  TRANSCRIPT_HISTORY,
} = streamModule;

// Kyle, 2026-10-11: everything the brain says streams as text on the right,
// for hearing-impaired visitors and anyone without sound. In voice, the text
// keeps pace with what has been heard; without voice, it flows at reading pace.

function setup() {
  const clock = { now: 0 };
  const stream = createTranscriptStream({ now: () => clock.now });
  const shown = (index = -1) => {
    const entry = stream.entries().at(index);
    return entry.text.slice(0, entry.shown);
  };
  return { clock, stream, shown };
}

const LINE = 'Not in me, strictly. I have no pain receptors of my own.';

describe('The visitor', () => {
  it("appears whole at once, marked as the visitor's own words", () => {
    const { stream } = setup();
    stream.addVisitor({ id: 'u1', text: 'Where do headaches happen?' });
    expect(stream.entries()).toEqual([
      { id: 'u1', fromGuide: false, text: 'Where do headaches happen?', shown: 26, done: true },
    ]);
  });
});

describe('The guide, in voice', () => {
  it('waits for its audio, then shows only what has been heard', () => {
    const { stream, shown } = setup();
    stream.addGuide({ id: 'g1', text: LINE });
    stream.tick({ id: null, playedChars: null, done: false });
    expect(shown()).toBe('');
    stream.tick({ id: 'r1', playedChars: 12, done: false });
    expect(shown()).toBe(LINE.slice(0, 12));
    stream.tick({ id: 'r1', playedChars: 30, done: false });
    expect(shown()).toBe(LINE.slice(0, 30));
  });

  it('never goes backwards, and never runs past its own text', () => {
    const { stream, shown } = setup();
    stream.addGuide({ id: 'g1', text: LINE });
    stream.tick({ id: 'r1', playedChars: 30, done: false });
    stream.tick({ id: 'r1', playedChars: 25, done: false });
    expect(shown()).toBe(LINE.slice(0, 30));
    stream.tick({ id: 'r1', playedChars: 999, done: false });
    expect(shown()).toBe(LINE);
  });

  it('completes when its audio is done', () => {
    const { stream } = setup();
    stream.addGuide({ id: 'g1', text: LINE });
    stream.tick({ id: 'r1', playedChars: 40, done: true });
    expect(stream.entries().at(-1)).toMatchObject({ shown: LINE.length, done: true });
  });

  it("never borrows the previous reply's clock", () => {
    const { stream, shown } = setup();
    stream.addGuide({ id: 'g1', text: 'First reply.' });
    stream.tick({ id: 'r1', playedChars: 5, done: false });
    stream.addGuide({ id: 'g2', text: LINE });
    // The first line completes; the second must not inherit r1's progress.
    expect(shown(0)).toBe('First reply.');
    stream.tick({ id: 'r1', playedChars: 12, done: true });
    expect(shown()).toBe('');
    stream.tick({ id: 'r2', playedChars: 8, done: false });
    expect(shown()).toBe(LINE.slice(0, 8));
  });

  it('completes the current line when the guide stops speaking', () => {
    const { stream } = setup();
    stream.addGuide({ id: 'g1', text: LINE });
    stream.tick({ id: 'r1', playedChars: 10, done: false });
    stream.guideStopped();
    expect(stream.entries().at(-1)).toMatchObject({ shown: LINE.length, done: true });
  });

  it('cuts an interrupted line at what was heard, with an ellipsis', () => {
    const { stream, shown } = setup();
    stream.addGuide({ id: 'g1', text: LINE });
    stream.tick({ id: 'r1', playedChars: 20, done: false });
    stream.interrupted();
    expect(shown()).toBe(`${LINE.slice(0, 20)}…`);
    expect(stream.entries().at(-1).done).toBe(true);
  });

  it('takes a corrected text for the same line without starting over', () => {
    const { stream, shown } = setup();
    stream.addGuide({ id: 'g1', text: LINE });
    stream.tick({ id: 'r1', playedChars: 10, done: false });
    stream.addGuide({ id: 'g1', text: `${LINE} More.` });
    expect(stream.entries()).toHaveLength(1);
    expect(shown()).toBe(LINE.slice(0, 10));
  });
});

describe('The guide, without sound', () => {
  it('flows at reading pace, about 20 characters a second', () => {
    expect(READING_CHARS_PER_SECOND).toBe(20);
    const { clock, stream, shown } = setup();
    stream.addGuide({ id: 'g1', text: LINE }, { audible: false });
    clock.now = 1000;
    stream.tick({ id: null, playedChars: null, done: false });
    expect(shown()).toBe(LINE.slice(0, 20));
    clock.now = 10_000;
    stream.tick({ id: null, playedChars: null, done: false });
    expect(stream.entries().at(-1)).toMatchObject({ shown: LINE.length, done: true });
  });

  it('falls back to reading pace if its audio never comes', () => {
    expect(PLAYBACK_WAIT_MS).toBe(3000);
    const { clock, stream, shown } = setup();
    stream.addGuide({ id: 'g1', text: LINE });
    clock.now = PLAYBACK_WAIT_MS;
    stream.tick({ id: null, playedChars: null, done: false });
    expect(shown()).toBe('');
    clock.now = PLAYBACK_WAIT_MS + 500;
    stream.tick({ id: null, playedChars: null, done: false });
    expect(shown()).toBe(LINE.slice(0, 10));
  });

  it('carries on at reading pace from where it was when the voice is switched off', () => {
    const { clock, stream, shown } = setup();
    stream.addGuide({ id: 'g1', text: LINE });
    stream.tick({ id: 'r1', playedChars: 15, done: false });
    clock.now = 2000;
    stream.setVoice(false);
    clock.now = 2500;
    stream.tick({ id: 'r1', playedChars: 15, done: false });
    expect(shown()).toBe(LINE.slice(0, 25));
  });
});

describe('History', () => {
  it('keeps a long conversation to scroll back through', () => {
    expect(TRANSCRIPT_HISTORY).toBeGreaterThanOrEqual(200);
    const { stream } = setup();
    for (let i = 0; i < TRANSCRIPT_HISTORY + 5; i += 1) stream.addVisitor({ id: `u${i}`, text: `Line ${i}` });
    expect(stream.entries()).toHaveLength(TRANSCRIPT_HISTORY);
    expect(stream.entries()[0].id).toBe('u5');
  });

  it('reports whether a tick changed anything, so the page renders only when it must', () => {
    const { stream } = setup();
    stream.addGuide({ id: 'g1', text: LINE });
    expect(stream.tick({ id: 'r1', playedChars: 4, done: false })).toBe(true);
    expect(stream.tick({ id: 'r1', playedChars: 4, done: false })).toBe(false);
  });
});

describe('Screen readers', () => {
  it('hear whole sentences, never letters as they stream', () => {
    expect(completedSentences('Hello there. I am Syl')).toBe('Hello there.');
    expect(completedSentences('Ends here! Does it?')).toBe('Ends here! Does it?');
    expect(completedSentences('No full stop yet')).toBe('');
    expect(completedSentences('')).toBe('');
  });
});
