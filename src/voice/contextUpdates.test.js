import { describe, expect, it } from 'vitest';

const contextModule = await import('./contextUpdates.js').catch(() => ({}));
const {
  formatRegionClicked,
  formatGrab,
  formatRelease,
  formatViewChange,
  formatIdle,
  formatStudyEntered,
  createContextReporter,
} = contextModule;

describe('M4: contextual updates use the formats in the agent prompt', () => {
  it('reports a clicked region', () => {
    expect(formatRegionClicked({ id: 13, name: "Wernicke's Area" })).toBe("[player] clicked region 13 (Wernicke's Area)");
  });

  it('reports a grab and what it interrupted', () => {
    expect(formatGrab({ interrupted: { command: 'faceRegion', regionId: 6, hemisphere: 'left' } })).toBe(
      '[player] took hold of me; interrupted: face_region 6 (left)'
    );
    expect(formatGrab({ interrupted: { command: 'faceRegion', regionId: 10, hemisphere: null } })).toBe(
      '[player] took hold of me; interrupted: face_region 10'
    );
    expect(formatGrab({ interrupted: { command: 'rotateTo', view: 'posterior' } })).toBe(
      '[player] took hold of me; interrupted: rotate_to_view posterior'
    );
    expect(formatGrab({ interrupted: null })).toBe('[player] took hold of me');
  });

  it('reports letting go, with the view', () => {
    expect(formatRelease({ view: 'left_lateral', viewExact: false })).toBe('[player] let go; now viewing left_lateral (not exact)');
    expect(formatRelease({ view: 'superior', viewExact: true })).toBe('[player] let go; now viewing superior (exact)');
  });

  it('reports a new view with the visible regions in id order', () => {
    expect(formatViewChange({ view: 'posterior', visibleRegions: [{ id: 17 }, { id: 9 }, { id: 18 }, { id: 10 }, { id: 19 }] })).toBe(
      '[player] rotated; now viewing posterior; visible: 9,10,17,18,19'
    );
  });

  it('reports idling and entering Study mode', () => {
    expect(formatIdle(25)).toBe('[player] idle 25s');
    expect(formatStudyEntered()).toBe('[player] entered Study mode');
  });
});

describe('M4: the context reporter', () => {
  function setup() {
    let now = 0;
    const sent = [];
    const reporter = createContextReporter({ send: (text) => sent.push(text), now: () => now });
    return { sent, reporter, advance: (ms) => (now += ms) };
  }

  it('sends a grab, then on release the let-go line and, if the view changed, the new view', () => {
    const { sent, reporter } = setup();
    reporter.userInteraction({ type: 'grab', interrupted: { command: 'faceRegion', regionId: 6, hemisphere: 'left' } });
    reporter.userInteraction({ type: 'release', view: 'posterior', viewExact: false, wasClick: false }, {
      visibleRegions: [{ id: 17 }, { id: 18 }],
    });
    expect(sent).toEqual([
      '[player] took hold of me; interrupted: face_region 6 (left)',
      '[player] let go; now viewing posterior (not exact)',
      '[player] rotated; now viewing posterior; visible: 17,18',
    ]);
  });

  it('does not repeat the view when it has not changed', () => {
    const { sent, reporter } = setup();
    const release = { type: 'release', view: 'anterior', viewExact: false, wasClick: false };
    reporter.userInteraction({ type: 'grab', interrupted: null });
    reporter.userInteraction(release, { visibleRegions: [{ id: 1 }] });
    reporter.userInteraction({ type: 'grab', interrupted: null });
    reporter.userInteraction(release, { visibleRegions: [{ id: 1 }] });
    expect(sent.filter((line) => line.includes('rotated'))).toHaveLength(1);
  });

  it('stays quiet about a click (the region click is reported instead)', () => {
    const { sent, reporter } = setup();
    reporter.userInteraction({ type: 'grab', interrupted: null });
    reporter.userInteraction({ type: 'release', view: 'left_lateral', viewExact: false, wasClick: true }, { visibleRegions: [] });
    reporter.regionClicked({ id: 19, name: 'Cerebellum' });
    expect(sent).toEqual(['[player] took hold of me', '[player] clicked region 19 (Cerebellum)']);
  });

  it('reports idling once after 25 seconds without input, then again only after new activity', () => {
    const { sent, reporter, advance } = setup();
    reporter.activity();
    advance(24_000);
    reporter.tick();
    expect(sent).toEqual([]);
    advance(1_000);
    reporter.tick();
    advance(30_000);
    reporter.tick();
    expect(sent).toEqual(['[player] idle 25s']);
    reporter.regionClicked({ id: 1, name: 'Prefrontal Cortex' });
    advance(25_000);
    reporter.tick();
    expect(sent.at(-1)).toBe('[player] idle 25s');
    expect(sent.filter((line) => line.includes('idle'))).toHaveLength(2);
  });
});
