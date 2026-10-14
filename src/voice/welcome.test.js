import { describe, expect, it } from 'vitest';

const welcomeModule = await import('./welcome.js').catch(() => ({}));
const { createWelcome, WELCOME_DELAY_MS, WELCOME_GREETING_LEAD_MS, WELCOME_ID } = welcomeModule;

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

const STUDY_TEXT = "Hello! Let's study.";
const studyResponse = {
  guideName: 'Sylvi',
  text: STUDY_TEXT,
  audioUrl: '/api/voice/welcome/sylvi/audio?kind=study',
  alignment: { chars: [...STUDY_TEXT], startsMs: [...STUDY_TEXT].map((_, i) => i * 100) },
};

function fakeAudio(options) {
  return {
    src: null,
    currentTime: 0,
    paused: true,
    plays: 0,
    pauses: 0,
    async play() {
      this.plays += 1;
      if (!options.autoplay) {
        const error = new Error('blocked');
        error.name = 'NotAllowedError';
        throw error;
      }
      this.paused = false;
    },
    pause() {
      this.pauses += 1;
      this.paused = true;
    },
  };
}

function setup({ autoplay = true, fetchOk = true, audioFetch = 'ok' } = {}) {
  const clock = { now: 0 };
  const options = { autoplay };
  // The first recording loaded (the arrival welcome) plays through `audio`.
  const audio = fakeAudio(options);
  const audios = [];
  const fetches = [];
  const blobs = [];
  const recordingBlob = { type: 'audio/mpeg', size: 1234 };
  const welcome = createWelcome({
    now: () => clock.now,
    fetchImpl: async (url) => {
      fetches.push(url);
      if (url === response.audioUrl || url === studyResponse.audioUrl) {
        if (audioFetch === 'throws') throw new Error('offline');
        const ok = audioFetch === 'ok';
        return { ok, status: ok ? 200 : 502, blob: async () => ({ ...recordingBlob, url }) };
      }
      const body = url.endsWith('?kind=study') ? studyResponse : response;
      return { ok: fetchOk, status: fetchOk ? 200 : 502, json: async () => (fetchOk ? body : { available: false }) };
    },
    createAudio: (src) => {
      const created = audios.length === 0 ? audio : fakeAudio(options);
      created.src = src;
      audios.push(created);
      return created;
    },
    objectUrl: (blob) => {
      blobs.push(blob);
      return blob.url === studyResponse.audioUrl ? 'blob:study-recording' : 'blob:welcome-recording';
    },
  });
  return { clock, audio, audios, welcome, fetches, blobs, recordingBlob, options };
}

