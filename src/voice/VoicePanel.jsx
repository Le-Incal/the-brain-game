/**
 * The voice guide in Study mode: consent, talk and end, guide choice, and the
 * transcript. Loaded lazily, only when VITE_VOICE_ENABLED is on, so the
 * ElevenLabs SDK never reaches the production bundle until launch.
 *
 * The logic lives in tested modules (voiceSession, clientTools,
 * contextUpdates, transcript, guideSettings); this file only wires them to
 * the SDK and to the scene.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { GUIDES } from './guides.js';
import { CONSENT_TEXT, createVoiceSession } from './voiceSession.js';
import { cancelMovesWhenHidden, createClientTools } from './clientTools.js';
import { createContextReporter } from './contextUpdates.js';
import { appendMessage, messageFromSdk } from './transcript.js';
import { planGuideChange, SWITCH_NOW_WARNING } from './guideSettings.js';
import { TRANSCRIPT_STYLE, VOICE_PANEL_STYLE, visibleTranscript } from './voicePanelLayout.js';
import { createGesture, gestureStrength, stepGesture } from './gestures.js';
import { createTourStallGuard } from './tourStallGuard.js';
import { createTourPacer } from './tourPacer.js';

const INK = '#1a1814';
const STYLES = {
  panel: VOICE_PANEL_STYLE,
  row: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: (active) => ({
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '4px 10px',
    background: active ? INK : 'transparent',
    color: active ? '#f5f0e8' : INK,
    border: `1px solid ${INK}`,
    cursor: 'pointer',
  }),
  note: { fontStyle: 'italic', fontSize: 13, lineHeight: 1.4, color: '#5a4030', margin: '6px 0' },
  transcript: TRANSCRIPT_STYLE,
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 14,
    padding: '3px 6px',
    border: `1px solid rgba(26, 24, 20, 0.4)`,
    background: 'transparent',
  },
};

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

function VoicePanelInner({ guide, onGuideChange, commands, scene, voiceEventsRef, control }) {
  const controlRef = useRef(control);
  controlRef.current = control;
  const [state, setState] = useState({ phase: 'idle', guide, message: null });
  const [transcript, setTranscript] = useState([]);
  const [typed, setTyped] = useState('');
  const [guideNote, setGuideNote] = useState(null);
  const sessionRef = useRef(null);
  const sdkRef = useRef(null);
  const stallGuardRef = useRef(null);
  // The tour moves on only after the guide has spoken about the current stop.
  const tourPacer = useMemo(() => createTourPacer(), []);

  const sdk = useConversation({
    onConnect: ({ conversationId }) => sessionRef.current?.handleConnect({ conversationId }),
    onDisconnect: (details) => sessionRef.current?.handleDisconnect(details),
    // The stall guard listens for the guide falling quiet at a stop; the
    // pacer counts how long it has spoken there.
    onModeChange: ({ mode }) => {
      stallGuardRef.current?.guideSpeaking(mode === 'speaking');
      tourPacer.guideSpeaking(mode === 'speaking');
    },
    onMessage: (payload) => {
      if (payload?.role === 'user') stallGuardRef.current?.playerActivity();
      const line = messageFromSdk(payload, GUIDES.find((g) => g.id === sessionRef.current?.getState().guide)?.name ?? 'Guide');
      if (line) setTranscript((list) => appendMessage(list, line));
    },
    onError: (message) => console.warn('[voice]', message),
  });
  sdkRef.current = sdk;

  const session = useMemo(() => {
    const clientTools = createClientTools(commands, {
      cancelMoves: (reason) => scene.controls.cancelMove(reason),
      tourPacer,
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
      onConversationEnd: () => commands.clearHighlight(),
      // A new conversation never inherits a region lit by the last one.
      onConversationStart: () => commands.clearHighlight(),
    });
  }, [commands, scene, tourPacer]);
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
  // while it speaks, unless anything else is directing attention.
  useEffect(() => {
    let frame;
    let last = performance.now();
    const gesture = createGesture();
    const reducedMotion = prefersReducedMotion();
    const tick = (now) => {
      const level = session.outputLevel();
      scene.setVoiceLevel(level);
      const strength = gestureStrength({
        control: controlRef.current,
        highlighted: scene.getVoiceHighlight() !== null || scene.selectedRegionId >= 0,
        reducedMotion,
      });
      scene.setGesture(stepGesture(gesture, { dtSeconds: (now - last) / 1000, level, strength }));
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      scene.setVoiceLevel(0);
      scene.setGesture({ yaw: 0, pitch: 0 });
    };
  }, [session, scene]);

  // Leaving Study mode ends the conversation.
  useEffect(() => () => session.end(), [session]);

  // Closing the tab is how most conversations really end; it still gets its summary.
  useEffect(() => {
    const onPageHide = () => session.pageClosing();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [session]);

  const name = GUIDES.find((g) => g.id === guide)?.name ?? 'your guide';
  const active = state.phase === 'connected' || state.phase === 'connecting' || state.phase === 'requesting';

  const chooseGuide = (next) => {
    const plan = planGuideChange({ current: guide, next, connected: active });
    if (plan.kind === 'none') return;
    session.changeGuide(next);
    onGuideChange(next);
    setGuideNote(plan.kind === 'next-conversation' ? { note: plan.note, next } : null);
  };

  const sendTyped = (event) => {
    event.preventDefault();
    const text = typed.trim();
    if (!text || state.phase !== 'connected') return;
    sdkRef.current.sendUserMessage(text);
    setTranscript((list) => appendMessage(list, { id: `typed-${Date.now()}`, speaker: 'You', fromGuide: false, text }));
    setTyped('');
  };

  return (
    <div className="voice-panel" style={STYLES.panel} aria-label="Voice guide">
      {state.phase === 'needs-consent' ? (
        <div role="dialog" aria-label="Before you talk">
          <div style={STYLES.note}>{CONSENT_TEXT}</div>
          <div style={STYLES.row}>
            <button type="button" style={STYLES.button(true)} onClick={() => session.acceptConsent()}>
              I agree
            </button>
            <button type="button" style={STYLES.button(false)} onClick={() => session.declineConsent()}>
              Not now
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={STYLES.row}>
            {active ? (
              <button type="button" style={STYLES.button(true)} onClick={() => session.end()}>
                End conversation
              </button>
            ) : (
              <button type="button" style={STYLES.button(true)} onClick={() => session.start({ guide })}>
                Talk with {name}
              </button>
            )}
            <span style={{ fontSize: 12, fontStyle: 'italic' }}>Guide:</span>
            {GUIDES.map((g) => (
              <button key={g.id} type="button" style={STYLES.button(g.id === guide)} onClick={() => chooseGuide(g.id)}>
                {g.name}
              </button>
            ))}
          </div>
          {(state.phase === 'requesting' || state.phase === 'connecting') && !state.message ? (
            <div style={STYLES.note}>Waking {name}…</div>
          ) : null}
          {state.message ? <div style={STYLES.note}>{state.message}</div> : null}
          {guideNote ? (
            <div style={STYLES.note}>
              {guideNote.note}{' '}
              <button
                type="button"
                style={STYLES.button(false)}
                title={SWITCH_NOW_WARNING}
                onClick={() => {
                  if (window.confirm(SWITCH_NOW_WARNING)) {
                    setGuideNote(null);
                    session.switchGuideNow(guideNote.next);
                  }
                }}
              >
                Switch now
              </button>
            </div>
          ) : null}
          {transcript.length > 0 && (
            <div style={STYLES.transcript} aria-live="polite">
              {visibleTranscript(transcript).map((line) => (
                <div key={line.id}>
                  <strong style={{ fontWeight: line.fromGuide ? 600 : 400 }}>{line.speaker}:</strong> {line.text}
                </div>
              ))}
            </div>
          )}
          {state.phase === 'connected' && (
            <form onSubmit={sendTyped} style={{ ...STYLES.row, marginTop: 6 }}>
              <input
                style={STYLES.input}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={`Type to ${name}`}
                aria-label={`Type a message to ${name}`}
              />
              <button type="submit" style={STYLES.button(false)}>
                Send
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

export default function VoicePanel(props) {
  return (
    <ConversationProvider>
      <VoicePanelInner {...props} />
    </ConversationProvider>
  );
}
