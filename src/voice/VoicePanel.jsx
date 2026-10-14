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
import { createVoiceSession } from './voiceSession.js';
import { cancelMovesWhenHidden, createClientTools } from './clientTools.js';
import { createContextReporter, formatCarryOn, formatCoachSignal, formatFirstPlay, formatMissPrompt, formatRegionClicked, isAppPrompt } from './contextUpdates.js';
import { STUDY_HANDOVER_WAIT_MS, freshSessionOnModeChange, studyHandoverTiming } from './carryOn.js';
import { createGuidePrompter } from './guidePrompter.js';
import { stripExpressiveTags } from './spokenNames.js';
import { gestureStrength } from './gestures.js';
import { createPuppet, stepPuppet } from './puppet.js';
import { createCueTracker, createLevelCues } from './speechCues.js';
import { createTourStallGuard } from './tourStallGuard.js';
import { createTourPacer } from './tourPacer.js';
import { createWordFollower } from './followWords.js';
import { createTranscriptStream } from './transcriptStream.js';
import { createArrivalClock, createWelcome, WELCOME_DELAY_MS, WELCOME_GREETING_LEAD_MS, WELCOME_ID } from './welcome.js';
import { createRestTimer, createSpeechOnset } from './restWake.js';
import { isAtBottom } from './transcriptScroll.js';
import { GuideColumnView, noticeFor, voiceSwitchOn } from './GuideColumn.jsx';
import { IDLE_TURN_DEGREES_PER_SECOND, createDrift, floatMode, stepDrift } from './floating.js';
import { createSpinCue, motionControl, welcomeTourTiming } from './welcomeSpin.js';

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

