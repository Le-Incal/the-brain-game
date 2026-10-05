/**
 * Build-time switch for the voice layer. main deploys to production on push,
 * so Study mode and every voice control stay out until launch. Only the exact
 * string 'true' enables it; Vite exposes env values as strings.
 */
export function isVoiceEnabled(env) {
  return env?.VITE_VOICE_ENABLED === 'true';
}

export const VOICE_ENABLED = isVoiceEnabled(import.meta.env);
