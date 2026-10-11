/**
 * Follow the words: decides when each region or lobe the guide names should
 * light, so the brain shows what is said as it is said, whether or not the
 * model remembered to call a tool.
 *
 * Timing comes from the audio's character alignment when ElevenLabs sends it,
 * otherwise from the reply text and the guide's speaking pace, learned reply
 * by reply (within about a second). Alignment chunks arrive in bursts ahead
 * of playback, so each reply keeps a playback clock: its first chunk starts
 * when the audio is heard (the output level rising), each later chunk where
 * the one before it ends. Each highlight holds at
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
// The guide's output level above which the audio counts as heard, and the
// silence before a rise counts as the start of a reply's audio.
export const AUDIBLE_LEVEL = 0.02;
const ONSET_AFTER_SILENCE_MS = 250;
// A reply whose audio is never heard is timed from its first chunk.
const HEARD_FALLBACK_MS = 2000;
// A chunk this long after the reply's audio should have ended starts a new reply.
const REPLY_END_GRACE_MS = 300;

// Calls that light the brain themselves; following steps aside for the rest
// of the reply. rotate_to_view only turns, so the words are still followed.
const SCENE_TOOLS = new Set([
  'face_region',
  'face_lobe',
  'highlight_region',
  'clear_highlight',
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
  // Alignment path: the reply being spoken, on its own playback clock.
  let timeline = null;
  let audible = false;
  let silentSince = -Infinity;
  let lastOnsetAt = -Infinity;
  let lastTimelineEndedAt = -Infinity;
  // Each reply (an aligned timeline, or a span of estimated speech) gets an id,
  // so the transcript never times one line by another reply's clock.
  let serial = 0;
  let spanId = null;

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

  function endTimeline() {
    if (!timeline) return;
    if (timeline.fallback !== null) clearTimeoutImpl(timeline.fallback);
    timeline = null;
    lastTimelineEndedAt = now();
  }

  function timelineOver(at) {
    return timeline.anchor !== null && at > timeline.anchor + timeline.endMs + REPLY_END_GRACE_MS;
  }

  function scheduleTimelineName(name) {
    if (suppressed || timeline.anchor === null) return;
    schedule(name.target, timeline.anchor + timeline.offsets[name.start]);
  }

  function anchorTimeline(at) {
    if (timeline.fallback !== null) clearTimeoutImpl(timeline.fallback);
    timeline.fallback = null;
    timeline.anchor = at;
    timeline.names.forEach(scheduleTimelineName);
  }

  function followTimeline() {
    for (const name of findSpokenNames(timeline.text)) {
      // A name at the very end may still be growing ("my cerebel|lum").
      if (name.end >= timeline.text.length || timeline.known.has(name.start)) continue;
      timeline.known.add(name.start);
      timeline.names.push(name);
      scheduleTimelineName(name);
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

    alignment({ chars = [], char_start_times_ms: starts = [], char_durations_ms: durations = [] } = {}) {
      if (!usingAlignment) {
        usingAlignment = true;
        cancelPending();
        reply = null;
      }
      const arrivedAt = now();
      if (timeline && timelineOver(arrivedAt)) endTimeline();
      if (!timeline) {
        serial += 1;
        timeline = { id: serial, anchor: null, fallback: null, endMs: 0, text: '', offsets: [], names: [], known: new Set() };
        // Audio already heard for this reply (its chunk came late): count from then.
        if (audible && lastOnsetAt > lastTimelineEndedAt) {
          anchorTimeline(lastOnsetAt);
        } else {
          const startedAt = arrivedAt;
          timeline.fallback = setTimeoutImpl(() => {
            timeline.fallback = null;
            anchorTimeline(startedAt);
          }, HEARD_FALLBACK_MS);
        }
      }
      // Chunks play back to back: this one starts where the last one ended.
      const chunkStart = timeline.endMs;
      chars.forEach((char, i) => {
        timeline.text += char;
        timeline.offsets.push(chunkStart + (starts[i] ?? 0));
      });
      if (chars.length > 0) {
        const last = chars.length - 1;
        timeline.endMs = chunkStart + (starts[last] ?? 0) + (durations[last] ?? 0);
      }
      followTimeline();
    },

    /** The guide's output level each frame: a rise after silence is its audio being heard. */
    outputLevel(level) {
      const at = now();
      const loud = Number(level) >= AUDIBLE_LEVEL;
      if (loud && !audible) {
        audible = true;
        if (at - silentSince >= ONSET_AFTER_SILENCE_MS) {
          lastOnsetAt = at;
          if (timeline && timeline.anchor === null) anchorTimeline(at);
        }
      } else if (!loud && audible) {
        audible = false;
        silentSince = at;
      }
    },

    guideSpeaking(speaking) {
      if (speaking) {
        if (speakingSince !== null) return;
        speakingSince = now();
        serial += 1;
        spanId = serial;
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
      endTimeline();
    },

    /**
     * How much of the current reply has been heard: `{ id, playedChars, done }`.
     * `playedChars` is null until its audio is heard (or, without alignment,
     * until the guide starts speaking).
     */
    playback() {
      const at = now();
      if (timeline) {
        if (timeline.anchor === null) return { id: timeline.id, playedChars: null, done: false };
        if (timelineOver(at)) return { id: timeline.id, playedChars: timeline.text.length, done: true };
        const elapsed = at - timeline.anchor;
        // Offsets ascend: count those at or before `elapsed`.
        let lo = 0;
        let hi = timeline.offsets.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (timeline.offsets[mid] <= elapsed) lo = mid + 1;
          else hi = mid;
        }
        return { id: timeline.id, playedChars: lo, done: false };
      }
      if (!usingAlignment && speakingSince !== null) {
        return { id: spanId, playedChars: Math.floor(((at - speakingSince) * charsPerSecond) / 1000), done: false };
      }
      return { id: null, playedChars: null, done: false };
    },

    timing: () => (usingAlignment ? 'alignment' : 'estimate'),
    charsPerSecond: () => charsPerSecond,
    dispose() {
      cancelPending();
      endTimeline();
    },
  };
}
