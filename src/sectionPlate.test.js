import { describe, expect, it } from 'vitest';

const plateModule = await import('./sectionPlate.js').catch(() => ({}));
const { SECTION_PLATE, screenBounds, plateBox, shouldCloseSection } = plateModule;

// Kyle, 2026-10-11: turn the 3D brain to its side and lay the midline section
// over it, like a lift-the-flap anatomy plate. Study mode only.
describe('The section plate', () => {
  it('is drawn from the left, front to the left, so the brain turns to its left side', () => {
    expect(SECTION_PLATE.view).toBe('left_lateral');
    expect(SECTION_PLATE.src).toBe('/section/midsagittal.png');
    expect(SECTION_PLATE.alt).toMatch(/divided along the midline/i);
  });

  it("is laid over the brain's own outline on screen", () => {
    const points = [
      { x: 430, y: 313 },
      { x: 970, y: 500 },
      { x: 600, y: 776 },
      { x: 700, y: 400 },
    ];
    expect(screenBounds(points)).toEqual({ left: 430, top: 313, width: 540, height: 463 });
    expect(screenBounds([])).toBeNull();
  });

  it('fills those bounds exactly, so the outlines meet', () => {
    expect(plateBox({ left: 430, top: 313, width: 540, height: 463 })).toEqual({
      position: 'absolute',
      left: 430,
      top: 313,
      width: 540,
      height: 463,
    });
  });

  it('closes when the visitor leaves Study, takes hold of the brain, or the guide turns it', () => {
    expect(shouldCloseSection({ gamePhase: 'study', control: 'guide_free' })).toBe(false);
    expect(shouldCloseSection({ gamePhase: 'ready', control: 'guide_free' })).toBe(true);
    expect(shouldCloseSection({ gamePhase: 'countdown', control: 'guide_free' })).toBe(true);
    expect(shouldCloseSection({ gamePhase: 'study', control: 'player_holding' })).toBe(true);
    expect(shouldCloseSection({ gamePhase: 'study', control: 'guide_moving' })).toBe(true);
  });
});
