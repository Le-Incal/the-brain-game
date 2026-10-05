import { describe, expect, it } from 'vitest';
import { makeEnv } from './helpers.js';

const configModule = await import('../config.js').catch(() => ({}));
const { readVoiceConfig, REQUIRED_VOICE_VARIABLES } = configModule;

describe('M3: voice configuration', () => {
  it('lists the variables voice cannot run without', () => {
    expect(REQUIRED_VOICE_VARIABLES).toEqual([
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_AGENT_ID',
      'VOICE_ID_ROLLO',
      'VOICE_ID_SYLVI',
      'VOICE_SESSION_SECRET',
      'VOICE_HOSTS',
      'VOICE_SESSION_MAX_SECONDS',
      'VOICE_DAILY_MAX_SECONDS',
      'VOICE_GLOBAL_DAILY_MAX_SECONDS',
      'VOICE_MAX_OPEN_RESERVATIONS',
    ]);
  });

  it('is available when every required variable is present and valid', () => {
    const config = readVoiceConfig(makeEnv());
    expect(config.available).toBe(true);
    expect(config).toMatchObject({
      sessionMaxSeconds: 480,
      dailyMaxSeconds: 900,
      globalDailyMaxSeconds: 18000,
      maxOpenReservations: 10,
      hosts: ['www.brain-game.io', 'brain-game.io'],
      voices: { rollo: 'voice_rollo_test', sylvi: 'voice_sylvi_test' },
      production: true,
    });
  });

  it.each(['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'VOICE_ID_SYLVI', 'VOICE_GLOBAL_DAILY_MAX_SECONDS'])(
    'is unavailable without %s, and names it without exposing any value',
    (name) => {
      const env = makeEnv();
      delete env[name];
      const config = readVoiceConfig(env);
      expect(config.available).toBe(false);
      expect(config.missing).toEqual([name]);
    }
  );

  it.each([
    ['VOICE_SESSION_MAX_SECONDS', 'abc'],
    ['VOICE_DAILY_MAX_SECONDS', '-5'],
    ['VOICE_GLOBAL_DAILY_MAX_SECONDS', '0'],
    ['VOICE_SESSION_SECRET', 'too-short'],
    ['VOICE_MAX_OPEN_RESERVATIONS', '0'],
  ])('is unavailable when %s is invalid (%j)', (name, value) => {
    const config = readVoiceConfig(makeEnv({ [name]: value }));
    expect(config.available).toBe(false);
    expect(config.invalid).toContain(name);
  });

  // Without refunds every conversation costs the full 480 s: about 37 a day
  // site-wide on an 18,000 s budget. Production must not run that way.
  it('requires the webhook secret in production', () => {
    const env = makeEnv();
    delete env.ELEVENLABS_WEBHOOK_SECRET;
    const config = readVoiceConfig(env);
    expect(config.available).toBe(false);
    expect(config.missing).toEqual(['ELEVENLABS_WEBHOOK_SECRET']);
  });

  it('keeps the webhook secret optional outside production, with refunds off', () => {
    const env = makeEnv({ NODE_ENV: 'development' });
    delete env.ELEVENLABS_WEBHOOK_SECRET;
    const config = readVoiceConfig(env);
    expect(config.available).toBe(true);
    expect(config.refundsEnabled).toBe(false);
  });

  it('turns refunds on when the secret is present', () => {
    expect(readVoiceConfig(makeEnv()).refundsEnabled).toBe(true);
  });
});
