import { describe, expect, it, vi } from 'vitest';

const { createEnter, ENTERED_KEY, APP_PATH } = await import('./enter.js').catch(() => ({}));

// Kyle, 2026-10-15: "When you click Enter, that acts as your action to turn on
// your mic and your speakers." Kyle, 2026-10-17: in this release.

function fakes({ refuse = false, noMic = false } = {}) {
  const stopped = [];
  const stored = new Map();
  const visits = [];
  const track = { stop: () => stopped.push('track') };
  const mediaDevices = noMic
    ? undefined
    : {
        getUserMedia: vi.fn(async () => {
          if (refuse) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
          return { getTracks: () => [track] };
        }),
      };
  const storage = { setItem: (key, value) => stored.set(key, value) };
  return { mediaDevices, storage, go: (path) => visits.push(path), now: () => 5000, stopped, stored, visits };
}

describe('Enter', () => {
  it('asks for the microphone, lets it go, marks the arrival and goes into the app', async () => {
    const f = fakes();
    await createEnter(f)();
    expect(APP_PATH).toBe('/app');
    expect(f.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(f.stopped).toEqual(['track']);
    expect(f.stored.get(ENTERED_KEY)).toBe('5000');
    expect(f.visits).toEqual(['/app']);
  });

  it('still goes in when the microphone is refused, or there is none', async () => {
    for (const options of [{ refuse: true }, { noMic: true }]) {
      const f = fakes(options);
      await createEnter(f)();
      expect(f.stored.get(ENTERED_KEY)).toBe('5000');
      expect(f.visits).toEqual(['/app']);
    }
  });

  it('goes in once, however many times it is pressed while the browser asks', async () => {
    const f = fakes();
    const enter = createEnter(f);
    await Promise.all([enter(), enter(), enter()]);
    expect(f.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(f.visits).toEqual(['/app']);
  });
});
