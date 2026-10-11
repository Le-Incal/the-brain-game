import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

const columnModule = await import('./GuideColumn.jsx').catch(() => ({}));
const { GuideColumnView, Switch, NOTICE_GAP_PX, SWITCH_SIZE, noticeFor } = columnModule;
const layoutModule = await import('./voicePanelLayout.js').catch(() => ({}));
const { GUIDE_COLUMN_STYLE } = layoutModule;

// Kyle, 2026-10-11: a thin, tall column of text on the right, flowing on top
// of the page with no box; the quill marks where to write; two small switches
// for Voice and Motion; the sound notice sits under the Voice switch.

const baseProps = {
  guideName: 'Sylvi',
  entries: [
    { id: 'g0', fromGuide: true, text: 'Welcome. I am Sylvi, a human brain.', shown: 35, done: true },
    { id: 'u1', fromGuide: false, text: 'Where do headaches happen?', shown: 26, done: true },
    { id: 'g1', fromGuide: true, text: 'Not in me, strictly. I have no pain receptors.', shown: 24, done: false },
  ],
  following: true,
  onLatest: () => {},
  draft: '',
  onDraft: () => {},
  onSend: () => {},
  voice: { on: false, onChange: () => {} },
  motion: { on: true, onChange: () => {} },
  notice: 'Turn on sound and allow the microphone to speak with Sylvi.',
  consent: null,
};

const render = (props = {}) => renderToStaticMarkup(<GuideColumnView {...baseProps} {...props} />);

describe('The column', () => {
  it('floats on the page: no box, no border, thin and tall on the right', () => {
    expect(GUIDE_COLUMN_STYLE.position).toBe('absolute');
    expect(GUIDE_COLUMN_STYLE.right).toBeDefined();
    expect(GUIDE_COLUMN_STYLE.left).toBeUndefined();
    expect(GUIDE_COLUMN_STYLE.border).toBeUndefined();
    expect(GUIDE_COLUMN_STYLE.background ?? 'transparent').toBe('transparent');
    expect(GUIDE_COLUMN_STYLE.width).toBeGreaterThanOrEqual(240);
    expect(GUIDE_COLUMN_STYLE.width).toBeLessThanOrEqual(320);
    // Clear of the title above and the bar below.
    expect(GUIDE_COLUMN_STYLE.top).toBeDefined();
    expect(GUIDE_COLUMN_STYLE.bottom).toBeDefined();
  });

  it('names the conversation for assistive technology', () => {
    expect(render()).toContain('aria-label="Conversation with Sylvi"');
  });

  it('moves to the foot of the page on phones', () => {
    const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
    const mobile = html.slice(html.indexOf('@media (max-width: 640px)'));
    const start = mobile.indexOf('.guide-column {');
    expect(start).toBeGreaterThan(-1);
    const rule = mobile.slice(start, mobile.indexOf('}', start));
    expect(rule).toMatch(/top: auto !important/);
    expect(rule).toMatch(/bottom: /);
  });
});

describe('The transcript', () => {
  it('is a focusable, scrollable log', () => {
    const markup = render();
    expect(markup).toMatch(/class="guide-transcript"[^>]*role="log"/);
    expect(markup).toMatch(/role="log"[^>]*aria-live="polite"/);
    expect(markup).toMatch(/class="guide-transcript"[^>]*tabindex="0"/);
    expect(markup).toMatch(/class="guide-transcript"[^>]*style="[^"]*overflow-y:auto/);
  });

  it('sets the guide in roman and the visitor in italic, with no speaker names', () => {
    const markup = render();
    expect(markup).toMatch(/class="guide-line"[^>]*style="[^"]*font-style:normal/);
    expect(markup).toMatch(/class="visitor-line"[^>]*style="[^"]*font-style:italic/);
    expect(markup).not.toContain('Sylvi:');
    expect(markup).not.toContain('You:');
  });

  it('shows only what has streamed so far', () => {
    const markup = render();
    expect(markup).toContain('Not in me, strictly. I h');
    expect(markup).not.toContain('pain receptors');
  });

  it('gives screen readers whole sentences, not streaming letters', () => {
    const markup = render();
    expect(markup).toMatch(/<span aria-hidden="true">Not in me, strictly. I h<\/span>/);
    expect(markup).toMatch(/<span class="visually-hidden">Not in me, strictly.<\/span>/);
  });

  it('offers a way back to the latest line only after scrolling up', () => {
    expect(render({ following: true })).not.toContain('>Latest<');
    expect(render({ following: false })).toMatch(/<button type="button" class="guide-latest"[^>]*>Latest</);
  });
});

