import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Kyle, 2026-10-23: "when I slide the screen smaller, the description text on
// the left should get pushed down to the bottom left and the brain should get
// shifted over so that the right side text and brain model never overlap."
// Measured at 900 px tall: the brain is about 540 px wide (590 px at its widest
// angle) whatever the width, and centred, so below about 1,300 px it slid under
// the conversation (56 to 103 px at 1,024 px wide, up to 206 px at 800).
// "the count down should happen above the brain where the words are going to
// fall from."

const composition = await import('./utils/composition.js').catch(() => ({}));
const layout = await import('./voice/voicePanelLayout.js').catch(() => ({}));
const app = await import('./App.jsx').catch(() => ({}));
const { GameEngine } = await import('./game/gameEngine.js');

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('The brain beside the conversation', () => {
  const fit = (options) => composition.sideFit({ gapPx: 24, marginPx: 16, ...options });

  it('stays centred while it clears the column', () => {
    expect(composition.SIDE_GAP_PX).toBe(24);
    expect(composition.SIDE_MARGIN_PX).toBe(16);
    expect(fit({ width: 1600, radiusPx: 293, columnLeftPx: 1264 })).toEqual({ centreXPx: 800, scale: 1, moved: false });
  });

  it('slides left until its outline is 24 px clear of the column', () => {
    // 1,024 px wide: the column starts at 703 px, so the brain's edge may reach 679.
    expect(fit({ width: 1024, radiusPx: 293, columnLeftPx: 703 })).toEqual({ centreXPx: 386, scale: 1, moved: true });
  });

  it('then shrinks, once it reaches the left margin', () => {
    // 800 px wide: 448 px between the margin and the gap, for a 586 px brain.
    const result = fit({ width: 800, radiusPx: 293, columnLeftPx: 488 });
    expect(result.moved).toBe(true);
    expect(result.scale).toBeCloseTo(448 / 586, 10);
    expect(result.centreXPx).toBeCloseTo(240, 10);
  });

  it('leaves phones, and pages with no column, as they are', () => {
    expect(fit({ width: 600, radiusPx: 200, columnLeftPx: 300 })).toEqual({ centreXPx: 300, scale: 1, moved: false });
    expect(fit({ width: 1024, radiusPx: 293, columnLeftPx: null })).toEqual({ centreXPx: 512, scale: 1, moved: false });
    expect(fit({ width: 1024, radiusPx: null, columnLeftPx: 703 })).toEqual({ centreXPx: 512, scale: 1, moved: false });
  });

  it("knows where the column starts from the column's own style", () => {
    expect(layout.GUIDE_COLUMN_STYLE.right).toBe('clamp(16px, 4vw, 56px)');
    expect(layout.GUIDE_COLUMN_STYLE.width).toBe(280);
    expect(layout.guideColumnLeftPx(1440)).toBe(1440 - 56 - 280);
    expect(layout.guideColumnLeftPx(1024)).toBeCloseTo(1024 - 40.96 - 280, 10);
    expect(layout.guideColumnLeftPx(641)).toBeCloseTo(641 - 25.64 - 280, 10);
  });

  it('is wired: the scene measures the brain at any angle and fits it to the column', () => {
    const scene = read('./utils/brainScene.js');
    expect(scene).toMatch(/this\._sideReserve = typeof options\.sideReserve === 'function' \? options\.sideReserve : null;/);
    expect(scene).toMatch(/this\._specimenRadius = this\._measureSpecimenRadius\(\);/);
    expect(scene).toMatch(/const side = sideFit\(\{/);
    expect(scene).toMatch(/this\.specimenGroup\.position\.x = /);
    expect(scene).toMatch(/laneX\(\) \{/);
    expect(read('./App.jsx')).toMatch(/new BrainScene\(mountRef\.current, \{[^}]*sideReserve: VOICE_ENABLED \? guideColumnLeftPx : null,[^}]*onSideChange: setBrainSide,/);
    expect(read('./landing/landing.js')).not.toMatch(/sideReserve/);
  });
});

describe('The words fall on the brain wherever it sits', () => {
  const scene = (laneX) => ({ getRegionIdAtNormalized: vi.fn(() => null), laneX: () => laneX });

  it('drops each word, and the example, at the brain centre', () => {
    const engine = new GameEngine(scene(0.38));
    engine.dropNextWord();
    expect(engine.wordPosition).toEqual({ x: 0.38, y: 0 });
    engine.playDemo({ word: 'SPEECH', targetRegion: 6 });
    expect(engine.wordPosition).toEqual({ x: 0.38, y: 0 });
  });

  it('keeps the middle of the page for a scene that does not say', () => {
    const engine = new GameEngine({ getRegionIdAtNormalized: () => null });
    engine.dropNextWord();
    expect(engine.wordPosition.x).toBe(0.5);
  });
});

describe('The text on the left when the brain moves', () => {
  it('drops the description and the two choices to the bottom left', () => {
    const html = read('../index.html');
    expect(html).toMatch(/\[data-side="moved"\] \.description-panel \{\s*top: auto !important;\s*bottom: 62px !important;\s*transform: none !important;/);
    expect(html).toMatch(/\[data-side="moved"\] \.arrival-panel \{\s*top: auto !important;\s*bottom: 62px !important;/);
    expect(html).toMatch(/\[data-side="moved"\] \.arrival-panel\[data-region="named"\] ~ \.description-panel \{\s*bottom: 280px !important;/);
  });

  it('is wired: the page says when the brain has moved', () => {
    expect(read('./App.jsx')).toMatch(/<div style=\{STYLES\.container\} data-side=\{brainSide\.moved \? 'moved' : undefined\}>/);
  });
});

describe('The countdown', () => {
  it('sits up where the words start, over the brain', () => {
    expect(app.countdownStyle(0.38)).toMatchObject({
      position: 'absolute',
      top: 'clamp(56px, 10vh, 104px)',
      left: '38%',
      transform: 'translate(-50%, -50%)',
    });
    expect(app.countdownStyle(0.5).left).toBe('50%');
  });

  it('is wired to where the brain sits', () => {
    expect(read('./App.jsx')).toMatch(/<div className="game-prompt" style=\{countdownStyle\(brainSide\.centreX\)\} aria-live="assertive">/);
  });
});
