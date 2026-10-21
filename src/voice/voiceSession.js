/**
 * One conversation with the guide, from the first microphone request to the end.
 * The SDK is injected (`conversation`: startSession, endSession,
 * sendContextualUpdate, getOutputVolume), so this runs without a browser.
 *
 *   idle -> requesting -> connecting -> connected -> idle
 *   (Kyle, 2026-10-11: no consent box; turning the voice on, speaking or writing starts at once.)
 *                                     \-> unavailable (with a plain message)
 *   connected -> resting (rest, time limit) -> requesting (wake) -> ...
 *   connected -> requesting (handover, carryingOn) -> connecting -> connected
 *     (Kyle, 2026-10-13: before the 8-minute cap, and on entering Study, the
 *     conversation carries on in a fresh session; the visitor hears a short pause.)
 *
 * A conversation is 'voice' or 'text' (text only: no microphone, no audio).
 * 'auto' asks for the microphone and carries on in text if it is refused.
 */
import { GUIDES, normalizeGuide } from './guides.js';
import { describeVoiceUnavailable } from './voiceAvailability.js';
import { formatTimeWarning } from './contextUpdates.js';

const WARN_BEFORE_END_MS = 30_000;
// The ElevenLabs agent's own maximum conversation duration (agent/architect-brief.md).
export const AGENT_MAX_SECONDS = 480;
// The handover opens this long before the cap: the guide is told to finish its
// thought, and the conversation carries on at its first quiet moment...
const HANDOVER_WINDOW_MS = 45_000;
// ...or this long before the cap, whatever it is doing.
const HANDOVER_LATEST_MS = 12_000;
// A shorter session (today's voice time nearly spent) rests at its limit as before.
const MIN_HANDOVER_SECONDS = 120;
// The server frees the old slot when it hears the end; wait this long for it at most.
const ENDED_REPORT_WAIT_MS = 1_500;
// Right after this page's own conversation, the server may still count it
// open until ElevenLabs' webhook lands (about 20 s in the first live run).
const RETRY_BUSY_WITHIN_MS = 60_000;
const BUSY_RETRY_EVERY_MS = 5_000;
const BUSY_RETRIES = 9; // 45 s
// The session summary keeps the most recent calls; the end is what we debug.
const SUMMARY_TOOL_LIMIT = 200;
const DISCONNECT_REASONS = new Set(['agent', 'error', 'user']);

export const MIC_BLOCKED_MESSAGE =
  "Your microphone is blocked, so we can't talk aloud. Allow the microphone for this site in your browser settings, then try again. On a school Chromebook, ask your teacher.";
export const START_FAILED_MESSAGE = "We couldn't start the conversation. Please try again.";
export const MIC_UNAVAILABLE_MESSAGE = "This browser can't use a microphone here, so we can't talk aloud.";

/*
 * Kyle, 2026-10-20: "after pressing study, nothing happened." On networks that
 * block WebRTC (UDP), the audio link never opens: ElevenLabs gives up after
 * about 15 s and the page waited on "Waking Sylvi…" forever. A start that
 * errors, disconnects or takes 15 s now releases its reservation and carries
 * on over a WebSocket relayed by our server (server/relay.js). The browser
 * remembers it needed the relay for six hours, so later conversations start
 * there at once. If the relay fails too, the page says so plainly.
 */
export const CONNECT_TIMEOUT_MS = 15_000;
export const TRANSPORT_KEY = 'brainGame.voiceTransport';
export const WEBSOCKET_MEMORY_MS = 6 * 60 * 60 * 1000;
// A failed attempt's last events can arrive just after the next has begun.
const START_GRACE_MS = 2_000;

export const noRouteMessage = (name) => `${name} can't connect on this network right now. The game works as usual.`;

