import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const frontDoor = await import('./frontDoor.jsx').catch(() => ({}));
const {
  DEFAULT_GUIDE,
  initialGuide,
  sceneModeForPhase,
  guideModeForPhase,
  getBarButtons,
  playAction,
  studyAction,
  leaveStudy,
  arrivalOptions,
  shouldShowArrival,
  getStudyCaption,
  ArrivalOptions,
  SettingsPanel,
  shouldMountGuide,
  initialMotion,
} = frontDoor;

// Kyle, 2026-10-11: the brain is the front door. Sylvi greets every visitor,
// the bar holds four persistent buttons, and two options wait on the left.

describe('The guide on arrival', () => {
  it('is Sylvi unless the visitor chose Rollo before', () => {
    expect(DEFAULT_GUIDE).toBe('sylvi');
    expect(initialGuide(null)).toBe('sylvi');
    expect(initialGuide('nonsense')).toBe('sylvi');
    expect(initialGuide('rollo')).toBe('rollo');
  });
});

describe('Modes', () => {
  it('lets the guide act while exploring and studying, never during a game', () => {
    expect(sceneModeForPhase('ready')).toBe('study');
    expect(sceneModeForPhase('study')).toBe('study');
    for (const phase of ['countdown', 'playing', 'paused']) {
      expect(sceneModeForPhase(phase), phase).toBe('game');
    }
  });

  it('names the mode the guide is told about', () => {
    expect(guideModeForPhase('ready')).toBe('explore');
    expect(guideModeForPhase('study')).toBe('study');
    for (const phase of ['countdown', 'playing', 'paused']) {
      expect(guideModeForPhase(phase), phase).toBe('game');
    }
  });
});

describe('The bottom bar', () => {
  const labels = (state) => getBarButtons(state).map((button) => button.label);

  it('holds Colour Regions, Play the Game, Study the Brain and Settings, in that order', () => {
    expect(labels({ gamePhase: 'ready', brainReady: true, colorMode: true, settingsOpen: false })).toEqual([
      'Colour Regions',
      'Play the Game',
      'Study the Brain',
      'Settings',
    ]);
  });

  it('keeps the British spelling of Colour', () => {
    expect(labels({ gamePhase: 'ready', brainReady: true })[0]).toBe('Colour Regions');
  });

  it('turns Play the Game into Pause and Resume during a game', () => {
    expect(labels({ gamePhase: 'playing', brainReady: true })[1]).toBe('Pause');
    expect(labels({ gamePhase: 'paused', brainReady: true })[1]).toBe('Resume');
    expect(labels({ gamePhase: 'study', brainReady: true })[1]).toBe('Play the Game');
  });

  it('reports pressed and expanded states for assistive technology', () => {
    const buttons = getBarButtons({
      gamePhase: 'study',
      brainReady: true,
      colorMode: true,
      settingsOpen: true,
    });
    const [colour, play, study] = buttons;
    const settings = buttons.find((button) => button.id === 'settings');
    expect(colour.pressed).toBe(true);
    expect(play.pressed).toBe(false);
    expect(study.pressed).toBe(true);
    expect(settings.expanded).toBe(true);
  });

  it('cannot start or study before the brain loads, or mid-countdown', () => {
    for (const state of [
      { gamePhase: 'ready', brainReady: false },
      { gamePhase: 'countdown', brainReady: true },
    ]) {
      const [, play, study] = getBarButtons(state);
      expect(play.disabled, JSON.stringify(state)).toBe(true);
      expect(study.disabled, JSON.stringify(state)).toBe(true);
    }
    const [colour, , , settings] = getBarButtons({ gamePhase: 'ready', brainReady: false });
    expect(colour.disabled).toBeFalsy();
    expect(settings.disabled).toBeFalsy();
  });
});

describe('What Play the Game does', () => {
  it('starts from exploring, pauses a running game and resumes a paused one', () => {
    expect(playAction('ready')).toBe('start');
    expect(playAction('playing')).toBe('pause');
    expect(playAction('paused')).toBe('resume');
    expect(playAction('countdown')).toBeNull();
  });

  it('leaves Study for the game it came from, or a new one', () => {
    expect(playAction('study', 'ready')).toBe('leave-study-and-start');
    expect(playAction('study', 'paused')).toBe('leave-study-and-resume');
  });
});

describe('What Study the Brain does', () => {
  it('enters from exploring or a paused game, and pauses a running one first', () => {
    expect(studyAction('ready')).toBe('enter');
    expect(studyAction('paused')).toBe('enter');
    expect(studyAction('playing')).toBe('pause-and-enter');
  });

  it('leaves Study when pressed again, and does nothing mid-countdown', () => {
    expect(studyAction('study')).toBe('leave');
    expect(studyAction('countdown')).toBeNull();
  });

  it('returns where it came from and never resumes falling words by itself', () => {
    expect(leaveStudy('ready')).toBe('ready');
    expect(leaveStudy('paused')).toBe('paused');
    expect(leaveStudy('playing')).toBe('paused');
    expect(leaveStudy(undefined)).toBe('ready');
  });
});

