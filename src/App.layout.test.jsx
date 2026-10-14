import { describe, expect, it } from 'vitest';
import * as AppModule from './App.jsx';

// Kyle, 2026-10-13: the arrival choices move to the bottom-left, so a region
// the visitor hovers or clicks is described while they stay in view. On
// phones the two share one strip, so the choices give way to the region.
describe('The left side of the page', () => {
  const region = { id: 1, name: 'Prefrontal Cortex' };
  const column = (options) => AppModule.leftColumn({ showArrival: false, describedRegion: null, factoid: null, correction: null, ...options });

  it('shows the arrival choices alone when nothing is described', () => {
    expect(column({ showArrival: true })).toEqual({ arrival: true, arrivalYields: false, description: false });
  });

  it('shows a hovered or clicked region beside the choices, which give way only where they share a place', () => {
    expect(column({ showArrival: true, describedRegion: region })).toEqual({ arrival: true, arrivalYields: true, description: true });
  });

  it("shows a game's factoid or correction once the choices have gone", () => {
    expect(column({ factoid: 'Broca, 1861.' })).toEqual({ arrival: false, arrivalYields: false, description: true });
    expect(column({ correction: 'That was Wernicke.' })).toEqual({ arrival: false, arrivalYields: false, description: true });
  });

  it('shows nothing when there is nothing to say', () => {
    expect(column({})).toEqual({ arrival: false, arrivalYields: false, description: false });
  });
});
