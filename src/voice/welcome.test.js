import { describe, expect, it } from 'vitest';

const welcomeModule = await import('./welcome.js').catch(() => ({}));
const { createWelcome, WELCOME_DELAY_MS, WELCOME_ID } = welcomeModule;

// Kyle, 2026-10-11: within seconds of the page loading the brain welcomes the
// visitor. Browsers block sound until the first tap, so the welcome's text
// flows on its own clock, and the voice joins at the word the text has reached.

const TEXT = 'Welcome. I am Sylvi.';
const response = {
  guideName: 'Sylvi',
  text: TEXT,
  audioUrl: '/api/voice/welcome/sylvi/audio',
  alignment: { chars: [...TEXT], startsMs: [...TEXT].map((_, i) => i * 100) },
};

function setup({ autoplay = true, fetchOk = true } = {}) {
  const clock = { now: 0 };
  const audio = {
    src: null,
    currentTime: 0,
    paused: true,
    plays: 0,
    async play() {
      this.plays += 1;
      if (!autoplay) {
        const error = new Error('blocked');
        error.name = 'NotAllowedError';
        throw error;
      }
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
  };
  const fetches = [];
  const welcome = createWelcome({
    now: () => clock.now,
    fetchImpl: async (url) => {
      fetches.push(url);
      return { ok: fetchOk, status: fetchOk ? 200 : 502, json: async () => (fetchOk ? response : { available: false }) };
    },
    createAudio: (src) => {
      audio.src = src;
      return audio;
    },
  });
  return { clock, audio, welcome, fetches };
}

describe('The welcome', () => {
  // Kyle, 2026-10-11: it started too quickly; a visitor needs a moment to land.
  // Kyle, 2026-10-11 (later): 4 s felt too long; halved.
  it('begins 2 s after the brain appears', () => {
    expect(WELCOME_DELAY_MS).toBe(2000);
  });

  it("loads the guide's recording and its text", async () => {
    const { welcome, fetches, audio } = setup();
    expect(await welcome.load('sylvi')).toBe(true);
    expect(fetches).toEqual(['/api/voice/welcome/sylvi']);
    expect(audio.src).toBe('/api/voice/welcome/sylvi/audio');
    expect(welcome.text()).toBe(TEXT);
  });

  it('plays aloud where the browser allows it, and reports what has been heard', async () => {
    const { welcome, audio } = setup({ autoplay: true });
    await welcome.load('sylvi');
    expect(await welcome.start()).toBe(true);
    expect(welcome.audible()).toBe(true);
    audio.currentTime = 0.55;
    expect(welcome.playback()).toEqual({ id: WELCOME_ID, playedChars: 6, done: false });
  });

  it('flows silently on its own clock when the browser blocks sound', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    await welcome.load('sylvi');
    expect(await welcome.start()).toBe(false);
    expect(welcome.audible()).toBe(false);
    clock.now = 850;
    expect(welcome.playback().playedChars).toBe(9);
  });

  it('joins with the voice at the word the text has reached on the first tap', async () => {
    const { welcome, clock, audio } = setup({ autoplay: false });
    await welcome.load('sylvi');
    await welcome.start();
    clock.now = 1200;
    audio.play = async function play() {
      this.paused = false;
    };
    expect(await welcome.unlock()).toBe(true);
    expect(audio.currentTime).toBeCloseTo(1.2, 5);
    expect(welcome.audible()).toBe(true);
  });

  it('does not replay a welcome that has already finished', async () => {
    const { welcome, clock, audio } = setup({ autoplay: false });
    await welcome.load('sylvi');
    await welcome.start();
    clock.now = 10_000;
    expect(welcome.playback()).toMatchObject({ playedChars: TEXT.length, done: true });
    const plays = audio.plays;
    expect(await welcome.unlock()).toBe(false);
    expect(audio.plays).toBe(plays);
  });

  it('stops at once when the visitor speaks or writes', async () => {
    const { welcome, audio } = setup({ autoplay: true });
    await welcome.load('sylvi');
    await welcome.start();
    welcome.stop();
    expect(audio.paused).toBe(true);
    expect(welcome.active()).toBe(false);
    expect(welcome.playback()).toMatchObject({ done: true });
  });

  it('can be muted and keeps flowing silently', async () => {
    const { welcome, audio, clock } = setup({ autoplay: true });
    await welcome.load('sylvi');
    await welcome.start();
    audio.currentTime = 0.3;
    clock.now = 300;
    welcome.mute();
    expect(audio.paused).toBe(true);
    expect(welcome.audible()).toBe(false);
    clock.now = 700;
    // Letters start every 100 ms from 0: by 700 ms, eight have begun.
    expect(welcome.playback().playedChars).toBe(8);
  });

  it('gives the hatching a voice level only while a letter is heard', async () => {
    const { welcome, audio } = setup({ autoplay: true });
    await welcome.load('sylvi');
    await welcome.start();
    audio.currentTime = 0.15;
    expect(welcome.level()).toBeGreaterThan(0);
    welcome.mute();
    expect(welcome.level()).toBe(0);
  });

  it('stays out of the way if the recording is unavailable', async () => {
    const { welcome } = setup({ fetchOk: false });
    expect(await welcome.load('sylvi')).toBe(false);
    expect(welcome.active()).toBe(false);
    expect(welcome.playback()).toEqual({ id: null, playedChars: null, done: false });
  });
});

