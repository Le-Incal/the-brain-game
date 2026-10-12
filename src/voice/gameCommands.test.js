import { describe, expect, it } from 'vitest';

const gameModule = await import('./gameCommands.js').catch(() => ({}));
const { createGameCommands, switchModeAction } = gameModule;

// Kyle, 2026-10-11: during the game the guide can change the speed of the
// falling words and the difficulty, and switch the player between Game and
// Study. It still never moves or lights the brain while a word is in play.

function setup({ phase = 'playing', speed = 1, colour = true, exact = false, returnTo = 'ready', falling = { word: { word: 'SPEECH', targetRegion: 6 }, drop: 1 } } = {}) {
  const state = { phase, speed, colour, exact, returnTo, falling };
  const performed = [];
  const commands = createGameCommands({
    getPhase: () => state.phase,
    getReturnTo: () => state.returnTo,
    getSettings: () => ({ speed: state.speed, colour: state.colour, exact: state.exact }),
    setSpeed: (value) => (state.speed = value),
    setExact: (value) => (state.exact = value),
    perform: (action) => performed.push(action),
    getFallingWord: () => state.falling,
  });
  return { state, performed, commands };
}

function expectResultShape(result) {
  expect(typeof result.ok).toBe('boolean');
  expect(typeof result.did).toBe('string');
  expect(typeof result.reason).toBe('string');
}

describe('setGameSpeed', () => {
  it('makes the words fall a step faster and says the new level', () => {
    const { commands, state } = setup({ colour: false });
    const result = commands.setGameSpeed('faster');
    expectResultShape(result);
    expect(result.ok).toBe(true);
    expect(state.speed).toBe(1.25);
    expect(result.speed).toBe(1.25);
    expect(result.level).toBe('Hard 2');
    expect(result.did).toMatch(/1\.25/);
  });

  it('makes them a step slower', () => {
    const { commands, state } = setup({ speed: 1.5 });
    expect(commands.setGameSpeed('slower').ok).toBe(true);
    expect(state.speed).toBe(1.25);
  });

  it('reads the change loosely, the way agents send it', () => {
    const { commands, state } = setup();
    expect(commands.setGameSpeed(' Faster ').ok).toBe(true);
    expect(state.speed).toBe(1.25);
  });

  it('says so plainly at either end, and changes nothing', () => {
    const fastest = setup({ speed: 2 });
    const top = fastest.commands.setGameSpeed('faster');
    expect(top.ok).toBe(false);
    expect(top.reason).toMatch(/fastest/);
    expect(fastest.state.speed).toBe(2);
    const slowest = setup({ speed: 0.5 });
    const bottom = slowest.commands.setGameSpeed('slower');
    expect(bottom.ok).toBe(false);
    expect(bottom.reason).toMatch(/slowest/);
  });

  it('refuses a change it cannot read', () => {
    const { commands, state } = setup();
    const result = commands.setGameSpeed('warp');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/faster.*slower/);
    expect(state.speed).toBe(1);
  });
});

describe('setDifficulty', () => {
  it('hard asks for the exact region', () => {
    const { commands, state } = setup({ colour: false, speed: 1.5 });
    const result = commands.setDifficulty('hard');
    expectResultShape(result);
    expect(result.ok).toBe(true);
    expect(state.exact).toBe(true);
    expect(result.did).toMatch(/exact region/);
    expect(result.level).toBe('Hard 4');
  });

  it('easy accepts any region in the right lobe', () => {
    const { commands, state } = setup({ exact: true });
    const result = commands.setDifficulty('Easy');
    expect(result.ok).toBe(true);
    expect(state.exact).toBe(false);
    expect(result.did).toMatch(/lobe/);
  });

  it('leaves the colours as they are: colour is its own step', () => {
    const { commands, state } = setup({ colour: true });
    commands.setDifficulty('hard');
    expect(state.colour).toBe(true);
  });

  it('refuses a difficulty it does not know', () => {
    const { commands, state } = setup();
    expect(commands.setDifficulty('nightmare').ok).toBe(false);
    expect(state.exact).toBe(false);
  });
});

