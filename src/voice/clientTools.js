/**
 * The nine client tools the ElevenLabs agent calls, mapped onto the scene
 * commands. Names and parameters match agent/architect-brief.md section 4
 * exactly (a drift test checks it). The SDK passes only a string or a number
 * back to the agent, so every result goes back as JSON text.
 */

import { coerceBooleanLike } from './sceneCommands.js';

export const AGENT_TOOL_NAMES = [
  'face_region',
  'rotate_to_view',
  'highlight_region',
  'clear_highlight',
  'set_colour_regions',
  'set_annotations',
  'lookup_region',
  'list_regions',
  'get_scene_state',
  'face_lobe',
  'start_tour',
  'next_tour_stop',
  'end_tour',
];

// Under the agent's 8 s response timeout, so the agent always hears the truth.
export const TOOL_TIMEOUT_MS = 7000;

/** Ported from the Atlas: parameters may arrive as JSON text or under `arguments`. */
export function normalizeToolParams(parameters) {
  if (parameters == null) return {};
  if (typeof parameters === 'string') {
    const text = parameters.trim();
    if (!text) return {};
    try {
      return normalizeToolParams(JSON.parse(text));
    } catch {
      const enabled = coerceBooleanLike(text);
      return enabled === undefined ? {} : { enabled };
    }
  }
  if (typeof parameters !== 'object' || Array.isArray(parameters)) return {};
  const nested = parameters.arguments;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) return { ...parameters, ...nested };
  return { ...parameters };
}

const TIMED_OUT = { ok: false, did: '', reason: 'The turn took too long, so I stopped it.' };

/**
 * `tourPacer` (optional) holds next_tour_stop until the guide has spoken about
 * the current stop. `onToolCall(name, ok)` hears every call, for the session
 * summary.
 */
export function createClientTools(
  commands,
  { cancelMoves = () => {}, tourPacer = null, onToolCall = () => {}, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}
) {
  const run = (name, call, { timed = false } = {}) => async (raw) => {
    const params = normalizeToolParams(raw);
    let timer = null;
    try {
      const work = Promise.resolve().then(() => call(params));
      const result = timed
        ? await Promise.race([
            work,
            new Promise((resolve) => {
              timer = setTimeoutImpl(() => {
                cancelMoves('timeout');
                resolve(TIMED_OUT);
              }, TOOL_TIMEOUT_MS);
            }),
          ])
        : await work;
      onToolCall(name, result?.ok !== false);
      return JSON.stringify(result);
    } catch (error) {
      onToolCall(name, false);
      return JSON.stringify({ ok: false, did: '', reason: error?.message ?? String(error) });
    } finally {
      if (timer !== null) clearTimeoutImpl?.(timer);
    }
  };

  async function startTour() {
    const result = await commands.startTour();
    if (result?.ok) tourPacer?.tourStarted();
    return result;
  }

  async function nextTourStop() {
    const refused = tourPacer?.request();
    if (refused) return refused;
    let result;
    try {
      result = await commands.nextTourStop();
    } finally {
      tourPacer?.arrived(result);
    }
    return result;
  }

  async function endTour() {
    tourPacer?.tourEnded();
    return commands.endTour();
  }

  return {
    face_region: run('face_region', (p) => commands.faceRegion(p.region_id, { hemisphere: p.hemisphere }), { timed: true }),
    rotate_to_view: run('rotate_to_view', (p) => commands.rotateTo(p.view), { timed: true }),
    highlight_region: run('highlight_region', (p) => commands.highlightRegion(p.region_id)),
    clear_highlight: run('clear_highlight', () => commands.clearHighlight()),
    set_colour_regions: run('set_colour_regions', (p) => commands.setColourRegions(p.enabled)),
    set_annotations: run('set_annotations', (p) => commands.setAnnotations(p.enabled)),
    lookup_region: run('lookup_region', (p) => commands.lookupRegion({ regionId: p.region_id, name: p.name })),
    list_regions: run('list_regions', () => commands.listRegions()),
    get_scene_state: run('get_scene_state', () => commands.getSceneState()),
    face_lobe: run('face_lobe', (p) => commands.faceLobe(p.lobe), { timed: true }),
    start_tour: run('start_tour', startTour, { timed: true }),
    next_tour_stop: run('next_tour_stop', nextTourStop, { timed: true }),
    end_tour: run('end_tour', endTour, { timed: true }),
  };
}

/** A hidden tab pauses animation frames, so a move would never finish: stop it. */
export function cancelMovesWhenHidden({ document: doc, cancelMoves }) {
  const onChange = () => {
    if (doc.hidden) cancelMoves('hidden');
  };
  doc.addEventListener('visibilitychange', onChange);
  return () => doc.removeEventListener('visibilitychange', onChange);
}
