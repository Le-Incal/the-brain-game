/**
 * The front door (Kyle, 2026-10-11): the brain greets every visitor, the bar
 * under it holds four persistent buttons, and two options wait on the left.
 *
 * Phases are unchanged ('ready', 'countdown', 'playing', 'paused', 'study');
 * 'ready' is now Explore, where the guide may also show things.
 */
import { GUIDES, normalizeGuide } from './voice/guides.js';

export const DEFAULT_GUIDE = 'sylvi';

export function initialGuide(saved) {
  return normalizeGuide(saved) ?? DEFAULT_GUIDE;
}

const GAME_PHASES = new Set(['countdown', 'playing', 'paused']);

/** The scene contract: 'study' while the guide may act, 'game' while it must not. */
export function sceneModeForPhase(gamePhase) {
  return GAME_PHASES.has(gamePhase) ? 'game' : 'study';
}

/** What the guide is told: explore, study or game. */
export function guideModeForPhase(gamePhase) {
  if (GAME_PHASES.has(gamePhase)) return 'game';
  return gamePhase === 'study' ? 'study' : 'explore';
}

export function getBarButtons({
  gamePhase,
  brainReady = false,
  colorMode = false,
  settingsOpen = false,
  sectionOpen = false,
  sectionAvailable = true,
}) {
  const blocked = !brainReady || gamePhase === 'countdown';
  const playLabel = gamePhase === 'playing' ? 'Pause' : gamePhase === 'paused' ? 'Resume' : 'Play the Game';
  return [
    { id: 'colour', label: 'Colour Regions', pressed: Boolean(colorMode), disabled: false },
    { id: 'play', label: playLabel, pressed: gamePhase === 'paused', disabled: blocked },
    { id: 'study', label: 'Study the Brain', pressed: gamePhase === 'study', disabled: blocked },
    // The midline section belongs to Study only.
    ...(gamePhase === 'study' && sectionAvailable
      ? [{ id: 'section', label: 'Section', pressed: Boolean(sectionOpen), disabled: !brainReady }]
      : []),
    { id: 'settings', label: 'Settings', expanded: Boolean(settingsOpen), disabled: false },
  ];
}

export function playAction(gamePhase, returnTo = 'ready') {
  switch (gamePhase) {
    case 'ready':
      return 'start';
    case 'playing':
      return 'pause';
    case 'paused':
      return 'resume';
    case 'study':
      return returnTo === 'paused' || returnTo === 'playing' ? 'leave-study-and-resume' : 'leave-study-and-start';
    default:
      return null;
  }
}

export function studyAction(gamePhase) {
  switch (gamePhase) {
    case 'ready':
    case 'paused':
      return 'enter';
    case 'playing':
      return 'pause-and-enter';
    case 'study':
      return 'leave';
    default:
      return null;
  }
}

// Leaving returns where the player came from, but never restarts falling
// words by itself: a game that was running comes back paused.
export function leaveStudy(returnTo) {
  if (returnTo === 'playing' || returnTo === 'paused') return 'paused';
  return 'ready';
}

export function arrivalOptions(guideName) {
  return [
    {
      id: 'study',
      label: 'Study the Brain',
      text: guideName
        ? `Learn with ${guideName} as your guide: ask anything, or take a tour of the lobes.`
        : 'Turn the brain and select any region to learn what it does.',
    },
    { id: 'play', label: 'Play the Game', text: 'Catch each falling word on the region that does the work.' },
  ];
}

/** The guide is there from arrival, in every phase, in the voice build. */
export function shouldMountGuide({ voiceEnabled, brainReady, commandsReady }) {
  return Boolean(voiceEnabled && brainReady && commandsReady);
}

/** Motion starts on, unless the visitor's system asks for reduced motion. */
export function initialMotion(reducedMotion) {
  return !reducedMotion;
}

export function shouldShowArrival({ gamePhase, brainReady, selectedRegion }) {
  return gamePhase === 'ready' && Boolean(brainReady) && !selectedRegion;
}

export function getStudyCaption(guide) {
  const id = normalizeGuide(guide);
  if (!id) {
    return { title: 'Study the Brain', note: 'Turn the brain and select any region to read about it.' };
  }
  const { name } = GUIDES.find((entry) => entry.id === id);
  return {
    title: `Studying with ${name}`,
    note: `Ask ${name} anything, or turn the brain and select a region to read about it.`,
  };
}

const INK = '#1a1814';
const PAPER = '#f5f0e8';

export function ToggleButton({ label, active, onClick, compact = false, mini = false, className, disabled = false, ...aria }) {
  return (
    <button
      type="button"
      className={className}
      aria-pressed={aria['aria-expanded'] === undefined ? Boolean(active) : undefined}
      aria-expanded={aria['aria-expanded']}
      aria-controls={aria['aria-controls']}
      disabled={disabled || undefined}
      onClick={onClick}
      style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: mini ? 8 : compact ? 10 : 11,
        fontWeight: 400,
        letterSpacing: mini ? '0.06em' : '0.1em',
        textTransform: 'uppercase',
        padding: mini ? '2px 7px' : compact ? '4px 10px' : '6px 14px',
        background: active ? INK : 'transparent',
        color: active ? PAPER : INK,
        border: `1px solid ${INK}`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'all 0.3s ease',
      }}
    >
      {label}
    </button>
  );
}

