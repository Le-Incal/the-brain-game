/**
 * One conversation with the guide, from the first mic consent to the end.
 * The SDK is injected (`conversation`: startSession, endSession,
 * sendContextualUpdate, getOutputVolume), so this runs without a browser.
 *
 *   idle -> needs-consent -> requesting -> connecting -> connected -> idle
 *                                     \-> unavailable (with a plain message)
 */
import { GUIDES, normalizeGuide } from './guides.js';
import { describeVoiceUnavailable } from './voiceAvailability.js';
import { formatTimeWarning } from './contextUpdates.js';

const WARN_BEFORE_END_MS = 30_000;
// Right after this page's own conversation, the server may still count it
// open until ElevenLabs' webhook lands (about 20 s in the first live run).
const RETRY_BUSY_WITHIN_MS = 60_000;
const BUSY_RETRY_EVERY_MS = 5_000;
const BUSY_RETRIES = 9; // 45 s
// The session summary keeps the most recent calls; the end is what we debug.
const SUMMARY_TOOL_LIMIT = 200;
const DISCONNECT_REASONS = new Set(['agent', 'error', 'user']);

export const CONSENT_TEXT =
  "Talking with your guide sends your voice to ElevenLabs, our voice provider. Audio isn't stored; transcripts are kept for 30 days to improve the guide. Please don't share personal details.";

export const CONSENT_STORAGE_KEY = 'brain-game.voice-consent';

export const MIC_BLOCKED_MESSAGE =
  "Your microphone is blocked, so we can't talk aloud. Allow the microphone for this site in your browser settings, then try again. On a school Chromebook, ask your teacher.";
export const START_FAILED_MESSAGE = "We couldn't start the conversation. Please try again.";
export const MIC_UNAVAILABLE_MESSAGE = "This browser can't use a microphone here, so we can't talk aloud.";

/**
 * The SDK cannot start a voice session without the microphone (WebRTC setup
 * waits for it and disconnects if refused), so ask before reserving minutes.
 * Returns 'granted', 'denied' or 'unavailable', and releases the mic at once.
 */
export async function requestMicrophoneAccess(nav = globalThis.navigator) {
  if (!nav?.mediaDevices?.getUserMedia) return 'unavailable';
  try {
    const stream = await nav.mediaDevices.getUserMedia({ audio: true });
    stream?.getTracks?.().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    return error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'denied' : 'unavailable';
  }
}

/**
 * Reports a failed mic check to the server at most once, so the count of
 * blocked microphones means players, not clicks. One reporter per page load.
 */
export function createMicEventReporter(fetchImpl = (...args) => globalThis.fetch(...args)) {
  let reported = false;
  return (type) => {
    if (reported) return;
    reported = true;
    Promise.resolve()
      .then(() =>
        fetchImpl('/api/voice/event', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        })
      )
      .catch(() => {});
  };
}

// Shared by every conversation on this page (Study mode can be left and re-entered).
let pageMicReporter = null;
const reportForThisPage = (type) => {
  pageMicReporter ??= createMicEventReporter();
  pageMicReporter(type);
};

