import { describe, expect, it } from 'vitest';
import * as AppModule from './App.jsx';

const { enterStudy, leaveStudy, getStudyControl, sceneModeForPhase, getPrimaryControl } = AppModule;
const ON = { voiceEnabled: true };

describe('M2: entering and leaving Study mode', () => {
  it('enters from the ready screen or a paused game, remembering where it came from', () => {
    expect(enterStudy('ready', ON)).toEqual({ phase: 'study', returnTo: 'ready' });
    expect(enterStudy('paused', ON)).toEqual({ phase: 'study', returnTo: 'paused' });
  });

  it('never enters mid-countdown or while words are falling', () => {
    expect(enterStudy('countdown', ON)).toBeNull();
    expect(enterStudy('playing', ON)).toBeNull();
    expect(enterStudy('study', ON)).toBeNull();
  });

  it('cannot be entered while the voice build flag is off', () => {
    expect(enterStudy('ready')).toBeNull();
    expect(enterStudy('ready', { voiceEnabled: false })).toBeNull();
  });

  it('returns where it came from and never resumes falling words by itself', () => {
    expect(leaveStudy('ready')).toBe('ready');
    expect(leaveStudy('paused')).toBe('paused');
    expect(leaveStudy('playing')).toBe('paused');
    expect(leaveStudy(undefined)).toBe('ready');
  });
});

describe('M2: Study control', () => {
  it('offers Study when the brain is ready and no game is running', () => {
    expect(getStudyControl('ready', true, ON)).toEqual({ label: 'Study', action: 'enter-study', active: false });
    expect(getStudyControl('paused', true, ON)).toEqual({ label: 'Study', action: 'enter-study', active: false });
  });

  it('offers a way back out while studying', () => {
    expect(getStudyControl('study', true, ON)).toEqual({ label: 'Leave Study', action: 'leave-study', active: true });
  });

  it('offers nothing before the brain loads or during play', () => {
    expect(getStudyControl('ready', false, ON)).toBeNull();
    expect(getStudyControl('countdown', true, ON)).toBeNull();
    expect(getStudyControl('playing', true, ON)).toBeNull();
  });

  it('offers nothing at all while the voice build flag is off', () => {
    expect(getStudyControl('ready', true)).toBeNull();
    expect(getStudyControl('paused', true, { voiceEnabled: false })).toBeNull();
  });

  it('keeps Begin and Pause out of Study mode', () => {
    expect(getPrimaryControl('study', true)).toBeNull();
  });
});

describe('M2: scene mode for the guide', () => {
  it("reports 'study' only in Study mode", () => {
    expect(sceneModeForPhase('study')).toBe('study');
    for (const phase of ['ready', 'countdown', 'playing', 'paused']) {
      expect(sceneModeForPhase(phase)).toBe('game');
    }
  });
});

describe('M2: Study mode says what it is', () => {
  // Until the voice arrives (M4), Study mode must not look like nothing happened.
  it('names the chosen guide and says what the player can do meanwhile', () => {
    expect(AppModule.getStudyCaption('rollo')).toEqual({
      title: 'Studying with Rollo',
      note: 'Rollo will speak here soon. For now, turn the brain freely and click a region to read about it.',
    });
    expect(AppModule.getStudyCaption('sylvi').title).toBe('Studying with Sylvi');
  });

  it('shows nothing without a valid guide', () => {
    expect(AppModule.getStudyCaption(null)).toBeNull();
    expect(AppModule.getStudyCaption('specimen')).toBeNull();
  });
});
