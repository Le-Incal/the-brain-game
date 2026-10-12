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
import { LIMBIC_NOTE, LOBE_NAMES, TOUR_ORDER, lobeRegionIds, normalizeLobe, normalizeTourLength, tourStop } from './lobes.js';

// The whole-brain view a tour starts and ends on.
const OVERVIEW_VIEW = 'left_lateral';

// After arriving, the brain shows the shape of what it lit: a turn either
// way, a slight tilt, then back to the best view, once, about 6 s in all.
const SHOWCASE_STEP_MS = 1500;
const SHOWCASE_TURN_DEGREES = 20;
const SHOWCASE_TILT_DEGREES = 8;

// Kyle: from below the brain stem is hard to see. It is shown from the front
// right, tilted up so the viewer looks a little at its underside.
export const BRAIN_STEM_VIEW_TILT_DEGREES = 15;
const BRAIN_STEM_ID = 20;

// Following the guide's words: a name already this squarely in view only
// lights; turns to names out of view are at least this far apart.
export const FOLLOW_TURN_MIN_INTERVAL_MS = 2500;
const FOLLOW_VISIBLE_SCORE = 0.5;
// Within this of a region's own pose, it counts as shown (about 20 degrees).
const SHOWN_POSE_RADIANS = 0.35;

const REGION_BY_ID = new Map(brainRegions.regions.map((region) => [region.id, region]));
const MIN_REGION_ID = Math.min(...REGION_BY_ID.keys());
const MAX_REGION_ID = Math.max(...REGION_BY_ID.keys());
const REGION_RANGE_REASON = `region_id must be a whole number from ${MIN_REGION_ID} to ${MAX_REGION_ID}.`;
// Kyle, 2026-10-11: showing a region mid-game would give the answer away.
export const GAME_REASON = 'A game is in progress, so I cannot change the scene; it might give an answer away.';
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
// Kyle, 2026-10-11: a Motion switch stops the brain turning; light still works.
export const MOTION_OFF_REASON =
  'The player has switched motion off, so I light regions without turning. Point them out in words instead.';

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
    onTourEvent,
    showcase = false,
    now = () => performance.now(),
    reducedMotion = () => false,
    motionAllowed = () => true,
    // The page's midline section plate: { open() -> Promise<{ ok, reason }>, close(), isOpen() }.
    section = null,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  } = {}
) {
  const { controls } = adapter;
  let userHolding = false;
  let interrupted = null;
  let currentMove = null;
  let showcaseToken = null;
  // { index, length } of the last stop shown, -1 before the first; null outside a tour.
  let tour = null;
  // The region given full emphasis over a lit lobe, whether the guide's words
  // lit what is shown (it then holds through a turn), and the last automatic turn.
  let litFocus = null;
  let litByWords = false;
  let lastFollowTurnAt = -Infinity;

  // Every light goes through here, so the focus is always known.
  function light(ids, focus = null, { byWords = false } = {}) {
    litFocus = focus;
    litByWords = byWords && ids !== null && ids !== undefined;
    if (focus) adapter.setHighlight(ids, { focus });
    else adapter.setHighlight(ids);
  }

  // Shared control: the quiet period after player input, and the press that
  // has not been announced yet.
  let quietTimer = null;
  let grabTimer = null;
  let press = null;
  let episodeAnnounced = false;
  let lastControl = 'guide_free';

  function control() {
    if (userHolding) return 'player_holding';
    if (currentMove || showcaseToken) return 'guide_moving';
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

  async function move(bookmark, quaternion, { durationMs } = {}) {
    const token = { bookmark };
    currentMove = token;
    const settled = controls.moveTo(quaternion, durationMs ? { durationMs } : undefined);
    notifyControl();
    const outcome = await settled;
    if (currentMove === token) currentMove = null;
    if (outcome.completed) interrupted = null;
    notifyControl();
    return outcome;
  }

  /**
   * Shows the shape of what was just lit: a turn either way, a slight tilt,
   * then back to the best view. Once; it counts as the guide moving; a grab
   * cancels it, the next move replaces it, and reduced motion skips it.
   */
  function startShowcase(best) {
    if (!showcase || reducedMotion() || !motionAllowed()) return;
    const token = {};
    showcaseToken = token;
    const { toCamera, screenUp } = frame();
    const screenRight = new THREE.Vector3().crossVectors(screenUp, toCamera).normalize();
    const turn = (axis, degrees) =>
      new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees)).multiply(best);
    const steps = [
      turn(screenUp, SHOWCASE_TURN_DEGREES),
      turn(screenUp, -SHOWCASE_TURN_DEGREES),
      turn(screenRight, SHOWCASE_TILT_DEGREES),
      best.clone(),
    ];
    (async () => {
      for (const target of steps) {
        if (showcaseToken !== token) return;
        const outcome = await move(null, target, { durationMs: SHOWCASE_STEP_MS });
        if (!outcome.completed) break;
      }
      if (showcaseToken === token) {
        showcaseToken = null;
        notifyControl();
      }
    })();
  }

  /** Why the guide may not move the brain right now, or null if it may. */
  function moveRefusal() {
    if (!motionAllowed()) return MOTION_OFF_REASON;
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

  function brainStemPose() {
    const tilt = THREE.MathUtils.degToRad(BRAIN_STEM_VIEW_TILT_DEGREES);
    // Toward the viewer: anterior and the specimen's right (-x), a little inferior.
    const direction = convertAxis([-Math.SQRT1_2 * Math.cos(tilt), -Math.sin(tilt), Math.SQRT1_2 * Math.cos(tilt)]);
    return orientationFacing(direction, frame(), convertAxis([0, 1, 0]), convertAxis([0, 0, 1]));
  }

  /** How to show a region: { quaternion, side, arrived }. */
  function regionPose(id, { hemisphere } = {}) {
    const region = REGION_BY_ID.get(id);
    const geometry = regionGeometry.regions[String(id)];
    const requested = typeof hemisphere === 'string' ? hemisphere.trim().toLowerCase() : null;

    let quaternion;
    let side = null;
    let arrived;
    const medialView = MEDIAL_REGION_VIEWS[id];
    if (id === BRAIN_STEM_ID) {
      quaternion = brainStemPose();
      arrived = `Turned my ${region.name} toward you from the front right, tilted up so you can see it, and highlighted it.`;
    } else if (medialView) {
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
    return { quaternion, side, arrived };
  }

  async function faceRegion(regionId, { hemisphere } = {}) {
    if (!inStudy()) return fail(GAME_REASON);
    const id = parseRegionId(regionId);
    if (id === null) return fail(REGION_RANGE_REASON);
    if (!motionAllowed()) {
      light(id);
      return fail(MOTION_OFF_REASON, `Highlighted my ${REGION_BY_ID.get(id).name} without turning it toward you.`);
    }
    if (moveRefusal()) return fail(moveRefusal());
    if (!loaded()) return fail(NOT_LOADED_REASON);

    const region = REGION_BY_ID.get(id);
    const { quaternion, side, arrived } = regionPose(id, { hemisphere });

    // The light goes on as the turn begins, so the player sees where we are going.
    light(id);
    const outcome = await move({ command: 'faceRegion', regionId: id, hemisphere: side }, quaternion);
    if (outcome.completed) {
      startShowcase(quaternion);
      return ok(arrived);
    }
    const lit = `Highlighted my ${region.name}, but did not finish turning it toward you.`;
    return fail(stoppedReason(outcome.reason), lit);
  }

  async function rotateTo(view) {
    if (!inStudy()) return fail(GAME_REASON);
    if (!VIEWS.includes(view)) {
      return fail(`Unknown view "${view}". Valid views: ${VIEWS.join(', ')}.`);
    }
    if (moveRefusal()) return fail(moveRefusal());
    if (!loaded()) return fail(NOT_LOADED_REASON);

    // A broad view never leaves a tool's region lit. What the guide's words
    // lit holds until the next name, a lighting tool or the player.
    if (!litByWords) light(null);
    const outcome = await move({ command: 'rotateTo', view }, orientationForView(view, frame(), convertAxis));
    if (outcome.completed) return ok(`Turned to my ${viewLabel(view)} view.`);
    return fail(stoppedReason(outcome.reason), `Started turning to my ${viewLabel(view)} view but did not finish.`);
  }

  function lobeMiddle(ids, side) {
    const key = side === 'left' ? 'centroidLeft' : 'centroidRight';
    const points = ids.map((id) => regionGeometry.regions[String(id)][key]).filter(Boolean);
    if (points.length === 0) return null;
    return points
      .map((point) => adapter.toSpecimenSpace(point))
      .reduce((sum, point) => sum.add(point), new THREE.Vector3())
      .divideScalar(points.length);
  }

  /** Which side of a lobe faces the viewer more, and how squarely (1 is head-on). */
  function lobeFacing(ids) {
    const { toCamera } = frame();
    const facing = (middle) =>
      middle ? middle.clone().normalize().applyQuaternion(controls.orientGroup.quaternion).dot(toCamera) : -Infinity;
    const left = lobeMiddle(ids, 'left');
    const right = lobeMiddle(ids, 'right');
    return facing(left) >= facing(right) ? { side: 'left', middle: left, score: facing(left) } : { side: 'right', middle: right, score: facing(right) };
  }

  /** How to show a lobe: { quaternion, arrived }. */
  function lobePose(lobe) {
    const ids = lobeRegionIds(lobe);
    let quaternion;
    let arrived;
    if (lobe === 'Brain Stem') {
      quaternion = brainStemPose();
      arrived = 'Turned my brain stem toward you from the front right, tilted up so you can see it, and lit it.';
    } else if (lobe === 'Limbic Lobe') {
      const view = MEDIAL_REGION_VIEWS[16];
      quaternion = orientationForView(view, frame(), convertAxis);
      arrived = `Turned to my ${viewLabel(view)} view and lit my limbic lobe. ${LIMBIC_NOTE}`;
    } else {
      const { side, middle } = lobeFacing(ids);
      quaternion = orientationFacing(middle.normalize(), frame(), convertAxis([0, 1, 0]), convertAxis([0, 0, 1]));
      arrived = `Turned my ${side} ${lobe} toward you and lit all of it.`;
    }
    return { quaternion, arrived };
  }

  async function faceLobe(lobeName, { bookmark } = {}) {
    if (!inStudy()) return fail(GAME_REASON);
    const lobe = normalizeLobe(lobeName);
    if (!lobe) return fail(`Unknown lobe "${lobeName}". Valid lobes: ${LOBE_NAMES.join(', ')}.`);
    if (!motionAllowed()) {
      light(lobeRegionIds(lobe));
      return fail(MOTION_OFF_REASON, `Lit my ${lobe} without turning it toward you.`);
    }
    if (moveRefusal()) return fail(moveRefusal());
    if (!loaded()) return fail(NOT_LOADED_REASON);

    const ids = lobeRegionIds(lobe);
    const { quaternion, arrived } = lobePose(lobe);

    light(ids);
    const outcome = await move(bookmark ?? { command: 'faceLobe', lobe }, quaternion);
    if (outcome.completed) {
      startShowcase(quaternion);
      return ok(arrived);
    }
    return fail(stoppedReason(outcome.reason), `Lit my ${lobe}, but did not finish turning it toward you.`);
  }

  // Clear the lights, colours on, the whole brain in view: how a tour begins and ends.
  async function showWholeBrain(bookmark) {
    light(null);
    adapter.setColourRegions(true);
    return move(bookmark, orientationForView(OVERVIEW_VIEW, frame(), convertAxis));
  }

  async function finishTour(did) {
    tour = null;
    onTourEvent?.({ type: 'end' });
    await showWholeBrain({ command: 'endTour' });
    return { ...ok(did), done: true };
  }

  async function startTour(length) {
    if (!inStudy()) return fail(GAME_REASON);
    if (moveRefusal()) return fail(moveRefusal());
    if (!loaded()) return fail(NOT_LOADED_REASON);
    tour = { index: -1, length: normalizeTourLength(length) };
    onTourEvent?.({ type: 'start' });
    await showWholeBrain({ command: 'startTour' });
    return {
      ...ok('Started the tour: colours on and my whole left side toward you.'),
      stops: TOUR_ORDER,
      length: tour.length,
      instruction: 'Give a one-sentence welcome, then call next_tour_stop.',
    };
  }

  async function nextTourStop() {
    if (!inStudy()) return fail(GAME_REASON);
    if (!tour) return fail('No tour is running. Call start_tour first.');
    const index = tour.index + 1;
    if (index >= TOUR_ORDER.length) return finishTour('That was the whole tour; my colours are back on.');
    tour.index = index;
    const stop = tourStop(index, { length: tour.length });
    const result = await faceLobe(stop.lobe, { bookmark: { command: 'tourStop', stop: stop.stop, lobe: stop.lobe } });
    onTourEvent?.({ type: 'stop', stop: stop.stop, of: stop.of });
    // With motion off the stop is still shown, lit in place.
    const shown = result.ok || result.reason === MOTION_OFF_REASON;
    return { ...stop, ok: shown, did: result.did, reason: result.reason };
  }

  async function endTour() {
    if (!inStudy()) return fail(GAME_REASON);
    return finishTour('Ended the tour; my colours are back on.');
  }

  /** How squarely a region faces the viewer: its nearer centroid against the camera (1 is head-on). */
  function regionFacingScore(id) {
    const geometry = regionGeometry.regions[String(id)];
    const { toCamera } = frame();
    return Math.max(
      ...[geometry.centroidLeft, geometry.centroidRight]
        .filter(Boolean)
        .map((point) => facingDirection(point).applyQuaternion(controls.orientGroup.quaternion).dot(toCamera))
    );
  }

  const nearPose = (quaternion) => controls.orientGroup.quaternion.angleTo(quaternion) < SHOWN_POSE_RADIANS;

  // Medial regions face the midline and the brain stem hangs below, so a
  // centroid says little about them: they count as shown in their own pose.
  function inView(target) {
    if (target.kind === 'region') {
      const medialView = MEDIAL_REGION_VIEWS[target.id];
      if (medialView) return currentView().view === medialView;
      if (target.id === BRAIN_STEM_ID) return nearPose(brainStemPose());
      return regionFacingScore(target.id) >= FOLLOW_VISIBLE_SCORE;
    }
    if (target.lobe === 'Limbic Lobe') return currentView().view === MEDIAL_REGION_VIEWS[16];
    return lobeFacing(lobeRegionIds(target.lobe)).score >= FOLLOW_VISIBLE_SCORE;
  }

  const sameLight = (ids, focus) => {
    const lit = adapter.getHighlight();
    const key = (value) => JSON.stringify(value === null || value === undefined ? [] : [].concat(value));
    return key(lit) === key(ids) && key(litFocus) === key(focus);
  };

  const mayTurnForWords = () =>
    !moveRefusal() && !currentMove && !showcaseToken && loaded() && now() - lastFollowTurnAt >= FOLLOW_TURN_MIN_INTERVAL_MS;

  /**
   * Follow the words: the guide named a region or lobe, so light it, and turn
   * to it if it is out of view and the brain is free. During a tour stop only
   * the current lobe's regions count: the lobe stays lit and the named region
   * stands out on top. Returns { did: 'lit' | 'turned' | 'skipped' }.
   */
  async function followName(target) {
    const skipped = { did: 'skipped' };
    if (!inStudy() || !target) return skipped;
    // While the section is up, the drawing is the show: a turn would close it.
    if (section?.isOpen?.()) return skipped;
    let ids;
    let focus = null;
    if (tour && tour.index >= 0) {
      const lobeIds = lobeRegionIds(TOUR_ORDER[tour.index]);
      if (target.kind !== 'region' || !lobeIds.includes(target.id)) return skipped;
      ids = lobeIds;
      focus = [target.id];
    } else if (target.kind === 'region' && REGION_BY_ID.has(target.id)) {
      ids = target.id;
    } else if (target.kind === 'lobe' && LOBE_NAMES.includes(target.lobe)) {
      ids = lobeRegionIds(target.lobe);
    } else {
      return skipped;
    }
    if (sameLight(ids, focus)) return skipped;

    light(ids, focus, { byWords: true });
    if (inView(target) || !mayTurnForWords()) return { did: 'lit' };
    lastFollowTurnAt = now();
    const { quaternion } = target.kind === 'region' ? regionPose(target.id) : lobePose(target.lobe);
    const outcome = await move(null, quaternion);
    return { did: outcome.completed ? 'turned' : 'lit' };
  }

  function highlightRegion(regionId) {
    if (!inStudy()) return fail(GAME_REASON);
    const id = parseRegionId(regionId);
    if (id === null) return fail(REGION_RANGE_REASON);
    light(id);
    return ok(`Highlighted my ${REGION_BY_ID.get(id).name}.`);
  }

  function clearHighlight() {
    if (!inStudy()) return fail(GAME_REASON);
    light(null);
    return ok('Cleared the highlight.');
  }

  // Kyle, 2026-10-11: colour is the player's aid, not an answer, so the guide
  // may turn it on or off in every mode, mid-game included.
  function setFlag(value, apply, label) {
    const enabled = coerceBooleanLike(value);
    if (enabled === undefined) return fail('enabled must be true or false.');
    apply(enabled);
    return ok(`${enabled ? 'Showed' : 'Hid'} ${label}.`);
  }

  function setColourRegions(enabled) {
    return setFlag(enabled, (value) => adapter.setColourRegions(value), 'the region colours');
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
    const lit = adapter.getHighlight();
    const litIds = lit === null || lit === undefined ? [] : [].concat(lit);
    return {
      ok: true,
      view,
      viewExact,
      visibleRegions: regionGeometry.labelsPerView[view].map(({ id, name, visibleFraction }) => ({
        id,
        name,
        visibleFraction,
      })),
      highlightedRegion: litIds.length === 1 ? litIds[0] : null,
      highlightedRegions: litIds,
      colourRegions: adapter.getColourRegions(),
      mode: adapter.getMode(),
      userHolding,
      interrupted,
      control: control(),
      tour: tour ? { stop: tour.index + 1, of: TOUR_ORDER.length } : null,
    };
  }

  /** The guide opens or closes the midline section (Kyle, 2026-10-11). */
  async function showSection(open) {
    if (!inStudy()) return fail(GAME_REASON);
    const wanted = coerceBooleanLike(open);
    if (wanted === undefined) return fail('open must be true or false.');
    if (!section) return fail('The section is not available here.');
    if (!wanted) {
      section.close();
      return ok('Closed the section; my whole outside is back.');
    }
    const result = await section.open();
    if (!result?.ok) return fail(result?.reason ?? 'The section could not open.');
    return ok(
      'Opened my section: a drawing of me divided along the midline, seen from my left, with my corpus callosum, thalamus, brain stem and cerebellum. Speak about what it shows.'
    );
  }

  const commands = {
    faceRegion,
    faceLobe: (lobe) => faceLobe(lobe),
    startTour,
    nextTourStop,
    endTour,
    rotateTo,
    highlightRegion,
    clearHighlight,
    setColourRegions,
    showSection,
    lookupRegion,
    listRegions,
    getSceneState,
  };
  // Kept off the enumerable keys: the agent contract is exactly thirteen commands.
  Object.defineProperty(commands, 'followName', { value: followName, enumerable: false });
  /**
   * The visitor opened the section: turn to the side it is drawn from. Not a
   * guide tool. With motion off the turn is instant, since the visitor asked for it.
   */
  async function turnToSide(view) {
    if (!inStudy()) return fail(GAME_REASON);
    if (!VIEWS.includes(view)) return fail(`Unknown view "${view}".`);
    if (userHolding) return fail(HOLDING_REASON);
    if (!loaded()) return fail(NOT_LOADED_REASON);
    light(null);
    const quaternion = orientationForView(view, frame(), convertAxis);
    const outcome = await move({ command: 'rotateTo', view }, quaternion, motionAllowed() ? undefined : { durationMs: 1 });
    return outcome.completed ? ok(`Turned to my ${viewLabel(view)} view.`) : fail(stoppedReason(outcome.reason));
  }
  Object.defineProperty(commands, 'turnToSide', { value: turnToSide, enumerable: false });
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
