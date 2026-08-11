import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  default as App,
  colorModeForDifficulty,
  getDescribedRegion,
  getPrimaryControl,
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

describe('countdown presentation', () => {
  it('sits above the brain without a white halo', () => {
    expect(STYLES.countdownPrompt.top).toBe('clamp(72px, 14vh, 128px)');
    expect(STYLES.countdown.textShadow).toBe('none');
    expect(STYLES.countdown.background).toBe('transparent');
  });
});

describe('mobile viewport layout', () => {
  it('uses the dynamic viewport height to avoid browser chrome overlap', () => {
    expect(STYLES.container.height).toBe('100dvh');
  });

  it('renders an accessible collapsed mobile settings menu', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-label="Open game settings"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="mobile-settings-panel"');
    expect(markup).toContain('id="mobile-settings-panel"');
  });

  it('keeps the score separate from the speed settings panel', () => {
    const markup = renderToStaticMarkup(<App />);
    const panelEnd = markup.indexOf('</div>', markup.indexOf('id="mobile-settings-panel"'));
    const scorePosition = markup.indexOf('Score:');

    expect(scorePosition).toBeGreaterThan(panelEnd);
  });

  it('keeps the mobile menu trigger visually unboxed', () => {
    expect(STYLES.mobileSettingsToggle.background).toBe('transparent');
    expect(STYLES.mobileSettingsToggle.border).toBe('none');
    expect(STYLES.mobileSettingsToggle.boxShadow).toBe('none');
    expect(STYLES.mobileSettingsLine.background).toBe('rgba(26, 24, 20, 0.62)');
  });
});

describe('bottom primary control', () => {
  it('starts with a highlighted Begin action', () => {
    expect(getPrimaryControl('ready', true)).toEqual({
      label: 'Begin',
      active: true,
      action: 'start',
    });
  });

  it('preserves the first position for Pause and Resume', () => {
    expect(getPrimaryControl('playing', true)).toEqual({
      label: 'Pause',
      active: false,
      mobileActive: true,
      action: 'pause',
    });
    expect(getPrimaryControl('paused', true)).toEqual({
      label: 'Resume',
      active: true,
      mobileActive: true,
      action: 'pause',
    });
  });

  it('does not offer Begin until the specimen is ready', () => {
    expect(getPrimaryControl('ready', false)).toBeNull();
    expect(getPrimaryControl('countdown', true)).toBeNull();
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

describe('region description while navigating', () => {
  const hovered = { id: 4, name: 'Broca\'s Area' };
  const selected = { id: 5, name: 'Wernicke\'s Area' };

  it('keeps hover and selection copy when the specimen is idle', () => {
    expect(
      getDescribedRegion({ hoveredRegion: hovered })
    ).toEqual(hovered);
    expect(
      getDescribedRegion({ selectedRegion: selected, hoveredRegion: hovered })
    ).toEqual(selected);
  });

  it('hides region title and description while gripping to orbit', () => {
    // Falling words share that panel space; a grip is navigation, not study.
    expect(
      getDescribedRegion({
        isNavigating: true,
        selectedRegion: selected,
        hoveredRegion: hovered,
      })
    ).toBeNull();
  });
});

describe('difficulty and the region palette', () => {
  function toggleState(markup, label) {
    const match = markup.match(
      new RegExp(`<button[^>]*aria-pressed="(true|false)"[^>]*>${label}</button>`)
    );
    return match ? match[1] === 'true' : null;
  }

  it('shows the palette on easy and withdraws it on hard', () => {
    // Easy names the lobe, so the lobes are worth seeing; hard asks the player
    // to find the region unaided.
    expect(colorModeForDifficulty('easy')).toBe(true);
    expect(colorModeForDifficulty('hard')).toBe(false);
  });

  it('opens on easy with the colours already showing', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(toggleState(markup, 'Easy')).toBe(true);
    expect(toggleState(markup, 'Colour Regions')).toBe(true);
  });

  it('reports the state of every toggle to assistive technology', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(toggleState(markup, 'Hard')).toBe(false);
    expect(toggleState(markup, 'Annotations')).toBe(false);
  });
});
