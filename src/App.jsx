import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { BrainScene } from './utils/brainScene';
import { loadBrainModel } from './utils/brainLoader';
import { GameEngine } from './game/gameEngine';
import { ShatterWord, splitWordLines } from './components/ShatterWord';
import { VOICE_ENABLED } from './voice/flags';
import { GUIDES, normalizeGuide, readSavedGuide, saveGuide } from './voice/guides';
import { createBrainSceneAdapter } from './voice/brainSceneAdapter';
import { createSceneCommands } from './voice/sceneCommands';
import { createGameCommands } from './voice/gameCommands';
import { createGameCoach } from './game/coach';
import { gameLevel } from './game/levels';
import { createTourOffer, DEMO_FALL_SPEED, DEMO_TILT_DEGREES, demoWord } from './game/demo';
import { getRegionById } from './data/regions';
import { VoiceDebugPanel, shouldShowVoiceDebugPanel } from './voice/debugPanel';
import { SECTION_PLATE, plateBox, screenBounds, shouldCloseSection } from './sectionPlate.js';

const SECTION_STUDY_ONLY = 'The section opens only in Study mode. Invite the player to press Study the Brain.';
const SECTION_FADE = 'opacity 600ms ease';
import {
  ArrivalOptions,
  SettingsPanel,
  ToggleButton,
  getBarButtons,
  getStudyCaption,
  guideModeForPhase,
  initialGuide,
  initialMotion,
  shouldMountGuide,
  leaveStudy,
  playAction,
  sceneModeForPhase,
  shouldShowArrival,
  studyAction,
  ScoreDisplay,
  guideStillness,
  shouldOfferExample,
  NO_CHOICE,
  recordChoice,
} from './frontDoor.jsx';

// The ElevenLabs SDK loads only in the voice build.
const VoicePanel = lazy(() => import('./voice/VoicePanel.jsx'));

/** Viewport-height fraction/sec at 1.0× — half the former 0.08 base. */
const BASE_FALL_SPEED = 0.04;

export function shouldShowHeader(gamePhase) {
  return (
    gamePhase === 'ready' ||
    gamePhase === 'offer' ||
    gamePhase === 'countdown' ||
    gamePhase === 'paused'
  );
}

/** Hover/click region copy yields while the specimen is being gripped to orbit. */
export function getDescribedRegion({
  isNavigating = false,
  selectedRegion = null,
  guideFocus = null,
  hoveredRegion = null,
} = {}) {
  if (isNavigating) return null;
  // A click wins; the guide's focus beats a cursor that happens to rest on the brain.
  return selectedRegion || guideFocus || hoveredRegion;
}

/** The full text under the title: for a click or the guide's focus, never a hover. */
export function getDescribedText({ isNavigating = false, selectedRegion = null, guideFocus = null } = {}) {
  if (isNavigating) return null;
  return (selectedRegion || guideFocus)?.description ?? null;
}

