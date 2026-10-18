import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Kyle, 2026-10-17, on his phone: "It's a mess, move the buttons for study and
// game to be small and in the bottom right. Limit text streaming to 3 lines,
// move the brain up, and consider where the descriptions for regions should
// go. Move the brain up under the title." Then: "Remove 'Voice is unavailable
// right now'. Remove 'Ask Sylvi anything' sentence. Remove the section button.
// In app mode you can change the buttons so they read, Study, and Play. Move
// Color regions button under the settings." And: "Region descriptions need to
// become compact. For instance, Broca Area should move to the same line as
// 'The articulate engine'. When a region is selected the title and header are
// replaced with the description." Phones only (640 px and under); desktop
// stays as it is.

const frontDoor = await import('./frontDoor.jsx').catch(() => ({}));
const app = await import('./App.jsx').catch(() => ({}));
const column = await import('./voice/GuideColumn.jsx').catch(() => ({}));
const availability = await import('./voice/voiceAvailability.js').catch(() => ({}));
const stream = await import('./voice/transcriptStream.js').catch(() => ({}));
const composition = await import('./utils/composition.js').catch(() => ({}));
const phoneModule = await import('./utils/phoneLayout.js').catch(() => ({}));
const pageTop = await import('./utils/pageTop.js').catch(() => ({}));

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const phoneCss = () => read('../index.html').match(/@media \(max-width: 640px\) \{([\s\S]*?)\n      \}/)?.[1] ?? '';
const rule = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
};

describe('Knowing it is a phone', () => {
  it('uses the same width as the page styles: 640 px and under', () => {
    expect(phoneModule.PHONE_QUERY).toBe('(max-width: 640px)');
    expect(phoneCss()).not.toBe('');
  });

  it('asks the browser, and says no when it cannot', () => {
    const { isPhoneLayout } = phoneModule;
    expect(isPhoneLayout({ matchMedia: (query) => ({ matches: query === '(max-width: 640px)' }) })).toBe(true);
    expect(isPhoneLayout({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isPhoneLayout(undefined)).toBe(false);
    expect(isPhoneLayout({ matchMedia: () => { throw new Error('no'); } })).toBe(false);
  });
});

describe('The bar on phones', () => {
  const labels = (state) => frontDoor.getBarButtons({ brainReady: true, ...state, phone: true }).map((button) => button.label);

  it('holds Settings, then Study and Play, from the moment the visitor arrives', () => {
    expect(labels({ gamePhase: 'ready', chosen: false })).toEqual(['Settings', 'Study', 'Play']);
    expect(labels({ gamePhase: 'ready', chosen: true })).toEqual(['Settings', 'Study', 'Play']);
  });

  it('still says Pause and Resume during a game', () => {
    expect(labels({ gamePhase: 'playing' })).toEqual(['Settings', 'Study', 'Pause']);
    expect(labels({ gamePhase: 'paused' })).toEqual(['Settings', 'Study', 'Resume']);
  });

  it('has no Colour Regions or Section, even in Study', () => {
    expect(labels({ gamePhase: 'study', sectionAvailable: true, colorMode: true })).toEqual(['Settings', 'Study', 'Play']);
  });

  it('keeps the desktop bar as it is', () => {
    const desktop = frontDoor.getBarButtons({ gamePhase: 'study', brainReady: true, sectionAvailable: true });
    expect(desktop.map((button) => button.label)).toEqual(['Colour Regions', 'Play the Game', 'Study the Brain', 'Section', 'Settings']);
  });

  it('sets Study and Play in the bottom right, and the score beside Settings on the left', () => {
    const css = phoneCss();
    expect(rule(css, '.game-controls .bar-settings')).toMatch(/order: 0;/);
    expect(rule(css, '.game-controls .score-display')).toMatch(/order: 1;/);
    expect(rule(css, '.game-controls .bar-study')).toMatch(/order: 2;[^}]*margin-left: auto !important;/);
    expect(rule(css, '.game-controls .bar-play')).toMatch(/order: 3;/);
  });

  it('shows no arrival panel: the two choices are in the bar', () => {
    expect(frontDoor.shouldShowArrival({ gamePhase: 'ready', brainReady: true, chosen: false, phone: true })).toBe(false);
    expect(frontDoor.shouldShowArrival({ gamePhase: 'ready', brainReady: true, chosen: false })).toBe(true);
  });

  it('is told it is on a phone', () => {
    const source = read('./App.jsx');
    expect(source).toMatch(/const phone = usePhoneLayout\(\);/);
    expect(source).toMatch(/getBarButtons\(\{[^}]*\bphone,/);
    expect(source).toMatch(/shouldShowArrival\(\{[^}]*\bphone\b[^}]*\}\)/);
  });
});

