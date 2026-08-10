import { useState, useEffect, useRef, useCallback } from 'react';
import { BrainScene } from './utils/brainScene';
import { loadBrainModel } from './utils/brainLoader';
import { GameEngine } from './game/gameEngine';
import { ShatterWord, splitWordLines } from './components/ShatterWord';

const BASE_FALL_SPEED = 0.08;

export function shouldShowHeader(gamePhase) {
  return (
    gamePhase === 'ready' ||
    gamePhase === 'countdown' ||
    gamePhase === 'paused'
  );
}

export function shouldShowInstructions(gamePhase, selectedRegion = null) {
  return gamePhase === 'ready' && !selectedRegion;
}

export function getPrimaryControl(gamePhase, brainReady) {
  if (gamePhase === 'ready') {
    return brainReady
      ? { label: 'Begin', active: true, action: 'start' }
      : null;
  }
  if (gamePhase === 'playing' || gamePhase === 'paused') {
    return {
      label: gamePhase === 'paused' ? 'Resume' : 'Pause',
      active: gamePhase === 'paused',
      mobileActive: true,
      action: 'pause',
    };
  }
  return null;
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
  speedControl: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  speedLabel: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 10,
    letterSpacing: '0.1em',
    color: '#2a2820',
    textTransform: 'uppercase',
  },
  speedSlider: {
    width: 'clamp(54px, 6vw, 76px)',
    margin: 0,
    cursor: 'pointer',
  },
  speedValue: {
    minWidth: 27,
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 10,
    color: '#2a2820',
    textAlign: 'right',
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
  instructionTitle: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: '#1a1814',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  instructionBody: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 16,
    lineHeight: 1.55,
    letterSpacing: '0.03em',
    color: '#3d3932',
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
  score: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 14,
    letterSpacing: '0.1em',
    color: '#4a4640',
    zIndex: 10,
    pointerEvents: 'none',
    textTransform: 'uppercase',
  },
  scorePosition: {
    position: 'absolute',
    bottom: 'clamp(18px, 3vh, 28px)',
    right: 'clamp(24px, 5vw, 64px)',
  },
  rightControls: {
    position: 'absolute',
    bottom: 'clamp(18px, 3vh, 28px)',
    right: 'calc(clamp(24px, 5vw, 64px) + 92px)',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  mobileSettingsToggle: {
    display: 'none',
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 14,
    width: 40,
    height: 40,
    padding: '12px 11px',
    flexDirection: 'column',
    justifyContent: 'space-between',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    boxShadow: 'none',
  },
  mobileSettingsLine: {
    display: 'block',
    width: '100%',
    height: 1,
    background: 'rgba(26, 24, 20, 0.62)',
  },
  settingsPanel: {
    display: 'contents',
  },
  difficulty: {
    position: 'absolute',
    bottom: 'clamp(18px, 3vh, 28px)',
    left: 'clamp(24px, 5vw, 64px)',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  difficultyLabel: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 12,
    letterSpacing: '0.1em',
    color: '#4a4640',
    textTransform: 'uppercase',
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
  startButton: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 'clamp(13px, 2vw, 16px)',
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    padding: '12px 24px',
    background: '#1a1814',
    color: '#f5f0e8',
    border: '1px solid #1a1814',
    cursor: 'pointer',
    boxShadow: '3px 3px 0 rgba(26, 24, 20, 0.2)',
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

function ToggleButton({
  label,
  active,
  onClick,
  compact = false,
  mini = false,
  className,
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: mini ? 8 : compact ? 10 : 11,
        fontWeight: 400,
        letterSpacing: mini ? '0.06em' : '0.1em',
        textTransform: 'uppercase',
        padding: mini ? '2px 7px' : compact ? '4px 10px' : '6px 14px',
        background: active ? '#1a1814' : 'transparent',
        color: active ? '#f5f0e8' : '#1a1814',
        border: '1px solid #1a1814',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
      }}
    >
      {label}
    </button>
  );
}

