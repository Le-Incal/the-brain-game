import { describe, expect, it } from 'vitest';

const carryOnModule = await import('./carryOn.js').catch(() => ({}));

// Kyle, 2026-10-13: "Start a new session when moving to a study". Study
// begins with a full session; the conversation carries on underneath.
describe('A fresh session when the visitor moves into Study', () => {
  const fresh = (from, to, phase = 'connected') => carryOnModule.freshSessionOnModeChange?.({ from, to, phase });

  it('starts one when a connected conversation moves into Study', () => {
    expect(fresh('explore', 'study')).toBe(true);
    expect(fresh('game', 'study')).toBe(true);
  });

  it('leaves the conversation alone for any other change', () => {
    expect(fresh('study', 'study')).toBe(false);
    expect(fresh('study', 'explore')).toBe(false);
    expect(fresh('explore', 'game')).toBe(false);
  });

  it('only for a connected conversation: a resting one wakes fresh anyway, and an idle one has no one to restart', () => {
    for (const phase of ['idle', 'requesting', 'connecting', 'resting', 'unavailable']) {
      expect(fresh('explore', 'study', phase), phase).toBe(false);
    }
  });
});

// Entering Study mid-sentence, or through the guide's own switch_mode call,
// waits for the guide to finish its turn; otherwise the fresh session starts now.
describe('When the fresh session for Study starts', () => {
  const timing = (options) => carryOnModule.studyHandoverTiming?.(options);

  it('starts now when the guide is quiet and no tool has just run', () => {
    expect(timing({ guideSpeaking: false, msSinceTool: 10_000 })).toBe('now');
    expect(timing({ guideSpeaking: false, msSinceTool: Infinity })).toBe('now');
  });

  it("waits for the guide's turn to end while it speaks", () => {
    expect(timing({ guideSpeaking: true, msSinceTool: Infinity })).toBe('after-turn');
  });

  it('waits when a tool has just run (the guide moved to Study itself and is about to speak)', () => {
    expect(timing({ guideSpeaking: false, msSinceTool: 500 })).toBe('after-turn');
    expect(timing({ guideSpeaking: false, msSinceTool: 1_999 })).toBe('after-turn');
  });

  it('waits at most 20 s for that turn', () => {
    expect(carryOnModule.STUDY_HANDOVER_WAIT_MS).toBe(20_000);
  });
});
