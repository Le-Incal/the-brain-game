import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Kyle, 2026-10-20, on brain-game.io/app: "I just selected study but nothing
// happened ... There was no voice in either the study or the game ... when I
// moved from the game back to the study, the falling word stopped and stalled
// out, stuck in place. Also the score did not go away. I think the score
// should sit in the top right hand of the screen just like on the phone."
// When Study brings Sylvi in, she offers a tour or a region (his choice).

const carryOn = await import('./voice/carryOn.js').catch(() => ({}));
const context = await import('./voice/contextUpdates.js').catch(() => ({}));
const app = await import('./App.jsx').catch(() => ({}));

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('Pressing Study brings Sylvi in', () => {
  const entry = (state) => carryOn.studyEntry({ from: 'explore', to: 'study', msSinceTool: Infinity, ...state });

  // Kyle, 2026-10-23: the fresh session for Study was refused and she went silent.
  it('keeps a live conversation going, and she offers', () => {
    expect(entry({ phase: 'connected' })).toEqual({ action: 'stay', offer: true });
  });

  it('wakes a conversation that has gone quiet', () => {
    expect(entry({ phase: 'resting' })).toEqual({ action: 'wake', offer: true });
  });

  it('starts one where there is none, unless the visitor turned the voice off', () => {
    expect(entry({ phase: 'idle' })).toEqual({ action: 'start', offer: true });
    expect(entry({ phase: 'idle', voiceOff: true })).toEqual({ action: 'none', offer: false });
  });

  it('lets one already on its way arrive, then offers', () => {
    expect(entry({ phase: 'requesting' })).toEqual({ action: 'none', offer: true });
    expect(entry({ phase: 'connecting' })).toEqual({ action: 'none', offer: true });
  });

  it('does nothing while voice is unavailable', () => {
    expect(entry({ phase: 'unavailable' })).toEqual({ action: 'none', offer: false });
  });

  it('makes no offer when Sylvi switched to Study herself: she is already speaking about it', () => {
    expect(entry({ phase: 'connected', msSinceTool: 500 })).toEqual({ action: 'stay', offer: false });
  });

  it('acts only on entering Study', () => {
    expect(carryOn.studyEntry({ from: 'study', to: 'study', phase: 'resting' })).toEqual({ action: 'none', offer: false });
    expect(carryOn.studyEntry({ from: 'study', to: 'explore', phase: 'idle' })).toEqual({ action: 'none', offer: false });
    expect(carryOn.studyEntry({ from: 'game', to: 'study', phase: 'resting' })).toEqual({ action: 'wake', offer: true });
  });
});

describe("Sylvi's offer when Study opens", () => {
  const line = '[app] the player opened Study; offer: a tour, or a region to look at';

  it('is a prompt she answers at once', () => {
    expect(context.formatStudyOffer()).toBe(line);
  });

  it('is in the agent brief', () => {
    expect(read('../agent/architect-brief.md')).toContain(`  ${line}`);
  });

  it('is wired: Study wakes or starts the conversation, and the offer goes once it connects, or at once if it is live', () => {
    const panel = read('./voice/VoicePanel.jsx');
    expect(panel).toMatch(/studyEntry\(\{/);
    expect(panel).toMatch(/entered\.action === 'wake'\) current\.wake\(\);/);
    expect(panel).toMatch(/entered\.action === 'start'\) current\.start\(\{ guide: guideRef\.current, mode: 'auto' \}\);/);
    expect(panel).toMatch(/studyOfferRef\.current = entered\.offer;/);
    // A live conversation stays: she offers at once, after any welcome still playing.
    expect(panel).toMatch(/if \(entered\.action === 'stay' && entered\.offer\) \{\s*studyOfferRef\.current = false;\s*whenWelcomeDone\(\)\.then\(\(\) => \{\s*if \(modeRef\.current === 'study' && current\.getState\(\)\.phase === 'connected'\) prompter\.prompt\(formatStudyOffer\(\)\);/);
    // A conversation carried on mid-tour or mid-sentence picks up instead.
    expect(panel).toMatch(/else if \(studyOfferRef\.current && modeRef\.current === 'study'\) \{\s*studyOfferRef\.current = false;[\s\S]{0,160}whenWelcomeDone\(\)\.then\(\(\) => \{\s*if \(modeRef\.current === 'study' && session\.getState\(\)\.phase === 'connected'\) prompter\.prompt\(formatStudyOffer\(\)\);/);
  });
});

describe('The falling word during Study and pauses', () => {
  // Kyle, 2026-10-23: "When you pause the game the falling word should go away
  // because you are not playing."
  it('is hidden while Study is open or the game is paused, and returns where it stopped', () => {
    expect(app.fallingWordHidden('study')).toBe(true);
    expect(app.fallingWordHidden('paused')).toBe(true);
    for (const phase of ['ready', 'offer', 'countdown', 'playing']) {
      expect(app.fallingWordHidden(phase), phase).toBe(false);
    }
  });

  it('stays in place underneath, so it comes back where it stopped', () => {
    expect(read('./App.jsx')).toMatch(/style=\{fallingWordHidden\(gamePhase\) \? \{ \.\.\.STYLES\.fallingWord, visibility: 'hidden' \} : STYLES\.fallingWord\}/);
  });
});

describe('The score', () => {
  it('shows during a game only, once the visitor has played', () => {
    for (const phase of ['offer', 'countdown', 'playing', 'paused']) {
      expect(app.scoreShows({ played: true, gamePhase: phase }), phase).toBe(true);
    }
    for (const phase of ['ready', 'study']) {
      expect(app.scoreShows({ played: true, gamePhase: phase }), phase).toBe(false);
    }
    expect(app.scoreShows({ played: false, gamePhase: 'playing' })).toBe(false);
  });

  it('sits in the top right-hand corner on every screen, outside the bar', () => {
    const source = read('./App.jsx');
    const bar = source.slice(source.indexOf('<div className="game-controls"'));
    expect(bar.slice(0, bar.indexOf('\n      </div>'))).not.toContain('<ScoreDisplay');
    expect(source).toMatch(/\{scoreShows\(\{ played: choice\.played, gamePhase \}\) && \(\s*<ScoreDisplay/);
    expect(source).toMatch(/scoreCorner: \{[^}]*position: 'absolute',[^}]*top: 'calc\(env\(safe-area-inset-top, 0px\) \+ clamp\(16px, 3vh, 28px\)\)',[^}]*right: GUIDE_TEXT_RIGHT,/);
  });

  // Kyle, 2026-10-23: "the score and the text should share the same padding at
  // the right side." The column's text sits 10 px inside it, for its scrollbar.
  it("lines up with the conversation text's right edge", async () => {
    const layout = await import('./voice/voicePanelLayout.js');
    expect(layout.GUIDE_TEXT_INSET_PX).toBe(10);
    expect(layout.GUIDE_TEXT_RIGHT).toBe(`calc(${layout.GUIDE_COLUMN_STYLE.right} + 10px)`);
    expect(read('./voice/GuideColumn.jsx')).toMatch(/transcript: \{[^}]*paddingRight: GUIDE_TEXT_INSET_PX,/);
  });
});
