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