function VoicePanelInner({ guide, commands, scene, voiceEventsRef, control, motion, mode = 'explore', stillness = false, onGuideActivity }) {
  // The page hears when the guide talks and when the visitor answers (the first-Play offer waits for quiet).
  const activityRef = useRef(onGuideActivity);
  activityRef.current = onGuideActivity;
  const controlRef = useRef(control);
  controlRef.current = control;
  const guideRef = useRef(guide);
  const motionRef = useRef(motion.on);
  motionRef.current = motion.on;
  // The section holds the brain still under its plate.
  const stillnessRef = useRef(stillness);
  stillnessRef.current = stillness;
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  // The welcome tour: its cue and when it moves on from the greeting (Kyle, 2026-10-13).
  const spinRef = useRef(null);
  // Once the introduction has finished, it turns slowly while it waits (Kyle, 2026-10-13).
  const waitingRef = useRef(false);
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
  // Context that should reach the next conversation (a click that woke it).
  const pendingContextRef = useRef([]);
  // Whether the visitor wants to hear the guide: on after the first tap or
  // when the welcome is heard, off when they switch Voice off.
  const voiceWantedRef = useRef(false);
  // The Voice switch shows this choice, so it reads On after the welcome is heard.
  const [voiceWanted, setVoiceWanted] = useState(false);
  const wantVoice = (value) => {
    voiceWantedRef.current = value;
    setVoiceWanted(value);
  };
  // A conversation has connected before: the next one carries it on.
  const connectedOnceRef = useRef(false);
  // Kyle, 2026-10-13: a conversation carried on in a fresh session picks up
  // where it was (a tour stop, a cut-off sentence). Set at the handover.
  const carryOnRef = useRef(null);
  // When the guide last used a tool: its own switch to Study is followed by speech.
  const lastToolAtRef = useRef(-Infinity);
  // A fresh Study session waiting for the guide's turn to end.
  const studyHandoverRef = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // One conversation on screen, many underneath: rest after 30 s of quiet.
  const restTimer = useMemo(() => createRestTimer({ onRest: () => sessionRef.current?.rest() }), []);
  useEffect(() => () => restTimer.dispose(), [restTimer]);
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
  // The recorded welcome on arrival: 'none' until it loads, then 'silent' or
  // 'audible' while it plays, then 'done'.
  const welcome = useMemo(() => {
    const instance = createWelcome();
    if (import.meta.env.DEV) window.__welcome = instance;
    return instance;
  }, []);
  const [welcomeState, setWelcomeState] = useState('none');
  const welcomeStateRef = useRef('none');
  const welcomeStreamingRef = useRef(false);
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

  // The coach's offers need an answer now, so they go as prompts, never over the guide.
  const prompter = useMemo(() => createGuidePrompter({ send: (text) => sdkRef.current?.sendUserMessage(text) }), []);
  useEffect(() => () => prompter.dispose(), [prompter]);

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
      restTimer.guideSpeaking(speaking);
      prompter.guideSpeaking(speaking);
      sessionRef.current?.guideSpeaking(speaking);
      // The guide finished its turn: a fresh Study session can start now.
      if (!speaking && studyHandoverRef.current) {
        window.clearTimeout(studyHandoverRef.current);
        studyHandoverRef.current = null;
        sessionRef.current?.handOver();
      }
      activityRef.current?.({ type: 'speaking', value: speaking });
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
      // The app's own prompts are not the visitor speaking.
      if (payload?.role === 'user' && isAppPrompt(raw)) return;
      restTimer.activity();
      if (payload?.role === 'user') activityRef.current?.({ type: 'visitor' });
      if (payload?.role === 'user') {
        welcome.stop();
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
      onToolStart: (name) => {
        lastToolAtRef.current = performance.now();
        follower.toolCalled(name);
      },
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
      onConversationEnd: (detail) => {
        follower.interrupted();
        stream.guideStopped();
        refreshEntries();
        // Carried on in a fresh session (Kyle, 2026-10-13): the lit region stays,
        // and the next conversation learns where to pick up.
        if (detail?.carriedOn) {
          carryOnRef.current = { tour: commands.getSceneState?.()?.tour ?? null, wasSpeaking: guideSpeakingRef.current };
          // The old conversation is silent now, whatever the SDK last reported,
          // so the pick-up prompt is not held behind a stale "speaking".
          guideSpeakingRef.current = false;
          prompter.guideSpeaking(false);
          restTimer.guideSpeaking(false);
          tourPacer.guideSpeaking(false);
          return;
        }
        commands.clearHighlight();
      },
      // A new conversation never inherits a region lit by the last one, unless it carries it on.
      onConversationStart: (detail) => {
        if (!detail?.carriedOn) commands.clearHighlight();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, scene, tourPacer, follower, stream]);
  sessionRef.current = session;

  // Scene events reach the guide only while a conversation is connected.
  useEffect(() => {
    const reporter = createContextReporter({ send: (text) => session.sendContext(text) });
    const regionClicked = reporter.regionClicked;
    // A click while the conversation rests wakes it, and the click goes with it.
    reporter.regionClicked = (region) => {
      restTimer.activity();
      if (session.getState().phase === 'resting') {
        pendingContextRef.current.push(formatRegionClicked(region));
        session.wake();
        return;
      }
      regionClicked(region);
    };
    const stallGuard = createTourStallGuard({ send: (text) => session.sendContext(text) });
    stallGuardRef.current = stallGuard;
    // Prompts the guide answers now. A resting conversation wakes for one; with
    // no conversation there is no one to ask.
    const promptGuide = (text) => {
      const phase = session.getState().phase;
      if (phase === 'connected') prompter.prompt(text);
      else if (phase === 'resting') {
        queuedRef.current.push(text);
        session.wake();
      }
    };
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
      // A streak or a struggle: the guide offers the next step. A resting
      // conversation wakes for it; with no conversation there is no one to ask.
      gameSignal: (signal) => promptGuide(formatCoachSignal(signal)),
      // Kyle, 2026-10-11: a miss is taught at once (what, where, why), with any struggle it completes.
      gameMiss: ({ signal, ...miss }) => promptGuide(formatMissPrompt(miss, signal)),
      // The first Play of a visit: the guide offers an example.
      firstPlay: () => promptGuide(formatFirstPlay()),
      canOffer: () => ['connected', 'resting'].includes(session.getState().phase),
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
  }, [session, scene, voiceEventsRef, prompter]);

  // On connecting, the guide learns what came before: the welcome it need not
  // repeat, the conversation so far if it woke from rest, the mode, and any
  // click that woke it. Then it rests after 30 s of quiet.
  useEffect(() => {
    restTimer.connected(state.phase === 'connected');
    if (state.phase !== 'connected') return;
    const events = voiceEventsRef.current;
    if (welcomeStateRef.current !== 'none') events?.welcomePlayed();
    if (connectedOnceRef.current) events?.resumed(stream.entries(), GUIDES.find((g) => g.id === guideRef.current)?.name ?? 'Guide');
    connectedOnceRef.current = true;
    events?.modeChanged(modeRef.current);
    const pending = pendingContextRef.current;
    pendingContextRef.current = [];
    for (const text of pending) session.sendContext(text);
    // Carried on mid-tour or mid-sentence: the guide picks up, with no greeting.
    const carried = carryOnRef.current;
    carryOnRef.current = null;
    const pickUp = carried ? formatCarryOn(carried) : null;
    if (pickUp) prompter.prompt(pickUp);
  }, [state.phase, voiceEventsRef, restTimer, stream, session, prompter]);

  // And whenever the mode changes while connected. Kyle, 2026-10-13: Study
  // begins with a fresh session, once the guide has finished its turn.
  const previousModeRef = useRef(mode);
  useEffect(() => {
    const from = previousModeRef.current;
    previousModeRef.current = mode;
    const current = sessionRef.current;
    if (!current) return;
    if (freshSessionOnModeChange({ from, to: mode, phase: current.getState().phase })) {
      const timing = studyHandoverTiming({
        guideSpeaking: guideSpeakingRef.current,
        msSinceTool: performance.now() - lastToolAtRef.current,
      });
      if (timing === 'now') {
        current.handOver();
        return;
      }
      if (studyHandoverRef.current) window.clearTimeout(studyHandoverRef.current);
      studyHandoverRef.current = window.setTimeout(() => {
        studyHandoverRef.current = null;
        sessionRef.current?.handOver();
      }, STUDY_HANDOVER_WAIT_MS);
    }
    if (current.getState().phase === 'connected') voiceEventsRef.current?.modeChanged(mode);
  }, [mode, voiceEventsRef]);
  useEffect(() => () => {
    if (studyHandoverRef.current) window.clearTimeout(studyHandoverRef.current);
  }, []);

  // A hidden tab rests the conversation soon after.
  useEffect(() => {
    const onVisibility = () => restTimer.hidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [restTimer]);

  // While a voice conversation rests, listen locally for the visitor to start
  // speaking, and wake it. Only the level is read; nothing leaves the page.
  useEffect(() => {
    if (state.phase !== 'resting' || state.mode !== 'voice') return undefined;
    let stopped = false;
    let micStream = null;
    let context = null;
    let timer = null;
    const onset = createSpeechOnset({
      onOnset: () => {
        if (stopped) return;
        stopped = true;
        session.wake();
      },
    });
    (async () => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stopped) return;
        context = new AudioContext();
        await context.resume().catch(() => {});
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(micStream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        timer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const value of samples) sum += value * value;
          onset.level(Math.sqrt(sum / samples.length) * 4);
        }, 50);
      } catch {
        // No microphone now: writing still wakes the guide.
      }
    })();
    return () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      micStream?.getTracks().forEach((track) => track.stop());
      context?.close().catch(() => {});
    };
  }, [state.phase, state.mode, session]);

  // The hatching answers the guide's voice, and the brain speaks like a
  // puppet (a beat on each syllable, a tilt on each phrase), unless anything
  // else is directing attention. Once its moves settle it floats: a drift
  // while something is lit, a slow turn when nothing is and the guide is
  // quiet, or while it waits after its introduction. Motion off stills all of
  // it. Each frame also streams the transcript to what has been heard.
  useEffect(() => {
    let frame;
    let last = performance.now();
    const puppet = createPuppet();
    const welcomeCues = createCueTracker();
    const liveCues = createLevelCues();
    const drift = createDrift();
    const reducedMotion = prefersReducedMotion();
    const idleTurnRate = (IDLE_TURN_DEGREES_PER_SECOND * Math.PI) / 180;
    const tick = (now) => {
      const dtSeconds = (now - last) / 1000;
      const level = session.outputLevel();
      scene.setVoiceLevel(Math.max(level, welcome.level()));
      // The level rising is the guide's audio being heard: the playback clock's start.
      follower.outputLevel(level);
      // The welcome streams on its own clock until it is done; then the follower's.
      const playback = welcomeStreamingRef.current ? welcome.playback() : follower.playback();
      if (welcomeStreamingRef.current && playback.done) welcomeStreamingRef.current = false;
      if (stream.tick(playback)) setEntries(stream.entries());
      if (welcomeStateRef.current !== 'none') {
        const next = welcome.active() ? (welcome.audible() ? 'audible' : 'silent') : 'done';
        if (next !== welcomeStateRef.current) {
          welcomeStateRef.current = next;
          setWelcomeState(next);
        }
      }
      const still = reducedMotion || !motionRef.current || stillnessRef.current;
      // The welcome tour: the brain faces the visitor on "Welcome.", then shows
      // each side and below, from the welcome's own clock.
      const spin = spinRef.current;
      if (spin) {
        // Before she speaks, the welcome's clock runs from when she will.
        const sinceVoice = welcome.position() ?? now - spin.voiceAt;
        const action = spin.cue.tick({
          elapsedMs: sinceVoice,
          active: welcome.active() || (spin.voicePending && !welcome.cutShort()),
          cut: welcome.cutShort(),
          touched: scene.controls.hasInteracted,
          still,
        });
        if (action === 'start') {
          // Timed from where the welcome has reached, so a late first frame never lags her words.
          const { tourAtMs } = welcomeTourTiming({ timeOf: (phrase) => welcome.timeOf(phrase), startedAtMs: sinceVoice });
          Promise.resolve(commandsRef.current.welcomeSpin({ tourAtMs }))
            .then((outcome) => {
              if (outcome?.ok) waitingRef.current = true;
            })
            .finally(() => spin.cue.done());
        } else if (action === 'home') {
          Promise.resolve(commandsRef.current.endWelcomeSpin()).then((outcome) => {
            if (outcome?.ok) waitingRef.current = true;
          });
        }
      }
      const lit = scene.getVoiceHighlight() !== null || scene.selectedRegionId >= 0;
      // Puppet speech: a beat on each syllable, a tilt on each phrase. The
      // welcome's cues come from its text, the live guide's from her voice
      // level; the brain keeps talking through the welcome tour.
      const liveCue = liveCues.step({ dtSeconds, level });
      const welcomeCue = welcomeCues.step(welcome.cues());
      const cue = welcome.active() ? welcomeCue : liveCue;
      const control = motionControl({ control: controlRef.current, touring: Boolean(spin?.cue.running()) });
      const strength = gestureStrength({ control, highlighted: lit, reducedMotion: still });
      const mode = floatMode({
        connected: session.getState().phase === 'connected',
        // After the introduction it turns slowly until the visitor takes hold.
        waiting: waitingRef.current && !scene.controls.hasInteracted,
        control: controlRef.current,
        lit,
        guideSpeaking: guideSpeakingRef.current,
        reducedMotion: still,
      });
      const speech = stepPuppet(puppet, { dtSeconds, ...cue, strength });
      const float = stepDrift(drift, { dtSeconds, active: mode === 'drift' });
      scene.setGesture({ yaw: float.yaw, pitch: speech.pitch + float.pitch, roll: speech.roll });
      scene.controls.setIdleTurn(mode === 'turn' ? idleTurnRate : 0);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      scene.setVoiceLevel(0);
      scene.setGesture({ yaw: 0, pitch: 0, roll: 0 });
      scene.controls.setIdleTurn(0);
    };
  }, [session, scene, follower, stream, welcome]);

  // Soon after the brain appears, and only once the page is seen, the brain
  // greets the visitor (Kyle, 2026-10-13): it turns from its side and snaps
  // round to face them, and "Hello!" lands on the snap, 1.2 s in. Aloud where
  // the browser allows it, otherwise as flowing text until the first tap. The
  // recording is fetched at once, so it plays on cue.
  useEffect(() => {
    let cancelled = false;
    let voiceTimer = null;
    const loading = welcome.load(guideRef.current);
    const speak = async () => {
      if (cancelled || welcome.cutShort()) return;
      stream.addGuide({ id: WELCOME_ID, text: welcome.text() });
      welcomeStreamingRef.current = true;
      setEntries(stream.entries());
      const heard = await welcome.start();
      if (spinRef.current) spinRef.current.voicePending = false;
      if (cancelled) return;
      welcomeStateRef.current = heard ? 'audible' : 'silent';
      if (heard) wantVoice(true);
      setWelcomeState(welcomeStateRef.current);
    };
    const clock = createArrivalClock({
      delayMs: WELCOME_DELAY_MS - WELCOME_GREETING_LEAD_MS,
      hidden: document.hidden,
      onDue: async () => {
        const loaded = await loading;
        if (cancelled) return;
        // No welcome to give: the brain simply turns slowly while it waits.
        if (!loaded) {
          waitingRef.current = true;
          return;
        }
        // The brain starts its greeting now; she speaks as it snaps round.
        spinRef.current = {
          cue: createSpinCue({ startMs: -WELCOME_GREETING_LEAD_MS }),
          voiceAt: performance.now() + WELCOME_GREETING_LEAD_MS,
          voicePending: true,
        };
        voiceTimer = setTimeout(speak, WELCOME_GREETING_LEAD_MS);
      },
    });
    const onVisibility = () => clock.visibility(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clock.dispose();
      if (voiceTimer !== null) clearTimeout(voiceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      // Silence it if it is playing. One that has not started is simply never
      // started here: a stop before the start would cancel it for good, and
      // React mounts this twice in development.
      if (welcome.position() !== null) welcome.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcome, stream]);

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
  useEffect(() => {
    if (guideRef.current === guide) return;
    guideRef.current = guide;
    welcome.stop();
    if (ACTIVE_PHASES.has(session.getState().phase)) session.switchGuideNow(guide);
    else session.changeGuide(guide);
  }, [guide, session, welcome]);

  // New lines keep the column at the bottom only while the reader is there.
  useLayoutEffect(() => {
    const element = transcriptRef.current;
    if (element && following) element.scrollTop = element.scrollHeight;
  }, [entries, following]);

  const name = GUIDES.find((g) => g.id === guide)?.name ?? 'your guide';
  const active = ACTIVE_PHASES.has(state.phase);

  const voiceConversation = state.mode === 'voice' && (active || state.phase === 'resting');

  const turnVoice = async (on) => {
    restTimer.activity();
    if (on) {
      wantVoice(true);
      stream.setVoice(true);
      // The first tap: the welcome's voice joins at the word its text has reached.
      if (welcome.active() && !welcome.audible()) await welcome.unlock();
      const current = session.getState();
      // A conversation in writing becomes a spoken one.
      if (current.phase === 'connected' && current.mode === 'text') session.end();
      if (!ACTIVE_PHASES.has(session.getState().phase)) session.start({ guide, mode: 'auto' });
      return;
    }
    wantVoice(false);
    welcome.mute();
    if (active || state.phase === 'resting') {
      stream.setVoice(false);
      session.end();
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    welcome.stop();
    restTimer.activity();
    stream.addVisitor({ id: nextLineId('typed'), text });
    refreshEntries();
    activityRef.current?.({ type: 'visitor' });
    const phase = session.getState().phase;
    if (phase === 'connected') {
      sdkRef.current.sendUserMessage(text);
      return;
    }
    queuedRef.current.push(text);
    if (phase === 'resting') session.wake();
    // Written words wake the guide in writing unless the visitor asked to hear it.
    else if (!ACTIVE_PHASES.has(phase)) session.start({ guide, mode: voiceWantedRef.current ? 'auto' : 'text' });
  };

  const notice = noticeFor(state.phase, state.message, name, {
    welcome: welcomeState === 'audible' || welcomeState === 'silent' ? welcomeState : null,
    micRefused: Boolean(state.micRefused),
    carryingOn: Boolean(state.carryingOn),
  });
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
      voice={{ on: voiceSwitchOn({ wanted: voiceWanted, conversation: voiceConversation, welcomeState }), onChange: turnVoice }}
      motion={motion}
      notice={notice ? { text: notice.text, onActivate: notice.invite ? () => turnVoice(true) : undefined } : null}
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