describe('The two options on arrival', () => {
  it('offers Study the Brain and Play the Game, each with one sentence', () => {
    const options = arrivalOptions('Sylvi');
    expect(options.map((option) => option.label)).toEqual(['Study the Brain', 'Play the Game']);
    expect(options[0].text).toBe('Learn with Sylvi as your guide: ask anything, or take a tour of the lobes.');
    expect(options[1].text).toBe('Catch each falling word on the region that does the work.');
    for (const option of options) expect(option.text.split(/[.!?](\s|$)/).filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it('names whichever guide is chosen, and no guide in a build without voice', () => {
    expect(arrivalOptions('Rollo')[0].text).toContain('Rollo');
    expect(arrivalOptions(null)[0].text).toBe('Turn the brain and select any region to learn what it does.');
  });

  it('shows only while exploring, with the brain ready and no region selected', () => {
    expect(shouldShowArrival({ gamePhase: 'ready', brainReady: true, selectedRegion: null })).toBe(true);
    expect(shouldShowArrival({ gamePhase: 'ready', brainReady: false, selectedRegion: null })).toBe(false);
    expect(shouldShowArrival({ gamePhase: 'ready', brainReady: true, selectedRegion: { id: 5 } })).toBe(false);
    for (const gamePhase of ['study', 'countdown', 'playing', 'paused']) {
      expect(shouldShowArrival({ gamePhase, brainReady: true, selectedRegion: null }), gamePhase).toBe(false);
    }
  });

  it('renders as two stacked, pressable buttons with their sentences', () => {
    const markup = renderToStaticMarkup(<ArrivalOptions guideName="Sylvi" onStudy={() => {}} onPlay={() => {}} />);
    const study = markup.indexOf('Study the Brain');
    const play = markup.indexOf('Play the Game');
    expect(study).toBeGreaterThan(-1);
    expect(play).toBeGreaterThan(study);
    expect(markup.match(/<button type="button"/g)).toHaveLength(2);
    expect(markup).toContain('Catch each falling word');
    expect(markup).not.toContain('How to Play');
  });
});

describe('Study says what it is', () => {
  it('names the guide and the two ways to learn', () => {
    expect(getStudyCaption('rollo')).toEqual({
      title: 'Studying with Rollo',
      note: 'Ask Rollo anything, or turn the brain and select a region to read about it.',
    });
    expect(getStudyCaption('sylvi').title).toBe('Studying with Sylvi');
  });

  it('works without a guide in a build without voice', () => {
    expect(getStudyCaption(null)).toEqual({
      title: 'Study the Brain',
      note: 'Turn the brain and select any region to read about it.',
    });
  });
});

describe('Settings', () => {
  const props = {
    voiceEnabled: true,
    guide: 'sylvi',
    onGuide: () => {},
    difficulty: 'easy',
    onDifficulty: () => {},
    speed: 1,
    onSpeed: () => {},
  };

  it('holds the guide, the difficulty and the speed of falling words', () => {
    const markup = renderToStaticMarkup(<SettingsPanel {...props} />);
    expect(markup).toContain('id="settings-panel"');
    for (const text of ['Guide', 'Sylvi', 'Rollo', 'Difficulty', 'Easy', 'Hard', 'Speed']) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toContain('aria-label="Falling word speed"');
  });

  it('marks the current choices as pressed', () => {
    const markup = renderToStaticMarkup(<SettingsPanel {...props} guide="rollo" difficulty="hard" />);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Rollo</);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Hard</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*>Sylvi</);
  });

  // The guide moves the speed in quarters; Settings shows the true value.
  it('shows the speed the guide set, to the quarter', () => {
    const quarter = renderToStaticMarkup(<SettingsPanel {...props} speed={1.25} />);
    expect(quarter).toMatch(/class="speed-value"[^>]*>1\.25×</);
    expect(quarter).toContain('aria-valuetext="1.25 times"');
    const tenth = renderToStaticMarkup(<SettingsPanel {...props} speed={1} />);
    expect(tenth).toMatch(/class="speed-value"[^>]*>1\.0×</);
  });

  it('offers no guide choice in a build without voice', () => {
    const markup = renderToStaticMarkup(<SettingsPanel {...props} voiceEnabled={false} />);
    expect(markup).not.toContain('Sylvi');
    expect(markup).toContain('Difficulty');
  });
});

describe('The guide is there from arrival', () => {
  it('mounts in every phase once the brain is ready, in the voice build', () => {
    for (const gamePhase of ['ready', 'study', 'countdown', 'playing', 'paused']) {
      expect(shouldMountGuide({ voiceEnabled: true, brainReady: true, commandsReady: true, gamePhase }), gamePhase).toBe(true);
    }
  });

  it('waits for the brain, and stays out of a build without voice', () => {
    expect(shouldMountGuide({ voiceEnabled: true, brainReady: false, commandsReady: true, gamePhase: 'ready' })).toBe(false);
    expect(shouldMountGuide({ voiceEnabled: true, brainReady: true, commandsReady: false, gamePhase: 'ready' })).toBe(false);
    expect(shouldMountGuide({ voiceEnabled: false, brainReady: true, commandsReady: true, gamePhase: 'ready' })).toBe(false);
  });
});

describe('Motion on arrival', () => {
  it('is on, unless the visitor asks their system for reduced motion', () => {
    expect(initialMotion(false)).toBe(true);
    expect(initialMotion(true)).toBe(false);
  });
});

// Kyle, 2026-10-11: a midline section, only in Study, to test turning it on and off.
describe('The section control', () => {
  const labels = (state) => getBarButtons(state).map((button) => button.label);

  it('appears in the bar only while studying, after Study the Brain', () => {
    expect(labels({ gamePhase: 'study', brainReady: true })).toEqual([
      'Colour Regions',
      'Play the Game',
      'Study the Brain',
      'Section',
      'Settings',
    ]);
    for (const gamePhase of ['ready', 'countdown', 'playing', 'paused']) {
      expect(labels({ gamePhase, brainReady: true }), gamePhase).not.toContain('Section');
    }
  });

  it('shows whether the section is open', () => {
    const section = (open) => getBarButtons({ gamePhase: 'study', brainReady: true, sectionOpen: open }).find((b) => b.id === 'section');
    expect(section(false).pressed).toBe(false);
    expect(section(true).pressed).toBe(true);
  });
});
