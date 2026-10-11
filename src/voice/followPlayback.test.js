import { describe, expect, it } from 'vitest';
import { createWordFollower, DEFAULT_CHARS_PER_SECOND } from './followWords.js';

// The transcript streams in time with the voice, so the follower reports how
// far into the current reply the listener has heard. Each reply has its own
// id, so a line of text never borrows another reply's clock.

function setup() {
  const clock = { now: 0 };
  let timers = [];
  let nextId = 1;
  const follower = createWordFollower({
    act: () => {},
    now: () => clock.now,
    setTimeoutImpl: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, fn, at: clock.now + Math.max(0, ms) });
      return id;
    },
    clearTimeoutImpl: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
  });
  const advance = (ms) => {
    const until = clock.now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      clock.now = due.at;
      due.fn();
    }
    clock.now = until;
  };
  return { clock, follower, advance };
}

const alignmentFor = (text, msPerChar = 50) => ({
  chars: [...text],
  char_start_times_ms: [...text].map((_, i) => i * msPerChar),
  char_durations_ms: [...text].map(() => msPerChar),
});

describe('How much of the reply has been heard', () => {
  it('reports nothing before any reply', () => {
    const { follower } = setup();
    expect(follower.playback()).toEqual({ id: null, playedChars: null, done: false });
  });

  it('counts aligned characters from when the audio is heard, not when it arrived', () => {
    const { follower, advance } = setup();
    follower.outputLevel(0);
    follower.alignment(alignmentFor('a'.repeat(100)));
    advance(500);
    expect(follower.playback().playedChars).toBeNull();
    follower.outputLevel(0.3);
    advance(1000);
    // 50 ms a character: 1 s heard is about 20 characters.
    const { id, playedChars, done } = follower.playback();
    expect(id).not.toBeNull();
    expect(playedChars).toBeGreaterThanOrEqual(19);
    expect(playedChars).toBeLessThanOrEqual(21);
    expect(done).toBe(false);
  });

  it('reports the whole reply, done, once its audio has ended', () => {
    const { follower, advance } = setup();
    follower.outputLevel(0);
    follower.alignment(alignmentFor('b'.repeat(40)));
    follower.outputLevel(0.3);
    advance(40 * 50 + 1000);
    expect(follower.playback()).toMatchObject({ playedChars: 40, done: true });
  });

  it('gives each reply its own id', () => {
    const { follower, advance } = setup();
    follower.outputLevel(0);
    follower.alignment(alignmentFor('c'.repeat(20)));
    follower.outputLevel(0.3);
    advance(100);
    const first = follower.playback().id;
    follower.outputLevel(0);
    advance(20 * 50 + 1000);
    follower.alignment(alignmentFor('d'.repeat(20)));
    follower.outputLevel(0.3);
    advance(100);
    const second = follower.playback().id;
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it('estimates from the speaking pace when no alignment arrives', () => {
    const { follower, advance } = setup();
    follower.guideSpeaking(true);
    advance(2000);
    const { id, playedChars } = follower.playback();
    expect(id).not.toBeNull();
    expect(playedChars).toBe(Math.floor(2 * DEFAULT_CHARS_PER_SECOND));
  });
});
