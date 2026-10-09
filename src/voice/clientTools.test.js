import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const toolsModule = await import('./clientTools.js').catch(() => ({}));
const { AGENT_TOOL_NAMES, TOOL_TIMEOUT_MS, createClientTools, normalizeToolParams, cancelMovesWhenHidden } = toolsModule;

function recordingCommands(overrides = {}) {
  const calls = [];
  const command = (name, result = { ok: true, did: `${name} done`, reason: '' }) => (...args) => {
    calls.push([name, ...args]);
    return result;
  };
  return {
    calls,
    commands: {
      faceRegion: command('faceRegion'),
      rotateTo: command('rotateTo'),
      highlightRegion: command('highlightRegion'),
      clearHighlight: command('clearHighlight'),
      setColourRegions: command('setColourRegions'),
      setAnnotations: command('setAnnotations'),
      lookupRegion: command('lookupRegion', { ok: true, region: { id: 6, name: "Broca's Area" } }),
      listRegions: command('listRegions', { ok: true, divisions: [] }),
      getSceneState: command('getSceneState', { ok: true, view: 'left_lateral' }),
      faceLobe: command('faceLobe'),
      startTour: command('startTour', { ok: true, did: 'Started the tour.', reason: '', stops: [] }),
      nextTourStop: command('nextTourStop', { ok: true, did: 'Turned.', reason: '', stop: 1, of: 7 }),
      endTour: command('endTour', { ok: true, did: 'Ended the tour.', reason: '', done: true }),
      ...overrides,
    },
  };
}

describe('M4: the nine client tools', () => {
  it('match the tools in agent/architect-brief.md section 4 exactly', () => {
    const brief = readFileSync(fileURLToPath(new URL('../../agent/architect-brief.md', import.meta.url)), 'utf8');
    const section = brief.slice(brief.indexOf('## 4.'), brief.indexOf('## 5.'));
    const headings = [...section.matchAll(/^### ([a-z_]+)$/gm)].map((match) => match[1]);
    expect(AGENT_TOOL_NAMES).toEqual(headings);
    expect(AGENT_TOOL_NAMES).toHaveLength(13);
  });

  it('exposes every tool by its exact name', () => {
    const tools = createClientTools(recordingCommands().commands);
    for (const name of AGENT_TOOL_NAMES) expect(typeof tools[name], name).toBe('function');
  });

  it.each([
    ['face_region', { region_id: 6, hemisphere: 'left' }, ['faceRegion', 6, { hemisphere: 'left' }]],
    ['face_region', { region_id: 11 }, ['faceRegion', 11, { hemisphere: undefined }]],
    ['rotate_to_view', { view: 'posterior' }, ['rotateTo', 'posterior']],
    ['highlight_region', { region_id: 9 }, ['highlightRegion', 9]],
    ['clear_highlight', {}, ['clearHighlight']],
    ['set_colour_regions', { enabled: true }, ['setColourRegions', true]],
    ['set_annotations', { enabled: 'false' }, ['setAnnotations', 'false']],
    ['lookup_region', { name: "broca's area" }, ['lookupRegion', { regionId: undefined, name: "broca's area" }]],
    ['lookup_region', { region_id: 19 }, ['lookupRegion', { regionId: 19, name: undefined }]],
    ['list_regions', {}, ['listRegions']],
    ['get_scene_state', {}, ['getSceneState']],
    ['face_lobe', { lobe: 'Temporal Lobe' }, ['faceLobe', 'Temporal Lobe']],
    ['start_tour', {}, ['startTour']],
    ['next_tour_stop', {}, ['nextTourStop']],
    ['end_tour', {}, ['endTour']],
  ])('%s %j calls the scene command', async (name, params, expected) => {
    const { commands, calls } = recordingCommands();
    await createClientTools(commands)[name](params);
    expect(calls).toEqual([expected]);
  });

  it('returns each result as JSON text, which is all the SDK passes back to the agent', async () => {
    const { commands } = recordingCommands();
    const result = await createClientTools(commands).face_region({ region_id: 6 });
    expect(typeof result).toBe('string');
    expect(JSON.parse(result)).toEqual({ ok: true, did: 'faceRegion done', reason: '' });
  });

  it('accepts parameters sent as a JSON string or nested under arguments', async () => {
    const { commands, calls } = recordingCommands();
    const tools = createClientTools(commands);
    await tools.highlight_region('{"region_id": 4}');
    await tools.highlight_region({ arguments: { region_id: 5 } });
    expect(calls).toEqual([
      ['highlightRegion', 4],
      ['highlightRegion', 5],
    ]);
    expect(normalizeToolParams(null)).toEqual({});
    expect(normalizeToolParams('not json')).toEqual({});
  });

  it('answers the agent truthfully when a command throws, and never throws itself', async () => {
    const { commands } = recordingCommands({
      rotateTo: () => {
        throw new Error('scene not ready');
      },
    });
    const result = JSON.parse(await createClientTools(commands).rotate_to_view({ view: 'anterior' }));
    expect(result).toEqual({ ok: false, did: '', reason: 'scene not ready' });
  });
});

describe('M4: a move never outlasts the agent', () => {
  it('stops waiting before the 8-second agent timeout and cancels the move', async () => {
    expect(TOOL_TIMEOUT_MS).toBeLessThan(8000);
    const timers = [];
    const cancelled = [];
    const { commands } = recordingCommands({ faceRegion: () => new Promise(() => {}) });
    const tools = createClientTools(commands, {
      cancelMoves: (reason) => cancelled.push(reason),
      setTimeoutImpl: (fn, ms) => timers.push({ fn, ms }),
    });
    const pending = tools.face_region({ region_id: 6 });
    expect(timers.map(({ ms }) => ms)).toEqual([TOOL_TIMEOUT_MS]);
    timers[0].fn();
    const result = JSON.parse(await pending);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too long/i);
    expect(cancelled).toEqual(['timeout']);
  });

  it('cancels any move when the tab is hidden, and stops watching on cleanup', () => {
    const listeners = new Map();
    const doc = {
      hidden: false,
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type),
    };
    const cancelled = [];
    const stop = cancelMovesWhenHidden({ document: doc, cancelMoves: (reason) => cancelled.push(reason) });
    listeners.get('visibilitychange')();
    doc.hidden = true;
    listeners.get('visibilitychange')();
    expect(cancelled).toEqual(['hidden']);
    stop();
    expect(listeners.has('visibilitychange')).toBe(false);
  });
});

