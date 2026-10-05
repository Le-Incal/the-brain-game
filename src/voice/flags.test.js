import { describe, expect, it } from 'vitest';

const flagsModule = await import('./flags.js').catch(() => ({}));
const { isVoiceEnabled } = flagsModule;

describe('M2: voice build flag', () => {
  // main deploys to production on push; voice stays out until launch.
  it("is on only when VITE_VOICE_ENABLED is the string 'true'", () => {
    expect(isVoiceEnabled({ VITE_VOICE_ENABLED: 'true' })).toBe(true);
    for (const value of [undefined, '', 'false', '1', 'TRUE', 'yes', true]) {
      expect(isVoiceEnabled({ VITE_VOICE_ENABLED: value }), String(value)).toBe(false);
    }
    expect(isVoiceEnabled(undefined)).toBe(false);
  });

  it('is off in the environment the tests and production build run with', () => {
    expect(isVoiceEnabled(import.meta.env)).toBe(false);
  });
});