const ARRIVAL_STYLES = {
  list: { display: 'flex', flexDirection: 'column', gap: 22, pointerEvents: 'auto' },
  button: {
    alignSelf: 'flex-start',
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 'clamp(12px, 1.4vw, 14px)',
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    padding: '9px 18px',
    background: 'transparent',
    color: INK,
    border: `1px solid ${INK}`,
    boxShadow: '3px 3px 0 rgba(26, 24, 20, 0.18)',
    cursor: 'pointer',
  },
  text: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 1.45,
    color: '#3d3932',
    marginTop: 8,
    maxWidth: 260,
  },
};

/** Two discrete options on arrival, stacked on the left. */
export function ArrivalOptions({ guideName, onStudy, onPlay }) {
  const actions = { study: onStudy, play: onPlay };
  return (
    <div className="arrival-options" style={ARRIVAL_STYLES.list}>
      {arrivalOptions(guideName).map((option) => (
        <div key={option.id}>
          <button type="button" className={`arrival-${option.id}`} style={ARRIVAL_STYLES.button} onClick={actions[option.id]}>
            {option.label}
          </button>
          <div className="arrival-text" style={ARRIVAL_STYLES.text}>
            {option.text}
          </div>
        </div>
      ))}
    </div>
  );
}

const SETTINGS_STYLES = {
  panel: {
    position: 'absolute',
    bottom: 'calc(clamp(18px, 3vh, 28px) + 40px)',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 15,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '14px 18px',
    background: 'rgba(247, 240, 220, 0.97)',
    border: `1px solid ${INK}`,
    boxShadow: `inset 0 0 0 3px #f7f0dc, inset 0 0 0 4px rgba(26, 24, 20, 0.24), 3px 3px 0 rgba(26, 24, 20, 0.18)`,
    minWidth: 240,
  },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: 12,
    letterSpacing: '0.1em',
    color: '#4a4640',
    textTransform: 'uppercase',
  },
  choices: { display: 'flex', gap: 6 },
  slider: { width: 96, margin: 0, cursor: 'pointer' },
  value: { minWidth: 27, fontFamily: "'EB Garamond', Georgia, serif", fontSize: 11, color: '#2a2820', textAlign: 'right' },
};

const LEVEL_PHASES = new Set(['countdown', 'playing', 'paused']);

/** The score, and during a game the level: Easy, Hard 1, Hard 2... */
export function ScoreDisplay({ score, level, gamePhase, style }) {
  return (
    <div className="score-display" style={style}>
      <div>Score: {score}</div>
      {LEVEL_PHASES.has(gamePhase) && level ? (
        <div className="level-display" style={{ marginTop: 2, fontSize: 11, letterSpacing: '0.14em', textAlign: 'right' }}>
          {level}
        </div>
      ) : null}
    </div>
  );
}

// Tenths as before; the quarters the guide steps by show in full (1.25, not 1.3).
function speedText(speed) {
  const value = Number(speed);
  return Number.isInteger(Math.round(value * 1000) / 100) ? value.toFixed(1) : String(Number(value.toFixed(2)));
}

/** Guide, difficulty and the speed of falling words. */
export function SettingsPanel({ voiceEnabled, guide, onGuide, difficulty, onDifficulty, speed, onSpeed }) {
  return (
    <div id="settings-panel" className="settings-panel" role="group" aria-label="Settings" style={SETTINGS_STYLES.panel}>
      {voiceEnabled && (
        <div style={SETTINGS_STYLES.row}>
          <span style={SETTINGS_STYLES.label}>Guide</span>
          <span style={SETTINGS_STYLES.choices}>
            {GUIDES.map(({ id, name }) => (
              <ToggleButton key={id} label={name} active={guide === id} onClick={() => onGuide(id)} mini />
            ))}
          </span>
        </div>
      )}
      <div className="difficulty-controls" style={SETTINGS_STYLES.row}>
        <span style={SETTINGS_STYLES.label}>Difficulty</span>
        <span style={SETTINGS_STYLES.choices}>
          {['easy', 'hard'].map((mode) => (
            <ToggleButton
              key={mode}
              label={mode === 'easy' ? 'Easy' : 'Hard'}
              active={difficulty === mode}
              onClick={() => onDifficulty(mode)}
              mini
            />
          ))}
        </span>
      </div>
      <label className="speed-control" style={SETTINGS_STYLES.row}>
        <span className="speed-label" style={SETTINGS_STYLES.label}>Speed</span>
        <span style={SETTINGS_STYLES.choices}>
          <input
            className="speed-slider"
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speed}
            onChange={(event) => onSpeed(Number(event.target.value))}
            aria-label="Falling word speed"
            aria-valuetext={`${speedText(speed)} times`}
            style={SETTINGS_STYLES.slider}
          />
          <span className="speed-value" style={SETTINGS_STYLES.value}>
            {speedText(speed)}×
          </span>
        </span>
      </label>
    </div>
  );
}
