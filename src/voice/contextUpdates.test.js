import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const contextModule = await import('./contextUpdates.js').catch(() => ({}));
const {
  CONTEXT_MESSAGES,
  formatRegionClicked,
  formatGrab,
  formatHandoff,
  formatIdle,
  formatStudyEntered,
  formatTimeWarning,
  formatTourWaiting,
  createContextReporter,
} = contextModule;

describe('M4: every contextual update, worded in one place', () => {
  // The agent prompt quotes these exactly, so they change only here.
  it('locks the wording', () => {
    expect(CONTEXT_MESSAGES).toEqual({
      regionClicked: '[player] clicked region {id} ({name})',
      tookHold: '[player] took hold of me',
      tookHoldInterrupted: '[player] took hold of me; interrupted: {move}',
      handoff: '[player] let go; now viewing {view} ({exactness}); you may move me again',
      idle: '[player] idle {seconds}s',
      studyEntered: '[player] entered Study mode',
      timeWarning: '[app] about 30 seconds of our conversation remain',
      tourWaiting: '[app] the tour is waiting at stop {stop} of {of}',
    });
  });

  it('nudges a stalled tour', () => {
    expect(formatTourWaiting({ stop: 3, of: 7 })).toBe('[app] the tour is waiting at stop 3 of 7');
  });

  it('warns the guide that time is nearly up', () => {
    expect(formatTimeWarning()).toBe('[app] about 30 seconds of our conversation remain');
  });

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

  it('hands control back once, with the view', () => {
    expect(formatHandoff({ view: 'left_lateral', viewExact: false })).toBe(
      '[player] let go; now viewing left_lateral (not exact); you may move me again'
    );
    expect(formatHandoff({ view: 'superior', viewExact: true })).toBe(
      '[player] let go; now viewing superior (exact); you may move me again'
    );
  });

  it('reports idling and entering Study mode', () => {
    expect(formatIdle(25)).toBe('[player] idle 25s');
    expect(formatStudyEntered()).toBe('[player] entered Study mode');
  });

  it('matches every example line in the agent brief', () => {
    const brief = readFileSync(fileURLToPath(new URL('../../agent/architect-brief.md', import.meta.url)), 'utf8');
    const examples = [...brief.matchAll(/^\s*(\[(?:player|app)\][^\n`]*)$/gm)].map((match) => match[1].trim());
    expect(examples.length).toBeGreaterThan(0);
    const patterns = Object.values(CONTEXT_MESSAGES).map(
      (template) =>
        new RegExp(`^${template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[a-z]+\}/g, '.+')}$`)
    );
    for (const line of examples) {
      expect(patterns.some((pattern) => pattern.test(line)), line).toBe(true);
    }
  });
});

describe('M4: the context reporter', () => {
  function setup() {
    let now = 0;
    const sent = [];
    const reporter = createContextReporter({ send: (text) => sent.push(text), now: () => now });
    return { sent, reporter, advance: (ms) => (now += ms) };
  }

  it('sends the grab at once and the handoff when control returns: two lines, not three', () => {
    const { sent, reporter } = setup();
    reporter.userInteraction({ type: 'grab', interrupted: { command: 'faceRegion', regionId: 6, hemisphere: 'left' } });
    reporter.userInteraction({ type: 'handoff', view: 'posterior', viewExact: false });
    expect(sent).toEqual([
      '[player] took hold of me; interrupted: face_region 6 (left)',
      '[player] let go; now viewing posterior (not exact); you may move me again',
    ]);
  });

  it('reports a click at once, as the only line', () => {
    const { sent, reporter } = setup();
    reporter.regionClicked({ id: 19, name: 'Cerebellum' });
    expect(sent).toEqual(['[player] clicked region 19 (Cerebellum)']);
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
    expect(sent.filter((line) => line.includes('idle'))).toHaveLength(2);
  });
});
