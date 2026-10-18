import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const composition = await import('./composition.js').catch(() => ({}));
const { composeSpecimenY, centreShiftFor, refineBrainCentre, slideLift, centresOnPage, cssPxToWorld, COMPOSITION_SLIDE_MS, CENTRE_DROP_CSS_PX } = composition;
const { compositionForPhase } = await import('../frontDoor.jsx');

// Kyle, 2026-10-16: "once we get into the application, I want the brain to be
// raised up to the middle of the page to match the brain at the home page. Not
// the size just the height position. Then if someone clicks the 'Play the
// Game' button, then the user can see that the brain gently slides down to
// its current position. The game is the only thing that needs the lower brain
// position." Phones keep today's position; leaving the game slides it back up;
// the slide takes 0.9 s, eased.

// At 1440 x 900 today: the game's 48 px drop is -0.115 world units, and the
// brain's own centre sits 0.075 below the specimen's origin.
const today = { baseY: -0.5, gameShift: -0.115, panY: 0, responsiveOffset: 0 };
const brainCentre = -0.075;

describe("The brain's height on the page", () => {
  it('sits in the game exactly where it does today', () => {
    const centreShift = centreShiftFor({ width: 1440, brainCentre, scale: 1, gameShift: today.gameShift });
    const y = composeSpecimenY({ ...today, centreShift, lift: 0 });
    expect(y).toBe(today.baseY + today.gameShift + today.panY + today.responsiveOffset);
  });

  it('centres the brain on the page in Explore and Study, at its own size', () => {
    const centreShift = centreShiftFor({ width: 1440, brainCentre, scale: 1, gameShift: today.gameShift });
    const y = composeSpecimenY({ ...today, centreShift, lift: 1 });
    // The brain's centre lands on the camera's target, the page's middle.
    expect(y + brainCentre).toBeCloseTo(today.baseY, 10);
  });

  // Kyle, 2026-10-17: "we need to slightly lower the standard position now."
  // A quarter inch below the page's middle in Explore and Study.
  it('sits a quarter inch below the middle in Explore and Study', () => {
    expect(CENTRE_DROP_CSS_PX).toBe(24);
    const viewportHeight = 2.157;
    const drop = cssPxToWorld(-CENTRE_DROP_CSS_PX, { height: 900, viewportHeight });
    expect(drop).toBeCloseTo((-24 / 900) * viewportHeight, 12);
    const centreShift = centreShiftFor({ width: 1440, brainCentre, scale: 1, gameShift: today.gameShift, drop });
    const y = composeSpecimenY({ ...today, centreShift, lift: 1 });
    expect(y + brainCentre).toBeCloseTo(today.baseY + drop, 10);
    // Phones keep today's height: no drop there either.
    expect(centreShiftFor({ width: 390, brainCentre, scale: 0.73, gameShift: 0, drop })).toBe(0);
  });

  it('keeps any pan the visitor or guide has made, on top', () => {
    const centreShift = centreShiftFor({ width: 1440, brainCentre, scale: 1, gameShift: today.gameShift });
    const y = composeSpecimenY({ ...today, panY: 0.2, centreShift, lift: 1 });
    expect(y + brainCentre).toBeCloseTo(today.baseY + 0.2, 10);
  });

  // The camera looks down a little, so a centred box lands a few pixels off the
  // middle on screen (12 px high at 1440 x 900). Where it lands corrects it.
  it('corrects the centre by where the brain lands on screen', () => {
    const viewportHeight = 2.157;
    const height = 900;
    // 12 px above the middle: NDC 12 / 450.
    const refined = refineBrainCentre({ brainCentre, ndcCentre: 12 / 450, viewportHeight, scale: 1 });
    expect(refined - brainCentre).toBeCloseTo((12 / height) * viewportHeight, 10);
    expect(refineBrainCentre({ brainCentre, ndcCentre: 0, viewportHeight, scale: 1 })).toBe(brainCentre);
  });

  // Kyle, 2026-10-17: in the app a phone's brain moves up under the title (see
  // phoneLayout.test.jsx); with nothing measured, as on the landing, it stays.
  it('keeps a phone where it was when nothing has measured its top', () => {
    expect(centresOnPage(640)).toBe(false);
    expect(centresOnPage(641)).toBe(true);
    const phone = { baseY: -0.5, gameShift: 0, panY: 0, responsiveOffset: -0.2 };
    const centreShift = centreShiftFor({ width: 390, brainCentre, scale: 0.73, gameShift: phone.gameShift });
    expect(composeSpecimenY({ ...phone, centreShift, lift: 1 })).toBe(composeSpecimenY({ ...phone, centreShift, lift: 0 }));
  });
});

describe('The slide between them', () => {
  it('takes 0.9 s', () => {
    expect(COMPOSITION_SLIDE_MS).toBe(900);
    expect(slideLift({ from: 1, to: 0, startedAt: 1000, now: 1000 })).toBe(1);
    expect(slideLift({ from: 1, to: 0, startedAt: 1000, now: 1900 })).toBe(0);
    expect(slideLift({ from: 1, to: 0, startedAt: 1000, now: 5000 })).toBe(0);
  });

  it('eases in and out, and never jumps or turns back', () => {
    const samples = Array.from({ length: 19 }, (_, i) => slideLift({ from: 0, to: 1, startedAt: 0, now: i * 50 }));
    expect(samples[9]).toBeCloseTo(0.5, 6);
    expect(samples[1]).toBeLessThan(0.01);
    expect(samples[17]).toBeGreaterThan(0.99);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
      expect(samples[i] - samples[i - 1]).toBeLessThan(0.1);
    }
  });
});

describe('Which height each part of the app uses', () => {
  it('lowers the brain for the game only: its offer, countdown, play and pause', () => {
    expect(['offer', 'countdown', 'playing', 'paused'].map(compositionForPhase)).toEqual(['game', 'game', 'game', 'game']);
    expect(['ready', 'study'].map(compositionForPhase)).toEqual(['centre', 'centre']);
  });

  it('is wired: the scene composes its height this way, and the app follows the phase', () => {
    const scene = readFileSync(fileURLToPath(new URL('./brainScene.js', import.meta.url)), 'utf8');
    const app = readFileSync(fileURLToPath(new URL('../App.jsx', import.meta.url)), 'utf8');
    expect(scene).toMatch(/composeSpecimenY\(/);
    expect(scene).toMatch(/setComposition\(name/);
    // With Motion off (the visitor's switch, or reduced motion) it moves without sliding.
    expect(app).toMatch(/setComposition\?\.\(compositionForPhase\(gamePhase\), \{ immediate: !motionOn \}\)/);
  });
});
