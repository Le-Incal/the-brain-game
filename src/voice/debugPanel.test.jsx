import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import brainRegions from '../data/brainRegions.json';
import App from '../App.jsx';

const debugModule = await import('./debugPanel.jsx').catch(() => ({}));
const { shouldShowVoiceDebugPanel, buildDebugActions, runDebugAction, VoiceDebugPanel } = debugModule;

function recordingCommands() {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push([name, ...args]);
    return { ok: true, did: `${name} done`, reason: '' };
  };
  return {
    calls,
    commands: {
      faceRegion: record('faceRegion'),
      rotateTo: record('rotateTo'),
      highlightRegion: record('highlightRegion'),
      clearHighlight: record('clearHighlight'),
      setColourRegions: record('setColourRegions'),
      setAnnotations: record('setAnnotations'),
    },
  };
}

describe('dev command panel: when it shows', () => {
  it('shows only with the voice flag on and ?debug=voice in the URL', () => {
    expect(shouldShowVoiceDebugPanel({ voiceEnabled: true, search: '?debug=voice' })).toBe(true);
    expect(shouldShowVoiceDebugPanel({ voiceEnabled: true, search: '?x=1&debug=voice' })).toBe(true);
  });

  it.each([
    [false, '?debug=voice'],
    [true, ''],
    [true, '?debug=Voice'],
    [true, '?debug=voices'],
    [true, '?debugvoice'],
    [false, ''],
    [true, undefined],
  ])('stays hidden for voiceEnabled=%s, search=%j', (voiceEnabled, search) => {
    expect(shouldShowVoiceDebugPanel({ voiceEnabled, search })).toBe(false);
  });

  it('renders nothing when hidden, however it is asked', () => {
    const { commands } = recordingCommands();
    expect(renderToStaticMarkup(<VoiceDebugPanel visible={false} commands={commands} />)).toBe('');
  });

  it('never appears in the app as built for tests and production (flag off)', () => {
    expect(renderToStaticMarkup(<App />)).not.toContain('voice-debug');
  });
});

describe('dev command panel: what it offers', () => {
  const actions = buildDebugActions?.() ?? [];
  const leftOnly = new Set(brainRegions.gameplayNotes.lateralized);

  it('faces every region on every hemisphere it has', () => {
    const face = actions.filter((action) => action.command === 'faceRegion');
    const expected = brainRegions.regions.flatMap((region) =>
      (leftOnly.has(region.id) ? ['left'] : ['left', 'right']).map((hemisphere) => [region.id, hemisphere])
    );
    expect(face.map(({ args }) => [args[0], args[1].hemisphere])).toEqual(expected);
    expect(face).toHaveLength(38);
  });

  it('turns to each of the six views', () => {
    expect(actions.filter((a) => a.command === 'rotateTo').map((a) => a.args[0])).toEqual([
      'left_lateral',
      'right_lateral',
      'anterior',
      'posterior',
      'superior',
      'inferior',
    ]);
  });

  it('highlights each region, clears, and switches colour and labels both ways', () => {
    expect(actions.filter((a) => a.command === 'highlightRegion').map((a) => a.args[0])).toEqual(
      brainRegions.regions.map(({ id }) => id)
    );
    expect(actions.filter((a) => a.command === 'clearHighlight')).toHaveLength(1);
    for (const command of ['setColourRegions', 'setAnnotations']) {
      expect(actions.filter((a) => a.command === command).map((a) => a.args[0])).toEqual([true, false]);
    }
  });

  it('labels every action so it can be told apart', () => {
    const labels = actions.map(({ label }) => label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Face 6 Broca's Area (left)");
  });
});

describe('dev command panel: running an action', () => {
  it('calls the scene command directly and returns its result', async () => {
    const { commands, calls } = recordingCommands();
    const action = buildDebugActions().find((a) => a.label === "Face 6 Broca's Area (left)");
    expect(await runDebugAction(commands, action)).toEqual({ ok: true, did: 'faceRegion done', reason: '' });
    expect(calls).toEqual([['faceRegion', 6, { hemisphere: 'left' }]]);
  });

  it('turns a thrown error into a truthful failure', async () => {
    const commands = { rotateTo: () => Promise.reject(new Error('boom')) };
    const action = buildDebugActions().find((a) => a.command === 'rotateTo');
    expect(await runDebugAction(commands, action)).toEqual({ ok: false, did: '', reason: 'boom' });
  });

  it('shows the last result as ok, did and reason', () => {
    const { commands } = recordingCommands();
    const markup = renderToStaticMarkup(
      <VoiceDebugPanel
        visible
        commands={commands}
        initialResult={{
          label: 'Face 99',
          result: { ok: false, did: '', reason: 'region_id must be a whole number from 1 to 20.' },
        }}
      />
    );
    expect(markup).toContain('voice-debug');
    expect(markup).toContain('Face 99');
    expect(markup).toContain('ok: false');
    expect(markup).toContain('region_id must be a whole number from 1 to 20.');
  });
});