export function createVoiceSession({
  fetchImpl = (...args) => globalThis.fetch(...args),
  requestMicrophone = () => requestMicrophoneAccess(),
  reportMicEvent = reportForThisPage,
  conversation,
  storage,
  clientTools,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  now = Date.now,
  onChange = () => {},
  onConversationEnd = () => {},
  onConversationStart = () => {},
  sendBeacon = (url, data) => globalThis.navigator?.sendBeacon?.(url, data) ?? false,
}) {
  let state = { phase: 'idle', guide: null, message: null, conversationId: null };
  let consentGiven = readConsent();
  let pendingGuide = null;
  let cutoffTimer = null;
  let warningTimer = null;
  let retryTimer = null;
  let busyRetries = 0;
  let lastConversationEndedAt = null;
  // The connected conversation, for its summary: the reservation's 8-character
  // prefix (the server logs the same prefix), when it connected, its tool calls.
  let sessionTag = null;
  let connectedAt = null;
  let toolCalls = [];

  function conversationOver(reason) {
    lastConversationEndedAt = now();
    sendSummary(reason);
    onConversationEnd();
  }

  /**
   * One line in our logs per conversation: how it ended, how long it ran and
   * every tool call. Sent once; a closing tab sends it by beacon, which the
   * browser delivers after the page is gone.
   */
  function sendSummary(reason, { beacon = false } = {}) {
    if (connectedAt === null) return;
    const body = JSON.stringify({
      type: 'session_summary',
      session: sessionTag ?? 'none',
      reason,
      durationSecs: Math.round((now() - connectedAt) / 1000),
      tools: toolCalls,
    });
    connectedAt = null;
    toolCalls = [];
    let beaconSent = false;
    if (beacon) {
      try {
        beaconSent = Boolean(sendBeacon('/api/voice/event', body));
      } catch {
        beaconSent = false;
      }
    }
    if (beaconSent) return;
    Promise.resolve()
      .then(() =>
        fetchImpl('/api/voice/event', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body,
        })
      )
      .catch(() => {});
  }

  function clearRetry() {
    if (retryTimer !== null) clearTimeoutImpl(retryTimer);
    retryTimer = null;
  }
  let maxSeconds = null;
  // The signed reservation for the conversation being started, kept until it
  // connects, so a failed start can be released at once.
  let pendingReservation = null;

  function releasePending() {
    const reservation = pendingReservation;
    pendingReservation = null;
    if (!reservation) return;
    Promise.resolve()
      .then(() =>
        fetchImpl('/api/voice/release', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservation }),
        })
      )
      .catch(() => {
        // The server's sweep releases it later in any case.
      });
  }

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
    if (warningTimer !== null) clearTimeoutImpl(warningTimer);
    cutoffTimer = null;
    warningTimer = null;
  }

  function warnGuide() {
    warningTimer = null;
    if (state.phase === 'connected') conversation.sendContextualUpdate(formatTimeWarning());
  }

  const starting = () => state.phase === 'requesting' || state.phase === 'connecting';

  async function requestAndStart() {
    set({ phase: 'requesting', message: null, conversationId: null });
    // A new conversation never inherits a region lit by the last one.
    onConversationStart();
    clearRetry();
    busyRetries = 0;
    const microphone = await requestMicrophone();
    if (microphone !== 'granted') {
      // Counted, once per page, so we know how often this happens ("Type instead").
      reportMicEvent(microphone === 'denied' ? 'mic_blocked' : 'mic_unsupported');
      set({ phase: 'unavailable', message: microphone === 'denied' ? MIC_BLOCKED_MESSAGE : MIC_UNAVAILABLE_MESSAGE });
      return;
    }
    await requestToken();
  }

  async function requestToken() {
    try {
      const response = await fetchImpl('/api/voice/token', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guide: state.guide }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const justEnded = lastConversationEndedAt !== null && now() - lastConversationEndedAt <= RETRY_BUSY_WITHIN_MS;
        if (body?.reason === 'busy' && justEnded && busyRetries < BUSY_RETRIES) {
          const name = GUIDES.find((g) => g.id === state.guide)?.name ?? 'your guide';
          set({ phase: 'requesting', message: `One moment, ${name} is getting ready…` });
          retryTimer = setTimeoutImpl(() => {
            retryTimer = null;
            busyRetries += 1;
            return requestToken();
          }, BUSY_RETRY_EVERY_MS);
          return;
        }
        set({ phase: 'unavailable', message: describeVoiceUnavailable(body) });
        return;
      }
      maxSeconds = body.maxSeconds;
      pendingReservation = body.dynamicVariables?.reservation ?? null;
      sessionTag = pendingReservation ? String(pendingReservation).split('.')[0].slice(0, 8) : null;
      set({ phase: 'connecting', message: null });
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
    // One conversation at a time: a second Talk while one is starting or
    // running does nothing.
    if (starting() || state.phase === 'connected') return;
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

  function end(reason = 'user') {
    clearCutoff();
    clearRetry();
    if (state.phase === 'connecting') releasePending();
    if (state.phase === 'connecting' || state.phase === 'connected') conversation.endSession();
    if (state.phase === 'connected') conversationOver(reason);
    set({ phase: 'idle', conversationId: null });
  }

  return {
    getState: () => ({ ...state }),
    start,
    end: () => end('user'),

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
      pendingReservation = null;
      set({ phase: 'connected', conversationId });
      connectedAt = now();
      toolCalls = [];
      clearCutoff();
      // The server reserved this many seconds; end on time rather than overrun,
      // and tell the guide 30 s before so it can say goodbye.
      if (maxSeconds) {
        cutoffTimer = setTimeoutImpl(() => end('time_limit'), maxSeconds * 1000);
        const warnIn = maxSeconds * 1000 - WARN_BEFORE_END_MS;
        if (warnIn > 0) warningTimer = setTimeoutImpl(warnGuide, warnIn);
        else warnGuide();
      }
    },

    handleDisconnect(details) {
      clearCutoff();
      if (state.phase === 'connecting') {
        // It never connected: free the reservation now, not in 30 minutes.
        releasePending();
        set({ phase: 'unavailable', message: START_FAILED_MESSAGE, conversationId: null });
        return;
      }
      if (state.phase === 'connected') {
        conversationOver(DISCONNECT_REASONS.has(details?.reason) ? details.reason : 'unknown');
      }
      if (state.phase !== 'unavailable') set({ phase: 'idle', conversationId: null });
    },

    recordToolCall(name, ok) {
      if (state.phase !== 'connected' || connectedAt === null) return;
      toolCalls.push({ name, ok, msSinceStart: now() - connectedAt });
      if (toolCalls.length > SUMMARY_TOOL_LIMIT) toolCalls.shift();
    },

    /** The tab is closing: the most common real ending. */
    pageClosing() {
      if (state.phase === 'connected') sendSummary('page_closed', { beacon: true });
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
      // While a conversation is still starting, switching would start a
      // second one; the new guide takes the next conversation instead.
      if (starting()) {
        const id = normalizeGuide(next);
        if (id) pendingGuide = id;
        return;
      }
      end('user');
      await start({ guide: next });
    },
  };
}
