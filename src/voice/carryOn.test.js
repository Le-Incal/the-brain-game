import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const carryOnModule = await import('./carryOn.js').catch(() => ({}));

// Kyle, 2026-10-23: Sylvi switched to Study, asked "tour or region?", and
// went silent. The app had ended her conversation to start a fresh one for
// Study, and the fresh one was refused. Study now keeps the conversation
// that is running, as Atlas does; only the 8-minute cap carries it on.
describe('Study keeps the running conversation', () => {
  it('no longer starts a fresh session on entering Study', () => {
    expect(carryOnModule.freshSessionOnModeChange).toBeUndefined();
    expect(carryOnModule.studyHandoverTiming).toBeUndefined();
    expect(carryOnModule.STUDY_HANDOVER_WAIT_MS).toBeUndefined();
  });

  it('is wired: changing mode never hands the conversation over', () => {
    const panel = readFileSync(fileURLToPath(new URL('./VoicePanel.jsx', import.meta.url)), 'utf8');
    const modeEffect = panel.slice(panel.indexOf('const previousModeRef = useRef(mode);'), panel.indexOf('// A hidden tab rests the conversation'));
    expect(modeEffect).not.toMatch(/handOver\(/);
    expect(panel).not.toMatch(/studyHandoverRef/);
  });
});
