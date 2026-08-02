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

describe('landing instructions', () => {
  it('shows instructions before the game starts', () => {
    expect(shouldShowInstructions('ready')).toBe(true);
  });

  it('hides instructions once Begin starts the countdown', () => {
    expect(shouldShowInstructions('countdown')).toBe(false);
    expect(shouldShowInstructions('playing')).toBe(false);
    expect(shouldShowInstructions('paused')).toBe(false);
  });
});
