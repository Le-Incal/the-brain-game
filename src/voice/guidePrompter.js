/**
 * Prompts that need the guide to answer now (Kyle, 2026-10-11: offers during
 * the game). A contextual update is background the guide reads at its next
 * turn; a user message makes it answer, so prompts go as user messages. A
 * prompt never talks over the guide: it waits for the sentence to end, keeps
 * only the latest, and is dropped once the moment has passed.
 */

export const PROMPT_STALE_MS = 8000;

export function createGuidePrompter({ send, now = () => performance.now(), staleMs = PROMPT_STALE_MS }) {
  let speaking = false;
  let waiting = null;
  let disposed = false;

  function flush() {
    if (!waiting || speaking || disposed) return;
    const { text, at } = waiting;
    waiting = null;
    if (now() - at > staleMs) return;
    send(text);
  }

  return {
    prompt(text) {
      if (disposed) return;
      waiting = { text, at: now() };
      flush();
    },
    guideSpeaking(value) {
      speaking = Boolean(value);
      flush();
    },
    dispose() {
      disposed = true;
      waiting = null;
    },
  };
}
