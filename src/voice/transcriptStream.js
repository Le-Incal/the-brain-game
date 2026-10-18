/**
 * The conversation as streaming text (Kyle, 2026-10-11): everything the guide
 * says flows into the column on the right, for hearing-impaired visitors and
 * anyone without sound.
 *
 * In voice, a guide line shows only what has been heard: it binds to the
 * follower's playback of one reply (`{ id, playedChars, done }`) and never
 * borrows another reply's clock. Without sound, or if its audio never comes,
 * it flows at reading pace. The visitor's words appear whole.
 */

export const READING_CHARS_PER_SECOND = 20;
// A guide line waits this long for its audio before flowing at reading pace.
export const PLAYBACK_WAIT_MS = 3000;
export const TRANSCRIPT_HISTORY = 200;
const ELLIPSIS = '…';

/** The text up to the last finished sentence, for screen readers. */
export function completedSentences(text) {
  const value = String(text ?? '');
  const match = value.match(/^[\s\S]*[.!?…](?=\s|$)/);
  return match ? match[0] : '';
}

// The speech engine's sound tags, "(clears throat)" or "[laughs]": a bracket
// of lowercase words only, so "(Area 10)" stays.
const SOUND_TAG = /[([]\s*[a-z][a-z '-]*\s*[)\]]/g;
// The same sounds bare, before the visitor's first word (Kyle's screenshot,
// 2026-10-17: "clears throat Show me the temporal lobe.").
const LEADING_SOUND = /^(?:clears (?:his |her |their |my )?throat|coughs?|laughs?|laughter|sighs?|sniffs?)\s+(?=[A-Z])/;

/** The visitor's spoken words without the speech engine's sound tags. */
export function withoutSoundTags(text) {
  return String(text ?? '')
    .replace(SOUND_TAG, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
    .replace(LEADING_SOUND, '');
}

export function createTranscriptStream({ now = () => performance.now(), readingCps = READING_CHARS_PER_SECOND } = {}) {
  let list = [];
  // The guide line still streaming, and the last reply id a line was bound to.
  let current = null;
  let lastBoundId = null;
  let voice = true;

  const snapshot = (entry) => ({
    id: entry.id,
    fromGuide: entry.fromGuide,
    text: entry.text,
    shown: entry.shown,
    done: entry.done,
  });

  function push(entry) {
    list.push(entry);
    if (list.length > TRANSCRIPT_HISTORY) list = list.slice(-TRANSCRIPT_HISTORY);
  }

  function complete(entry = current) {
    if (!entry) return;
    entry.shown = entry.text.length;
    entry.done = true;
    if (entry === current) current = null;
  }

  function readFrom(entry, at) {
    entry.reading = { since: at, from: entry.shown };
  }

  return {
    addVisitor({ id, text }) {
      const clean = String(text ?? '').trim();
      if (!clean) return;
      push({ id, fromGuide: false, text: clean, shown: clean.length, done: true });
    },

    addGuide({ id, text }, { audible = true } = {}) {
      const clean = String(text ?? '').trim();
      if (!clean) return;
      const existing = list.find((entry) => entry.id === id && entry.fromGuide);
      if (existing) {
        existing.text = clean;
        existing.shown = Math.min(existing.shown, clean.length);
        if (existing.done) existing.shown = clean.length;
        return;
      }
      complete();
      const entry = { id, fromGuide: true, text: clean, shown: 0, done: false, arrivedAt: now(), boundTo: null, reading: null };
      if (!audible || !voice) readFrom(entry, entry.arrivedAt);
      push(entry);
      current = entry;
    },

    /** Advance the streaming line. Returns true when anything changed. */
    tick(playback = {}) {
      const entry = current;
      if (!entry) return false;
      const before = entry.shown;
      const at = now();
      const { id = null, playedChars = null, done = false } = playback;
      if (!entry.reading) {
        if (entry.boundTo === null && id !== null && id !== lastBoundId) {
          entry.boundTo = id;
          lastBoundId = id;
        }
        if (entry.boundTo !== null && id === entry.boundTo) {
          if (playedChars !== null) entry.shown = Math.max(entry.shown, Math.min(entry.text.length, playedChars));
          if (done) complete(entry);
        } else if (entry.boundTo === null && at - entry.arrivedAt >= PLAYBACK_WAIT_MS) {
          // Its audio never came: flow at reading pace from now.
          readFrom(entry, at);
        }
      }
      if (entry.reading) {
        const read = Math.floor(((at - entry.reading.since) * readingCps) / 1000);
        entry.shown = Math.max(entry.shown, Math.min(entry.text.length, entry.reading.from + read));
      }
      if (entry.shown >= entry.text.length) complete(entry);
      return entry.shown !== before || entry.done;
    },

    /**
     * The guide finished its turn: what it said is all on screen. A line
     * already flowing at reading pace (voice switched off) keeps flowing.
     */
    guideStopped() {
      if (current && current.boundTo !== null && !current.reading) complete();
    },

    /** The visitor cut in: the line ends at what was heard. */
    interrupted() {
      if (!current) return;
      const heard = current.text.slice(0, current.shown).trimEnd();
      current.text = heard ? `${heard}${ELLIPSIS}` : ELLIPSIS;
      complete();
    },

    /** Voice off: the streaming line carries on at reading pace from where it is. */
    setVoice(on) {
      voice = Boolean(on);
      if (!voice && current && !current.reading) readFrom(current, now());
    },

    entries: () => list.map(snapshot),
  };
}