describe('The welcome', () => {
  // Kyle, 2026-10-11: it started too quickly; a visitor needs a moment to land.
  // Kyle, 2026-10-11 (later): 4 s felt too long; halved.
  // Kyle, 2026-10-13: "the agent voice still starts a little too delayed";
  // his pick: "Hello!" about 1.2 s after the brain appears.
  it('says "Hello!" 1.2 s after the brain appears', () => {
    expect(WELCOME_DELAY_MS).toBe(1200);
  });

  // The brain starts to turn before she speaks, so "Hello!" lands on its snap.
  it('lets the brain start turning 0.6 s before she speaks', () => {
    expect(WELCOME_GREETING_LEAD_MS).toBe(600);
  });

  it('never plays once stopped before it starts, and counts as cut short', async () => {
    const { welcome, audio } = setup({ autoplay: true });
    await welcome.load('sylvi');
    welcome.stop();
    expect(await welcome.start()).toBe(false);
    expect(audio.plays).toBe(0);
    expect(welcome.active()).toBe(false);
    expect(welcome.cutShort()).toBe(true);
  });

  it("loads the guide's recording and its text", async () => {
    const { welcome, fetches, audio } = setup();
    expect(await welcome.load('sylvi')).toBe(true);
    expect(fetches).toEqual(['/api/voice/welcome/sylvi', '/api/voice/welcome/sylvi/audio']);
    expect(audio.src).toBe('blob:welcome-recording');
    expect(welcome.text()).toBe(TEXT);
  });

  // Kyle, 2026-10-13, on brain-game.io: the first click turned the voice on
  // from the start, not at the word reached. The server sends the recording
  // whole, so Chrome cannot jump into its middle; a recording held in the page
  // can always be joined anywhere, and is ready the instant the visitor presses.
  it('holds the recording in the page, so the voice can join mid-sentence', async () => {
    const { welcome, audio, blobs, recordingBlob } = setup();
    await welcome.load('sylvi');
    expect(blobs).toEqual([{ ...recordingBlob, url: '/api/voice/welcome/sylvi/audio' }]);
    expect(audio.src).toBe('blob:welcome-recording');
  });

  it("falls back to the recording's address if it cannot be held in the page", async () => {
    for (const audioFetch of ['refused', 'throws']) {
      const { welcome, audio, blobs } = setup({ audioFetch });
      expect(await welcome.load('sylvi')).toBe(true);
      expect(blobs).toEqual([]);
      expect(audio.src).toBe('/api/voice/welcome/sylvi/audio');
      expect(welcome.text()).toBe(TEXT);
    }
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

// Kyle, 2026-10-13: the brain speaks like a puppet, a beat on each syllable
// and a tilt on each phrase, so the welcome reports both as it is spoken.
describe("The welcome's speech cues, for the brain's puppetry", () => {
  // "Welcome. I am Sylvi.": letter i starts at i * 100 ms.
  it('counts syllables and phrases as they are spoken, heard or silent', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    expect(welcome.cues()).toEqual({ syllables: 0, phrases: 0, speaking: false });
    await welcome.load('sylvi');
    await welcome.start();
    const at = (ms) => {
      clock.now = ms;
      return welcome.cues();
    };
    expect(at(50)).toEqual({ syllables: 0, phrases: 1, speaking: true }); // "W"
    expect(at(150)).toEqual({ syllables: 1, phrases: 1, speaking: true }); // "e"
    expect(at(750)).toEqual({ syllables: 2, phrases: 1, speaking: false }); // "."
    expect(at(950)).toEqual({ syllables: 3, phrases: 2, speaking: true }); // "I"
  });

  it('follows the audio while heard', async () => {
    const { welcome, audio } = setup({ autoplay: true });
    await welcome.load('sylvi');
    await welcome.start();
    audio.currentTime = 0.95;
    expect(welcome.cues()).toEqual({ syllables: 3, phrases: 2, speaking: true });
  });

  it('stops speaking once finished or stopped, keeping its counts', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    await welcome.load('sylvi');
    await welcome.start();
    clock.now = 10_000;
    expect(welcome.cues()).toEqual({ syllables: 6, phrases: 2, speaking: false });

    const other = setup({ autoplay: false });
    await other.welcome.load('sylvi');
    await other.welcome.start();
    other.clock.now = 950;
    other.welcome.stop();
    expect(other.welcome.cues()).toEqual({ syllables: 3, phrases: 2, speaking: false });
  });
});

// Kyle, 2026-10-13: the tour runs about 15 s and outlasts the welcome, so the
// page needs to tell a welcome that was cut short from one that simply finished.
describe('Whether the welcome was cut short', () => {
  it('is not, before it starts or while it plays', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    expect(welcome.cutShort()).toBe(false);
    await welcome.load('sylvi');
    await welcome.start();
    clock.now = 500;
    expect(welcome.cutShort()).toBe(false);
  });

  it('is, once the visitor speaks or writes over it', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    await welcome.load('sylvi');
    await welcome.start();
    clock.now = 500;
    welcome.stop();
    expect(welcome.cutShort()).toBe(true);
  });

  it('is not, when it simply finishes, even if stopped afterwards', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    await welcome.load('sylvi');
    await welcome.start();
    clock.now = 10_000;
    expect(welcome.active()).toBe(false);
    expect(welcome.cutShort()).toBe(false);
    welcome.stop();
    expect(welcome.cutShort()).toBe(false);
  });
});

