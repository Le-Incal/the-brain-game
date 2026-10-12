import { describe, expect, it } from 'vitest';
import { WORD_BANK } from '../data/regions';

const demoModule = await import('./demo.js').catch(() => ({}));
const { DEMO_WORDS, DEMO_TILT_DEGREES, DEMO_FALL_SPEED, demoWord, createTourOffer, TOUR_OFFER_QUIET_MS, TOUR_OFFER_MAX_MS } = demoModule;

// Kyle, 2026-10-11: the guide can play the game to give an example, in an
// unscored demo before the countdown. On the first Play of a visit it offers
// one: silence or "no" lets the player play.

// Measured on the painted model (2026-10-11): with the region turned up and
// tilted toward the viewer, a word falling down the centre lands on it for
// every tilt from 5 to 20 degrees for these regions. 12 degrees is the middle.
const CATCHES_AT_12_DEGREES = [5, 6, 7, 11, 17, 19, 20];

describe('The example words', () => {
  it('are easy words from the bank, each landing on its own region', () => {
    expect(DEMO_WORDS.map((entry) => entry.word)).toEqual(['VISION', 'SPEECH', 'BALANCE', 'TOUCH', 'HEARING', 'MOVEMENT']);
    for (const entry of DEMO_WORDS) {
      const banked = WORD_BANK.find((w) => w.word === entry.word);
      expect(banked, entry.word).toBeDefined();
      expect(entry).toBe(banked);
      expect(entry.tier, entry.word).toBe(1);
      expect(CATCHES_AT_12_DEGREES, entry.word).toContain(entry.targetRegion);
    }
  });

  it('turn the region up, tilted 12 degrees toward the player, and fall quickly', () => {
    expect(DEMO_TILT_DEGREES).toBe(12);
    // About two seconds from the top of the screen to the top of the brain.
    expect(DEMO_FALL_SPEED).toBe(0.12);
  });

  it('take turns, so a second example shows something new', () => {
    expect(demoWord(0)).toBe(DEMO_WORDS[0]);
    expect(demoWord(1)).toBe(DEMO_WORDS[1]);
    expect(demoWord(DEMO_WORDS.length)).toBe(DEMO_WORDS[0]);
  });
});

function scheduler() {
  let t = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeoutImpl(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: t + ms });
      return id;
    },
    clearTimeoutImpl(id) {
      timers.delete(id);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
  };
}

function offer() {
  const s = scheduler();
  const starts = [];
  const tour = createTourOffer({ onStart: () => starts.push('start'), setTimeoutImpl: s.setTimeoutImpl, clearTimeoutImpl: s.clearTimeoutImpl });
  return { s, starts, tour };
}

describe('The offer on the first Play', () => {
  it('starts the game after 6 s of quiet', () => {
    expect(TOUR_OFFER_QUIET_MS).toBe(6000);
    const { s, starts, tour } = offer();
    tour.begin();
    s.advance(5999);
    expect(starts).toEqual([]);
    s.advance(1);
    expect(starts).toEqual(['start']);
  });

  it('waits while the guide asks and the player answers', () => {
    const { s, starts, tour } = offer();
    tour.begin();
    s.advance(1000);
    tour.guideSpeaking(true);
    s.advance(10_000);
    expect(starts).toEqual([]);
    tour.guideSpeaking(false);
    s.advance(4000);
    tour.visitorSpoke();
    s.advance(5999);
    expect(starts).toEqual([]);
    s.advance(1);
    expect(starts).toEqual(['start']);
  });

  it('never waits more than 20 s in all', () => {
    expect(TOUR_OFFER_MAX_MS).toBe(20_000);
    const { s, starts, tour } = offer();
    tour.begin();
    tour.guideSpeaking(true);
    s.advance(20_000);
    expect(starts).toEqual(['start']);
  });

  it('holds still while an example plays, then gives the player 6 s more', () => {
    const { s, starts, tour } = offer();
    tour.begin();
    s.advance(3000);
    tour.exampleStarted();
    s.advance(30_000);
    expect(starts).toEqual([]);
    tour.exampleEnded();
    s.advance(5999);
    expect(starts).toEqual([]);
    s.advance(1);
    expect(starts).toEqual(['start']);
  });

  it('starts once only, and never after it is cancelled', () => {
    const { s, starts, tour } = offer();
    tour.begin();
    s.advance(6000);
    tour.visitorSpoke();
    s.advance(6000);
    expect(starts).toEqual(['start']);
    const second = offer();
    second.tour.begin();
    second.tour.cancel();
    second.s.advance(60_000);
    expect(second.starts).toEqual([]);
  });
});
