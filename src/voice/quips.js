/**
 * Kyle, 2026-10-23: "When the user gets something right in the game, there
 * should be a small and short acknowledgment ... super short and quippy
 * comments. Encouraging to the user."
 *
 * The server records the guide's quips once (server/quips.js). The page loads
 * them when a game begins, then answers a catch with the next one: spoken
 * when the voice is on, always written in the conversation. Every line comes
 * once before any repeats, never the same twice running.
 */

/** A catch gets a quip only while nothing else is speaking. */
export function shouldQuip({ guideSpeaking = false, welcomePlaying = false, quipPlaying = false } = {}) {
  return !guideSpeaking && !welcomePlaying && !quipPlaying;
}

function shuffled(count, random, avoidFirst) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // A new round never opens with the line that closed the last.
  if (count > 1 && order[0] === avoidFirst) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

export function createQuipPlayer({
  fetchImpl = (...args) => globalThis.fetch(...args),
  makeAudio = (url) => new globalThis.Audio(url),
  random = Math.random,
} = {}) {
  let loadedFor = null;
  let loading = null;
  let lines = [];
  let order = [];
  let last = null;
  let playing = false;

  async function load(guide) {
    if (!guide) return;
    if (loadedFor === guide) return loading;
    loadedFor = guide;
    lines = [];
    order = [];
    loading = Promise.resolve()
      .then(() => fetchImpl(`/api/voice/quips/${encodeURIComponent(guide)}`, { credentials: 'same-origin' }))
      .then((response) => (response?.ok ? response.json() : null))
      .then((body) => {
        if (loadedFor !== guide || !Array.isArray(body?.quips)) return;
        lines = body.quips
          .filter((quip) => typeof quip?.text === 'string' && typeof quip?.audioUrl === 'string')
          .map((quip) => {
            let audio = null;
            try {
              audio = makeAudio(quip.audioUrl);
              audio.preload = 'auto';
            } catch {
              audio = null;
            }
            return { text: quip.text, audio };
          });
      })
      .catch(() => {
        lines = [];
      });
    return loading;
  }

  /** The next quip: `{ text }`, played aloud when `voice` is on; null if there are none. */
  function say({ voice = true } = {}) {
    if (!lines.length) return null;
    if (!order.length) order = shuffled(lines.length, random, last);
    const index = order.shift();
    last = index;
    const line = lines[index];
    if (voice && line.audio) {
      playing = true;
      const done = () => {
        playing = false;
      };
      line.audio.onended = done;
      line.audio.onerror = done;
      try {
        line.audio.currentTime = 0;
      } catch {
        // Not seekable yet: it plays from the start anyway.
      }
      Promise.resolve(line.audio.play()).catch(done);
    }
    return { text: line.text };
  }

  return {
    load,
    say,
    playing: () => playing,
  };
}
