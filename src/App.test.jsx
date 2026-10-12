import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  default as App,
  colorModeForDifficulty,
  getDescribedRegion,
  getDescribedText,
  shouldShowHeader,
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

  // Kyle, 2026-10-11: the score moved into the bar, after Settings.
  it('puts the score in the bottom bar, after Settings', () => {
    const markup = renderToStaticMarkup(<App />);
    const barStart = markup.indexOf('class="game-controls"');
    const barEnd = markup.indexOf('</div>', barStart);
    const score = markup.indexOf('Score:');
    expect(score).toBeGreaterThan(markup.indexOf('>Settings</button>', barStart));
    expect(score).toBeLessThan(barEnd);
  });
});

// Kyle, 2026-10-11: four persistent buttons under the brain; How to Play,
// Begin and the phone menu give way to them and to the Settings panel.
describe('The front door', () => {
  it('puts Colour Regions, Play the Game, Study the Brain and Settings in the bar, in order', () => {
    const markup = renderToStaticMarkup(<App />);
    const bar = markup.slice(markup.indexOf('class="game-controls"'));
    const order = ['Colour Regions', 'Play the Game', 'Study the Brain', 'Settings'].map((label) => bar.indexOf(`>${label}</button>`));
    for (const position of order) expect(position).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('opens Settings as a disclosure', () => {
    const markup = renderToStaticMarkup(<App />);
    expect(markup).toMatch(/aria-expanded="false"[^>]*aria-controls="settings-panel"[^>]*>Settings</);
  });

  it('no longer shows How to Play, Begin or the phone menu', () => {
    const markup = renderToStaticMarkup(<App />);
    expect(markup).not.toContain('How to Play');
    expect(markup).not.toContain('>Begin<');
    expect(markup).not.toContain('Open game settings');
    expect(markup).not.toContain('mobile-settings-panel');
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

    expect(toggleState(markup, 'Colour Regions')).toBe(true);
  });

  it('reports the state of every toggle to assistive technology', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(toggleState(markup, 'Study the Brain')).toBe(false);
    // Kyle, 2026-10-11: the Annotations toggle is gone.
    expect(toggleState(markup, 'Annotations')).toBeNull();
  });
});

// Kyle: when the guide shows something, its text appears on the left, as it
// does for a click. A click still wins; a resting cursor does not hide it.
describe('The left panel follows the guide', () => {
  const selected = { id: 6, name: "Broca's Area", subtitle: 'The Articulate Engine', description: 'Clicked text.' };
  const hovered = { id: 11, name: 'Primary Auditory Cortex', subtitle: 'The Listening Chamber', description: 'Hover text.' };
  const guideFocus = { kind: 'lobe', lobe: 'Frontal Lobe', name: 'Frontal Lobe', subtitle: 'The Province of Will', description: 'Lobe text.' };

  it('shows the guide focus over a hover, and a click over both', () => {
    expect(getDescribedRegion({ guideFocus, hoveredRegion: hovered })).toEqual(guideFocus);
    expect(getDescribedRegion({ selectedRegion: selected, guideFocus, hoveredRegion: hovered })).toEqual(selected);
    expect(getDescribedRegion({ hoveredRegion: hovered })).toEqual(hovered);
  });

  it("shows the full text for a click or the guide's focus, never for a hover", () => {
    expect(getDescribedText({ selectedRegion: selected, guideFocus })).toBe('Clicked text.');
    expect(getDescribedText({ guideFocus, hoveredRegion: hovered })).toBe('Lobe text.');
    expect(getDescribedText({ hoveredRegion: hovered })).toBeNull();
  });

  it('hides everything while the player grips the brain', () => {
    expect(getDescribedRegion({ isNavigating: true, guideFocus })).toBeNull();
    expect(getDescribedText({ isNavigating: true, guideFocus })).toBeNull();
  });
});
