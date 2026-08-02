import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from './gameEngine.js';

function mockScene(regionId) {
  return {
    getRegionIdAtNormalized: vi.fn(() => regionId),
  };
}

describe('GameEngine', () => {
  it('defaults to tier 4 (full bank)', () => {
    const engine = new GameEngine(mockScene(null));
    expect(engine.tier).toBe(4);
  });

  it('uses a readable default fall speed', () => {
    const engine = new GameEngine(mockScene(null));
    expect(engine.fallSpeed).toBe(0.08);
  });

  it('updates and safely clamps the falling-word speed', () => {
    const engine = new GameEngine(mockScene(null));

    engine.setFallSpeed(0.12);
    expect(engine.fallSpeed).toBe(0.12);

    engine.setFallSpeed(1);
    expect(engine.fallSpeed).toBe(0.16);
    engine.setFallSpeed(0);
    expect(engine.fallSpeed).toBe(0.04);
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
    const engine = new GameEngine(mockScene(12));
    engine.currentWord = {
      word: 'VISION',
      targetRegion: 12,
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
      targetRegion: 12,
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
    const engine = new GameEngine(mockScene(0), { onIncorrect, onMiss });
    engine.currentWord = {
      word: 'VISION',
      targetRegion: 12,
      tier: 1,
      factoid: 'x',
    };
    const result = engine.checkAnswer(0);
    expect(result.outcome).toBe('wrong');
    expect(onIncorrect).toHaveBeenCalled();
    expect(onMiss).not.toHaveBeenCalled();
  });

  it('accepts acceptAlternates as correct', () => {
    const onCorrect = vi.fn();
    const engine = new GameEngine(mockScene(1), { onCorrect });
    engine.currentWord = {
      word: 'CATCHING A BALL',
      targetRegion: 13,
      acceptAlternates: [1],
      tier: 2,
      factoid: 'x',
    };
    const result = engine.checkAnswer(1);
    expect(result.outcome).toBe('correct');
    expect(engine.score).toBe(25);
    expect(onCorrect).toHaveBeenCalled();
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
    const engine = new GameEngine(mockScene(0), { onWordDrop, shatterDurationMs: 1800 });
    engine.isPlaying = true;
    engine.currentWord = {
      word: 'VISION',
      targetRegion: 12,
      tier: 1,
      factoid: 'x',
    };

    engine._resolveAt(0);
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
