/**
 * Plain-language voice availability for players. Days run on UTC, so the
 * reset falls at 5pm Pacific: say how long, never "tomorrow".
 */
export function formatTimeUntilReset(seconds) {
  if (seconds < 60) return 'in under a minute';
  const minutes = Math.round(seconds / 60);
  if (seconds < 3600 && minutes < 60) return minutes === 1 ? 'in about a minute' : `in about ${minutes} minutes`;
  const hours = seconds / 3600;
  if (hours < 1.5) return 'in about an hour';
  return `in about ${Math.round(hours)} hours`;
}

export function describeVoiceUnavailable({ reason, resetsInSeconds } = {}) {
  switch (reason) {
    case 'device_daily_cap':
      return `You've used today's voice time. Voice returns ${formatTimeUntilReset(resetsInSeconds)}.`;
    case 'global_budget':
      return `Voice has reached today's limit for everyone. It returns ${formatTimeUntilReset(resetsInSeconds)}.`;
    case 'restoring':
      return 'Voice is starting up. Try again in a moment.';
    case 'busy':
      return 'The guide is busy, try again shortly.';
    case 'rate_limited':
      return 'Too many conversations from this network. Try again in a few minutes.';
    default:
      return 'Voice is unavailable right now. The game works as usual.';
  }
}
