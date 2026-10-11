/**
 * The voice guide, present from arrival (Kyle, 2026-10-11): the conversation
 * streams as text in the column on the right, the visitor can speak or write,
 * and two small switches turn the voice and the brain's motion on or off.
 * Loaded lazily, only when VITE_VOICE_ENABLED is on, so the ElevenLabs SDK
 * never reaches the production bundle until launch.
 *
 * The logic lives in tested modules (voiceSession, clientTools,
 * contextUpdates, transcriptStream, followWords, GuideColumn); this file only
 * wires them to the SDK and to the scene.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { GUIDES } from './guides.js';
import { CONSENT_TEXT, createVoiceSession } from './voiceSession.js';
import { cancelMovesWhenHidden, createClientTools } from './clientTools.js';
import { createContextReporter } from './contextUpdates.js';
import { stripExpressiveTags } from './spokenNames.js';
import { createGesture, gestureStrength, stepGesture } from './gestures.js';
import { createTourStallGuard } from './tourStallGuard.js';
import { createTourPacer } from './tourPacer.js';
import { createWordFollower } from './followWords.js';
import { createTranscriptStream } from './transcriptStream.js';
import { isAtBottom } from './transcriptScroll.js';
import { GuideColumnView, noticeFor } from './GuideColumn.jsx';
import { IDLE_TURN_DEGREES_PER_SECOND, createDrift, floatMode, stepDrift } from './floating.js';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const ACTIVE_PHASES = new Set(['requesting', 'connecting', 'connected']);

function VoicePanelInner({ guide, commands, scene, voiceEventsRef, control, motion }) {
  const controlRef = useRef(control);
  controlRef.current = control;
  const motionRef = useRef(motion.on);
  motionRef.current = motion.on;
  const [state, setState] = useState({ phase: 'idle', guide, message: null });
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState('');
  const [following, setFollowing] = useState(true);
  const transcriptRef = useRef(null);
  const sessionRef = useRef(null);
  const sdkRef = useRef(null);
  const stallGuardRef = useRef(null);
  // Words written before the conversation connected, sent once it does.
  const queuedRef = useRef([]);
  const lineIdRef = useRef(0);
  const nextLineId = (prefix) => {
    lineIdRef.current += 1;
    return `${prefix}-${lineIdRef.current}`;
  };
  // The tour moves on only after the guide has spoken about the current stop.
  const tourPacer = useMemo(() => createTourPacer(), []);
  const guideSpeakingRef = useRef(false);
  const stream = useMemo(() => createTranscriptStream(), []);
  const refreshEntries = () => setEntries(stream.entries());
  // Follow the words: the brain lights what the guide names, as it names it.
  const follower = useMemo(() => {
    const instance = createWordFollower({
      act: (target) => {
        if (sessionRef.current?.getState().phase !== 'connected') return;
        Promise.resolve(commands.followName(target))
          .then((result) => sessionRef.current?.recordFollow(result?.did, instance.timing()))
          .catch((error) => console.warn('[voice] follow', error));
      },
    });
    return instance;
  }, [commands]);
  useEffect(() => () => follower.dispose(), [follower]);

  const sdk = useConversation({
    onConnect: ({ conversationId }) => {
      sessionRef.current?.handleConnect({ conversationId });
      // Words written while the guide was waking go now, in order.
      const queued = queuedRef.current;
      queuedRef.current = [];
      for (const text of queued) sdkRef.current?.sendUserMessage(text);
    },
    onDisconnect: (details) => sessionRef.current?.handleDisconnect(details),
    // The stall guard listens for the guide falling quiet at a stop; the
    // pacer counts how long it has spoken there.
    onModeChange: ({ mode }) => {
      const speaking = mode === 'speaking';
      guideSpeakingRef.current = speaking;
      stallGuardRef.current?.guideSpeaking(speaking);
      tourPacer.guideSpeaking(speaking);
      follower.guideSpeaking(speaking);
      if (!speaking) {
        stream.guideStopped();
        refreshEntries();
      }
    },
    // Exact timing for following the words, when ElevenLabs sends it.
    onAudioAlignment: (alignment) => follower.alignment(alignment),
    onInterruption: () => {
      follower.interrupted();
      stream.interrupted();
      refreshEntries();
    },
    onMessage: (payload) => {
      const raw = typeof payload?.message === 'string' ? payload.message : '';
      if (payload?.role === 'user') {
        stallGuardRef.current?.playerActivity();
        follower.interrupted();
        stream.addVisitor({ id: payload.event_id ? `u-${payload.event_id}` : nextLineId('u'), text: raw });
      } else if (payload?.role === 'agent') {
        follower.guideText(raw);
        stream.addGuide({ id: payload.event_id ? `g-${payload.event_id}` : nextLineId('g'), text: stripExpressiveTags(raw) });
      }
      refreshEntries();
    },
    onError: (message) => console.warn('[voice]', message),
  });
  sdkRef.current = sdk;

  const session = useMemo(() => {
    const clientTools = createClientTools(commands, {
      cancelMoves: (reason) => scene.controls.cancelMove(reason),
      tourPacer,
      // An explicit scene tool wins over following the words.
      onToolStart: (name) => follower.toolCalled(name),
      onToolCall: (name, ok, detail) => sessionRef.current?.recordToolCall(name, ok, detail),
    });
    return createVoiceSession({
      conversation: {
        startSession: (config) => sdkRef.current.startSession(config),
        endSession: () => sdkRef.current.endSession(),
        sendContextualUpdate: (text) => sdkRef.current.sendContextualUpdate(text),
        getOutputVolume: () => sdkRef.current.getOutputVolume(),
      },
      storage: browserStorage(),
      clientTools,
      onChange: setState,
      // The guide lets go of the brain when the conversation is over.
      onConversationEnd: () => {
        follower.interrupted();
        stream.guideStopped();
        refreshEntries();
        commands.clearHighlight();
      },
      // A new conversation never inherits a region lit by the last one.
      onConversationStart: () => commands.clearHighlight(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, scene, tourPacer, follower, stream]);
  sessionRef.current = session;

  // Scene events reach the guide only while a conversation is connected.
  useEffect(() => {
    const reporter = createContextReporter({ send: (text) => session.sendContext(text) });
    const stallGuard = createTourStallGuard({ send: (text) => session.sendContext(text) });
    stallGuardRef.current = stallGuard;
    voiceEventsRef.current = {
      ...reporter,
      userInteraction: (event) => {
        if (event.type === 'grab') stallGuard.playerActivity();
        reporter.userInteraction(event);
      },
      tourEvent: (event) => {
        if (event.type === 'stop') stallGuard.stopShown(event);
        else if (event.type === 'end') stallGuard.tourEnded();
      },
    };
    const idle = window.setInterval(() => reporter.tick(), 1000);
    const stopWatching = cancelMovesWhenHidden({
      document,
      cancelMoves: (reason) => scene.controls.cancelMove(reason),
    });
    return () => {
      window.clearInterval(idle);
      stopWatching();
      stallGuard.tourEnded();
      stallGuardRef.current = null;
      voiceEventsRef.current = null;
    };
  }, [session, scene, voiceEventsRef]);

  useEffect(() => {
    if (state.phase === 'connected') voiceEventsRef.current?.studyEntered();
  }, [state.phase, voiceEventsRef]);

  // The hatching answers the guide's voice, and the brain gestures gently
  // while it speaks, unless anything else is directing attention. Once its
  // moves settle it floats: a drift while something is lit, a slow turn when
  // nothing is and the guide is quiet. Motion off stills all of it. Each
  // frame also streams the transcript to what has been heard.
  useEffect(() => {
    let frame;
    let last = performance.now();
    const gesture = createGesture();
    const drift = createDrift();
    const reducedMotion = prefersReducedMotion();
    const idleTurnRate = (IDLE_TURN_DEGREES_PER_SECOND * Math.PI) / 180;
    const tick = (now) => {
      const dtSeconds = (now - last) / 1000;
      const level = session.outputLevel();
      scene.setVoiceLevel(level);
      // The level rising is the guide's audio being heard: the playback clock's start.
      follower.outputLevel(level);
      if (stream.tick(follower.playback())) setEntries(stream.entries());
      const still = reducedMotion || !motionRef.current;
      const lit = scene.getVoiceHighlight() !== null || scene.selectedRegionId >= 0;
      const strength = gestureStrength({ control: controlRef.current, highlighted: lit, reducedMotion: still });
      const mode = floatMode({
        connected: session.getState().phase === 'connected',
        control: controlRef.current,
        lit,
        guideSpeaking: guideSpeakingRef.current,
        reducedMotion: still,
      });
      const sway = stepGesture(gesture, { dtSeconds, level, strength });
      const float = stepDrift(drift, { dtSeconds, active: mode === 'drift' });
      scene.setGesture({ yaw: sway.yaw + float.yaw, pitch: sway.pitch + float.pitch });
      scene.controls.setIdleTurn(mode === 'turn' ? idleTurnRate : 0);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      scene.setVoiceLevel(0);
      scene.setGesture({ yaw: 0, pitch: 0 });
      scene.controls.setIdleTurn(0);
    };
  }, [session, scene, follower, stream]);

  // Closing the tab is how most conversations really end; it still gets its summary.
  useEffect(() => {
    const onPageHide = () => session.pageClosing();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      session.end();
    };
  }, [session]);

  // The guide is chosen in Settings: a change takes effect at once, in a new conversation.
  const guideRef = useRef(guide);
  useEffect(() => {
    if (guideRef.current === guide) return;
    guideRef.current = guide;
    if (ACTIVE_PHASES.has(session.getState().phase)) session.switchGuideNow(guide);
    else session.changeGuide(guide);
  }, [guide, session]);

  // New lines keep the column at the bottom only while the reader is there.
  useLayoutEffect(() => {
    const element = transcriptRef.current;
    if (element && following) element.scrollTop = element.scrollHeight;
  }, [entries, following]);

  const name = GUIDES.find((g) => g.id === guide)?.name ?? 'your guide';
  const active = ACTIVE_PHASES.has(state.phase);

  const turnVoice = (on) => {
    if (on) {
      if (!active) session.start({ guide });
    } else {
      stream.setVoice(false);
      session.end();
    }
    if (on) stream.setVoice(true);
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    stream.addVisitor({ id: nextLineId('typed'), text });
    refreshEntries();
    if (state.phase === 'connected') {
      sdkRef.current.sendUserMessage(text);
      return;
    }
    queuedRef.current.push(text);
    if (!active) session.start({ guide });
  };

  const notice = noticeFor(state.phase, state.message, name);
  return (
    <GuideColumnView
      guideName={name}
      entries={entries}
      following={following}
      onLatest={() => {
        setFollowing(true);
        const element = transcriptRef.current;
        if (element) element.scrollTop = element.scrollHeight;
      }}
      transcriptRef={transcriptRef}
      onTranscriptScroll={(event) => setFollowing(isAtBottom(event.currentTarget))}
      draft={draft}
      onDraft={setDraft}
      onSend={send}
      voice={{ on: active, onChange: turnVoice }}
      motion={motion}
      notice={notice ? { text: notice.text, onActivate: notice.invite ? () => turnVoice(true) : undefined } : null}
      consent={
        state.phase === 'needs-consent'
          ? {
              text: CONSENT_TEXT,
              onAgree: () => session.acceptConsent(),
              onDecline: () => {
                queuedRef.current = [];
                session.declineConsent();
              },
            }
          : null
      }
    />
  );
}

export default function VoicePanel(props) {
  return (
    <ConversationProvider>
      <VoicePanelInner {...props} />
    </ConversationProvider>
  );
}
