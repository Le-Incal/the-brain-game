/**
 * The recorded welcome (Kyle, 2026-10-11). Each guide's welcome is recorded
 * once with ElevenLabs text to speech, with the time each letter is spoken,
 * and kept in memory: it plays at once, costs nothing per visit and works even
 * when every conversation slot is taken. It never touches voice minutes.
 */

const API = 'https://api.elevenlabs.io';
// The voice settings the agent uses (ElevenLabs agent, Voice panel).
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75 };
// The live agent speaks with V4 Turbo (ElevenLabs agent, Voice panel), so the
// welcome does too. Kyle, 2026-10-11: recorded with Turbo v2.5 it sounded
// "like an early 2000s digital voice". Turbo v2.5 stays only as a fallback for
// an account that refuses the model. WELCOME_TTS_MODEL overrides the first choice.
export const DEFAULT_WELCOME_MODEL = 'eleven_v4_turbo';
export const WELCOME_FALLBACK_MODEL = 'eleven_turbo_v2_5';
// ElevenLabs answers these when a model is unknown or not allowed; an outage (5xx) is not one.
const MODEL_REFUSED = new Set([400, 403, 404, 422]);
export const WELCOME_RETRY_AFTER_MS = 60_000;

// The arrival welcome, and one for each choice (Kyle, 2026-10-13: "Have a
// custom welcome for each button if the first welcome never plays").
export const WELCOME_KINDS = ['arrival', 'study', 'play'];

export function welcomeText(guideName, kind = 'arrival') {
  if (kind === 'study') {
    return `Hello! I am ${guideName}, a human brain. Let's study together: turn me around and select any of my regions, or ask me anything.`;
  }
  if (kind === 'play') return `Hello! I am ${guideName}. Turn me so each word lands on the part of me that does it.`;
  // "Hello!", as a puppet that turns and suddenly recognizes the visitor (Kyle, 2026-10-13).
  return `Hello! I am ${guideName}, a human brain. You can study with me to learn how I work, test your knowledge in the Brain Game, or explore on your own: turn me around and select any of my regions.`;
}

/** One recording: `{ audio: Buffer, chars, startsMs }`. */
export async function fetchWelcomeRecording({ fetchImpl, apiKey, voiceId, text, modelId }) {
  const url = `${API}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: VOICE_SETTINGS }),
  });
  if (!response.ok) {
    const error = new Error(`ElevenLabs welcome recording failed (${response.status})`);
    error.status = response.status;
    error.modelRefused = MODEL_REFUSED.has(response.status);
    throw error;
  }
  const body = await response.json();
  const alignment = body?.alignment ?? body?.normalized_alignment;
  if (typeof body?.audio_base64 !== 'string' || !Array.isArray(alignment?.characters)) {
    throw new Error('ElevenLabs welcome response was malformed');
  }
  return {
    model: modelId,
    audio: Buffer.from(body.audio_base64, 'base64'),
    chars: alignment.characters,
    startsMs: alignment.character_start_times_seconds.map((seconds) => Math.round(seconds * 1000)),
  };
}

/**
 * Records each guide once and keeps it. A failed recording is not cached, and
 * is tried again only after a minute, so a broken key cannot hammer ElevenLabs.
 */
export function createWelcomeCache({ record, now = Date.now, retryAfterMs = WELCOME_RETRY_AFTER_MS }) {
  const recordings = new Map();
  const failedAt = new Map();
  return {
    get(guide) {
      if (recordings.has(guide)) return recordings.get(guide);
      const failed = failedAt.get(guide);
      if (failed !== undefined && now() - failed < retryAfterMs) {
        return Promise.reject(new Error('welcome recording failed recently'));
      }
      const pending = record(guide).catch((error) => {
        recordings.delete(guide);
        failedAt.set(guide, now());
        throw error;
      });
      recordings.set(guide, pending);
      return pending;
    },
  };
}
