import { describe, expect, it } from 'vitest';

const transcriptModule = await import('./transcript.js').catch(() => ({}));
const { appendMessage, messageFromSdk, TRANSCRIPT_LIMIT } = transcriptModule;

describe('M4: transcript', () => {
  it('maps SDK messages to guide and player lines', () => {
    expect(messageFromSdk({ message: 'Observe my cerebellum.', role: 'agent', event_id: 3 }, 'Rollo')).toEqual({
      id: 3,
      speaker: 'Rollo',
      fromGuide: true,
      text: 'Observe my cerebellum.',
    });
    expect(messageFromSdk({ message: 'Show me Broca', role: 'user', event_id: 4 }, 'Rollo')).toEqual({
      id: 4,
      speaker: 'You',
      fromGuide: false,
      text: 'Show me Broca',
    });
  });

  it('ignores empty messages', () => {
    expect(messageFromSdk({ message: '  ', role: 'agent', event_id: 5 }, 'Rollo')).toBeNull();
  });

  it('keeps only the most recent lines', () => {
    let list = [];
    for (let i = 0; i < TRANSCRIPT_LIMIT + 5; i += 1) list = appendMessage(list, { id: i, text: String(i) });
    expect(list).toHaveLength(TRANSCRIPT_LIMIT);
    expect(list[0].id).toBe(5);
  });

  it('replaces a resent message with the same id rather than duplicating it', () => {
    let list = appendMessage([], { id: 1, text: 'Obs' });
    list = appendMessage(list, { id: 1, text: 'Observe' });
    expect(list).toEqual([{ id: 1, text: 'Observe' }]);
  });
});
