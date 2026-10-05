/**
 * Scene commands: the nine actions the voice guide can take on the specimen.
 *
 * Each command reports what actually happened ({ ok, did, reason }); the Atlas
 * tools claimed success that never happened and ours never do. Commands work
 * through a scene adapter so they run without WebGL:
 *
 *   controls            BrainOrbitControls (moveTo, subscribeUserInput)
 *   toSpecimenSpace(point), toSpecimenDirection(axis)
 *                       raw model frame (regionGeometry, view axes) to the
 *                       specimen's frame; null until the specimen has loaded
 *   setHighlight(id|null), getHighlight()
 *   setColourRegions(bool), getColourRegions()
 *   setAnnotations(bool), getAnnotations()
 *   getMode()           'study' while the guide may act on the scene
 *
 * The player always wins. Guide and player share the brain the way an agent
 * and a user share a browser cursor:
 *   guide_moving      the guide is turning the brain (any press stops it)
 *   player_holding    the player has hold of the brain
 *   player_exploring  the player let go less than 2 s ago, or zoomed
 *   guide_free        the brain is the guide's to move
 * A press stops motion at once, but the guide hears "took hold" only after
 * 250 ms or a drag, so a click reads as a click. Control returns 2 s after the
 * player's last input, with one handoff message. Nothing moves the brain by
 * itself when control returns.
 */

import * as THREE from 'three';
import brainRegions from '../data/brainRegions.json';
import regionGeometry from '../data/regionGeometry.json';
import { VIEWS, classifyView, getViewFrame, orientationFacing, orientationForView } from './orientation.js';

const REGION_BY_ID = new Map(brainRegions.regions.map((region) => [region.id, region]));
const MIN_REGION_ID = Math.min(...REGION_BY_ID.keys());
const MAX_REGION_ID = Math.max(...REGION_BY_ID.keys());
const REGION_RANGE_REASON = `region_id must be a whole number from ${MIN_REGION_ID} to ${MAX_REGION_ID}.`;
const STUDY_ONLY_REASON = 'I can only change the scene in Study mode.';
const HOLDING_REASON = 'The user is holding me; I will not move while they do.';
const USER_GRAB_REASON = 'The user took hold of me mid-turn, so I stopped where they grabbed me.';
const REPLACED_REASON = 'This turn was replaced by a later move before it finished.';
const EXPLORING_REASON = 'The player is still exploring; I will wait until they let me move again.';
const HIDDEN_REASON = 'The turn stopped because the page was hidden.';
const TIMEOUT_REASON = 'The turn took too long, so I stopped it.';
const STOPPED_REASON = 'The turn was stopped before it finished.';

export const QUIET_PERIOD_MS = 2000;
export const ANNOUNCE_GRAB_AFTER_MS = 250;

function stoppedReason(reason) {
  if (reason === 'user') return USER_GRAB_REASON;
  if (reason === 'superseded') return REPLACED_REASON;
  if (reason === 'hidden') return HIDDEN_REASON;
  if (reason === 'timeout') return TIMEOUT_REASON;
  return STOPPED_REASON;
}
const NOT_LOADED_REASON = 'I have not loaded yet, so I cannot turn.';

// Medial regions face the midline, so no exterior view shows them squarely.
// Each turns to the standard view whose generated labels include it.
export const MEDIAL_REGION_VIEWS = { 10: 'superior', 16: 'inferior' };

function parseRegionId(value) {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\s*\d+\s*$/.test(value)
        ? Number(value)
        : NaN;
  return Number.isInteger(number) && REGION_BY_ID.has(number) ? number : null;
}

// Ported from the Atlas voiceClientTools.js normalizer: agents send booleans
// as strings as often as not. Undefined means "cannot tell".
export function coerceBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', 'disable', 'disabled'].includes(normalized)) return false;
  }
  return undefined;
}