export default function App() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const gameRef = useRef(null);
  const wordRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const [colorMode, setColorMode] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [difficulty, setDifficulty] = useState('easy');
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
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
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  const handleHover = useCallback((region) => {
    setHoveredRegion(region);
  }, []);

  const handleRegionSelect = useCallback((region) => {
    setSelectedRegion(region);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const brainScene = new BrainScene(mountRef.current, {
      onHoverChange: handleHover,
      onRegionSelect: handleRegionSelect,
    });
    sceneRef.current = brainScene;
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
          onCorrect: ({ factoid: text, region, targetRegion, matchedBy }) => {
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
          onIncorrect: ({ word, correctRegion }) => {
            brainScene.beginHighlightFeedback(correctRegion?.id ?? -1, 2500);
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
          onMiss: ({ correctRegion }) => {
            brainScene.beginHighlightFeedback(correctRegion?.id ?? -1, 2000);
            setCorrection(
              correctRegion
                ? `It sought ${correctRegion.name}`
                : null
            );
            window.setTimeout(() => setCorrection(null), 2500);
          },
        });
        gameRef.current = game;
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
      gameRef.current?.dispose();
      gameRef.current = null;
      window.clearTimeout(countdownTimerRef.current);
      brainScene.dispose();
      sceneRef.current = null;
      setBrainReady(false);
    };
  }, [handleHover, handleRegionSelect]);

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

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setLabelsVisible(showLabels);
    }
  }, [showLabels, brainReady]);

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

  const startGame = () => {
    if (!gameRef.current || gamePhase !== 'ready') return;

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

  const describedRegion = selectedRegion || hoveredRegion;
  const showInstructions = shouldShowInstructions(gamePhase, selectedRegion);
  const primaryControl = getPrimaryControl(gamePhase, brainReady);

  return (
    <div style={STYLES.container}>
      <div style={STYLES.stage}>
        <div ref={mountRef} style={STYLES.canvas} />
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
        </div>
      )}

      <button
        type="button"
        className="mobile-settings-toggle"
        aria-label={`${mobileSettingsOpen ? 'Close' : 'Open'} game settings`}
        aria-expanded={mobileSettingsOpen}
        aria-controls="mobile-settings-panel"
        onClick={() => setMobileSettingsOpen((open) => !open)}
        style={STYLES.mobileSettingsToggle}
      >
        {[0, 1, 2].map((line) => (
          <span key={line} aria-hidden="true" style={STYLES.mobileSettingsLine} />
        ))}
      </button>

      <div
        id="mobile-settings-panel"
        className={`mobile-settings-panel${mobileSettingsOpen ? ' is-open' : ''}`}
        style={STYLES.settingsPanel}
      >
        <div className="difficulty-controls" style={STYLES.difficulty}>
          <span style={STYLES.difficultyLabel}>Difficulty</span>
          {['easy', 'hard'].map((mode) => (
            <ToggleButton
              key={mode}
              label={mode === 'easy' ? 'Easy' : 'Hard'}
              active={difficulty === mode}
              onClick={() => setDifficulty(mode)}
              mini
            />
          ))}
        </div>

        <div className="right-controls" style={STYLES.rightControls}>
          <label className="speed-control" style={STYLES.speedControl}>
            <span className="speed-label" style={STYLES.speedLabel}>Speed</span>
            <input
              className="speed-slider"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speedMultiplier}
              onChange={(event) =>
                setSpeedMultiplier(Number(event.target.value))
              }
              aria-label="Falling word speed"
              aria-valuetext={`${speedMultiplier.toFixed(1)} times`}
              style={STYLES.speedSlider}
            />
            <span className="speed-value" style={STYLES.speedValue}>
              {speedMultiplier.toFixed(1)}×
            </span>
          </label>
        </div>
      </div>
      <div className="score-display" style={{ ...STYLES.score, ...STYLES.scorePosition }}>
        Score: {score}
      </div>

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

      {brainReady && gamePhase === 'ready' && (
        <div className="game-prompt ready-prompt" style={STYLES.gamePrompt}>
          <button
            type="button"
            className="start-button"
            onClick={startGame}
            style={STYLES.startButton}
          >
            Begin
          </button>
        </div>
      )}
      {gamePhase === 'countdown' && (
        <div className="game-prompt" style={STYLES.gamePrompt} aria-live="assertive">
          <div style={STYLES.countdown}>{countdown}</div>
        </div>
      )}

      {(showInstructions ||
        describedRegion ||
        factoid ||
        correction) && (
        <div className="description-panel" style={STYLES.descriptionPanel}>
          {showInstructions && (
            <div>
              <div style={STYLES.instructionTitle}>How to Play</div>
              <div className="instruction-body" style={STYLES.instructionBody}>
                <p style={{ marginBottom: 10 }}>
                  Welcome to the Brain Game, a study in anatomy and cognition.
                </p>
                <p style={{ marginBottom: 10 }}>
                  Rotate the brain to guide each falling word to its rightful
                  region. A correct catch illuminates the area; a wrong one
                  shatters into the void below.
                </p>
                <p>
                  Toggle Colour Regions to reveal each area&apos;s hue. Pause
                  at any time to explore the brain freely, region by region.
                </p>
              </div>
            </div>
          )}
          {!showInstructions && describedRegion && (
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
              {selectedRegion && (
                <span
                  style={{
                    display: 'block',
                    marginTop: 12,
                    fontStyle: 'normal',
                    lineHeight: 1.55,
                    letterSpacing: '0.03em',
                  }}
                >
                  {selectedRegion.description}
                </span>
              )}
            </div>
          )}
          {!showInstructions && factoid && (
            <div className="region-description" style={STYLES.factoid}>{factoid}</div>
          )}
          {!showInstructions && !factoid && correction && (
            <div className="region-description" style={STYLES.correction}>{correction}</div>
          )}
        </div>
      )}

      <div className="game-controls" style={STYLES.controls}>
        {primaryControl && (
          <ToggleButton
            className={
              primaryControl.action === 'start'
                ? 'primary-game-control mobile-primary-control'
                : 'primary-game-control'
            }
            label={primaryControl.label}
            active={primaryControl.active}
            onClick={
              primaryControl.action === 'start' ? startGame : togglePause
            }
            compact
          />
        )}
        <ToggleButton
          label="Colour Regions"
          active={colorMode}
          onClick={() => setColorMode(!colorMode)}
          compact
        />
        <ToggleButton
          label="Annotations"
          active={showLabels}
          onClick={() => setShowLabels(!showLabels)}
          compact
        />
      </div>
    </div>
  );
}