// Like a browser agent's cursor: while the guide turns the brain, say so, and
// keep the open hand so the player knows they can take hold at any time.
export function getControlIndicator({ control, guide }) {
  const id = normalizeGuide(guide);
  if (control !== 'guide_moving' || !id) return null;
  const { name } = GUIDES.find((entry) => entry.id === id);
  return { text: `${name} is turning…`, cursor: 'grab' };
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function browserStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * App — Root component
 *
 * Victorian magazine UI frame around the 3D brain; falling words and game loop.
 */

export const STYLES = {
  container: {
    width: '100vw',
    height: '100dvh',
    minHeight: '100svh',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: "'Playfair Display', Georgia, serif",
    backgroundColor: '#f7f0dc',
    backgroundImage: "url('/parchment.png')",
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
  },
  stage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  canvas: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    inset: 0,
  },
  wordLayer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 5,
  },
  fallingWord: {
    position: 'absolute',
    fontFamily: "'Playfair Display', Georgia, serif",
    fontWeight: 700,
    fontSize: 'clamp(11px, 1.15vw, 13px)',
    letterSpacing: '0.18em',
    color: '#1a1814',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    lineHeight: 1.08,
    textAlign: 'center',
    textShadow: 'none',
    transform: 'translate(-50%, -50%)',
    maxWidth: '90vw',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
    zIndex: 10,
    pointerEvents: 'none',
    paddingTop: 'clamp(16px, 3vh, 28px)',
  },
  title: {
    fontSize: 'clamp(28px, 5vw, 42px)',
    fontWeight: 900,
    letterSpacing: '0.18em',
    color: '#1a1814',
    textTransform: 'uppercase',
    lineHeight: 1,
    margin: 0,
  },
  subtitle: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 'clamp(13px, 2vw, 15px)',
    fontWeight: 400,
    letterSpacing: '0.12em',
    color: '#4a4640',
    marginTop: 6,
  },
  rule: {
    width: 120,
    height: 1,
    background: '#1a1814',
    margin: '10px auto 0',
    opacity: 0.35,
  },
  controls: {
    position: 'absolute',
    bottom: 'clamp(18px, 3vh, 28px)',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    zIndex: 10,
    maxWidth: '96vw',
    padding: '0 8px',
  },
  descriptionPanel: {
    position: 'absolute',
    top: '50%',
    left: 'clamp(24px, 5vw, 64px)',
    transform: 'translateY(-50%)',
    width: 'clamp(180px, 22vw, 280px)',
    zIndex: 11,
    pointerEvents: 'none',
    textAlign: 'left',
  },
  hoverLabel: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 14,
    color: '#2a2820',
    letterSpacing: '0.08em',
    textShadow: '0 0 8px #fff, 0 0 16px #fff',
    marginBottom: 14,
  },
  // In the bottom bar, after Settings (Kyle, 2026-10-11).
  score: {
    alignSelf: 'center',
    marginLeft: 6,
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 14,
    letterSpacing: '0.1em',
    color: '#4a4640',
    pointerEvents: 'none',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  loading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 18,
    color: '#4a4640',
    letterSpacing: '0.1em',
    zIndex: 12,
  },
  factoid: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 1.55,
    color: '#2a2820',
    textAlign: 'left',
    letterSpacing: '0.04em',
    textShadow: '0 0 12px #fff, 0 0 24px #fff',
  },
  correction: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 1.55,
    color: '#5a4030',
    textAlign: 'left',
    letterSpacing: '0.04em',
    textShadow: '0 0 12px #fff, 0 0 24px #fff',
  },
  gamePrompt: {
    position: 'absolute',
    top: 'calc(50% + 96px)',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 12,
    textAlign: 'center',
  },
  studyCaption: {
    position: 'absolute',
    top: 'clamp(16px, 3vh, 28px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(420px, calc(100vw - 32px))',
    textAlign: 'center',
    zIndex: 10,
    pointerEvents: 'none',
  },
  studyCaptionTitle: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 'clamp(15px, 2.2vw, 19px)',
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: '#1a1814',
  },
  studyCaptionNote: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 1.45,
    color: '#5a4030',
    marginTop: 6,
  },
  controlIndicator: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 13,
    color: '#5a4030',
    marginTop: 4,
  },
  countdown: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 'clamp(52px, 10vw, 92px)',
    fontWeight: 900,
    color: '#1a1814',
    lineHeight: 1,
    textShadow: '0 0 16px #fff, 0 0 32px #fff',
  },
};

// Easy already names the lobe when a catch lands in the right neighbourhood, so
// the palette belongs on screen to teach it. Hard asks the player to find the
// region on the engraving alone, so the colour comes away with it.
export function colorModeForDifficulty(difficulty) {
  return difficulty === 'easy';
}