describe('Switching modes', () => {
  it.each([
    ['ready', 'game', 'ready', 'start'],
    ['paused', 'game', 'ready', 'resume'],
    ['study', 'game', 'ready', 'leave-study-and-start'],
    ['study', 'game', 'paused', 'leave-study-and-resume'],
    ['playing', 'game', 'ready', 'already'],
    ['countdown', 'game', 'ready', 'already'],
    ['ready', 'study', 'ready', 'enter'],
    ['paused', 'study', 'ready', 'enter'],
    ['playing', 'study', 'ready', 'pause-and-enter'],
    ['study', 'study', 'ready', 'already'],
    ['countdown', 'study', 'ready', null],
    ['study', 'explore', 'ready', 'leave'],
    ['ready', 'explore', 'ready', 'already'],
    ['playing', 'explore', 'ready', null],
  ])('from %s, %s (came from %s) is %s', (phase, target, returnTo, expected) => {
    expect(switchModeAction(phase, target, returnTo)).toBe(expected);
  });

  it('presses the same control the player would', () => {
    const { commands, performed } = setup({ phase: 'playing' });
    const result = commands.switchMode('study');
    expectResultShape(result);
    expect(result.ok).toBe(true);
    expect(performed).toEqual(['pause-and-enter']);
    expect(result.did).toMatch(/paused/i);
  });

  it('starts the game from Study', () => {
    const { commands, performed } = setup({ phase: 'study' });
    const result = commands.switchMode('game');
    expect(result.ok).toBe(true);
    expect(performed).toEqual(['leave-study-and-start']);
    expect(result.did).toMatch(/countdown/);
  });

  it('never pauses a running game when asked for the game', () => {
    const { commands, performed } = setup({ phase: 'playing' });
    const result = commands.switchMode('game');
    expect(result.ok).toBe(true);
    expect(performed).toEqual([]);
  });

  it('says how to leave a game rather than pretending to explore', () => {
    const { commands, performed } = setup({ phase: 'playing' });
    const result = commands.switchMode('explore');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/game/i);
    expect(performed).toEqual([]);
  });

  it('refuses a mode it does not know', () => {
    const { commands, performed } = setup({ phase: 'ready' });
    const result = commands.switchMode('arcade');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/game.*study.*explore/);
    expect(performed).toEqual([]);
  });
});

// Kyle, 2026-10-11: hints during the game; the word keeps falling.
describe('giveHint', () => {
  it('climbs the ladder for the same word: where to look, the lobe, the region', () => {
    const { commands } = setup();
    const first = commands.giveHint();
    expectResultShape(first);
    expect(first).toMatchObject({ ok: true, word: 'SPEECH', hint: 1, final: false });
    expect(first.did).toBe('For "SPEECH": look on my left side, toward the front.');
    expect(commands.giveHint()).toMatchObject({ hint: 2, did: expect.stringMatching(/^For "SPEECH": it lies in my Frontal Lobe\./) });
    expect(commands.giveHint()).toMatchObject({ hint: 3, final: true });
    expect(commands.giveHint()).toMatchObject({ hint: 3, final: true });
  });

  it('starts again at the bottom for the next word', () => {
    const { commands, state } = setup();
    commands.giveHint();
    commands.giveHint();
    state.falling = { word: { word: 'VISION', targetRegion: 17 }, drop: 2 };
    expect(commands.giveHint()).toMatchObject({ word: 'VISION', hint: 1 });
  });

  it('says on Easy when the lobe alone will score', () => {
    const easy = setup({ exact: false });
    easy.commands.giveHint();
    expect(easy.commands.giveHint().did).toMatch(/On Easy, the lobe is enough to score\.$/);
    const hard = setup({ exact: true });
    hard.commands.giveHint();
    expect(hard.commands.giveHint().did).not.toMatch(/enough to score/);
  });

  it('works while the game is paused', () => {
    const { commands } = setup({ phase: 'paused' });
    expect(commands.giveHint().ok).toBe(true);
  });

  it('waits for the next word when none is in the air', () => {
    const { commands } = setup({ falling: null });
    const result = commands.giveHint();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/next word/);
  });

  it('is for the game only', () => {
    for (const phase of ['ready', 'study', 'countdown']) {
      const { commands } = setup({ phase });
      const result = commands.giveHint();
      expect(result.ok, phase).toBe(false);
      expect(result.reason, phase).toMatch(/game/i);
    }
  });
});
