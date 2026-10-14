import { describe, expect, it } from 'vitest';
import * as AppModule from './App.jsx';

// Kyle, 2026-10-13: the arrival choices move to the bottom-left, so a region
// the visitor hovers or clicks is described while they stay in view. On
// phones and tablets there is room for only one panel where they sit, so the
// page needs to know how much of a region is shown: its name (a hover) or its
// full text (a click, or the guide's focus).
describe('The left side of the page', () => {
  const region = { id: 1, name: 'Prefrontal Cortex' };
  const text = 'The prefrontal cortex orchestrates planning.';
  const column = (options) => AppModule.leftColumn({
    showArrival: false, describedRegion: null, describedText: null, factoid: null, correction: null, ...options,
  });

  it('shows the arrival choices alone when nothing is described', () => {
    expect(column({ showArrival: true })).toEqual({ arrival: true, region: 'none', description: false });
  });

  it('shows a hovered region by name beside the choices', () => {
    expect(column({ showArrival: true, describedRegion: region })).toEqual({ arrival: true, region: 'named', description: true });
  });

  it('shows a clicked region in full beside the choices', () => {
    expect(column({ showArrival: true, describedRegion: region, describedText: text })).toEqual({ arrival: true, region: 'described', description: true });
  });

  it("shows a game's factoid or correction once the choices have gone", () => {
    expect(column({ factoid: 'Broca, 1861.' })).toEqual({ arrival: false, region: 'none', description: true });
    expect(column({ correction: 'That was Wernicke.' })).toEqual({ arrival: false, region: 'none', description: true });
  });

  it('shows nothing when there is nothing to say', () => {
    expect(column({})).toEqual({ arrival: false, region: 'none', description: false });
  });
});