function normalizeName(text) {
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findRegionByName(name) {
  const query = normalizeName(name);
  if (!query) return { error: 'Provide a region_id or a name.' };
  const regions = brainRegions.regions.map((region) => ({
    region,
    name: normalizeName(region.name),
    subtitle: normalizeName(region.subtitle),
  }));
  // Most specific match first; a tier with several matches is ambiguous.
  const tiers = [
    ({ name: n }) => n === query,
    ({ subtitle }) => subtitle === query,
    ({ name: n }) => n.includes(query),
    ({ subtitle }) => subtitle.includes(query),
  ];
  for (const matches of tiers) {
    const found = regions.filter(matches);
    if (found.length === 1) return { region: found[0].region };
    if (found.length > 1) {
      return { error: `"${name}" could mean ${found.map(({ region }) => region.name).join(', ')}.` };
    }
  }
  return { error: `I have no region called "${name}".` };
}

const ok = (did) => ({ ok: true, did, reason: '' });
const fail = (reason, did = '') => ({ ok: false, did, reason });

function viewLabel(view) {
  return view.replace('_', ' ');
}

export function createSceneCommands(
  adapter,
  {
    onUserInteraction,
    onControlChange,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  } = {}
) {
  const { controls } = adapter;
  let userHolding = false;
  let interrupted = null;
  let currentMove = null;

  // Shared control: the quiet period after player input, and the press that
  // has not been announced yet.
  let quietTimer = null;
  let grabTimer = null;
  let press = null;
  let episodeAnnounced = false;
  let lastControl = 'guide_free';

  function control() {
    if (userHolding) return 'player_holding';
    if (currentMove) return 'guide_moving';
    if (quietTimer !== null) return 'player_exploring';
    return 'guide_free';
  }

  function notifyControl() {
    const next = control();
    if (next === lastControl) return;
    lastControl = next;
    onControlChange?.(next);
  }

  function restartQuietPeriod() {
    if (quietTimer !== null) clearTimeoutImpl(quietTimer);
    quietTimer = setTimeoutImpl(endQuietPeriod, QUIET_PERIOD_MS);
  }

  function endQuietPeriod() {
    quietTimer = null;
    if (episodeAnnounced) {
      episodeAnnounced = false;
      onUserInteraction?.({ type: 'handoff', ...currentView() });
    }
    notifyControl();
  }

  function announcePress() {
    if (!press || press.announced) return;
    press.announced = true;
    episodeAnnounced = true;
    onUserInteraction?.({ type: 'grab', interrupted: press.interrupted });
  }

  const frame = () => getViewFrame(controls.camera, controls.target);
  const inStudy = () => adapter.getMode() === 'study';
  const loaded = () =>
    adapter.toSpecimenSpace([0, 0, 0]) !== null && adapter.toSpecimenDirection([1, 0, 0]) !== null;
  // View axes share the raw model frame with the region geometry, so they
  // take the same rotation. Before loading there is nothing to rotate yet.
  const convertAxis = (axis) =>
    adapter.toSpecimenDirection(axis) ?? new THREE.Vector3(...axis).normalize();
  const currentView = () => classifyView(controls.orientGroup.quaternion, frame(), convertAxis);

  const unsubscribe = controls.subscribeUserInput((event) => {
    if (event.type === 'grab') {
      userHolding = true;
      // Controls have already cancelled the move; its promise settles later,
      // so the move still in flight here is the one the grab interrupted.
      const cut = currentMove ? currentMove.bookmark : null;
      if (cut) interrupted = cut;
      press = { interrupted: cut, announced: false, exploringBefore: quietTimer !== null };
      if (quietTimer !== null) {
        clearTimeoutImpl(quietTimer);
        quietTimer = null;
      }
      if (grabTimer !== null) clearTimeoutImpl(grabTimer);
      grabTimer = setTimeoutImpl(() => {
        grabTimer = null;
        announcePress();
      }, ANNOUNCE_GRAB_AFTER_MS);
      notifyControl();
    } else if (event.type === 'release') {
      userHolding = false;
      if (grabTimer !== null) {
        clearTimeoutImpl(grabTimer);
        grabTimer = null;
      }
      const quickClick = event.wasClick && press && !press.announced;
      if (!quickClick) {
        announcePress();
        restartQuietPeriod();
      } else if (press.exploringBefore) {
        restartQuietPeriod();
      }
      press = null;
      notifyControl();
    } else if (event.type === 'zoom') {
      restartQuietPeriod();
      notifyControl();
    }
  });

  async function move(bookmark, quaternion) {
    const token = { bookmark };
    currentMove = token;
    const settled = controls.moveTo(quaternion);
    notifyControl();
    const outcome = await settled;
    if (currentMove === token) currentMove = null;
    if (outcome.completed) interrupted = null;
    notifyControl();
    return outcome;
  }

  /** Why the guide may not move the brain right now, or null if it may. */
  function moveRefusal() {
    if (userHolding) return HOLDING_REASON;
    if (quietTimer !== null) return EXPLORING_REASON;
    return null;
  }

  function facingDirection(point) {
    return adapter.toSpecimenSpace(point).normalize();
  }

  function orientationFacingRegion(point) {
    return orientationFacing(
      facingDirection(point),
      frame(),
      convertAxis([0, 1, 0]),
      convertAxis([0, 0, 1])
    );
  }

  function nearerHemisphere(geometry) {
    const { toCamera } = frame();
    const facing = (point) =>
      facingDirection(point).applyQuaternion(controls.orientGroup.quaternion).dot(toCamera);
    return facing(geometry.centroidLeft) >= facing(geometry.centroidRight) ? 'left' : 'right';
  }

  async function faceRegion(regionId, { hemisphere } = {}) {
    if (!inStudy()) return fail(STUDY_ONLY_REASON);
    const id = parseRegionId(regionId);
    if (id === null) return fail(REGION_RANGE_REASON);
    if (moveRefusal()) return fail(moveRefusal());
    if (!loaded()) return fail(NOT_LOADED_REASON);

    const region = REGION_BY_ID.get(id);
    const geometry = regionGeometry.regions[String(id)];
    const requested = typeof hemisphere === 'string' ? hemisphere.trim().toLowerCase() : null;

    let quaternion;
    let side = null;
    let arrived;
    const medialView = MEDIAL_REGION_VIEWS[id];
    if (medialView) {
      quaternion = orientationForView(medialView, frame(), convertAxis);
      arrived = `Turned to my ${viewLabel(medialView)} view and highlighted my ${region.name}. It lies on my medial surface, facing the midline, so the shading marks where it lies.`;
    } else if (region.hemisphere === 'left') {
      side = 'left';
      quaternion = orientationFacingRegion(geometry.centroidLeft);
      arrived =
        requested === 'right'
          ? `My ${region.name} exists only on my left hemisphere, so I turned my left side to you and highlighted it.`
          : `Turned my left ${region.name} toward you and highlighted it.`;
    } else {
      side = requested === 'left' || requested === 'right' ? requested : nearerHemisphere(geometry);
      const centroid = side === 'left' ? geometry.centroidLeft : geometry.centroidRight;
      quaternion = orientationFacingRegion(centroid);
      arrived = `Turned my ${side} ${region.name} toward you and highlighted it.`;
    }

    // The light goes on as the turn begins, so the player sees where we are going.
    adapter.setHighlight(id);
    const outcome = await move({ command: 'faceRegion', regionId: id, hemisphere: side }, quaternion);
    if (outcome.completed) return ok(arrived);
    const lit = `Highlighted my ${region.name}, but did not finish turning it toward you.`;
    return fail(stoppedReason(outcome.reason), lit);
  }

  async function rotateTo(view) {
    if (!inStudy()) return fail(STUDY_ONLY_REASON);
    if (!VIEWS.includes(view)) {
      return fail(`Unknown view "${view}". Valid views: ${VIEWS.join(', ')}.`);
    }
    if (moveRefusal()) return fail(moveRefusal());
    if (!loaded()) return fail(NOT_LOADED_REASON);

    const outcome = await move({ command: 'rotateTo', view }, orientationForView(view, frame(), convertAxis));
    if (outcome.completed) return ok(`Turned to my ${viewLabel(view)} view.`);
    return fail(stoppedReason(outcome.reason), `Started turning to my ${viewLabel(view)} view but did not finish.`);
  }

  function highlightRegion(regionId) {
    if (!inStudy()) return fail(STUDY_ONLY_REASON);
    const id = parseRegionId(regionId);
    if (id === null) return fail(REGION_RANGE_REASON);
    adapter.setHighlight(id);
    return ok(`Highlighted my ${REGION_BY_ID.get(id).name}.`);
  }

  function clearHighlight() {
    if (!inStudy()) return fail(STUDY_ONLY_REASON);
    adapter.setHighlight(null);
    return ok('Cleared the highlight.');
  }

  function setFlag(value, apply, label) {
    if (!inStudy()) return fail(STUDY_ONLY_REASON);
    const enabled = coerceBooleanLike(value);
    if (enabled === undefined) return fail('enabled must be true or false.');
    apply(enabled);
    return ok(`${enabled ? 'Showed' : 'Hid'} ${label}.`);
  }

  function setColourRegions(enabled) {
    return setFlag(enabled, (value) => adapter.setColourRegions(value), 'the region colours');
  }

  function setAnnotations(enabled) {
    return setFlag(enabled, (value) => adapter.setAnnotations(value), 'the region labels');
  }

  function lookupRegion({ regionId, name } = {}) {
    let region;
    if (regionId !== undefined && regionId !== null) {
      const id = parseRegionId(regionId);
      if (id === null) return fail(REGION_RANGE_REASON);
      region = REGION_BY_ID.get(id);
    } else if (name !== undefined && name !== null) {
      const found = findRegionByName(name);
      if (found.error) return fail(found.error);
      region = found.region;
    } else {
      return fail('Provide a region_id or a name.');
    }
    return {
      ok: true,
      region: {
        id: region.id,
        name: region.name,
        division: region.division,
        hemisphere: region.hemisphere,
        subtitle: region.subtitle,
        description: region.clickDescription,
        factoid: region.factoid,
      },
    };
  }

  function listRegions() {
    return {
      ok: true,
      divisions: brainRegions.divisions.map((division) => ({
        name: division.name,
        regions: division.regions.map((id) => [id, REGION_BY_ID.get(id).name]),
      })),
    };
  }

  function getSceneState() {
    const { view, viewExact } = currentView();
    return {
      ok: true,
      view,
      viewExact,
      visibleRegions: regionGeometry.labelsPerView[view].map(({ id, name, visibleFraction }) => ({
        id,
        name,
        visibleFraction,
      })),
      highlightedRegion: adapter.getHighlight() ?? null,
      colourRegions: adapter.getColourRegions(),
      annotations: adapter.getAnnotations(),
      mode: adapter.getMode(),
      userHolding,
      interrupted,
      control: control(),
    };
  }

  const commands = {
    faceRegion,
    rotateTo,
    highlightRegion,
    clearHighlight,
    setColourRegions,
    setAnnotations,
    lookupRegion,
    listRegions,
    getSceneState,
  };
  // Kept off the enumerable keys: the agent contract is exactly nine commands.
  Object.defineProperty(commands, 'dispose', {
    value: () => {
      unsubscribe();
      if (quietTimer !== null) clearTimeoutImpl(quietTimer);
      if (grabTimer !== null) clearTimeoutImpl(grabTimer);
    },
    enumerable: false,
  });
  return commands;
}