describe('The brief and the dashboard agree on execution mode', () => {
  const brief = readFileSync(fileURLToPath(new URL('../../agent/architect-brief.md', import.meta.url)), 'utf8');
  const section = brief.slice(brief.indexOf('## 4.'), brief.indexOf('## 5.'));
  const settings = section.split('\n').find((line) => line.startsWith('Create each as a **Client tool**'));

  // next_tour_stop runs after the guide's audio for the turn has finished, so
  // the lobe lights as the guide starts on it, not a stop ahead of the voice.
  it('says next_tour_stop runs post_tool_speech and the other twelve run immediate', () => {
    expect(settings).toMatch(/`execution_mode: immediate`/);
    expect(settings).toMatch(/next_tour_stop[^.]*`execution_mode: post_tool_speech`/);
  });

  it("documents next_tour_stop's refusal and its instruction", () => {
    const tool = section.slice(section.indexOf('### next_tour_stop'), section.indexOf('### end_tour'));
    expect(tool).toMatch(/ok: false/);
    expect(tool).toMatch(/instruction/);
    expect(tool).toMatch(/8 s/);
    expect(tool).toMatch(/20 s/);
  });
});

const pacerModule = await import('./tourPacer.js').catch(() => ({}));

describe('next_tour_stop waits for the guide (lockstep gate)', () => {
  function pacedTools() {
    const clock = { now: 0 };
    const pacer = pacerModule.createTourPacer({ now: () => clock.now });
    let stop = 0;
    const { commands, calls } = recordingCommands({
      nextTourStop: () => {
        calls.push(['nextTourStop']);
        stop += 1;
        return { ok: true, did: 'Turned.', reason: '', stop, of: 7, lobe: ['Frontal Lobe', 'Parietal Lobe'][stop - 1] };
      },
    });
    const tools = createClientTools(commands, { tourPacer: pacer });
    return { tools, calls, pacer, clock };
  }

  it('refuses a chained call without moving the brain, and tells the guide what to do', async () => {
    const { tools, calls } = pacedTools();
    await tools.start_tour({});
    expect(JSON.parse(await tools.next_tour_stop({}))).toMatchObject({ ok: true, stop: 1 });
    const refused = JSON.parse(await tools.next_tour_stop({}));
    expect(refused).toMatchObject({
      ok: false,
      instruction: 'Describe the Frontal Lobe first (two or three sentences), then call next_tour_stop.',
    });
    expect(calls.filter(([name]) => name === 'nextTourStop')).toHaveLength(1);
  });

  it('moves on once the guide has spoken about the stop', async () => {
    const { tools, calls, pacer, clock } = pacedTools();
    await tools.start_tour({});
    await tools.next_tour_stop({});
    pacer.guideSpeaking(true);
    clock.now += 8000;
    pacer.guideSpeaking(false);
    expect(JSON.parse(await tools.next_tour_stop({}))).toMatchObject({ ok: true, stop: 2, lobe: 'Parietal Lobe' });
    expect(calls.filter(([name]) => name === 'nextTourStop')).toHaveLength(2);
  });

  it('end_tour is never gated, and clears the gate', async () => {
    const { tools, calls } = pacedTools();
    await tools.start_tour({});
    await tools.next_tour_stop({});
    expect(JSON.parse(await tools.end_tour({}))).toMatchObject({ ok: true, done: true });
    expect(JSON.parse(await tools.next_tour_stop({})).ok).toBe(true);
    expect(calls.filter(([name]) => name === 'nextTourStop')).toHaveLength(2);
  });

  it('works without a pacer exactly as before', async () => {
    const { commands, calls } = recordingCommands();
    const tools = createClientTools(commands);
    await tools.next_tour_stop({});
    await tools.next_tour_stop({});
    expect(calls).toEqual([['nextTourStop'], ['nextTourStop']]);
  });
});

