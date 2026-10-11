import { describe, expect, it } from 'vitest';

const followModule = await import('./followWords.js').catch(() => ({}));
const { createWordFollower, DEFAULT_CHARS_PER_SECOND, FOLLOW_MIN_HIGHLIGHT_MS } = followModule;

// A fake clock with timers that fire in order as time advances.
function setup() {
  const clock = { now: 0 };
  let timers = [];
  let nextId = 1;
  const acts = [];
  const follower = createWordFollower({
    act: (target) => acts.push({ at: clock.now, target }),
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
  const pending = () => timers.length;
  return { clock, follower, acts, advance, pending };
}

const region = (id) => ({ kind: 'region', id });
// Characters before a name, at the default pace, in milliseconds.
const at = (index, cps = DEFAULT_CHARS_PER_SECOND) => (index / cps) * 1000;

const alignmentFor = (text, msPerChar = 50) => ({
  chars: [...text],
  char_start_times_ms: [...text].map((_, i) => i * msPerChar),
  char_durations_ms: [...text].map(() => msPerChar),
});

describe('Follow the words: timing from the reply text (no alignment)', () => {
  it('speaks at about 15 characters a second, and keeps each highlight at least 1.2 s', () => {
    expect(DEFAULT_CHARS_PER_SECOND).toBe(15);
    expect(FOLLOW_MIN_HIGHLIGHT_MS).toBe(1200);
  });

  it('lights a name when the guide reaches it, counted from when speech began', () => {
    const { follower, acts, advance } = setup();
    const text = 'Here is my cerebellum, busy as ever.';
    follower.guideSpeaking(true);
    advance(300);
    follower.guideText(text);
    const due = at(text.indexOf('cerebellum'));
    advance(due - 300 - 10);
    expect(acts).toEqual([]);
    advance(20);
    expect(acts).toEqual([{ at: expect.closeTo(due, 0), target: region(19) }]);
  });

  it('waits for speech to start when the text arrives first', () => {
    const { follower, acts, advance } = setup();
    const text = 'Here is my cerebellum.';
    follower.guideText(text);
    advance(600);
    follower.guideSpeaking(true);
    advance(5000);
    expect(acts.map(({ at: time }) => time)).toEqual([expect.closeTo(600 + at(text.indexOf('cerebellum')), 0)]);
  });

  it('starts counting at the text after 2 s if speech never reports starting', () => {
    const { follower, acts, advance } = setup();
    follower.guideText('my pons');
    advance(5000);
    expect(acts.map(({ at: time }) => time)).toEqual([expect.closeTo(at(3), 0)]);
  });

  it('counts from the text, not from an earlier reply still being spoken', () => {
    const { follower, acts, advance } = setup();
    follower.guideSpeaking(true);
    follower.guideText('Nothing named here at all.');
    advance(4000);
    follower.guideText('my pons');
    advance(5000);
    expect(acts.map(({ at: time }) => time)).toEqual([expect.closeTo(4000 + at(3), 0)]);
  });

  it('ignores expressive tags when counting', () => {
    const { follower, acts, advance } = setup();
    follower.guideSpeaking(true);
    follower.guideText('[warm] my pons');
    advance(5000);
    expect(acts).toEqual([{ at: expect.closeTo(at(3), 0), target: region(20) }]);
  });

  it('keeps each highlight at least 1.2 s, and lets only the latest waiting name through', () => {
    const { follower, acts, advance } = setup();
    follower.guideSpeaking(true);
    // pons at 0.2 s; cingulate due 0.6 s waits until 1.4 s; precuneus (due
    // 1.33 s) replaces it while it waits.
    follower.guideText('my pons, cingulate, precuneus');
    advance(10_000);
    expect(acts.map(({ target }) => target)).toEqual([region(20), region(10)]);
    expect(acts[1].at - acts[0].at).toBeCloseTo(1200, 0);
  });

  it('learns the guide pace from each reply, within 10 to 22 characters a second', () => {
    const slow = setup();
    slow.follower.guideSpeaking(true);
    slow.follower.guideText('x'.repeat(100));
    slow.advance(10_000);
    slow.follower.guideSpeaking(false);
    expect(slow.follower.charsPerSecond()).toBeLessThan(15);
    expect(slow.follower.charsPerSecond()).toBeGreaterThanOrEqual(10);

    const fast = setup();
    fast.follower.guideSpeaking(true);
    fast.follower.guideText('x'.repeat(300));
    fast.advance(5000);
    fast.follower.guideSpeaking(false);
    expect(fast.follower.charsPerSecond()).toBeGreaterThan(15);
    expect(fast.follower.charsPerSecond()).toBeLessThanOrEqual(22);
  });

  it('reports estimate timing until alignment arrives', () => {
    const { follower } = setup();
    expect(follower.timing()).toBe('estimate');
  });
});

describe('Follow the words: exact timing from audio alignment', () => {
  it('lights a name at its first character as the audio plays', () => {
    const { follower, acts, advance } = setup();
    advance(1000);
    follower.alignment(alignmentFor('and my pons is'));
    advance(5000);
    expect(acts).toEqual([{ at: 1000 + 'and my '.length * 50, target: region(20) }]);
    expect(follower.timing()).toBe('alignment');
  });

  it('waits for a name split across two chunks, then times it from the first', () => {
    const { follower, acts, advance } = setup();
    advance(1000);
    follower.alignment(alignmentFor('my cerebel'));
    advance(200);
    expect(acts).toEqual([]);
    follower.alignment(alignmentFor('lum is busy'));
    advance(5000);
    expect(acts).toEqual([{ at: 1200, target: region(19) }]);
  });

  it('stops estimating from text once alignment is flowing', () => {
    const { follower, acts, advance } = setup();
    follower.alignment(alignmentFor('my pons '));
    follower.guideSpeaking(true);
    follower.guideText('my pons');
    advance(5000);
    expect(acts).toHaveLength(1);
  });
});

describe('Follow the words: the guide and the player come first', () => {
  it('an explicit scene tool call cancels what is waiting, for the rest of that reply', () => {
    const { follower, acts, advance } = setup();
    follower.guideSpeaking(true);
    follower.guideText('my pons and then my cerebellum');
    follower.toolCalled('face_region');
    advance(5000);
    expect(acts).toEqual([]);
    follower.guideText('my precuneus');
    advance(5000);
    expect(acts.map(({ target }) => target)).toEqual([region(10)]);
  });

  it('a non-scene tool (a lookup) changes nothing', () => {
    const { follower, acts, advance } = setup();
    follower.guideSpeaking(true);
    follower.guideText('my pons');
    follower.toolCalled('lookup_region');
    advance(5000);
    expect(acts).toHaveLength(1);
  });

  it('the player interrupting cancels what is waiting', () => {
    const { follower, acts, advance, pending } = setup();
    follower.guideSpeaking(true);
    follower.guideText('Here is my cerebellum.');
    follower.interrupted();
    advance(5000);
    expect(acts).toEqual([]);
    expect(pending()).toBe(0);
  });

  it('dispose clears every timer', () => {
    const { follower, pending } = setup();
    follower.guideSpeaking(true);
    follower.guideText('my pons and my cerebellum');
    follower.dispose();
    expect(pending()).toBe(0);
  });
});
