/**
 * The guide's game controls (Kyle, 2026-10-11): the speed of the falling
 * words, the difficulty, and switching the player between Game and Study.
 * None of them moves or lights the brain, so none can give an answer away.
 *
 * The adapter is the page:
 *   getPhase()        'ready' | 'study' | 'countdown' | 'playing' | 'paused'
 *   getReturnTo()     where Study returns to
 *   getSettings()     { speed, colour, exact }
 *   setSpeed(n), setExact(bool)
 *   perform(action)   presses the control the player would press
 *   getFallingWord()  { word, drop } for the word in the air, or null
 */

import { gameLevel, stepSpeed } from '../game/levels.js';
import { hintFor } from '../game/hints.js';

const HINT_PHASES = new Set(['playing', 'paused']);

const ok = (did, extra = {}) => ({ ok: true, did, reason: '', ...extra });
const fail = (reason) => ({ ok: false, did: '', reason });

const word = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const times = (speed) => `${Number(speed.toFixed(2))} times`;

/** Which control a mode switch presses, 'already' if none is needed, or null if it cannot. */
export function switchModeAction(phase, target, returnTo = 'ready') {
  if (target === 'game') {
    if (phase === 'ready') return 'start';
    if (phase === 'paused') return 'resume';
    if (phase === 'study') return returnTo === 'paused' || returnTo === 'playing' ? 'leave-study-and-resume' : 'leave-study-and-start';
    if (phase === 'playing' || phase === 'countdown') return 'already';
    return null;
  }
  if (target === 'study') {
    if (phase === 'ready' || phase === 'paused') return 'enter';
    if (phase === 'playing') return 'pause-and-enter';
    if (phase === 'study') return 'already';
    return null;
  }
  if (target === 'explore') {
    if (phase === 'study') return 'leave';
    if (phase === 'ready') return 'already';
    return null;
  }
  return null;
}

const MODES = ['game', 'study', 'explore'];

function didFor(action, { phase, returnTo, target }) {
  switch (action) {
    case 'start':
      return 'Started the game: a three-second countdown, then the words begin to fall.';
    case 'resume':
      return 'Resumed the game where it was paused.';
    case 'leave-study-and-start':
      return 'Left Study and started the game: a three-second countdown, then the words begin to fall.';
    case 'leave-study-and-resume':
      return 'Left Study; the game resumes where it was.';
    case 'enter':
      return phase === 'paused' ? 'Opened Study; the game stays paused until the player returns.' : 'Opened Study.';
    case 'pause-and-enter':
      return 'Paused the game and opened Study. Play the Game resumes it.';
    case 'leave':
      return returnTo === 'paused' || returnTo === 'playing'
        ? 'Left Study; the game is paused where the player left it.'
        : 'Left Study; the player is exploring on their own.';
    case 'already':
      return target === 'game' ? 'The game is already under way.' : `Already in ${target === 'study' ? 'Study' : 'explore'}.`;
    default:
      return '';
  }
}

function refusal(phase, target) {
  if (phase === 'countdown') return 'The countdown is running; the game starts in a moment.';
  if (target === 'explore') return 'A game is under way. The player can pause it, or I can open Study.';
  return 'That is not possible from here.';
}

export function createGameCommands(adapter) {
  const level = (changes = {}) => gameLevel({ ...adapter.getSettings(), ...changes }).label;

  function setGameSpeed(change) {
    const direction = word(change);
    if (direction !== 'faster' && direction !== 'slower') return fail('change must be "faster" or "slower".');
    const { speed } = adapter.getSettings();
    const next = stepSpeed(speed, direction);
    if (next === null) {
      return fail(direction === 'faster' ? 'The words already fall at their fastest, 2 times.' : 'The words already fall at their slowest, half speed.');
    }
    adapter.setSpeed(next);
    return ok(`The words now fall at ${times(next)} their usual speed.`, { speed: next, level: level({ speed: next }) });
  }

  function setDifficulty(difficulty) {
    const choice = word(difficulty);
    if (choice !== 'easy' && choice !== 'hard') return fail('difficulty must be "easy" or "hard".');
    const exact = choice === 'hard';
    adapter.setExact(exact);
    const did = exact ? 'Only the exact region scores now.' : 'Any region in the right lobe scores now.';
    return ok(did, { level: level({ exact }) });
  }

  function switchMode(mode) {
    const target = word(mode);
    if (!MODES.includes(target)) return fail('mode must be "game", "study" or "explore".');
    const phase = adapter.getPhase();
    const returnTo = adapter.getReturnTo?.() ?? 'ready';
    const action = switchModeAction(phase, target, returnTo);
    if (action === null) return fail(refusal(phase, target));
    if (action !== 'already') adapter.perform(action);
    return ok(didFor(action, { phase, returnTo, target }));
  }

  // Each word climbs its own ladder: where to look, the lobe, the region.
  let hinted = { drop: null, level: 0 };

  function giveHint() {
    if (!HINT_PHASES.has(adapter.getPhase())) return fail('Hints are for the game, while a word is falling.');
    const falling = adapter.getFallingWord?.();
    if (!falling) return fail('No word is in the air; ask again when the next word falls.');
    const level = hinted.drop === falling.drop ? hinted.level + 1 : 1;
    const { text, final } = hintFor(falling.word, level);
    hinted = { drop: falling.drop, level: final ? level - 1 : level };
    const easyNote = !final && level === 2 && !adapter.getSettings().exact ? ' On Easy, the lobe is enough to score.' : '';
    return ok(`${text}${easyNote}`, { word: falling.word.word, hint: Math.min(level, 3), final });
  }

  return { setGameSpeed, setDifficulty, switchMode, giveHint };
}
