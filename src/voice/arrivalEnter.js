/**
 * Arriving through Enter (Kyle, 2026-10-17): the landing's Enter asked for the
 * microphone and marked the arrival (src/landing/enter.js). That press counts
 * as the visitor's first: the conversation opens at once, without a second
 * press, where the browser lets Sylvi be heard. Where it does not (Safari
 * carries no sound across pages), the first press here starts everything, as
 * before: "only trigger streaming and motion if the voice talks".
 */

import { ENTERED_KEY } from '../landing/enter.js';

// A mark older than this is from an earlier visit, not this arrival.
export const ENTERED_MAX_AGE_MS = 60_000;

/** Whether this page was reached through Enter just now. Reads the mark once. */
export function consumeEnteredMark({ storage, now = () => Date.now() }) {
  try {
    const value = storage?.getItem(ENTERED_KEY);
    if (value === null || value === undefined) return false;
    storage.removeItem(ENTERED_KEY);
    const age = now() - Number(value);
    return Number.isFinite(age) && age >= 0 && age <= ENTERED_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** 'start' the conversation now, or 'wait' for the visitor's first press. */
export function conversationOnArrival({ entered, soundAllowed, phase, voiceChosen }) {
  if (!entered || !soundAllowed || voiceChosen || phase !== 'idle') return 'wait';
  return 'start';
}
