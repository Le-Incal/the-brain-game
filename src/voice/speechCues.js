/**
 * Speech cues for puppet speech (Kyle, 2026-10-13): when a syllable lands (a
 * beat), when a phrase starts (a tilt) and whether she is speaking at all.
 *
 * For the welcome we know when every letter is spoken, so the cues come from
 * its text: a syllable is a vowel group (a final silent "e" aside, and "y"
 * before a vowel is a consonant), a phrase starts at the first word and after
 * every stop. For the live guide we hear only her voice level, so a beat is
 * each rise in it and a phrase starts when she speaks again after a pause.
 */

const STOPS = /[.,;:!?]/;
const LETTER = /[a-z0-9']/i;
const VOWEL = /[aeiouy]/i;

// Live voice: below this she is not speaking (her level runs 0 to 1).
const SPEAKING_FLOOR = 0.025;
// A pause longer than this ends a phrase; shorter gaps are between syllables.
const PAUSE_SECONDS = 0.25;
// A rise above the lowest level since the last syllable by this share, plus a
// little, is a syllable. Measured from that low, a falling voice never beats.
const RISE_SHARE = 0.3;
const RISE_MARGIN = 0.01;
// After a beat, the level must fall back by this much before the next one.
const FALL_MIN = 0.02;
const FALL_SHARE = 0.25;
// At most about eight beats a second.
const MIN_BEAT_GAP_SECONDS = 0.12;

function syllableOnsets(word) {
  const onsets = [];
  for (let i = 0; i < word.length; i += 1) {
    const char = word[i];
    const vowel = VOWEL.test(char) && !(/y/i.test(char) && VOWEL.test(word[i + 1] ?? '') && !/y/i.test(word[i + 1] ?? ''));
    const previous = i > 0 ? word[i - 1] : '';
    const previousVowel =
      i > 0 && VOWEL.test(previous) && !(/y/i.test(previous) && VOWEL.test(char) && !/y/i.test(char));
    if (vowel && !previousVowel) onsets.push(i);
  }
  // A final "e" after a consonant is silent when the word has another syllable.
  const last = word.length - 1;
  if (onsets.length > 1 && onsets.at(-1) === last && /e/i.test(word[last]) && !VOWEL.test(word[last - 1])) onsets.pop();
  return onsets;
}

/**
 * Reads a text once: `syllablesUpTo(i)`, `phrasesUpTo(i)` count what has been
 * spoken by letter i; `speakingAt(i)` is false at a stop and the spaces after it.
 */
export function analyseSpeech(text) {
  const syllableAt = new Array(text.length).fill(0);
  const phraseAt = new Array(text.length).fill(0);
  const speaking = new Array(text.length).fill(false);

  for (const match of text.matchAll(/[a-z0-9']+/gi)) {
    for (const onset of syllableOnsets(match[0])) syllableAt[match.index + onset] = 1;
  }
  let phraseOpen = false;
  let afterStop = true;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (LETTER.test(char)) {
      if (!phraseOpen) phraseAt[i] = 1;
      phraseOpen = true;
      afterStop = false;
      speaking[i] = true;
    } else if (STOPS.test(char)) {
      phraseOpen = false;
      afterStop = true;
    } else {
      speaking[i] = phraseOpen && !afterStop;
    }
  }

  const running = (marks) => {
    const totals = [];
    let sum = 0;
    for (const mark of marks) totals.push((sum += mark));
    return totals;
  };
  const syllables = running(syllableAt);
  const phrases = running(phraseAt);
  const at = (totals, i) => (i < 0 ? 0 : totals[Math.min(i, totals.length - 1)] ?? 0);

  return {
    syllablesUpTo: (i) => at(syllables, i),
    phrasesUpTo: (i) => at(phrases, i),
    speakingAt: (i) => (i < 0 || i >= text.length ? false : speaking[i]),
  };
}

/** Turns running counts into cues: a beat for each new syllable, a phrase start for each new phrase. */
export function createCueTracker() {
  let syllables = 0;
  let phrases = 0;
  return {
    step({ syllables: nextSyllables, phrases: nextPhrases, speaking }) {
      const cue = { beat: nextSyllables > syllables, phraseStart: nextPhrases > phrases, speaking: Boolean(speaking) };
      syllables = nextSyllables;
      phrases = nextPhrases;
      return cue;
    },
  };
}

/** Cues from the live guide's voice level, one frame at a time. */
export function createLevelCues() {
  let speaking = false;
  let quietFor = Infinity;
  // The lowest level since re-arming, and the low and peak around the last beat.
  let valley = null;
  let beatValley = 0;
  let peak = 0;
  let armed = true;
  let sinceBeat = Infinity;

  return {
    step({ dtSeconds, level }) {
      const dt = Math.max(0, Math.min(dtSeconds, 0.1));
      const value = Number.isFinite(level) ? Math.max(0, level) : 0;
      sinceBeat += dt;

      // Speaking, with a short hold over the gaps between syllables.
      const voiced = value >= SPEAKING_FLOOR;
      quietFor = voiced ? 0 : quietFor + dt;
      const wasSpeaking = speaking;
      speaking = voiced || (speaking && quietFor < PAUSE_SECONDS);
      const phraseStart = speaking && !wasSpeaking;

      let beat = false;
      if (armed) {
        valley = valley === null ? value : Math.min(valley, value);
        if (voiced && value > valley * (1 + RISE_SHARE) + RISE_MARGIN && sinceBeat >= MIN_BEAT_GAP_SECONDS) {
          beat = true;
          armed = false;
          beatValley = valley;
          peak = value;
          sinceBeat = 0;
        }
      } else {
        peak = Math.max(peak, value);
        // Re-armed once the syllable has fallen away; the next rise is measured from here.
        if (value <= peak - Math.max(FALL_MIN, FALL_SHARE * (peak - beatValley)) || !voiced) {
          armed = true;
          valley = value;
        }
      }

      return { beat, phraseStart, speaking };
    },
  };
}
