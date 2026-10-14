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
  formatMode,
  formatMiss,
  formatWelcomePlayed,
  formatResume,
  formatSection,
  formatTimeWarning,
  formatTourWaiting,
  formatCoachSignal,
  isAppPrompt,
  formatFirstPlay,
  formatMissPrompt,
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
      mode: '[app] mode: {mode}',
      missed: '[app] missed: "{word}" belongs to {region}, {where}. Why: {why}',
      welcomePlayed: '[app] the welcome has played',
      resumed: '[app] conversation so far: {lines}',
      section: '[app] the section is {state}',
      timeWarning: '[app] about 30 seconds of our conversation remain',
      tourWaiting: '[app] the tour is waiting at stop {stop} of {of}',
      streak: '[app] streak: {count} caught in a row at {level} ({settings}); offer: {offers}',
      struggling: '[app] struggling: {pattern} at {level} ({settings}); offer: {offers}',
      firstPlay: '[app] the player pressed Play for the first time; offer: a quick example first',
      carriedOnTour: '[app] the conversation carried on mid-tour, {where}: pick up where you left off, with no greeting',
      carriedOnSpeaking: '[app] the conversation carried on mid-sentence: finish your thought briefly, with no greeting',
    });
  });

  // Kyle, 2026-10-13: a conversation that carries on in a fresh session picks
  // up where it was: mid-tour, or mid-sentence. Otherwise the guide waits.
  describe('picking up after the conversation carried on', () => {
    it('picks up a tour at its stop', () => {
      expect(contextModule.formatCarryOn({ tour: { stop: 3, of: 7 }, wasSpeaking: false })).toBe(
        '[app] the conversation carried on mid-tour, at stop 3 of 7: pick up where you left off, with no greeting'
      );
    });

    it('picks up a tour that had only just begun', () => {
      expect(contextModule.formatCarryOn({ tour: { stop: 0, of: 7 }, wasSpeaking: true })).toBe(
        '[app] the conversation carried on mid-tour, at its start: pick up where you left off, with no greeting'
      );
    });

    it('finishes a sentence it was cut off in', () => {
      expect(contextModule.formatCarryOn({ tour: null, wasSpeaking: true })).toBe(
        '[app] the conversation carried on mid-sentence: finish your thought briefly, with no greeting'
      );
    });

    it('says nothing when the guide was quiet and no tour was running', () => {
      expect(contextModule.formatCarryOn({ tour: null, wasSpeaking: false })).toBeNull();
      expect(contextModule.formatCarryOn()).toBeNull();
    });

    it('goes as a prompt the guide answers now', () => {
      expect(contextModule.isAppPrompt(contextModule.formatCarryOn({ tour: { stop: 1, of: 7 } }))).toBe(true);
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

  it('reports idling', () => {
    expect(formatIdle(25)).toBe('[player] idle 25s');
  });

  // Kyle, 2026-10-11: the guide is present in every mode, and is told which.
  it('carries the conversation so far into a session that wakes from rest', () => {
    const entries = [
      { fromGuide: true, text: 'Welcome. I am Sylvi, a human brain.' },
      { fromGuide: false, text: 'Where do headaches happen?' },
      { fromGuide: true, text: 'Not in me, strictly.' },
    ];
    expect(formatResume(entries, 'Sylvi')).toBe(
      '[app] conversation so far: Sylvi: Welcome. I am Sylvi, a human brain. | Visitor: Where do headaches happen? | Sylvi: Not in me, strictly.'
    );
  });

  it('keeps the carried conversation short: the last ten lines, each cut at 200 characters', () => {
    const entries = Array.from({ length: 14 }, (_, i) => ({ fromGuide: i % 2 === 0, text: `${i} ${'x'.repeat(300)}` }));
    const line = formatResume(entries, 'Rollo');
    expect(line.split(' | ')).toHaveLength(10);
    expect(line).toContain('Rollo: 4 ');
    expect(line).not.toContain('Rollo: 2 ');
    for (const part of line.replace('[app] conversation so far: ', '').split(' | ')) {
      expect(part.length).toBeLessThanOrEqual(210);
    }
  });

  it('tells the guide when the section opens or closes, whoever opened it', () => {
    expect(formatSection(true)).toBe('[app] the section is open');
    expect(formatSection(false)).toBe('[app] the section is closed');
  });

  it('tells a new conversation that the recorded welcome has already played', () => {
    expect(formatWelcomePlayed()).toBe('[app] the welcome has played');
  });

  it('names the mode: explore, study or game', () => {
    expect(formatMode('explore')).toBe('[app] mode: explore');
    expect(formatMode('study')).toBe('[app] mode: study');
    expect(formatMode('game')).toBe('[app] mode: game');
  });

  // Kyle, 2026-10-11: the guide explains a miss at once: what, where and why.
  const SPEECH_MISS = {
    word: 'SPEECH',
    region: "Broca's Area",
    where: 'in my Frontal Lobe, on my left side, toward the front',
    why: "Broca's area participates in articulatory planning within a distributed language network.",
  };

  it('tells the guide where a missed word belonged, where that lies and why', () => {
    expect(formatMiss(SPEECH_MISS)).toBe(
      '[app] missed: "SPEECH" belongs to Broca\'s Area, in my Frontal Lobe, on my left side, toward the front. Why: Broca\'s area participates in articulatory planning within a distributed language network.'
    );
  });

  it('carries a struggle in the same prompt, so the guide never gets two at once', () => {
    expect(formatMissPrompt(SPEECH_MISS)).toBe(formatMiss(SPEECH_MISS));
    const signal = { kind: 'struggling', inARow: 3, level: 'Easy', settings: { speed: 1, colour: true, exact: false }, offers: ['slower'] };
    expect(formatMissPrompt(SPEECH_MISS, signal)).toBe(`${formatMiss(SPEECH_MISS)}\n${formatCoachSignal(signal)}`);
  });

  // Kyle, 2026-10-11: the guide offers the next step; the player picks it.
  it('tells the guide of a streak and what it may offer', () => {
    expect(
      formatCoachSignal({ kind: 'streak', count: 5, level: 'Easy', settings: { speed: 1, colour: true, exact: false }, offers: ['faster', 'colours off'] })
    ).toBe('[app] streak: 5 caught in a row at Easy (lobe counts, colour on, 1.0×); offer: faster or colours off');
    expect(
      formatCoachSignal({ kind: 'streak', count: 5, level: 'Hard 6', settings: { speed: 2, colour: false, exact: true }, offers: [] })
    ).toBe('[app] streak: 5 caught in a row at Hard 6 (exact region, colour off, 2.0×); offer: nothing harder');
  });

  it('tells the guide the player is struggling and what it may offer', () => {
    expect(
      formatCoachSignal({ kind: 'struggling', inARow: 3, level: 'Hard 2', settings: { speed: 1.25, colour: false, exact: false }, offers: ['slower', 'colours back on'] })
    ).toBe('[app] struggling: 3 missed in a row at Hard 2 (lobe counts, colour off, 1.25×); offer: slower or colours back on');
    expect(
      formatCoachSignal({ kind: 'struggling', missed: 4, of: 6, level: 'Easy', settings: { speed: 0.5, colour: true, exact: false }, offers: [] })
    ).toBe('[app] struggling: 4 of the last 6 missed at Easy (lobe counts, colour on, 0.5×); offer: nothing easier');
  });

  it('asks the guide to offer an example on the first Play', () => {
    expect(formatFirstPlay()).toBe('[app] the player pressed Play for the first time; offer: a quick example first');
  });

  it('knows an app prompt from something the player said, so the transcript never shows one', () => {
    expect(isAppPrompt('[app] streak: 5 caught in a row')).toBe(true);
    expect(isAppPrompt('  [app] struggling')).toBe(true);
    expect(isAppPrompt('What does the [app] do?')).toBe(false);
    expect(isAppPrompt('Faster please')).toBe(false);
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

  it('tells the guide the mode when it changes', () => {
    const { sent, reporter } = setup();
    reporter.modeChanged('game');
    expect(sent).toEqual(['[app] mode: game']);
  });

  // A miss needs an answer now, so it travels as a prompt, not as background.
  it('leaves misses to the prompter', () => {
    const { reporter } = setup();
    expect(reporter.gameMiss).toBeUndefined();
  });
});
