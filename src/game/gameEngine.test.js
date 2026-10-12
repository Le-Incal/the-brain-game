import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from './gameEngine.js';

function mockScene(regionId) {
  return {
    getRegionIdAtNormalized: vi.fn(() => regionId),
  };
}

describe('GameEngine', () => {
  it('starts on easy', () => {
    const engine = new GameEngine(mockScene(null));
    expect(engine.difficulty).toBe('easy');
  });

  it('draws on the whole word bank in either difficulty', () => {
    // Difficulty changes what counts as a correct catch, not which words the
    // player meets, so no part of the bank is hidden behind a setting.
    const engine = new GameEngine(mockScene(null));
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(engine.getNextWord().tier);

    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it('uses a readable default fall speed', () => {
    const engine = new GameEngine(mockScene(null));
    expect(engine.fallSpeed).toBe(0.04);
  });

  it('updates and safely clamps the falling-word speed', () => {
    const engine = new GameEngine(mockScene(null));

    engine.setFallSpeed(0.06);
    expect(engine.fallSpeed).toBe(0.06);

    engine.setFallSpeed(1);
    expect(engine.fallSpeed).toBe(0.08);
    engine.setFallSpeed(0);
    expect(engine.fallSpeed).toBe(0.02);
  });

  it('does not begin dropping words until started', () => {
    const engine = new GameEngine(mockScene(null));

    expect(engine.isPlaying).toBe(false);
    expect(engine.currentWord).toBeNull();
  });

  it('starts a fresh word sequence when started', () => {
    const onWordDrop = vi.fn();
    const engine = new GameEngine(mockScene(null), { onWordDrop });

    engine.start();

    expect(engine.isPlaying).toBe(true);
    expect(engine.currentWord).not.toBeNull();
    expect(onWordDrop).toHaveBeenCalledOnce();
  });

  it('drops every word at screen center', () => {
    const engine = new GameEngine(mockScene(null));
    engine.dropNextWord();

    expect(engine.wordPosition).toEqual({ x: 0.5, y: 0 });
  });

  it('scores by tier multipliers', () => {
    const engine = new GameEngine(mockScene(18));
    engine.currentWord = {
      word: 'VISION',
      targetRegion: 18,
      tier: 1,
      factoid: 'x',
    };
    expect(engine.getPointValue()).toBe(10);
    engine.currentWord.tier = 4;
    expect(engine.getPointValue()).toBe(100);
  });

  it('treats null region as miss, not wrong', () => {
    const onMiss = vi.fn();
    const onIncorrect = vi.fn();
    const engine = new GameEngine(mockScene(null), { onMiss, onIncorrect });
    engine.currentWord = {
      word: 'VISION',
      targetRegion: 18,
      tier: 1,
      factoid: 'x',
    };
    const result = engine.checkAnswer(null);
    expect(result.outcome).toBe('miss');
    expect(onMiss).toHaveBeenCalled();
    expect(onIncorrect).not.toHaveBeenCalled();
  });

  it('treats wrong region as wrong', () => {
    const onIncorrect = vi.fn();
    const onMiss = vi.fn();
    const engine = new GameEngine(mockScene(1), { onIncorrect, onMiss });
    engine.currentWord = {
      word: 'VISION',
      targetRegion: 18,
      tier: 1,
      factoid: 'x',
    };
    const result = engine.checkAnswer(1);
    expect(result.outcome).toBe('wrong');
    expect(onIncorrect).toHaveBeenCalled();
    expect(onMiss).not.toHaveBeenCalled();
  });

  it('accepts acceptAlternates as correct', () => {
    const onCorrect = vi.fn();
    const engine = new GameEngine(mockScene(5), { onCorrect });
    engine.currentWord = {
      word: 'CATCHING A BALL',
      targetRegion: 20,
      acceptAlternates: [5],
      tier: 2,
      factoid: 'x',
    };
    const result = engine.checkAnswer(5);
    expect(result.outcome).toBe('correct');
    expect(engine.score).toBe(25);
    expect(onCorrect).toHaveBeenCalled();
  });

  it("accepts the target region's own contested alternates", () => {
    // The atlas records where the literature genuinely disagrees, so a player
    // who names visual association cortex for a word about inferior temporal
    // cortex has not made an error the game should punish.
    const engine = new GameEngine(mockScene(18), {});
    engine.currentWord = {
      word: 'RECOGNISING A FACE',
      targetRegion: 14,
      tier: 2,
      factoid: 'x',
    };

    expect(engine.checkAnswer(18).outcome).toBe('correct');
  });

  describe('easy mode', () => {
    // Broca's area (6) sits in the frontal lobe alongside the primary motor
    // cortex (5); the cerebellum (19) is its own division.
    function easyEngine(caughtRegionId) {
      const engine = new GameEngine(mockScene(caughtRegionId), {});
      engine.currentWord = {
        word: 'SPEECH',
        targetRegion: 6,
        tier: 1,
        factoid: 'x',
      };
      return engine;
    }

    it('accepts any region sharing the lobe of the target', () => {
      const engine = easyEngine(5);
      const result = engine.checkAnswer(5);

      expect(result.outcome).toBe('correct');
      expect(result.matchedBy).toBe('division');
    });

    it('reports an exact catch as exact even in easy', () => {
      // The feedback names the precise region when the player only found the
      // lobe, so easy mode stays a teaching aid rather than a blur.
      expect(easyEngine(6).checkAnswer(6).matchedBy).toBe('region');
    });

    it('rejects a region outside the lobe of the target', () => {
      expect(easyEngine(19).checkAnswer(19).outcome).toBe('wrong');
    });

    it('treats the cerebellum and brain stem as their own divisions', () => {
      const engine = new GameEngine(mockScene(20), {});
      engine.currentWord = {
        word: 'BALANCE',
        targetRegion: 19,
        tier: 1,
        factoid: 'x',
      };

      expect(engine.checkAnswer(20).outcome).toBe('wrong');
    });
  });

  describe('hard mode', () => {
    it('requires the exact region, not merely the right lobe', () => {
      const engine = new GameEngine(mockScene(5), { difficulty: 'hard' });
      engine.currentWord = {
        word: 'SPEECH',
        targetRegion: 6,
        tier: 1,
        factoid: 'x',
      };

      expect(engine.checkAnswer(5).outcome).toBe('wrong');
    });

    it('switches difficulty at runtime', () => {
      const engine = new GameEngine(mockScene(5), {});
      engine.setDifficulty('hard');
      expect(engine.difficulty).toBe('hard');

      engine.setDifficulty('easy');
      expect(engine.difficulty).toBe('easy');
      // An unknown mode must not silently disable the rules.
      engine.setDifficulty('impossible');
      expect(engine.difficulty).toBe('easy');
    });
  });

  it('still rejects a region the atlas does not consider contested', () => {
    const engine = new GameEngine(mockScene(19), {});
    engine.currentWord = {
      word: 'RECOGNISING A FACE',
      targetRegion: 14,
      tier: 2,
      factoid: 'x',
    };

    expect(engine.checkAnswer(19).outcome).toBe('wrong');
  });

  it('freezes a falling word while paused', () => {
    const engine = new GameEngine(mockScene(null));
    engine.start();
    engine.update(1);
    const yBeforePause = engine.wordPosition.y;

    engine.pause();
    engine.update(5);

    expect(engine.isPlaying).toBe(false);
    expect(engine.wordPosition.y).toBe(yBeforePause);
    expect(engine.currentWord).not.toBeNull();
  });

  it('preserves queued next-word delays through pause and resume', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const onWordDrop = vi.fn();
    const engine = new GameEngine(mockScene(1), { onWordDrop, shatterDurationMs: 1800 });
    engine.isPlaying = true;
    engine.currentWord = {
      word: 'VISION',
      targetRegion: 18,
      tier: 1,
      factoid: 'x',
    };

    engine._resolveAt(1);
    engine.pause();
    vi.advanceTimersByTime(1800);
    expect(onWordDrop).not.toHaveBeenCalled();

    engine.resume();
    vi.runAllTimers();
    expect(onWordDrop).toHaveBeenCalledOnce();

    engine.dispose();
    vi.useRealTimers();
  });
});

// Kyle, 2026-10-11: the guide hints at the word in the air; the word keeps falling.
describe('The falling word, for hints', () => {
  it('is nothing before the game starts', () => {
    const engine = new GameEngine(mockScene(null));
    expect(engine.fallingWord()).toBeNull();
  });

  it('is the word in the air, numbered by its drop', () => {
    const engine = new GameEngine(mockScene(null));
    engine.start();
    const first = engine.fallingWord();
    expect(first.word).toBe(engine.currentWord);
    expect(first.drop).toBe(1);
    engine.dropNextWord();
    expect(engine.fallingWord().drop).toBe(2);
  });

  it('still counts while the game is paused', () => {
    const engine = new GameEngine(mockScene(null));
    engine.start();
    engine.pause();
    expect(engine.fallingWord()).not.toBeNull();
  });

  it('is nothing once the word has landed', () => {
    const engine = new GameEngine(mockScene(6));
    engine.start();
    engine.update(1);
    expect(engine.fallingWord()).toBeNull();
  });
});

// Kyle, 2026-10-11: the guide plays an example word. It is unscored.
describe('An example word', () => {
  const VISION = { word: 'VISION', targetRegion: 17, tier: 1, factoid: 'f' };

  it('falls fast, lands, and scores nothing', async () => {
    const engine = new GameEngine(mockScene(17), { onScoreChange: vi.fn() });
    const landed = engine.playDemo(VISION, { fallSpeed: 0.12 });
    expect(engine.isPlaying).toBe(true);
    expect(engine.currentWord).toBe(VISION);
    expect(engine.fallSpeed).toBe(0.12);
    engine.update(1);
    await expect(landed).resolves.toEqual({ outcome: 'correct', regionId: 17 });
    expect(engine.score).toBe(0);
    expect(engine.onScoreChange).not.toHaveBeenCalled();
    expect(engine.usedWords.size).toBe(0);
  });

  it('shows the same feedback as a real catch, marked as an example', async () => {
    const onCorrect = vi.fn();
    const engine = new GameEngine(mockScene(17), { onCorrect });
    const landed = engine.playDemo(VISION);
    engine.update(1);
    await landed;
    expect(onCorrect).toHaveBeenCalledWith(expect.objectContaining({ demo: true }));
  });

  it('stops afterwards, with the speed and the game as they were', async () => {
    const engine = new GameEngine(mockScene(17));
    engine.setFallSpeed(0.05);
    const landed = engine.playDemo(VISION, { fallSpeed: 0.12 });
    engine.update(1);
    await landed;
    expect(engine.isPlaying).toBe(false);
    expect(engine.fallSpeed).toBe(0.05);
    expect(engine.fallingWord()).toBeNull();
    expect(engine.dropCount).toBe(0);
  });

  it('reports a miss plainly, and drops no further word', async () => {
    const onMiss = vi.fn();
    const engine = new GameEngine(mockScene(null), { onMiss });
    const landed = engine.playDemo(VISION);
    // At 0.12 a second the word passes the miss line (0.9) after 7.5 s.
    for (let i = 0; i < 80; i++) engine.update(0.1);
    await expect(landed).resolves.toEqual({ outcome: 'miss', regionId: null });
    expect(onMiss).toHaveBeenCalledWith(expect.objectContaining({ demo: true }));
    expect(engine.isPlaying).toBe(false);
  });
});
