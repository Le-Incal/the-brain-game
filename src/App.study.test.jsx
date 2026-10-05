import { describe, expect, it } from 'vitest';
import * as AppModule from './App.jsx';

const { enterStudy, leaveStudy, getStudyControl, sceneModeForPhase, getPrimaryControl } = AppModule;

describe('M2: entering and leaving Study mode', () => {
  it('enters from the ready screen or a paused game, remembering where it came from', () => {
    expect(enterStudy('ready')).toEqual({ phase: 'study', returnTo: 'ready' });
    expect(enterStudy('paused')).toEqual({ phase: 'study', returnTo: 'paused' });
  });

  it('never enters mid-countdown or while words are falling', () => {
    expect(enterStudy('countdown')).toBeNull();
    expect(enterStudy('playing')).toBeNull();
    expect(enterStudy('study')).toBeNull();
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
    expect(getStudyControl('ready', true)).toEqual({ label: 'Study', action: 'enter-study', active: false });
    expect(getStudyControl('paused', true)).toEqual({ label: 'Study', action: 'enter-study', active: false });
  });

  it('offers a way back out while studying', () => {
    expect(getStudyControl('study', true)).toEqual({ label: 'Leave Study', action: 'leave-study', active: true });
  });

  it('offers nothing before the brain loads or during play', () => {
    expect(getStudyControl('ready', false)).toBeNull();
    expect(getStudyControl('countdown', true)).toBeNull();
    expect(getStudyControl('playing', true)).toBeNull();
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