function defaultSocketOrigin() {
  const location = globalThis.location;
  if (!location?.host) return '';
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
}

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
  // Where the relay is: this page's own host, over wss.
  socketOrigin = defaultSocketOrigin(),
}) {
  let state = { phase: 'idle', guide: null, message: null, conversationId: null, mode: 'voice', micRefused: false };
  // The mode asked for ('voice', 'text' or 'auto'), kept for waking from rest.
  let requestedMode = 'voice';
  let pendingGuide = null;
  let cutoffTimer = null;
  let warningTimer = null;
  let handoverTimer = null;
  let handoverDue = false;
  let guideIsSpeaking = false;
  let retryTimer = null;
  let busyRetries = 0;
  let lastConversationEndedAt = null;
  // The connected conversation, for its summary: the reservation's 8-character
  // prefix (the server logs the same prefix), when it connected, its tool calls.
  let sessionTag = null;
  let connectedAt = null;
  let toolCalls = [];
  // What following the guide's words did: names lit, names turned to.
  let follow = null;

  function conversationOver(reason, detail) {
    lastConversationEndedAt = now();
    sendSummary(reason);
    const ended = reportEnded();
    if (detail) onConversationEnd(detail);
    else onConversationEnd();
    return ended;
  }

  // The slot frees at once; the minutes wait for ElevenLabs' report.
  let connectedReservation = null;
  // A keepalive fetch outlives the page, so a closing tab reports too.
  function reportEnded() {
    const reservation = connectedReservation;
    connectedReservation = null;
    if (!reservation) return Promise.resolve();
    return Promise.resolve()
      .then(() =>
        fetchImpl('/api/voice/ended', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservation }),
        })
      )
      .catch(() => {});
  }


  /**
   * One line in our logs per conversation: how it ended, how long it ran and
   * every tool call. Sent once; a closing tab sends it by beacon, which the
   * browser delivers after the page is gone.
   */
  function sendSummary(reason, { beacon = false } = {}) {
    if (connectedAt === null) return;
    const summary = {
      type: 'session_summary',
      session: sessionTag ?? 'none',
      reason,
      durationSecs: Math.round((now() - connectedAt) / 1000),
      tools: toolCalls,
    };
    if (follow && follow.lit + follow.turned > 0) summary.follow = follow;
    const body = JSON.stringify(summary);
    connectedAt = null;
    toolCalls = [];
    follow = null;
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
  // The route of the conversation being started ('webrtc' or 'websocket'),
  // its number, when it began, and how long it may take.
  let attemptTransport = null;
  let attemptNumber = 0;
  let attemptStartedAt = 0;
  let attemptIsFallback = false;
  let connectTimer = null;

  function rememberedTransport() {
    try {
      const saved = JSON.parse(storage?.getItem?.(TRANSPORT_KEY) ?? 'null');
      if (saved?.transport === 'websocket' && Number(saved.until) > now()) return 'websocket';
    } catch {
      // Storage blocked or unreadable: try WebRTC.
    }
    return 'webrtc';
  }

  function rememberRelay() {
    try {
      storage?.setItem?.(TRANSPORT_KEY, JSON.stringify({ transport: 'websocket', until: now() + WEBSOCKET_MEMORY_MS }));
    } catch {
      // Not remembered: the next conversation tries WebRTC first again.
    }
  }

  function clearConnectTimer() {
    if (connectTimer !== null) clearTimeoutImpl(connectTimer);
    connectTimer = null;
  }

  const guideName = () => GUIDES.find((g) => g.id === state.guide)?.name ?? 'Your guide';

  /** The conversation being started could not connect: try the relay, or say so. */
  async function connectFailed() {
    if (state.phase !== 'connecting') return;
    clearConnectTimer();
    const failed = attemptTransport;
    const reservation = pendingReservation;
    // Requesting first, so the failed attempt's own goodbye is ignored.
    set({ phase: 'requesting', message: null });
    try {
      conversation.endSession();
    } catch {
      // Nothing left to end.
    }
    // Refund it if it never started, and free this browser's one slot either way.
    releasePending();
    if (failed === 'websocket') {
      set({ phase: 'unavailable', message: noRouteMessage(guideName()), conversationId: null });
      return;
    }
    rememberRelay();
    const ended = reservation
      ? Promise.resolve()
          .then(() =>
            fetchImpl('/api/voice/ended', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reservation }),
            })
          )
          .catch(() => {})
      : Promise.resolve();
    await Promise.race([ended, wait(ENDED_REPORT_WAIT_MS)]);
    if (state.phase !== 'requesting') return;
    await requestToken('websocket', { fallback: true });
  }

  /** An event from the SDK about a start: ignore one that belongs to a failed attempt. */
  const strayAfterFallback = () => attemptIsFallback && now() - attemptStartedAt < START_GRACE_MS;

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

  function set(patch) {
    // Carrying on lasts only while the next conversation starts.
    const settled = patch.phase && patch.phase !== 'requesting' && patch.phase !== 'connecting';
    state = { ...state, ...(settled && !('carryingOn' in patch) ? { carryingOn: false } : {}), ...patch };
    onChange(state);
  }

  function clearCutoff() {
    if (cutoffTimer !== null) clearTimeoutImpl(cutoffTimer);
    if (warningTimer !== null) clearTimeoutImpl(warningTimer);
    if (handoverTimer !== null) clearTimeoutImpl(handoverTimer);
    cutoffTimer = null;
    warningTimer = null;
    handoverTimer = null;
    handoverDue = false;
  }

  function warnGuide() {
    warningTimer = null;
    if (state.phase === 'connected') conversation.sendContextualUpdate(formatTimeWarning());
  }

  // The handover window opens: tell the guide, then carry on at its first quiet moment.
  function openHandover() {
    warningTimer = null;
    if (state.phase !== 'connected') return;
    if (!guideIsSpeaking) {
      handOver();
      return;
    }
    conversation.sendContextualUpdate(formatTimeWarning());
    handoverDue = true;
  }

  const wait = (ms) => new Promise((resolve) => setTimeoutImpl(resolve, ms));

  /** Ends this conversation and starts the next at once, in the same guide and mode. */
  async function handOver() {
    if (state.phase !== 'connected') return;
    clearCutoff();
    clearRetry();
    conversation.endSession();
    const ended = conversationOver('handover', { carriedOn: true });
    guideIsSpeaking = false;
    set({ phase: 'requesting', carryingOn: true, conversationId: null, message: null });
    // The server frees this page's slot when it hears the end: wait for that, briefly.
    await Promise.race([ended.catch(() => {}), wait(ENDED_REPORT_WAIT_MS)]);
    if (state.phase !== 'requesting' || !state.carryingOn) return;
    if (state.mode === 'text') requestedMode = 'text';
    await requestAndStart({ carriedOn: true });
  }

  const starting = () => state.phase === 'requesting' || state.phase === 'connecting';

  async function requestAndStart({ carriedOn = false } = {}) {
    set({ phase: 'requesting', message: null, conversationId: null });
    // A new conversation never inherits a region lit by the last one, unless it
    // carries the same conversation on.
    if (carriedOn) onConversationStart({ carriedOn: true });
    else onConversationStart();
    clearRetry();
    busyRetries = 0;
    if (requestedMode === 'text') {
      set({ mode: 'text' });
      await requestToken();
      return;
    }
    const microphone = await requestMicrophone();
    if (microphone !== 'granted') {
      // Counted, once per page, so we know how often this happens ("Type instead").
      reportMicEvent(microphone === 'denied' ? 'mic_blocked' : 'mic_unsupported');
      if (requestedMode === 'auto') {
        // Kyle, 2026-10-11: without the microphone the guide carries on in text.
        set({ mode: 'text', micRefused: true });
        await requestToken();
        return;
      }
      set({ phase: 'unavailable', message: microphone === 'denied' ? MIC_BLOCKED_MESSAGE : MIC_UNAVAILABLE_MESSAGE });
      return;
    }
    set({ mode: 'voice', micRefused: false });
    await requestToken();
  }

  async function requestToken(transport = rememberedTransport(), { fallback = false } = {}) {
    let body;
    try {
      const response = await fetchImpl('/api/voice/token', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guide: state.guide, transport }),
      });
      body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const justEnded = lastConversationEndedAt !== null && now() - lastConversationEndedAt <= RETRY_BUSY_WITHIN_MS;
        if (body?.reason === 'busy' && justEnded && busyRetries < BUSY_RETRIES) {
          const name = GUIDES.find((g) => g.id === state.guide)?.name ?? 'your guide';
          set({ phase: 'requesting', message: `One moment, ${name} is getting ready…` });
          retryTimer = setTimeoutImpl(() => {
            retryTimer = null;
            busyRetries += 1;
            return requestToken(transport, { fallback });
          }, BUSY_RETRY_EVERY_MS);
          return;
        }
        set({ phase: 'unavailable', message: describeVoiceUnavailable(body) });
        return;
      }
    } catch {
      set({ phase: 'unavailable', message: describeVoiceUnavailable({}) });
      return;
    }
    // Ended or restarted while the token was on its way.
    if (state.phase !== 'requesting') return;
    maxSeconds = body.maxSeconds;
    pendingReservation = body.dynamicVariables?.reservation ?? null;
    sessionTag = pendingReservation ? String(pendingReservation).split('.')[0].slice(0, 8) : null;
    set({ phase: 'connecting', message: null });
    const textOnly = state.mode === 'text';
    const shared = {
      dynamicVariables: body.dynamicVariables,
      // Text only needs no microphone and makes no audio.
      ...(textOnly ? { textOnly: true } : {}),
      overrides: textOnly ? { conversation: { textOnly: true } } : { tts: { voiceId: body.voiceId } },
      clientTools,
    };
    const config = body.relayPath
      ? { signedUrl: `${socketOrigin}${body.relayPath}`, connectionType: 'websocket', ...shared }
      : { conversationToken: body.conversationToken, connectionType: 'webrtc', ...shared };
    attemptTransport = body.relayPath ? 'websocket' : 'webrtc';
    attemptNumber += 1;
    attemptStartedAt = now();
    attemptIsFallback = fallback;
    const attempt = attemptNumber;
    clearConnectTimer();
    connectTimer = setTimeoutImpl(() => {
      connectTimer = null;
      if (attempt === attemptNumber) connectFailed();
    }, CONNECT_TIMEOUT_MS);
    let started;
    try {
      started = conversation.startSession(config);
    } catch {
      connectFailed();
      return;
    }
    Promise.resolve(started).catch(() => {
      if (attempt === attemptNumber) connectFailed();
    });
  }

  async function start({ guide, mode } = {}) {
    // One conversation at a time: a second Talk while one is starting or
    // running does nothing.
    if (starting() || state.phase === 'connected') return;
    if (mode === 'voice' || mode === 'text' || mode === 'auto') requestedMode = mode;
    const chosen = normalizeGuide(guide) ?? pendingGuide ?? state.guide;
    pendingGuide = null;
    if (!chosen) {
      set({ phase: 'unavailable', message: describeVoiceUnavailable({}) });
      return;
    }
    set({ guide: chosen });
    await requestAndStart();
  }

  // Resting and the time limit end the conversation quietly; the next
  // activity wakes a new one that carries on.
  const RESTING_REASONS = new Set(['rest', 'time_limit']);

  function end(reason = 'user') {
    clearConnectTimer();
    clearCutoff();
    clearRetry();
    const wasConnected = state.phase === 'connected';
    if (state.phase === 'connecting') releasePending();
    if (state.phase === 'connecting' || state.phase === 'connected') conversation.endSession();
    if (wasConnected) conversationOver(reason);
    const resting = wasConnected && RESTING_REASONS.has(reason);
    set({ phase: resting ? 'resting' : 'idle', conversationId: null });
  }

  return {
    getState: () => ({ ...state }),
    start,
    end: () => end('user'),
    /** Quiet: the conversation ends, and the next activity wakes another. */
    rest: () => end('rest'),
    /** Wakes from rest in the mode it rested in. */
    async wake() {
      if (state.phase !== 'resting') return;
      await start({ guide: state.guide, mode: state.mode === 'text' ? 'text' : requestedMode });
    },

    /** The SDK reported an error: before connecting, the start has failed. */
    handleError() {
      if (state.phase === 'connecting' && !strayAfterFallback()) connectFailed();
    },

    async handleConnect({ conversationId }) {
      clearConnectTimer();
      connectedReservation = pendingReservation;
      pendingReservation = null;
      set({ phase: 'connected', conversationId, carryingOn: false });
      connectedAt = now();
      toolCalls = [];
      follow = null;
      clearCutoff();
      // The server reserved this many seconds; end on time rather than overrun.
      if (maxSeconds) {
        cutoffTimer = setTimeoutImpl(() => end('time_limit'), maxSeconds * 1000);
        // Kyle, 2026-10-13: before the cap (the agent's 8 minutes or the
        // reservation, whichever is first), carry on in a fresh session.
        const capMs = Math.min(maxSeconds, AGENT_MAX_SECONDS) * 1000;
        if (capMs >= MIN_HANDOVER_SECONDS * 1000) {
          warningTimer = setTimeoutImpl(openHandover, capMs - HANDOVER_WINDOW_MS);
          handoverTimer = setTimeoutImpl(() => handOver(), capMs - HANDOVER_LATEST_MS);
        } else {
          // Today's voice time is nearly spent: warn 30 s before, and rest at the limit.
          const warnIn = maxSeconds * 1000 - WARN_BEFORE_END_MS;
          if (warnIn > 0) warningTimer = setTimeoutImpl(warnGuide, warnIn);
          else warnGuide();
        }
      }
    },

    /** Whether the guide is speaking: a due handover waits for it to finish. */
    guideSpeaking(speaking) {
      guideIsSpeaking = Boolean(speaking);
      if (!guideIsSpeaking && handoverDue) handOver();
    },

    /** Carries the conversation on in a fresh session now (entering Study). */
    handOver,

    handleDisconnect(details) {
      // A new conversation is being arranged: this goodbye is the last one's.
      if (state.phase === 'requesting') return;
      if (state.phase === 'connecting') {
        if (strayAfterFallback()) return;
        // It never connected: free the reservation now, and try the relay.
        connectFailed();
        return;
      }
      clearCutoff();
      if (state.phase === 'connected') {
        conversationOver(DISCONNECT_REASONS.has(details?.reason) ? details.reason : 'unknown');
        // No visible end: the next word or tap wakes another conversation.
        set({ phase: 'resting', conversationId: null });
        return;
      }
      if (state.phase !== 'unavailable' && state.phase !== 'resting') set({ phase: 'idle', conversationId: null });
    },

    /** `detail` is `{ refused: true, spokenMs }` when the tour gate refused the call. */
    recordToolCall(name, ok, detail) {
      if (state.phase !== 'connected' || connectedAt === null) return;
      const call = { name, ok, msSinceStart: now() - connectedAt };
      if (detail?.refused) Object.assign(call, { ok: false, refused: true, spokenMs: detail.spokenMs });
      toolCalls.push(call);
      if (toolCalls.length > SUMMARY_TOOL_LIMIT) toolCalls.shift();
    },

    /** A spoken name the brain followed: `did` is 'lit', 'turned' or 'skipped'. */
    recordFollow(did, timing) {
      if (state.phase !== 'connected' || connectedAt === null) return;
      follow ??= { lit: 0, turned: 0, timing: 'estimate' };
      if (did === 'lit') follow.lit += 1;
      if (did === 'turned') follow.turned += 1;
      if (timing === 'alignment' || timing === 'estimate') follow.timing = timing;
    },

    /** The tab is closing: the most common real ending. */
    pageClosing() {
      if (state.phase === 'connected') {
        sendSummary('page_closed', { beacon: true });
        reportEnded();
      }
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
