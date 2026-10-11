/**
 * The recorded welcome on arrival (Kyle, 2026-10-11). It begins about 1.5 s
 * after the brain is ready. Where the browser allows sound it plays aloud;
 * where it does not (most first visits), its text flows on its own clock and
 * the voice joins at the word the text has reached on the visitor's first tap.
 *
 * `playback()` speaks the same language as the word follower's, so the
 * transcript streams the welcome exactly as it streams any other reply.
 */

export const WELCOME_DELAY_MS = 1500;
export const WELCOME_ID = 'welcome';
// The last letter's start plus a breath, before the welcome counts as done.
const TAIL_MS = 600;
// A gentle level for the hatching while a letter is heard.
const SPEAKING_LEVEL = 0.28;

export function createWelcome({
  fetchImpl = (...args) => globalThis.fetch(...args),
  createAudio = (src) => new Audio(src),
  now = () => performance.now(),
} = {}) {
  let recording = null;
  let audio = null;
  let startedAt = null;
  let heard = false;
  let stopped = false;

  const endMs = () => (recording ? (recording.startsMs.at(-1) ?? 0) + TAIL_MS : 0);
  // While heard, the audio's own position is the truth; otherwise our clock.
  const elapsedMs = () => {
    if (startedAt === null) return 0;
    if (heard && audio && !audio.paused) return audio.currentTime * 1000;
    return now() - startedAt;
  };
  const finished = () => stopped || (startedAt !== null && elapsedMs() >= endMs());

  function playedChars(at = elapsedMs()) {
    const starts = recording.startsMs;
    let lo = 0;
    let hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // Keep our clock in step with the audio, so a mute or a stall carries on smoothly.
  function rebase() {
    if (heard && audio && !audio.paused) startedAt = now() - audio.currentTime * 1000;
  }

  return {
    async load(guide) {
      try {
        const response = await fetchImpl(`/api/voice/welcome/${guide}`);
        if (!response.ok) return false;
        const body = await response.json();
        if (!Array.isArray(body?.alignment?.chars) || !Array.isArray(body?.alignment?.startsMs)) return false;
        recording = { text: body.alignment.chars.join(''), startsMs: body.alignment.startsMs };
        audio = createAudio(body.audioUrl);
        return true;
      } catch {
        return false;
      }
    },

    text: () => recording?.text ?? '',

    /** Starts the welcome; resolves true if it is heard, false if it flows silently. */
    async start() {
      if (!recording || startedAt !== null) return heard;
      startedAt = now();
      try {
        await audio.play();
        heard = true;
      } catch {
        heard = false;
      }
      return heard;
    },

    /** The visitor's first tap: the voice joins at the word the text has reached. */
    async unlock() {
      if (!recording || startedAt === null || finished()) return false;
      if (heard) return true;
      const at = now() - startedAt;
      try {
        audio.currentTime = at / 1000;
        await audio.play();
        heard = true;
        rebase();
        return true;
      } catch {
        return false;
      }
    },

    mute() {
      if (!heard) return;
      rebase();
      heard = false;
      audio?.pause();
    },

    stop() {
      if (startedAt === null) return;
      stopped = true;
      heard = false;
      audio?.pause();
    },

    audible: () => heard && !finished(),
    active: () => recording !== null && startedAt !== null && !finished(),

    playback() {
      if (!recording || startedAt === null) return { id: null, playedChars: null, done: false };
      if (finished()) return { id: WELCOME_ID, playedChars: recording.text.length, done: true };
      return { id: WELCOME_ID, playedChars: playedChars(), done: false };
    },

    /** A level for the hatching: only while the welcome is heard and a letter is sounding. */
    level() {
      if (!heard || finished()) return 0;
      const index = playedChars() - 1;
      const char = recording.text[index];
      return char && /\S/.test(char) ? SPEAKING_LEVEL : 0;
    },
  };
}
