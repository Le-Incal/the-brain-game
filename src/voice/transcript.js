/** The conversation as text, from the SDK's onMessage events. */
import { stripExpressiveTags } from './spokenNames.js';

export const TRANSCRIPT_LIMIT = 40;

export function messageFromSdk({ message, role, event_id: id }, guideName) {
  const fromGuide = role === 'agent';
  // Voice-engine cues like [warm] are for the voice, not the screen.
  const raw = typeof message === 'string' ? message : '';
  const text = fromGuide ? stripExpressiveTags(raw) : raw.trim();
  if (!text) return null;
  return { id, speaker: fromGuide ? guideName : 'You', fromGuide, text };
}

export function appendMessage(list, message) {
  const index = list.findIndex((entry) => entry.id === message.id);
  const next = index >= 0 ? list.map((entry, i) => (i === index ? message : entry)) : [...list, message];
  return next.slice(-TRANSCRIPT_LIMIT);
}
