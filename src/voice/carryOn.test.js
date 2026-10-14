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