export default function App() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const gameRef = useRef(null);
  const wordRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const [difficulty, setDifficulty] = useState('easy');
  const [colorMode, setColorMode] = useState(() =>
    colorModeForDifficulty('easy')
  );
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  // What the voice guide is showing, for the left panel.
  const [guideFocus, setGuideFocus] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [score, setScore] = useState(0);
  const [brainReady, setBrainReady] = useState(false);
  const [activeWordLabel, setActiveWordLabel] = useState('');
  const [wordAnim, setWordAnim] = useState(null); // 'absorb' | null
  const [factoid, setFactoid] = useState(null);
  const [correction, setCorrection] = useState(null);
  const [shatter, setShatter] = useState(null);
  const [gamePhase, setGamePhase] = useState('ready');
  const [countdown, setCountdown] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Kyle, 2026-10-11: a Motion switch stops the brain turning.
  const [motionOn, setMotionOn] = useState(() => initialMotion(prefersReducedMotion()));
  // The midline section: the brain turns to its side and the plate is laid over it.
  const [sectionOpen, setSectionOpen] = useState(false);
  const [sectionBox, setSectionBox] = useState(null);
  const sectionApiRef = useRef(null);
  // Sylvi greets every visitor, unless Rollo was chosen before.
  const [guide, setGuide] = useState(() => initialGuide(readSavedGuide(browserStorage())));
  const studyReturnToRef = useRef('ready');
  const sceneCommandsRef = useRef(null);
  const sceneAdapterRef = useRef(null);
  // The voice panel's context reporter, while the panel is open.
  const voiceEventsRef = useRef(null);
  const [control, setControl] = useState('guide_free');
  // The guide's adapter reads App state from outside React's render cycle.
  const liveStateRef = useRef({});
  // Kyle, 2026-10-11: the guide can play an unscored example word.
  const [exampleRunning, setExampleRunning] = useState(false);
  // Kyle, 2026-10-11: Play and Study join the bar after the first choice; the score after the first Play.
  const [choice, setChoice] = useState(NO_CHOICE);
  liveStateRef.current = { gamePhase, colorMode, motionOn, sectionOpen, speedMultiplier, difficulty, exampleRunning };
  // On the first Play of a visit the guide offers an example; quiet starts the game.
  const firstPlayRef = useRef(true);
  const demoIndexRef = useRef(0);
  const runCountdownRef = useRef(null);
  const offerRef = useRef(null);
  if (!offerRef.current) {
    offerRef.current = createTourOffer({
      onStart: () => {
        if (liveStateRef.current.gamePhase === 'offer') runCountdownRef.current?.();
      },
    });
  }
  const onGuideActivity = useCallback((event) => {
    if (event.type === 'speaking') offerRef.current.guideSpeaking(event.value);
    else if (event.type === 'visitor') offerRef.current.visitorSpoke();
  }, []);
  // The guide presses the same Play and Study controls the player does.
  const modeApiRef = useRef(null);
  // Kyle, 2026-10-11: the coach notices streaks and struggles; the guide offers the next step.
  const coachRef = useRef(null);
  if (!coachRef.current) coachRef.current = createGameCoach();
  const gameSettings = () => ({
    speed: liveStateRef.current.speedMultiplier,
    colour: liveStateRef.current.colorMode,
    exact: liveStateRef.current.difficulty === 'hard',
  });
  const coachResult = (outcome) => {
    const signal = coachRef.current.result(outcome, gameSettings());
    if (signal) voiceEventsRef.current?.gameSignal?.(signal);
  };

  // Picking a difficulty resets the palette to that difficulty's default. The
  // Colour Regions toggle still overrides it afterwards, so a player who wants
  // the hues in hard mode can have them.
  const chooseDifficulty = useCallback((mode) => {
    setDifficulty(mode);
    setColorMode(colorModeForDifficulty(mode));
  }, []);

  const handleHover = useCallback((region) => {
    setHoveredRegion(region);
  }, []);

  const handleRegionSelect = useCallback((region) => {
    setSelectedRegion(region);
    sceneAdapterRef.current?.playerSelected(region?.id ?? null);
    if (region) voiceEventsRef.current?.regionClicked(region);
  }, []);

  const handleNavigatingChange = useCallback((navigating) => {
    setIsNavigating(navigating);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const brainScene = new BrainScene(mountRef.current, {
      onHoverChange: handleHover,
      onRegionSelect: handleRegionSelect,
      onNavigatingChange: handleNavigatingChange,
    });
    sceneRef.current = brainScene;
    // StrictMode mounts this effect twice in development; a discarded scene's
    // model can finish loading after its replacement, so it must not attach.
    let disposed = false;
    // Atlas work needs to drive the viewer from outside React: setting a known
    // orbit angle and reading back what the surface shows there is how a paint
    // change is checked against the model rather than against a memory of it.
    if (import.meta.env.DEV) window.__brainScene = brainScene;

    loadBrainModel('/brain.glb')
      .then(({ group, faceCount, vertexCount, atlasVertexAttributesValid }) => {
        brainScene.addBrainGeometry(group);
        console.info(
          `[Brain Game] Loaded specimen — ${Math.round(faceCount)} faces, ${vertexCount} verts`
        );
        if (!atlasVertexAttributesValid) {
          console.warn(
            '[Brain Game] GLB COLOR_1 atlas is absent or invalid; interactions use the canonical UV mask.'
          );
        }

        const game = new GameEngine(brainScene, {
          difficulty: 'easy',
          onScoreChange: (s) => setScore(s),
          onWordDrop: (entry) => {
            setActiveWordLabel(entry.word);
            setWordAnim(null);
            setCorrection(null);
          },
          onCorrect: ({ factoid: text, region, targetRegion, matchedBy, demo }) => {
            if (!demo) coachResult('correct');
            setFactoid(text);
            setWordAnim('absorb');
            // In easy mode the lobe is enough to score, so name the precise
            // region that was sought; the catch still teaches the anatomy.
            setCorrection(
              matchedBy === 'division' && targetRegion
                ? `Precisely: ${targetRegion.name}`
                : null
            );
            // Illuminate what was sought, so the eye learns the right area.
            brainScene.beginHighlightFeedback(
              (matchedBy === 'division' ? targetRegion?.id : region?.id) ?? -1,
              2400,
              { warm: true }
            );
            window.setTimeout(() => setFactoid(null), 4000);
            window.setTimeout(() => setCorrection(null), 4000);
            window.setTimeout(() => {
              setWordAnim(null);
              setActiveWordLabel('');
            }, 500);
          },
          onIncorrect: ({ word, correctRegion, demo }) => {
            brainScene.beginHighlightFeedback(correctRegion?.id ?? -1, 2500);
            // The guide teaches the miss in one sentence. An example is not the player's miss.
            if (correctRegion && !demo) voiceEventsRef.current?.gameMiss?.({ word: word.word, region: correctRegion.name });
            if (!demo) coachResult('wrong');
            setCorrection(
              correctRegion
                ? `Rather: ${correctRegion.name}${correctRegion.subtitle ? ` — ${correctRegion.subtitle}` : ''}`
                : null
            );
            const id = `${word.word}-${Date.now()}`;
            setActiveWordLabel('');
            setShatter({
              id,
              text: word.word,
              x: game.wordPosition.x,
              y: game.wordPosition.y,
            });
            window.setTimeout(() => setCorrection(null), 3000);
          },
          onMiss: ({ word, correctRegion, demo }) => {
            brainScene.beginHighlightFeedback(correctRegion?.id ?? -1, 2000);
            if (correctRegion && word && !demo) voiceEventsRef.current?.gameMiss?.({ word: word.word, region: correctRegion.name });
            if (!demo) coachResult('miss');
            setCorrection(
              correctRegion
                ? `It sought ${correctRegion.name}`
                : null
            );
            window.setTimeout(() => setCorrection(null), 2500);
          },
        });
        gameRef.current = game;
        if (VOICE_ENABLED && !disposed) {
          const adapter = createBrainSceneAdapter({
            scene: brainScene,
            // While an example plays, nothing else may move or light the brain.
            getMode: () => (liveStateRef.current.exampleRunning ? 'game' : sceneModeForPhase(liveStateRef.current.gamePhase)),
            getColourRegions: () => liveStateRef.current.colorMode,
            setColourRegions: (value) => setColorMode(value),
            onGuideFocus: setGuideFocus,
          });
          sceneAdapterRef.current = adapter;
          sceneCommandsRef.current = createSceneCommands(adapter, {
            onUserInteraction: (event) => voiceEventsRef.current?.userInteraction(event),
            onControlChange: setControl,
            onTourEvent: (event) => voiceEventsRef.current?.tourEvent?.(event),
            // Each arrival shows the shape of what was lit, once.
            showcase: true,
            motionAllowed: () => liveStateRef.current.motionOn,
            // The guide opens and closes the section through the page.
            section: {
              open: () => sectionApiRef.current?.open() ?? { ok: false, reason: SECTION_STUDY_ONLY },
              close: () => sectionApiRef.current?.close(),
              isOpen: () => Boolean(liveStateRef.current.sectionOpen),
            },
            reducedMotion: prefersReducedMotion,
          });
          // Kyle, 2026-10-11: the guide sets the game's speed and difficulty and
          // switches modes. None of it moves or lights the brain.
          Object.assign(
            sceneCommandsRef.current,
            createGameCommands({
              getPhase: () => liveStateRef.current.gamePhase,
              getReturnTo: () => studyReturnToRef.current,
              getSettings: () => ({
                speed: liveStateRef.current.speedMultiplier,
                colour: liveStateRef.current.colorMode,
                exact: liveStateRef.current.difficulty === 'hard',
              }),
              setSpeed: (value) => {
                liveStateRef.current.speedMultiplier = value;
                setSpeedMultiplier(value);
              },
              // Unlike the Settings choice, the guide's step leaves the colours alone.
              setExact: (exact) => {
                liveStateRef.current.difficulty = exact ? 'hard' : 'easy';
                setDifficulty(exact ? 'hard' : 'easy');
              },
              perform: (action) => modeApiRef.current?.perform(action),
              getFallingWord: () => gameRef.current?.fallingWord() ?? null,
              motionAllowed: () => liveStateRef.current.motionOn,
              playDemo: () => playDemoRef.current?.() ?? { ok: false, reason: 'I have not loaded yet.' },
            })
          );
          if (import.meta.env.DEV) window.__sceneCommands = sceneCommandsRef.current;
        }
        setBrainReady(true);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load brain model:', err);
        setError(
          'Brain model not found. Place your GLB file at /public/brain.glb — see README for details.'
        );
        setLoading(false);
      });

    return () => {
      disposed = true;
      sceneCommandsRef.current?.dispose?.();
      sceneCommandsRef.current = null;
      sceneAdapterRef.current = null;
      gameRef.current?.dispose();
      gameRef.current = null;
      window.clearTimeout(countdownTimerRef.current);
      brainScene.dispose();
      sceneRef.current = null;
      setBrainReady(false);
    };
  }, [handleHover, handleRegionSelect, handleNavigatingChange]);

  useEffect(() => () => window.clearTimeout(countdownTimerRef.current), []);

  useEffect(() => {
    if (!brainReady) return;

    let frameId;
    let last = performance.now();

    const tick = (now) => {
      frameId = requestAnimationFrame(tick);
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;

      const game = gameRef.current;
      if (game?.isPlaying && wordRef.current && game.currentWord) {
        game.update(dt);
        wordRef.current.style.left = `${game.wordPosition.x * 100}%`;
        wordRef.current.style.top = `${game.wordPosition.y * 100}%`;

      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [brainReady]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setColorMode(colorMode);
    }
  }, [colorMode]);

  // Motion off: the specimen's own slow turn stops too, and any move in flight.
  useEffect(() => {
    if (motionOn || !brainReady || !sceneRef.current) return;
    sceneRef.current.controls.stopAutoRotate();
    sceneRef.current.controls.cancelMove?.('stopped');
  }, [motionOn, brainReady]);


  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.setDifficulty(difficulty);
    }
  }, [difficulty]);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.setFallSpeed(BASE_FALL_SPEED * speedMultiplier);
    }
  }, [speedMultiplier, brainReady]);

  // A change of speed, difficulty or colour is a new level: the coach counts afresh.
  useEffect(() => {
    coachRef.current.settingsChanged();
  }, [speedMultiplier, difficulty, colorMode]);

  const runCountdown = () => {
    if (!gameRef.current) return;
    coachRef.current.reset();
    setGamePhase('countdown');
    setCountdown(3);
    countdownTimerRef.current = window.setTimeout(() => {
      setCountdown(2);
      countdownTimerRef.current = window.setTimeout(() => {
        setCountdown(1);
        countdownTimerRef.current = window.setTimeout(() => {
          gameRef.current?.start();
          setCountdown(null);
          setGamePhase('playing');
        }, 1000);
      }, 1000);
    }, 1000);
  };

  const togglePause = () => {
    const game = gameRef.current;
    if (!game) return;

    if (gamePhase === 'playing') {
      game.pause();
      setGamePhase('paused');
    } else if (gamePhase === 'paused') {
      game.resume();
      setGamePhase('playing');
    }
  };

  const enterStudy = (returnTo) => {
    studyReturnToRef.current = returnTo;
    sceneRef.current?.enterStudyMode();
    setSelectedRegion(null);
    setGamePhase('study');
  };

  runCountdownRef.current = runCountdown;

  // The first Play of a visit: the guide offers an example, and quiet starts the game.
  const beginGame = (fromPlayer) => {
    const offer = fromPlayer && shouldOfferExample({ firstPlay: firstPlayRef.current, conversation: Boolean(voiceEventsRef.current?.canOffer?.()) });
    firstPlayRef.current = false;
    if (!offer) {
      runCountdown();
      return;
    }
    liveStateRef.current.gamePhase = 'offer';
    setGamePhase('offer');
    offerRef.current.begin();
    voiceEventsRef.current?.firstPlay?.();
  };

  const handlePlay = (fromPlayer = true) => {
    if (!brainReady) return;
    setSettingsOpen(false);
    setChoice((previous) => recordChoice(previous, 'play'));
    const action = playAction(gamePhase, studyReturnToRef.current);
    if (action === 'start') beginGame(fromPlayer);
    else if (action === 'start-now') {
      offerRef.current.cancel();
      runCountdown();
    } else if (action === 'pause' || action === 'resume') togglePause();
    else if (action === 'leave-study-and-start') {
      // The game never inherits the guide's highlight.
      sceneAdapterRef.current?.resetForGame();
      beginGame(fromPlayer);
    } else if (action === 'leave-study-and-resume') {
      sceneAdapterRef.current?.resetForGame();
      gameRef.current?.resume();
      setGamePhase('playing');
    }
  };

  const handleStudy = () => {
    if (!brainReady) return;
    setSettingsOpen(false);
    setChoice((previous) => recordChoice(previous, 'study'));
    const action = studyAction(gamePhase);
    if (action === 'enter') {
      if (gamePhase === 'offer') offerRef.current.cancel();
      enterStudy(gamePhase === 'offer' ? 'ready' : gamePhase);
    }
    else if (action === 'pause-and-enter') {
      gameRef.current?.pause();
      enterStudy('paused');
    } else if (action === 'leave') {
      const next = leaveStudy(studyReturnToRef.current);
      if (next === 'paused') sceneAdapterRef.current?.resetForGame();
      setGamePhase(next);
    }
  };

  // The guide's switch_mode presses the same controls; a game it starts needs no offer.
  modeApiRef.current = {
    perform(action) {
      if (['start', 'start-now', 'resume', 'leave-study-and-start', 'leave-study-and-resume'].includes(action)) handlePlay(false);
      else if (['enter', 'pause-and-enter', 'leave'].includes(action)) handleStudy();
      else if (action === 'cancel-offer') {
        offerRef.current.cancel();
        setGamePhase('ready');
      }
    },
  };

  // The guide's example: turn the word's region up, drop the word, let it land. Unscored.
  const playDemoRef = useRef(null);
  playDemoRef.current = async () => {
    const game = gameRef.current;
    const commands = sceneCommandsRef.current;
    if (!game || !commands?.turnRegionUp) return { ok: false, reason: 'I have not loaded yet.' };
    if (liveStateRef.current.exampleRunning) return { ok: false, reason: 'An example is already playing.' };
    const entry = demoWord(demoIndexRef.current);
    demoIndexRef.current += 1;
    liveStateRef.current.exampleRunning = true;
    setExampleRunning(true);
    offerRef.current.exampleStarted();
    try {
      const turned = await commands.turnRegionUp(entry.targetRegion, { tiltDegrees: DEMO_TILT_DEGREES });
      if (!turned.ok) return { ok: false, reason: turned.reason };
      const landed = await game.playDemo(entry, { fallSpeed: DEMO_FALL_SPEED });
      return {
        ok: true,
        word: entry.word,
        region: getRegionById(entry.targetRegion)?.name,
        outcome: landed.outcome,
        landed: landed.regionId != null ? getRegionById(landed.regionId)?.name ?? null : null,
      };
    } finally {
      liveStateRef.current.exampleRunning = false;
      setExampleRunning(false);
      if (liveStateRef.current.gamePhase === 'offer') offerRef.current.exampleEnded();
    }
  };

  const closeSection = () => {
    liveStateRef.current.sectionOpen = false;
    setSectionOpen(false);
  };

  const openSection = async () => {
    if (liveStateRef.current.gamePhase !== 'study') return { ok: false, reason: SECTION_STUDY_ONLY };
    const commands = sceneCommandsRef.current;
    const scene = sceneRef.current;
    if (!commands?.turnToSide || !scene) return { ok: false, reason: 'I have not loaded yet.' };
    if (liveStateRef.current.sectionOpen) return { ok: true };
    const turned = await commands.turnToSide(SECTION_PLATE.view);
    if (!turned.ok) return turned;
    const bounds = screenBounds(scene.projectedPoints());
    if (!bounds) return { ok: false, reason: 'The section could not be placed.' };
    setSectionBox(bounds);
    liveStateRef.current.sectionOpen = true;
    setSectionOpen(true);
    return { ok: true };
  };
  sectionApiRef.current = { open: openSection, close: closeSection };

  const handleSection = () => {
    setSettingsOpen(false);
    if (liveStateRef.current.sectionOpen) closeSection();
    else openSection();
  };

  // The plate belongs to Study and to a still brain.
  useEffect(() => {
    if (sectionOpen && shouldCloseSection({ gamePhase, control })) closeSection();
  }, [sectionOpen, gamePhase, control]);

  // The guide hears when the section opens or closes, whoever opened it.
  const sectionReportedRef = useRef(false);
  useEffect(() => {
    if (sectionReportedRef.current === sectionOpen) return;
    sectionReportedRef.current = sectionOpen;
    voiceEventsRef.current?.sectionChanged?.(sectionOpen);
  }, [sectionOpen]);

  // Escape closes it; a resized window re-lays it over the brain.
  useEffect(() => {
    if (!sectionOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') closeSection();
    };
    const onResize = () => {
      const bounds = sceneRef.current && screenBounds(sceneRef.current.projectedPoints());
      if (bounds) setSectionBox(bounds);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [sectionOpen]);

  const changeGuide = (guideId) => {
    saveGuide(browserStorage(), guideId);
    setGuide(guideId);
  };

  // Settings closes with Escape, like any disclosure.
  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  const studyCaption = gamePhase === 'study' ? getStudyCaption(VOICE_ENABLED ? guide : null) : null;
  const controlIndicator = getControlIndicator({ control, guide });
  const showVoiceDebug = shouldShowVoiceDebugPanel({
    voiceEnabled: VOICE_ENABLED,
    search: typeof window === 'undefined' ? undefined : window.location.search,
  });

  const describedRegion = getDescribedRegion({
    isNavigating,
    selectedRegion,
    guideFocus,
    hoveredRegion,
  });
  const describedText = getDescribedText({ isNavigating, selectedRegion, guideFocus });
  const showArrival = shouldShowArrival({ gamePhase, brainReady, selectedRegion, chosen: choice.chosen });
  const barButtons = getBarButtons({
    gamePhase,
    brainReady,
    colorMode,
    settingsOpen,
    sectionOpen,
    sectionAvailable: VOICE_ENABLED,
    chosen: choice.chosen,
  });
  const barActions = {
    colour: () => setColorMode(!colorMode),
    play: () => handlePlay(true),
    study: handleStudy,
    section: handleSection,
    settings: () => setSettingsOpen((open) => !open),
  };
  const guideName = VOICE_ENABLED ? GUIDES.find((entry) => entry.id === guide)?.name ?? null : null;

  return (
    <div style={STYLES.container}>
      <div style={STYLES.stage}>
        <div
          ref={mountRef}
          style={{
            ...STYLES.canvas,
            ...(controlIndicator ? { cursor: controlIndicator.cursor } : {}),
            // The 3D brain gives way to the section plate.
            opacity: sectionOpen ? 0 : 1,
            transition: SECTION_FADE,
          }}
        />
        {VOICE_ENABLED && gamePhase === 'study' && (
          <img
            className="section-plate"
            src={SECTION_PLATE.src}
            alt={sectionOpen ? SECTION_PLATE.alt : ''}
            aria-hidden={!sectionOpen}
            draggable={false}
            style={{
              ...(sectionBox ? plateBox(sectionBox) : { position: 'absolute', display: 'none' }),
              // Ink on the page: the drawing's white paper takes the parchment's tone.
              mixBlendMode: 'multiply',
              opacity: sectionOpen ? 1 : 0,
              transition: SECTION_FADE,
              pointerEvents: sectionOpen ? 'auto' : 'none',
              userSelect: 'none',
              zIndex: 4,
            }}
          />
        )}
        <div style={STYLES.wordLayer}>
          {activeWordLabel && (
            <div
              ref={wordRef}
              className={wordAnim === 'absorb' ? 'word-absorb' : undefined}
              style={STYLES.fallingWord}
            >
              {splitWordLines(activeWordLabel).map((line, index) => (
                <span key={`${line}-${index}`}>{line}</span>
              ))}
            </div>
          )}
          {shatter && (
            <ShatterWord
              key={shatter.id}
              text={shatter.text}
              x={shatter.x}
              y={shatter.y}
              onComplete={() => setShatter((s) => (s?.id === shatter.id ? null : s))}
            />
          )}
        </div>
      </div>

      {shouldShowHeader(gamePhase) && (
        <div
          className={gamePhase === 'countdown' ? 'title-fold-up' : undefined}
          style={STYLES.header}
        >
          <h1 className="app-title" style={STYLES.title}>Brain Game</h1>
          <div className="app-subtitle" style={STYLES.subtitle}>
            A Study in Cognition
          </div>
          <div style={STYLES.rule} />
          {controlIndicator && gamePhase === 'ready' && (
            <div className="control-indicator" style={STYLES.controlIndicator}>
              {controlIndicator.text}
            </div>
          )}
        </div>
      )}

      {loading && <div style={STYLES.loading}>Preparing the specimen...</div>}
      {error && (
        <div
          style={{
            ...STYLES.loading,
            color: '#8b4040',
            fontSize: 14,
            maxWidth: 400,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      {gamePhase === 'countdown' && (
        <div className="game-prompt" style={STYLES.gamePrompt} aria-live="assertive">
          <div style={STYLES.countdown}>{countdown}</div>
        </div>
      )}

      {(showArrival ||
        describedRegion ||
        factoid ||
        correction) && (
        <div className="description-panel" style={STYLES.descriptionPanel}>
          {showArrival && !describedRegion && (
            <ArrivalOptions guideName={guideName} onStudy={handleStudy} onPlay={() => handlePlay(true)} />
          )}
          {describedRegion && (
            <div className="region-description" style={STYLES.hoverLabel}>
              <span
                style={{
                  display: 'block',
                  color: '#1a1814',
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: 'normal',
                  fontWeight: 600,
                }}
              >
                {describedRegion.subtitle || describedRegion.name}
              </span>
              {describedRegion.subtitle && (
                <span style={{ display: 'block', opacity: 0.65, marginTop: 4 }}>
                  {describedRegion.name}
                </span>
              )}
              {describedText && (
                <span
                  style={{
                    display: 'block',
                    marginTop: 12,
                    fontStyle: 'normal',
                    lineHeight: 1.55,
                    letterSpacing: '0.03em',
                  }}
                >
                  {describedText}
                </span>
              )}
            </div>
          )}
          {!showArrival && factoid && (
            <div className="region-description" style={STYLES.factoid}>{factoid}</div>
          )}
          {!showArrival && !factoid && correction && (
            <div className="region-description" style={STYLES.correction}>{correction}</div>
          )}
        </div>
      )}

      <div className="game-controls" style={STYLES.controls}>
        {barButtons.map((button) => (
          <ToggleButton
            key={button.id}
            className={`bar-${button.id}`}
            label={button.label}
            active={button.id === 'settings' ? button.expanded : button.pressed}
            disabled={button.disabled}
            onClick={barActions[button.id]}
            {...(button.id === 'settings'
              ? { 'aria-expanded': button.expanded, 'aria-controls': 'settings-panel' }
              : {})}
            compact
          />
        ))}
        {choice.played && (
          <ScoreDisplay
            score={score}
            level={gameLevel({ speed: speedMultiplier, colour: colorMode, exact: difficulty === 'hard' }).label}
            gamePhase={gamePhase}
            style={STYLES.score}
          />
        )}
      </div>

      {settingsOpen && (
        <SettingsPanel
          voiceEnabled={VOICE_ENABLED}
          guide={guide}
          onGuide={changeGuide}
          difficulty={difficulty}
          onDifficulty={chooseDifficulty}
          speed={speedMultiplier}
          onSpeed={setSpeedMultiplier}
        />
      )}

      {showVoiceDebug && (
        <VoiceDebugPanel
          visible
          commands={brainReady ? sceneCommandsRef.current : null}
        />
      )}

      {studyCaption && (
        <div className="study-caption" style={STYLES.studyCaption} aria-live="polite">
          <div style={STYLES.studyCaptionTitle}>{studyCaption.title}</div>
          <div style={STYLES.studyCaptionNote}>{studyCaption.note}</div>
          {controlIndicator && (
            <div className="control-indicator" style={STYLES.controlIndicator}>
              {controlIndicator.text}
            </div>
          )}
        </div>
      )}

      {shouldMountGuide({ voiceEnabled: VOICE_ENABLED, brainReady, commandsReady: Boolean(sceneCommandsRef.current) }) && (
        <Suspense fallback={null}>
          <VoicePanel
            guide={guide}
            commands={sceneCommandsRef.current}
            scene={sceneRef.current}
            voiceEventsRef={voiceEventsRef}
            control={control}
            motion={{ on: motionOn, onChange: setMotionOn }}
            stillness={guideStillness({ gamePhase, sectionOpen, exampleRunning })}
            onGuideActivity={onGuideActivity}
            mode={guideModeForPhase(gamePhase)}
          />
        </Suspense>
      )}

    </div>
  );
}
