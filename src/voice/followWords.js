/**
 * Follow the words: decides when each region or lobe the guide names should
 * light, so the brain shows what is said as it is said, whether or not the
 * model remembered to call a tool.
 *
 * Timing comes from the audio's character alignment when ElevenLabs sends it
 * (exact), otherwise from the reply text and the guide's speaking pace,
 * learned reply by reply (within about a second). Each highlight holds at
 * least 1.2 s; when names come faster, only the latest waiting one goes
 * through. A scene tool call in the same reply wins, and the player speaking
 * cancels whatever is waiting. `act(target)` does the lighting.
 */
import { findSpokenNames, stripExpressiveTags } from './spokenNames.js';

export const DEFAULT_CHARS_PER_SECOND = 15;
export const FOLLOW_MIN_HIGHLIGHT_MS = 1200;
// Text that arrives before the audio is re-timed from the start of speech, if
// speech starts within this long.
const SPEECH_START_WINDOW_MS = 2000;
const MIN_CHARS_PER_SECOND = 10;
const MAX_CHARS_PER_SECOND = 22;
const MIN_CALIBRATION_SPAN_MS = 1500;
// Alignment text kept for matching names split across chunks.
const STREAM_KEEP_CHARS = 1000;

// Calls that move or light the brain themselves; following steps aside.
const SCENE_TOOLS = new Set([
  'face_region',
  'face_lobe',
  'highlight_region',
  'clear_highlight',
  'rotate_to_view',
  'start_tour',
  'next_tour_stop',
  'end_tour',
]);

export function createWordFollower({
  act,
  now = () => performance.now(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
}) {
  let charsPerSecond = DEFAULT_CHARS_PER_SECOND;
  let speakingSince = null;
  let lastTextAt = -Infinity;
  let charsThisSpan = 0;
  let usingAlignment = false;
  let suppressed = false;
  let lastActAt = -Infinity;
  let waiting = null;
  const timers = new Set();
  // Estimate path: the latest reply's names, re-timed if speech starts late.
  let reply = null;
  // Alignment path: the spoken characters with their play times.
  const stream = { text: '', times: [], base: 0, scheduled: new Set() };

  function cancelPending() {
    for (const timer of timers) clearTimeoutImpl(timer);
    timers.clear();
    if (waiting) clearTimeoutImpl(waiting.timer);
    waiting = null;
  }

  function doAct(target) {
    lastActAt = now();
    act(target);
  }

  function fire(target) {
    const elapsed = now() - lastActAt;
    if (elapsed >= FOLLOW_MIN_HIGHLIGHT_MS) {
      doAct(target);
      return;
    }
    if (waiting) clearTimeoutImpl(waiting.timer);
    const timer = setTimeoutImpl(() => {
      waiting = null;
      doAct(target);
    }, FOLLOW_MIN_HIGHLIGHT_MS - elapsed);
    waiting = { target, timer };
  }

  function schedule(target, at, onFired) {
    const timer = setTimeoutImpl(() => {
      timers.delete(timer);
      onFired?.();
      fire(target);
    }, Math.max(0, at - now()));
    timers.add(timer);
  }

  function timeReply(anchor) {
    cancelPending();
    for (const name of reply.names) {
      if (name.fired) continue;
      schedule(name.target, anchor + (name.start / charsPerSecond) * 1000, () => {
        name.fired = true;
      });
    }
  }

  function followStream() {
    const names = findSpokenNames(stream.text);
    for (const name of names) {
      const absolute = stream.base + name.start;
      // A name at the very end may still be growing ("my cerebel|lum").
      if (name.end >= stream.text.length || stream.scheduled.has(absolute)) continue;
      stream.scheduled.add(absolute);
      if (!suppressed) schedule(name.target, stream.times[name.start]);
    }
  }

  return {
    guideText(text) {
      suppressed = false;
      const clean = stripExpressiveTags(text);
      const textAt = now();
      charsThisSpan += clean.length;
      const previousTextAt = lastTextAt;
      lastTextAt = textAt;
      if (usingAlignment) return;
      reply = { names: findSpokenNames(clean).map((name) => ({ ...name, fired: false })), textAt };
      // Speech that began after the last reply's text belongs to this one.
      const speechIsThisReply = speakingSince !== null && speakingSince > previousTextAt;
      timeReply(speechIsThisReply ? speakingSince : textAt);
    },

    alignment({ chars = [], char_start_times_ms: starts = [] } = {}) {
      if (!usingAlignment) {
        usingAlignment = true;
        cancelPending();
        reply = null;
      }
      const arrivedAt = now();
      chars.forEach((char, i) => {
        stream.text += char;
        stream.times.push(arrivedAt + (starts[i] ?? 0));
      });
      if (stream.text.length > STREAM_KEEP_CHARS * 2) {
        const drop = stream.text.length - STREAM_KEEP_CHARS;
        stream.text = stream.text.slice(drop);
        stream.times = stream.times.slice(drop);
        stream.base += drop;
      }
      followStream();
    },

    guideSpeaking(speaking) {
      if (speaking) {
        if (speakingSince !== null) return;
        speakingSince = now();
        // The reply's text came first: count from the start of speech.
        if (reply && !usingAlignment && speakingSince - reply.textAt <= SPEECH_START_WINDOW_MS) timeReply(speakingSince);
        return;
      }
      if (speakingSince === null) return;
      const span = now() - speakingSince;
      if (span >= MIN_CALIBRATION_SPAN_MS && charsThisSpan > 0) {
        const sample = charsThisSpan / (span / 1000);
        charsPerSecond = Math.min(
          MAX_CHARS_PER_SECOND,
          Math.max(MIN_CHARS_PER_SECOND, 0.7 * charsPerSecond + 0.3 * sample)
        );
      }
      charsThisSpan = 0;
      speakingSince = null;
    },

    toolCalled(name) {
      if (!SCENE_TOOLS.has(name)) return;
      cancelPending();
      suppressed = true;
      reply = null;
    },

    interrupted() {
      cancelPending();
      reply = null;
    },

    timing: () => (usingAlignment ? 'alignment' : 'estimate'),
    charsPerSecond: () => charsPerSecond,
    dispose: cancelPending,
  };
}
