import { describe, expect, it } from 'vitest';

const soundCheckModule = await import('./soundCheck.js').catch(() => ({}));
const { createSoundCheck, silentWav } = soundCheckModule;

// Kyle, 2026-10-13: "only trigger streaming and motion if the voice talks".
// The brain starts its greeting turn 0.6 s before she speaks, so the page asks
// the browser first, with a sound no one can hear, whether she may be heard.

function fakeAudio(play) {
  return {
    src: null,
    pauses: 0,
    play,
    pause() {
      this.pauses += 1;
    },
  };
}

describe('The silent test sound', () => {
  it('is a valid, silent WAV clip of 50 ms', () => {
    const bytes = silentWav();
    const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 12)).toBe('WAVE');
    expect(ascii(12, 16)).toBe('fmt ');
    expect(ascii(36, 40)).toBe('data');
    // 8000 samples a second, 16-bit mono: 400 samples, 800 bytes, after a 44-byte header.
    expect(bytes.length).toBe(844);
    expect(bytes.slice(44).every((byte) => byte === 0)).toBe(true);
  });
});

describe('Asking the browser whether she may be heard', () => {
  it('says yes when the test sound plays, and stops it', async () => {
    const audio = fakeAudio(async () => {});
    const check = createSoundCheck({ createAudio: (src) => Object.assign(audio, { src }), src: 'blob:silent' });
    expect(await check.allowed()).toBe(true);
    expect(audio.src).toBe('blob:silent');
    expect(audio.pauses).toBe(1);
  });

  it('says no when the browser refuses sound until a press', async () => {
    const check = createSoundCheck({
      createAudio: () =>
        fakeAudio(async () => {
          const error = new Error('blocked');
          error.name = 'NotAllowedError';
          throw error;
        }),
      src: 'blob:silent',
    });
    expect(await check.allowed()).toBe(false);
  });

  // Anything else (an odd codec, a slow device) is not a refusal: she tries,
  // and if the browser refuses then, she waits for the press all the same.
  it('lets her try when the answer is unclear', async () => {
    const odd = createSoundCheck({
      createAudio: () =>
        fakeAudio(async () => {
          const error = new Error('cannot decode');
          error.name = 'NotSupportedError';
          throw error;
        }),
      src: 'blob:silent',
    });
    expect(await odd.allowed()).toBe(true);
    const slow = createSoundCheck({ createAudio: () => fakeAudio(() => new Promise(() => {})), src: 'blob:silent', timeoutMs: 5 });
    expect(await slow.allowed()).toBe(true);
  });
});