describe('Writing to the guide', () => {
  it('marks the field with the quill and a hairline, labelled for screen readers', () => {
    const markup = render();
    expect(markup).toMatch(/class="guide-quill" aria-hidden="true"/);
    expect(markup).toContain('<svg');
    expect(markup).toContain('<label for="guide-input" class="visually-hidden">Write to Sylvi</label>');
    expect(markup).toMatch(/<input id="guide-input"[^>]*placeholder="Write to Sylvi…"/);
    expect(markup).toMatch(/class="guide-write"[^>]*style="[^"]*border-bottom:/);
  });

  it('shows the quill at about 40 px tall', () => {
    expect(render()).toMatch(/class="guide-quill"[^>]*style="[^"]*height:40px/);
  });
});

describe('The switches', () => {
  it('are small, about 20 by 11 px', () => {
    expect(SWITCH_SIZE).toEqual({ width: 20, height: 11, knob: 7 });
  });

  it('are real switches for assistive technology, with a 24 px target', () => {
    const markup = renderToStaticMarkup(<Switch label="Voice" checked={false} onChange={() => {}} />);
    expect(markup).toMatch(/<button type="button" role="switch" aria-checked="false"/);
    expect(markup).toContain('>Voice<');
    expect(markup).toMatch(/min-height:24px/);
    const on = renderToStaticMarkup(<Switch label="Motion" checked onChange={() => {}} />);
    expect(on).toContain('aria-checked="true"');
  });

  it('sit under the field: Voice, then Motion', () => {
    const markup = render();
    const field = markup.indexOf('id="guide-input"');
    const voice = markup.indexOf('>Voice<');
    const motion = markup.indexOf('>Motion<');
    expect(voice).toBeGreaterThan(field);
    expect(motion).toBeGreaterThan(voice);
  });
});

describe('The sound notice', () => {
  it('sits under the switches with about 20 px between them', () => {
    expect(NOTICE_GAP_PX).toBe(20);
    const markup = render();
    const notice = markup.indexOf('Turn on sound and allow the microphone to speak with Sylvi.');
    expect(notice).toBeGreaterThan(markup.indexOf('>Motion<'));
    expect(markup).toMatch(/class="guide-notice"[^>]*style="[^"]*margin-top:20px/);
  });

  it('is gone once there is nothing to say', () => {
    expect(render({ notice: null })).not.toContain('guide-notice');
  });

  it('asks for consent in the same place before any voice or words go to ElevenLabs', () => {
    const markup = render({
      notice: null,
      consent: { text: 'Talking with your guide sends your voice to ElevenLabs.', onAgree: () => {}, onDecline: () => {} },
    });
    const consent = markup.indexOf('Talking with your guide sends your voice to ElevenLabs.');
    expect(consent).toBeGreaterThan(markup.indexOf('>Motion<'));
    expect(markup).toContain('>I agree<');
    expect(markup).toContain('>Not now<');
  });
});

describe('What the notice says', () => {
  it('invites the visitor to turn on sound while the voice is off', () => {
    expect(noticeFor('idle', null, 'Sylvi')).toEqual({
      text: 'Turn on sound and allow the microphone to speak with Sylvi.',
      invite: true,
    });
  });

  it('says the guide is waking while the conversation starts', () => {
    expect(noticeFor('requesting', null, 'Rollo')).toEqual({ text: 'Waking Rollo…' });
    expect(noticeFor('connecting', 'One moment, Rollo is getting ready…', 'Rollo')).toEqual({
      text: 'One moment, Rollo is getting ready…',
    });
  });

  it('explains plainly when the voice could not start, and says nothing once connected', () => {
    expect(noticeFor('unavailable', 'Your microphone is blocked.', 'Sylvi')).toEqual({ text: 'Your microphone is blocked.' });
    expect(noticeFor('connected', null, 'Sylvi')).toBeNull();
  });
});
