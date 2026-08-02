import { describe, expect, it } from 'vitest';
import {
  shouldShowHeader,
  shouldShowInstructions,
  STYLES,
} from './App.jsx';

describe('shouldShowHeader', () => {
  it('keeps the title mounted to fold away during countdown', () => {
    expect(shouldShowHeader('countdown')).toBe(true);
  });

  it('hides the title during active play', () => {
    expect(shouldShowHeader('playing')).toBe(false);
  });

  it('shows the title before play and while paused', () => {
    expect(shouldShowHeader('ready')).toBe(true);
    expect(shouldShowHeader('paused')).toBe(true);
  });
});

describe('falling word presentation', () => {
  it('does not draw a white halo behind falling text', () => {
    expect(STYLES.fallingWord.textShadow).toBe('none');
  });
});

describe('mobile viewport layout', () => {
  it('uses the dynamic viewport height to avoid browser chrome overlap', () => {
    expect(STYLES.container.height).toBe('100dvh');
  });
});

describe('landing instructions', () => {
  it('shows instructions before the game starts', () => {
    expect(shouldShowInstructions('ready')).toBe(true);
  });

  it('replaces instructions with a clicked region description', () => {
    expect(shouldShowInstructions('ready', { id: 4 })).toBe(false);
  });

  it('hides instructions once Begin starts the countdown', () => {
    expect(shouldShowInstructions('countdown')).toBe(false);
    expect(shouldShowInstructions('playing')).toBe(false);
    expect(shouldShowInstructions('paused')).toBe(false);
  });
});
