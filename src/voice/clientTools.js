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

export function createClientTools(commands, { cancelMoves = () => {}, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  const run = (call, { timed = false } = {}) => async (raw) => {
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
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ ok: false, did: '', reason: error?.message ?? String(error) });
    } finally {
      if (timer !== null) clearTimeoutImpl?.(timer);
    }
  };

  return {
    face_region: run((p) => commands.faceRegion(p.region_id, { hemisphere: p.hemisphere }), { timed: true }),
    rotate_to_view: run((p) => commands.rotateTo(p.view), { timed: true }),
    highlight_region: run((p) => commands.highlightRegion(p.region_id)),
    clear_highlight: run(() => commands.clearHighlight()),
    set_colour_regions: run((p) => commands.setColourRegions(p.enabled)),
    set_annotations: run((p) => commands.setAnnotations(p.enabled)),
    lookup_region: run((p) => commands.lookupRegion({ regionId: p.region_id, name: p.name })),
    list_regions: run(() => commands.listRegions()),
    get_scene_state: run(() => commands.getSceneState()),
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