describe('Colour Regions in Settings on phones', () => {
  const { SettingsPanel } = frontDoor;
  const panel = (props) => renderToStaticMarkup(
    <SettingsPanel voiceEnabled guide="sylvi" onGuide={() => {}} difficulty="easy" onDifficulty={() => {}} speed={1} onSpeed={() => {}} {...props} />,
  );

  it('is a row of its own, Off and On, showing which is chosen', () => {
    const markup = panel({ colour: { on: true, onChange: () => {} } });
    expect(markup).toMatch(/class="settings-colour"/);
    expect(markup).toContain('Colour Regions');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>On<\/button>/);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>Off<\/button>/);
  });

  it('is left out on desktop, where Colour Regions stays in the bar', () => {
    expect(panel({})).not.toMatch(/settings-colour/);
  });

  it('is given the colour on phones only', () => {
    expect(read('./App.jsx')).toMatch(/colour=\{phone \? \{ on: colorMode, onChange: setColorMode \} : undefined\}/);
  });
});

describe('Study on phones', () => {
  it('says only who we study with', () => {
    expect(frontDoor.getStudyCaption('sylvi', { phone: true })).toEqual({ title: 'Studying with Sylvi', note: null });
    expect(frontDoor.getStudyCaption('sylvi').note).toMatch(/^Ask Sylvi anything/);
  });

  it('draws the sentence only when there is one', () => {
    const source = read('./App.jsx');
    expect(source).toMatch(/getStudyCaption\(VOICE_ENABLED \? guide : null, \{ phone \}\)/);
    expect(source).toMatch(/\{studyCaption\.note && \(/);
  });
});

describe("A region's description on phones", () => {
  const region = { id: 6, name: "Broca's Area", subtitle: 'The Articulate Engine', description: 'Speech.' };
  const text = "Broca's area assembles the motor program of speech.";

  it('takes the place of the title and header in Explore and Study', () => {
    const { descriptionInHeader } = app;
    expect(descriptionInHeader({ phone: true, describedRegion: region, gamePhase: 'ready' })).toBe(true);
    expect(descriptionInHeader({ phone: true, describedRegion: region, gamePhase: 'study' })).toBe(true);
    expect(descriptionInHeader({ phone: true, describedRegion: null, gamePhase: 'study' })).toBe(false);
    expect(descriptionInHeader({ phone: false, describedRegion: region, gamePhase: 'study' })).toBe(false);
    for (const gamePhase of ['offer', 'countdown', 'playing', 'paused']) {
      expect(descriptionInHeader({ phone: true, describedRegion: region, gamePhase }), gamePhase).toBe(false);
    }
  });

  it('hides the title while it is there, and only then', () => {
    const { headerShows, shouldShowHeader } = app;
    expect(headerShows({ gamePhase: 'ready', inHeader: true })).toBe(false);
    for (const gamePhase of ['ready', 'offer', 'countdown', 'playing', 'paused', 'study']) {
      expect(headerShows({ gamePhase, inHeader: false }), gamePhase).toBe(shouldShowHeader(gamePhase));
    }
  });

  it('is wired: the title and the Study heading give way, and the panel moves up', () => {
    const source = read('./App.jsx');
    expect(source).toMatch(/const inHeader = descriptionInHeader\(\{ phone, describedRegion, gamePhase \}\);/);
    expect(source).toMatch(/\{headerShows\(\{ gamePhase, inHeader \}\) && \(/);
    expect(source).toMatch(/\{studyCaption && !inHeader && \(/);
    expect(source).toMatch(/className="description-panel" data-place=\{inHeader \? 'header' : undefined\}/);
  });

  it('comes from a tap or the guide: a phone has no hover', () => {
    const { getDescribedRegion } = app;
    const hovered = { id: 2, name: 'Premotor Cortex' };
    expect(getDescribedRegion({ hoveredRegion: hovered, phone: true })).toBeNull();
    expect(getDescribedRegion({ hoveredRegion: hovered })).toBe(hovered);
    expect(getDescribedRegion({ selectedRegion: region, hoveredRegion: hovered, phone: true })).toBe(region);
    expect(read('./App.jsx')).toMatch(/getDescribedRegion\(\{[^}]*\bphone,/);
  });

  it('sets the name on the same line as its title, then the text', () => {
    const markup = renderToStaticMarkup(<app.RegionDescription region={region} text={text} />);
    expect(markup).toMatch(/class="region-title"[^>]*>The Articulate Engine<\/span>/);
    expect(markup).toMatch(/class="region-name"[^>]*>Broca(&#x27;|')s Area<\/span>/);
    expect(markup).toMatch(/class="region-text"[^>]*>Broca/);
    const css = phoneCss();
    expect(css).toMatch(/\.region-title,\s*\.region-name \{[^}]*display: inline !important;/);
    expect(rule(css, '.region-name::before')).toMatch(/content: '·';/);
    expect(rule(css, '.region-text')).toMatch(/margin-top: 4px !important;/);
  });

  it('sits where the title was', () => {
    const header = rule(phoneCss(), '.description-panel[data-place="header"]');
    expect(header).toMatch(/top: clamp\(16px, 3vh, 28px\) !important;/);
    expect(header).toMatch(/background: transparent;/);
    expect(header).toMatch(/border: none;/);
  });
});

describe('The notice on phones', () => {
  it('leaves out "Voice is unavailable right now", but keeps the lines that say when voice returns', () => {
    const { noticeFor } = column;
    const { VOICE_UNAVAILABLE, describeVoiceUnavailable } = availability;
    expect(VOICE_UNAVAILABLE).toBe('Voice is unavailable right now. The game works as usual.');
    expect(describeVoiceUnavailable({})).toBe(VOICE_UNAVAILABLE);
    expect(noticeFor('unavailable', VOICE_UNAVAILABLE, 'Sylvi', { phone: true })).toBeNull();
    expect(noticeFor('unavailable', VOICE_UNAVAILABLE, 'Sylvi')).toEqual({ text: VOICE_UNAVAILABLE });
    const cap = describeVoiceUnavailable({ reason: 'device_daily_cap', resetsInSeconds: 7200 });
    expect(noticeFor('unavailable', cap, 'Sylvi', { phone: true })).toEqual({ text: cap });
  });

  it('is told when it is on a phone', () => {
    const source = read('./voice/VoicePanel.jsx');
    expect(source).toMatch(/const phone = usePhoneLayout\(\);/);
    expect(source).toMatch(/noticeFor\(state\.phase, state\.message, name, \{[^}]*\bphone,/);
  });
});

describe('The conversation on phones', () => {
  it('shows at most three lines: 14 px at 1.5, and the small gaps between them', () => {
    const css = phoneCss();
    expect(rule(css, '.guide-transcript')).toMatch(/max-height: 66px !important;/);
    expect(rule(css, '.guide-transcript')).toMatch(/mask-image: linear-gradient\(to bottom, transparent 0, #000 10px\) !important;/);
    expect(rule(css, '.guide-transcript > div')).toMatch(/padding-top: 0 !important;/);
    expect(css).toMatch(/\.guide-line, \.visitor-line \{[^}]*font-size: 14px !important;[^}]*line-height: 1\.5 !important;[^}]*margin-bottom: 3px !important;/);
  });
});

// From Kyle's first screenshot: his line read "clears throat Show me the
// temporal lobe." The speech engine's sound tags are not his words.
describe("The visitor's spoken words without sound tags", () => {
  const { withoutSoundTags } = stream;

  it('drops tags like (clears throat) and [laughs]', () => {
    expect(withoutSoundTags('(clears throat) Show me the temporal lobe.')).toBe('Show me the temporal lobe.');
    expect(withoutSoundTags('Show me [laughs] the cerebellum')).toBe('Show me the cerebellum');
    expect(withoutSoundTags('I see (laughs).')).toBe('I see.');
    expect(withoutSoundTags('(coughs)')).toBe('');
  });

  it('drops a bare sound at the start, before the first word', () => {
    expect(withoutSoundTags('clears throat Show me the temporal lobe.')).toBe('Show me the temporal lobe.');
    expect(withoutSoundTags('coughs What is this?')).toBe('What is this?');
  });

  it('keeps ordinary words and brackets that are not sounds', () => {
    expect(withoutSoundTags('Is the PFC (Area 10) involved?')).toBe('Is the PFC (Area 10) involved?');
    expect(withoutSoundTags('Laughs aside, what is the insula?')).toBe('Laughs aside, what is the insula?');
    expect(withoutSoundTags('Show me the temporal lobe.')).toBe('Show me the temporal lobe.');
  });

  it('applies to what the visitor says, not to what they write', () => {
    const source = read('./voice/VoicePanel.jsx');
    expect(source).toMatch(/stream\.addVisitor\(\{ id: payload\.event_id \? `u-\$\{payload\.event_id\}` : nextLineId\('u'\), text: withoutSoundTags\(raw\) \}\);/);
    expect(source).toMatch(/stream\.addVisitor\(\{ id: nextLineId\('typed'\), text \}\);/);
  });
});

// Also from the first screenshot: the title was cut off at the top. On an
// iPhone the page scrolls up to show the field above the keyboard and can stay
// there after the keyboard closes.
describe('The page after the keyboard closes', () => {
  const { keepPageAtTop, PAGE_TOP_SETTLE_MS } = pageTop;

  function fakePage(scrollY) {
    const listeners = {};
    const calls = [];
    const timers = [];
    const win = { scrollY, scrollTo(x, y) { calls.push([x, y]); this.scrollY = y; } };
    const doc = {
      addEventListener: (type, fn) => { listeners[type] = fn; },
      removeEventListener: (type, fn) => { if (listeners[type] === fn) delete listeners[type]; },
    };
    const schedule = (fn, ms) => timers.push({ fn, ms });
    return { win, doc, schedule, listeners, calls, timers };
  }

  it('scrolls back to the top when a text field lets go, and again once the keyboard has gone', () => {
    const page = fakePage(120);
    keepPageAtTop(page);
    page.listeners.focusout({ target: { tagName: 'INPUT' } });
    expect(page.calls).toEqual([[0, 0]]);
    // iOS may scroll once more as the keyboard slides away.
    page.win.scrollY = 40;
    expect(page.timers.map((timer) => timer.ms)).toEqual([PAGE_TOP_SETTLE_MS]);
    page.timers[0].fn();
    expect(page.calls).toEqual([[0, 0], [0, 0]]);
  });

  it('leaves the page alone when it has not moved, or when a button lets go', () => {
    const still = fakePage(0);
    keepPageAtTop(still);
    still.listeners.focusout({ target: { tagName: 'TEXTAREA' } });
    still.timers.forEach((timer) => timer.fn());
    expect(still.calls).toEqual([]);
    const button = fakePage(120);
    keepPageAtTop(button);
    button.listeners.focusout({ target: { tagName: 'BUTTON' } });
    expect(button.calls).toEqual([]);
    expect(button.timers).toEqual([]);
  });

  it('stops listening when asked, and runs in the app', () => {
    const page = fakePage(120);
    const stop = keepPageAtTop(page);
    stop();
    expect(page.listeners.focusout).toBeUndefined();
    expect(read('./App.jsx')).toMatch(/useEffect\(\(\) => keepPageAtTop\(\), \[\]\);/);
  });
});

// "Move the brain up under the title." Its top sits 100 px down the page, a
// little under the title's rule on every phone (76 to 88 px). The game keeps
// today's height and the brain slides between them, as on desktop.
describe("A phone's brain under the title", () => {
  const { PHONE_BRAIN_TOP_CSS_PX, shiftToTop, centreShiftFor, composeSpecimenY } = composition;
  const viewportHeight = 2.157;

  // Kyle, 2026-10-17: "We can lower the brain position now slightly." 24 px.
  it('moves the brain so its top lands 124 px down the page', () => {
    expect(PHONE_BRAIN_TOP_CSS_PX).toBe(124);
    // At 390 x 664 today the brain's top is at 291 px.
    const shift = shiftToTop({ shift: 0, topPx: 291, targetTopPx: 100, height: 664, viewportHeight });
    expect(shift).toBeCloseTo((191 / 664) * viewportHeight, 10);
    expect(shiftToTop({ shift: 0.3, topPx: 100, targetTopPx: 100, height: 664, viewportHeight })).toBe(0.3);
    expect(shiftToTop({ shift: 0.3, topPx: 90, targetTopPx: 100, height: 664, viewportHeight })).toBeLessThan(0.3);
  });

  it('uses it in Explore and Study, and the game height in the game', () => {
    const phone = { baseY: -0.5, gameShift: 0, panY: 0, responsiveOffset: -0.2 };
    const centreShift = centreShiftFor({ width: 390, brainCentre: -0.075, scale: 0.73, gameShift: 0, phoneShift: 0.62 });
    expect(centreShift).toBe(0.62);
    expect(composeSpecimenY({ ...phone, centreShift, lift: 0 })).toBe(composeSpecimenY({ ...phone, centreShift: 0, lift: 0 }));
    expect(composeSpecimenY({ ...phone, centreShift, lift: 1 }) - composeSpecimenY({ ...phone, centreShift, lift: 0 })).toBeCloseTo(0.62, 10);
  });

  it('leaves desktops centred, and a phone with nothing measured where it was', () => {
    expect(centreShiftFor({ width: 1440, brainCentre: -0.075, scale: 1, gameShift: -0.115, phoneShift: 0.62 })).toBeCloseTo(0.075, 10);
    expect(centreShiftFor({ width: 390, brainCentre: -0.075, scale: 0.73, gameShift: 0 })).toBe(0);
  });

  it("is measured by the app's scene only, never the landing's", () => {
    const scene = read('./utils/brainScene.js');
    expect(scene).toMatch(/phoneShift: this\._phoneShift/);
    expect(scene).toMatch(/this\._phoneTopPx = options\.phoneTop \? PHONE_BRAIN_TOP_CSS_PX : null;/);
    expect(scene).toMatch(/this\._phoneShift = this\._landedPhoneShift\(\);/);
    expect(read('./App.jsx')).toMatch(/new BrainScene\(mountRef\.current, \{[^}]*phoneTop: true/);
    expect(read('./landing/landing.js')).not.toMatch(/phoneTop/);
  });
});
