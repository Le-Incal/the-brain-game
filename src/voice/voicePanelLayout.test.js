import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const layoutModule = await import('./voicePanelLayout.js').catch(() => ({}));
const { VOICE_PANEL_STYLE, TRANSCRIPT_STYLE, VISIBLE_TRANSCRIPT_LINES, visibleTranscript } = layoutModule;

// Kyle, after the first live run: smaller, and on the right, mirroring How
// to Play on the left; it must never grow into the brain.
describe('Voice panel layout', () => {
  it('sits on the right on desktop, vertically centred, about 300px wide', () => {
    expect(VOICE_PANEL_STYLE).toMatchObject({ position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 300 });
    expect(VOICE_PANEL_STYLE.right).toBeDefined();
    expect(VOICE_PANEL_STYLE.left).toBeUndefined();
    expect(VOICE_PANEL_STYLE.bottom).toBeUndefined();
  });

  it('keeps the transcript to the last few lines, scrolling inside a capped height', () => {
    expect(VISIBLE_TRANSCRIPT_LINES).toBeGreaterThanOrEqual(3);
    expect(VISIBLE_TRANSCRIPT_LINES).toBeLessThanOrEqual(6);
    expect(TRANSCRIPT_STYLE.overflowY).toBe('auto');
    expect(TRANSCRIPT_STYLE.maxHeight).toBeLessThanOrEqual(140);
    const lines = Array.from({ length: 10 }, (_, id) => ({ id, text: String(id) }));
    expect(visibleTranscript(lines).map(({ id }) => id)).toEqual(
      lines.slice(-VISIBLE_TRANSCRIPT_LINES).map(({ id }) => id)
    );
    expect(visibleTranscript([])).toEqual([]);
  });

  it('moves to the bottom on mobile', () => {
    const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
    const mobile = html.slice(html.indexOf('@media (max-width: 640px)'));
    const rule = mobile.slice(mobile.indexOf('.voice-panel {'), mobile.indexOf('}', mobile.indexOf('.voice-panel {')));
    expect(rule).toContain('.voice-panel {');
    expect(rule).toMatch(/top: auto !important/);
    expect(rule).toMatch(/bottom: /);
  });
});
