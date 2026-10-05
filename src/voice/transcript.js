/** The conversation as text, from the SDK's onMessage events. */
export const TRANSCRIPT_LIMIT = 40;

export function messageFromSdk({ message, role, event_id: id }, guideName) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return null;
  const fromGuide = role === 'agent';
  return { id, speaker: fromGuide ? guideName : 'You', fromGuide, text };
}

export function appendMessage(list, message) {
  const index = list.findIndex((entry) => entry.id === message.id);
  const next = index >= 0 ? list.map((entry, i) => (i === index ? message : entry)) : [...list, message];
  return next.slice(-TRANSCRIPT_LIMIT);
}