// Kyle, 2026-10-11: the brain turns all the way round while it introduces
// itself and moves as if it is talking. The spin is timed to its words, and
// the talking motion follows its syllables, whether the welcome is heard or
// flows silently as text.
describe("The welcome's timings, for the spin", () => {
  it('knows when a phrase is spoken', async () => {
    const { welcome } = setup();
    expect(welcome.timeOf('I am')).toBeNull();
    await welcome.load('sylvi');
    // "Welcome. I am Sylvi.": "I am" begins at letter 9, 100 ms a letter.
    expect(welcome.timeOf('I am')).toBe(900);
    expect(welcome.timeOf('Sylvi')).toBe(1400);
    expect(welcome.timeOf('a human brain')).toBeNull();
  });

  it('knows how long it lasts: the last letter plus a breath', async () => {
    const { welcome } = setup();
    expect(welcome.lengthMs()).toBe(0);
    await welcome.load('sylvi');
    expect(welcome.lengthMs()).toBe(2500);
  });

  it('reports how far in it is, on its own clock while silent', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    await welcome.load('sylvi');
    expect(welcome.position()).toBeNull();
    await welcome.start();
    clock.now = 850;
    expect(welcome.position()).toBe(850);
  });

  it("reports how far in it is from the audio's own position while heard", async () => {
    const { welcome, audio } = setup({ autoplay: true });
    await welcome.load('sylvi');
    await welcome.start();
    audio.currentTime = 1.25;
    expect(welcome.position()).toBe(1250);
  });
});

describe("The welcome's talking level, for the brain's motion", () => {
  // "Welcome. I am Sylvi.": letter i starts at i * 100 ms.
  it('rises on vowels, less on consonants, little on spaces and not at all on stops', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    await welcome.load('sylvi');
    await welcome.start();
    const at = (ms) => {
      clock.now = ms;
      return welcome.talkingLevel();
    };
    const vowel = at(150); // "e" in "Welcome"
    const consonant = at(250); // "l"
    const stop = at(750); // "."
    const space = at(850); // " "
    const capitalVowel = at(950); // "I"
    expect(vowel).toBe(1);
    expect(capitalVowel).toBe(1);
    expect(consonant).toBeGreaterThan(space);
    expect(consonant).toBeLessThan(vowel);
    expect(space).toBeGreaterThan(stop);
    expect(stop).toBe(0);
  });

  it('follows the audio while heard', async () => {
    const { welcome, audio } = setup({ autoplay: true });
    await welcome.load('sylvi');
    await welcome.start();
    audio.currentTime = 0.15;
    expect(welcome.talkingLevel()).toBe(1);
  });

  it('keeps moving while the welcome flows silently, unlike the hatching', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    await welcome.load('sylvi');
    await welcome.start();
    clock.now = 150;
    expect(welcome.talkingLevel()).toBe(1);
    expect(welcome.level()).toBe(0);
  });

  it('is still before the welcome starts, once it is stopped and once it has finished', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    expect(welcome.talkingLevel()).toBe(0);
    await welcome.load('sylvi');
    expect(welcome.talkingLevel()).toBe(0);
    await welcome.start();
    clock.now = 10_000;
    expect(welcome.talkingLevel()).toBe(0);

    const other = setup({ autoplay: true });
    await other.welcome.load('sylvi');
    await other.welcome.start();
    other.audio.currentTime = 0.15;
    other.welcome.stop();
    expect(other.welcome.talkingLevel()).toBe(0);
  });
});
