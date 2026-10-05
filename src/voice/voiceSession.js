/**
 * One conversation with the guide, from the first mic consent to the end.
 * The SDK is injected (`conversation`: startSession, endSession,
 * sendContextualUpdate, getOutputVolume), so this runs without a browser.
 *
 *   idle -> needs-consent -> requesting -> connecting -> connected -> idle
 *                                     \-> unavailable (with a plain message)
 */
import { normalizeGuide } from './guides.js';
import { describeVoiceUnavailable } from './voiceAvailability.js';

export const CONSENT_TEXT =
  "Talking with your guide sends your voice to ElevenLabs, our voice provider. Audio isn't stored; transcripts are kept for 30 days to improve the guide. Please don't share personal details.";

export const CONSENT_STORAGE_KEY = 'brain-game.voice-consent';

export function createVoiceSession({
  fetchImpl = (...args) => globalThis.fetch(...args),
  conversation,
  storage,
  clientTools,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  onChange = () => {},
}) {
  let state = { phase: 'idle', guide: null, message: null, conversationId: null };
  let consentGiven = readConsent();
  let pendingGuide = null;
  let cutoffTimer = null;
  let maxSeconds = null;

  function readConsent() {
    try {
      return storage?.getItem(CONSENT_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function set(patch) {
    state = { ...state, ...patch };
    onChange(state);
  }

  function clearCutoff() {
    if (cutoffTimer !== null) clearTimeoutImpl(cutoffTimer);
    cutoffTimer = null;
  }

  async function requestAndStart() {
    set({ phase: 'requesting', message: null, conversationId: null });
    try {
      const response = await fetchImpl('/api/voice/token', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guide: state.guide }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        set({ phase: 'unavailable', message: describeVoiceUnavailable(body) });
        return;
      }
      maxSeconds = body.maxSeconds;
      set({ phase: 'connecting' });
      conversation.startSession({
        conversationToken: body.conversationToken,
        connectionType: 'webrtc',
        dynamicVariables: body.dynamicVariables,
        overrides: { tts: { voiceId: body.voiceId } },
        clientTools,
      });
    } catch {
      set({ phase: 'unavailable', message: describeVoiceUnavailable({}) });
    }
  }

  async function start({ guide } = {}) {
    const chosen = normalizeGuide(guide) ?? pendingGuide ?? state.guide;
    pendingGuide = null;
    if (!chosen) {
      set({ phase: 'unavailable', message: describeVoiceUnavailable({}) });
      return;
    }
    set({ guide: chosen });
    if (!consentGiven) {
      set({ phase: 'needs-consent', message: null });
      return;
    }
    await requestAndStart();
  }

  function end() {
    clearCutoff();
    if (state.phase === 'connecting' || state.phase === 'connected') conversation.endSession();
    set({ phase: 'idle', conversationId: null });
  }

  return {
    getState: () => ({ ...state }),
    start,
    end,

    async acceptConsent() {
      consentGiven = true;
      try {
        storage?.setItem(CONSENT_STORAGE_KEY, '1');
      } catch {
        // Blocked storage: consent holds for this page only and is asked again next visit.
      }
      await requestAndStart();
    },

    declineConsent() {
      set({ phase: 'idle', message: null });
    },

    async handleConnect({ conversationId }) {
      set({ phase: 'connected', conversationId });
      clearCutoff();
      // The server reserved this many seconds; end on time rather than overrun.
      if (maxSeconds) cutoffTimer = setTimeoutImpl(end, maxSeconds * 1000);
    },

    handleDisconnect() {
      clearCutoff();
      if (state.phase !== 'unavailable') set({ phase: 'idle', conversationId: null });
    },

    outputLevel() {
      return state.phase === 'connected' ? conversation.getOutputVolume() : 0;
    },

    sendContext(text) {
      if (state.phase === 'connected') conversation.sendContextualUpdate(text);
    },

    changeGuide(next) {
      const id = normalizeGuide(next);
      if (!id) return { applies: 'none' };
      if (state.phase === 'connected' || state.phase === 'connecting') {
        pendingGuide = id;
        return { applies: 'next-conversation' };
      }
      set({ guide: id });
      return { applies: 'now' };
    },

    async switchGuideNow(next) {
      end();
      await start({ guide: next });
    },
  };
}