// Kyle, 2026-10-13: "only trigger streaming and motion if the voice talks".
// Where the browser refuses sound, the welcome waits, unstarted, for the
// visitor's first press; nothing streams and nothing moves until it is heard.
describe('Waiting for sound', () => {
  it('stays unstarted when the browser refuses, so nothing flows silently', async () => {
    const { welcome, clock } = setup({ autoplay: false });
    await welcome.load('sylvi');
    expect(await welcome.start({ holdIfRefused: true })).toBe(false);
    clock.now = 850;
    expect(welcome.position()).toBeNull();
    expect(welcome.active()).toBe(false);
    expect(welcome.playback()).toEqual({ id: null, playedChars: null, done: false });
    expect(welcome.cues()).toEqual({ syllables: 0, phrases: 0, speaking: false });
    expect(welcome.cutShort()).toBe(false);
  });

  it('starts from the top once a press allows sound', async () => {
    const { welcome, clock, options } = setup({ autoplay: false });
    await welcome.load('sylvi');
    await welcome.start({ holdIfRefused: true });
    clock.now = 4000;
    options.autoplay = true;
    expect(await welcome.start({ holdIfRefused: true })).toBe(true);
    expect(welcome.position()).toBe(0);
    expect(welcome.audible()).toBe(true);
  });

  // Safari allows a page sound only from inside the press itself. Starting and
  // pausing each recording there lets it play when its moment comes.
  it('primes every recording from inside the press, without starting the welcome', async () => {
    const { welcome, audios } = setup({ autoplay: false });
    await welcome.load('sylvi');
    await welcome.load('sylvi', 'study');
    expect(welcome.primed()).toBe(false);
    welcome.prime();
    expect(audios.map((a) => [a.plays, a.pauses])).toEqual([[1, 1], [1, 1]]);
    expect(welcome.primed()).toBe(true);
    expect(welcome.position()).toBeNull();
    // Once is enough.
    welcome.prime();
    expect(audios.map((a) => a.plays)).toEqual([1, 1]);
  });
});

// Kyle, 2026-10-13: "Have a custom welcome for each button if the first
// welcome never plays". Each choice has its own short recording.
describe("The choices' own welcomes", () => {
  it("loads a choice's welcome beside the arrival one, without replacing it", async () => {
    const { welcome, fetches, audios } = setup();
    await welcome.load('sylvi');
    expect(await welcome.load('sylvi', 'study')).toBe(true);
    expect(fetches).toEqual([
      '/api/voice/welcome/sylvi',
      '/api/voice/welcome/sylvi/audio',
      '/api/voice/welcome/sylvi?kind=study',
      '/api/voice/welcome/sylvi/audio?kind=study',
    ]);
    expect(audios.map((a) => a.src)).toEqual(['blob:welcome-recording', 'blob:study-recording']);
    expect(welcome.kind()).toBe('arrival');
    expect(welcome.text()).toBe(TEXT);
  });

  it("plays a choice's welcome in place of the arrival one", async () => {
    const { welcome, audios, audio } = setup();
    await welcome.load('sylvi');
    await welcome.load('sylvi', 'study');
    expect(welcome.use('study')).toBe(true);
    expect(welcome.kind()).toBe('study');
    expect(welcome.text()).toBe(STUDY_TEXT);
    expect(await welcome.start()).toBe(true);
    expect(audios[1].paused).toBe(false);
    expect(audio.plays).toBe(0);
    expect(welcome.playback().id).toBe(WELCOME_ID);
  });

  it('never swaps a welcome that has started or was stopped, or one not loaded', async () => {
    const { welcome } = setup();
    await welcome.load('sylvi');
    expect(welcome.use('play')).toBe(false);
    await welcome.load('sylvi', 'study');
    await welcome.start();
    expect(welcome.use('study')).toBe(false);
    expect(welcome.kind()).toBe('arrival');

    const other = setup();
    await other.welcome.load('sylvi');
    await other.welcome.load('sylvi', 'study');
    other.welcome.stop();
    expect(other.welcome.use('study')).toBe(false);
  });
});
