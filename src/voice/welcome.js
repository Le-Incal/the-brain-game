/**
 * The recorded welcome on arrival (Kyle, 2026-10-11). It begins 2 s after the
 * brain appears, counting only time the visitor can see the page, so a
 * background tab keeps its welcome until it is looked at. Where the browser allows sound it plays aloud;
 * where it does not (most first visits), its text flows on its own clock and
 * the voice joins at the word the text has reached on the visitor's first tap.
 *
 * `playback()` speaks the same language as the word follower's, so the
 * transcript streams the welcome exactly as it streams any other reply.
 */

import { analyseSpeech } from './speechCues.js';

export const WELCOME_DELAY_MS = 2000;
export const WELCOME_ID = 'welcome';

/**
 * Calls `onDue` once, after `delayMs` of time with the page visible. Feed it
 * `visibility(document.hidden)` on every visibilitychange.
 */
export function createArrivalClock({
  delayMs = WELCOME_DELAY_MS,
  hidden = false,
  onDue,
  now = () => performance.now(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
}) {
  let remaining = delayMs;
  let runningSince = null;
  let timer = null;
  let done = false;

  function run() {
    if (done || runningSince !== null) return;
    runningSince = now();
    timer = setTimeoutImpl(() => {
      timer = null;
      runningSince = null;
      if (done) return;
      done = true;
      onDue();
    }, remaining);
  }

  function hold() {
    if (runningSince === null) return;
    remaining = Math.max(0, remaining - (now() - runningSince));
    runningSince = null;
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
  }

  if (!hidden) run();

  return {
    visibility(isHidden) {
      if (isHidden) hold();
      else run();
    },
    dispose() {
      done = true;
      hold();
    },
  };
}
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
  // Stopped before it had finished: the visitor spoke or wrote over it.
  let cut = false;
  // Where the letters stood when it was stopped, so its cues hold there.
  let stoppedAtChars = null;

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
        const text = body.alignment.chars.join('');
        recording = { text, startsMs: body.alignment.startsMs, speech: analyseSpeech(text) };
        audio = createAudio(body.audioUrl);
        return true;
      } catch {
        return false;
      }
    },

    text: () => recording?.text ?? '',

    /** When `phrase` begins, in ms from the start of the welcome; null if it is not said. */
    timeOf(phrase) {
      const index = recording ? recording.text.indexOf(phrase) : -1;
      return index < 0 ? null : recording.startsMs[index];
    },

    /** How far into the welcome we are, in ms; null before it starts. */
    position: () => (startedAt === null ? null : elapsedMs()),

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
      if (!finished()) {
        cut = true;
        stoppedAtChars = playedChars();
      }
      stopped = true;
      heard = false;
      audio?.pause();
    },

    /** Whether the welcome was stopped before it finished (Kyle, 2026-10-13: the tour outlasts it). */
    cutShort: () => cut,

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

    /**
     * Puppet speech cues (Kyle, 2026-10-13): syllables and phrases spoken so
     * far, heard or flowing silently, and whether a letter is being spoken.
     */
    cues() {
      if (!recording || startedAt === null) return { syllables: 0, phrases: 0, speaking: false };
      const { speech, text } = recording;
      if (finished()) {
        const last = (stoppedAtChars ?? text.length) - 1;
        return { syllables: speech.syllablesUpTo(last), phrases: speech.phrasesUpTo(last), speaking: false };
      }
      const index = playedChars() - 1;
      return { syllables: speech.syllablesUpTo(index), phrases: speech.phrasesUpTo(index), speaking: speech.speakingAt(index) };
    },
  };
}
