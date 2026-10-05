import { describe, expect, it } from 'vitest';

const settingsModule = await import('./guideSettings.js').catch(() => ({}));
const { planGuideChange, SWITCH_NOW_WARNING } = settingsModule;

describe('M4: changing the guide in Settings', () => {
  it('warns that switching now ends the conversation', () => {
    expect(SWITCH_NOW_WARNING).toBe('Switching now ends this conversation. Your new guide starts fresh.');
  });

  it('saves the choice straight away when no conversation is running', () => {
    expect(planGuideChange({ current: 'rollo', next: 'sylvi', connected: false })).toEqual({ kind: 'save' });
  });

  it('applies it to the next conversation while talking, offering Switch now', () => {
    expect(planGuideChange({ current: 'rollo', next: 'sylvi', connected: true })).toEqual({
      kind: 'next-conversation',
      note: 'Sylvi will guide your next conversation.',
      offerSwitchNow: true,
    });
  });

  it('does nothing for the same guide or an unknown one', () => {
    expect(planGuideChange({ current: 'rollo', next: 'rollo', connected: true })).toEqual({ kind: 'none' });
    expect(planGuideChange({ current: 'rollo', next: 'specimen', connected: false })).toEqual({ kind: 'none' });
  });
});
