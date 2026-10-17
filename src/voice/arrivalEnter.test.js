import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { consumeEnteredMark, conversationOnArrival, ENTERED_MAX_AGE_MS } = await import('./arrivalEnter.js').catch(() => ({}));
const { ENTERED_KEY } = await import('../landing/enter.js').catch(() => ({}));

// Kyle, 2026-10-17: Enter on the landing turns on the mic and Sylvi. Arriving
// through it counts as the visitor's first press: the conversation opens at
// once, where the browser lets her be heard. Where it does not (Safari), the
// first press in the app starts everything, as before.

function storageWith(value) {
  const map = new Map(value === undefined ? [] : [[ENTERED_KEY, value]]);
  return { getItem: (key) => map.get(key) ?? null, removeItem: (key) => map.delete(key), map };
}

describe('Arriving through Enter', () => {
  it('reads a fresh mark once', () => {
    const storage = storageWith('5000');
    expect(consumeEnteredMark({ storage, now: () => 5000 + 2000 })).toBe(true);
    expect(storage.map.size).toBe(0);
    expect(consumeEnteredMark({ storage, now: () => 5000 + 2000 })).toBe(false);
  });

  it('ignores a stale mark, or none, and clears it', () => {
    expect(ENTERED_MAX_AGE_MS).toBe(60_000);
    const stale = storageWith('5000');
    expect(consumeEnteredMark({ storage: stale, now: () => 5000 + 60_001 })).toBe(false);
    expect(stale.map.size).toBe(0);
    expect(consumeEnteredMark({ storage: storageWith(undefined), now: () => 0 })).toBe(false);
  });

  it('survives a browser that will not lend its storage', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(consumeEnteredMark({ storage, now: () => 0 })).toBe(false);
  });

  it('opens the conversation at once only when she can be heard', () => {
    const base = { entered: true, soundAllowed: true, phase: 'idle', voiceChosen: false };
    expect(conversationOnArrival(base)).toBe('start');
    expect(conversationOnArrival({ ...base, soundAllowed: false })).toBe('wait');
    expect(conversationOnArrival({ ...base, entered: false })).toBe('wait');
    expect(conversationOnArrival({ ...base, phase: 'connecting' })).toBe('wait');
    expect(conversationOnArrival({ ...base, voiceChosen: true })).toBe('wait');
  });

  it('is wired into the guide', () => {
    const panel = readFileSync(fileURLToPath(new URL('./VoicePanel.jsx', import.meta.url)), 'utf8');
    expect(panel).toMatch(/consumeEnteredMark\(/);
    expect(panel).toMatch(/conversationOnArrival\(\{/);
  });
});
