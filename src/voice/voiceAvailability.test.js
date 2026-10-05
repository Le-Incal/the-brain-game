import { describe, expect, it } from 'vitest';

const availabilityModule = await import('./voiceAvailability.js').catch(() => ({}));
const { describeVoiceUnavailable, formatTimeUntilReset } = availabilityModule;

describe('M3: telling players when voice returns', () => {
  // Days run on UTC, so the reset is 5pm Pacific: say hours, never "tomorrow".
  it.each([
    [3 * 3600, 'in about 3 hours'],
    [12 * 3600, 'in about 12 hours'],
    [2.6 * 3600, 'in about 3 hours'],
    [5000, 'in about an hour'],
    [3600, 'in about an hour'],
    [40 * 60, 'in about 40 minutes'],
    [90, 'in about 2 minutes'],
    [45, 'in under a minute'],
  ])('%i seconds reads %j', (seconds, text) => {
    expect(formatTimeUntilReset(seconds)).toBe(text);
  });

  it('never says tomorrow', () => {
    for (const seconds of [60, 3600, 6 * 3600, 23.9 * 3600]) {
      expect(formatTimeUntilReset(seconds)).not.toMatch(/tomorrow/i);
    }
  });

  it('explains each reason in plain words, with the reset time where there is one', () => {
    expect(describeVoiceUnavailable({ reason: 'device_daily_cap', resetsInSeconds: 3 * 3600 })).toBe(
      "You've used today's voice time. Voice returns in about 3 hours."
    );
    expect(describeVoiceUnavailable({ reason: 'global_budget', resetsInSeconds: 3 * 3600 })).toBe(
      "Voice has reached today's limit for everyone. It returns in about 3 hours."
    );
    expect(describeVoiceUnavailable({ reason: 'restoring' })).toBe('Voice is starting up. Try again in a moment.');
    expect(describeVoiceUnavailable({ reason: 'busy' })).toBe('The guide is busy. Try again shortly.');
    expect(describeVoiceUnavailable({ reason: 'rate_limited' })).toBe(
      'Too many conversations from this network. Try again in a few minutes.'
    );
    for (const reason of ['not_configured', 'host', 'upstream', 'anything_else']) {
      expect(describeVoiceUnavailable({ reason })).toBe('Voice is unavailable right now. The game works as usual.');
    }
  });
});