describe('Every tool call is reported for the session summary', () => {
  it('reports each call by name with whether it succeeded', async () => {
    const reported = [];
    const { commands } = recordingCommands({
      rotateTo: () => {
        throw new Error('scene not ready');
      },
    });
    const tools = createClientTools(commands, { onToolCall: (name, ok) => reported.push([name, ok]) });
    await tools.face_region({ region_id: 6 });
    await tools.rotate_to_view({ view: 'anterior' });
    await tools.lookup_region({ region_id: 19 });
    expect(reported).toEqual([
      ['face_region', true],
      ['rotate_to_view', false],
      ['lookup_region', true],
    ]);
  });

  it('reports a gate refusal as a failed next_tour_stop', async () => {
    const reported = [];
    const pacer = pacerModule.createTourPacer({ now: () => 0 });
    const { commands } = recordingCommands({
      nextTourStop: () => ({ ok: true, did: 'Turned.', reason: '', stop: 1, of: 7, lobe: 'Frontal Lobe' }),
    });
    const tools = createClientTools(commands, { tourPacer: pacer, onToolCall: (name, ok) => reported.push([name, ok]) });
    await tools.start_tour({});
    await tools.next_tour_stop({});
    await tools.next_tour_stop({});
    expect(reported).toEqual([
      ['start_tour', true],
      ['next_tour_stop', true],
      ['next_tour_stop', false],
    ]);
  });
});

describe('A gate refusal is reported as refused, with the speech it measured', () => {
  it('hands the refusal and its measured speech to onToolCall, and nothing extra to the agent', async () => {
    const reported = [];
    const clock = { now: 0 };
    const pacer = pacerModule.createTourPacer({ now: () => clock.now });
    const { commands } = recordingCommands({
      nextTourStop: () => ({ ok: true, did: 'Turned.', reason: '', stop: 1, of: 7, lobe: 'Frontal Lobe' }),
    });
    const tools = createClientTools(commands, { tourPacer: pacer, onToolCall: (...args) => reported.push(args) });
    await tools.start_tour({});
    await tools.next_tour_stop({});
    pacer.guideSpeaking(true);
    clock.now += 3100;
    pacer.guideSpeaking(false);
    const answer = JSON.parse(await tools.next_tour_stop({}));
    expect(reported).toEqual([
      ['start_tour', true],
      ['next_tour_stop', true],
      ['next_tour_stop', false, { refused: true, spokenMs: 3100 }],
    ]);
    expect(Object.keys(answer).sort()).toEqual(['did', 'instruction', 'ok', 'reason']);
  });
});
