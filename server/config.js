/**
 * Voice configuration from the environment. Any missing or invalid variable
 * makes voice unavailable; the game itself never depends on these. Names of
 * missing variables may be logged, values never.
 */

export const REQUIRED_VOICE_VARIABLES = [
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_AGENT_ID',
  'VOICE_ID_ROLLO',
  'VOICE_ID_SYLVI',
  'VOICE_SESSION_SECRET',
  'VOICE_HOSTS',
  'VOICE_SESSION_MAX_SECONDS',
  'VOICE_DAILY_MAX_SECONDS',
  'VOICE_GLOBAL_DAILY_MAX_SECONDS',
];

const SECONDS_VARIABLES = ['VOICE_SESSION_MAX_SECONDS', 'VOICE_DAILY_MAX_SECONDS', 'VOICE_GLOBAL_DAILY_MAX_SECONDS'];
const MIN_SESSION_SECRET_LENGTH = 32;

const present = (value) => typeof value === 'string' && value.trim() !== '';

function positiveSeconds(value) {
  if (!/^\d+$/.test(String(value ?? '').trim())) return null;
  const seconds = Number(value);
  return seconds > 0 ? seconds : null;
}

export function readVoiceConfig(env = {}) {
  const production = env.NODE_ENV === 'production';
  const missing = REQUIRED_VOICE_VARIABLES.filter((name) => !present(env[name]));
  // Without refunds every conversation costs its full reservation, which
  // drains the global budget about four times too fast. Production refuses.
  if (production && !present(env.ELEVENLABS_WEBHOOK_SECRET)) missing.push('ELEVENLABS_WEBHOOK_SECRET');

  const invalid = [];
  for (const name of SECONDS_VARIABLES) {
    if (present(env[name]) && positiveSeconds(env[name]) === null) invalid.push(name);
  }
  if (present(env.VOICE_SESSION_SECRET) && env.VOICE_SESSION_SECRET.trim().length < MIN_SESSION_SECRET_LENGTH) {
    invalid.push('VOICE_SESSION_SECRET');
  }
  const hosts = present(env.VOICE_HOSTS)
    ? env.VOICE_HOSTS.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean)
    : [];
  if (present(env.VOICE_HOSTS) && hosts.length === 0) invalid.push('VOICE_HOSTS');

  const webhookSecret = present(env.ELEVENLABS_WEBHOOK_SECRET) ? env.ELEVENLABS_WEBHOOK_SECRET.trim() : null;
  return {
    available: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    production,
    apiKey: env.ELEVENLABS_API_KEY?.trim(),
    agentId: env.ELEVENLABS_AGENT_ID?.trim(),
    voices: { rollo: env.VOICE_ID_ROLLO?.trim(), sylvi: env.VOICE_ID_SYLVI?.trim() },
    sessionSecret: env.VOICE_SESSION_SECRET?.trim(),
    hosts,
    sessionMaxSeconds: positiveSeconds(env.VOICE_SESSION_MAX_SECONDS),
    dailyMaxSeconds: positiveSeconds(env.VOICE_DAILY_MAX_SECONDS),
    globalDailyMaxSeconds: positiveSeconds(env.VOICE_GLOBAL_DAILY_MAX_SECONDS),
    webhookSecret,
    refundsEnabled: webhookSecret !== null,
  };
}
