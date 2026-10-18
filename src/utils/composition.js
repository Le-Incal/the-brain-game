/**
 * The brain's height on the page (Kyle, 2026-10-16): "once we get into the
 * application, I want the brain to be raised up to the middle of the page to
 * match the brain at the home page. Not the size just the height position.
 * Then if someone clicks the 'Play the Game' button, then the user can see that
 * the brain gently slides down to its current position. The game is the only
 * thing that needs the lower brain position."
 *
 * Two compositions: 'centre' (Explore and Study) puts the brain's own centre on
 * the page's middle; 'game' keeps the height the game has always used. A lift
 * of 1 is centred and 0 is the game; the slide between them takes 0.9 s,
 * eased. Phones (640 px and under) keep today's height in every mode, since
 * their buttons stack above the brain.
 */

export const COMPOSITION_SLIDE_MS = 900;
export const PHONE_MAX_WIDTH = 640;
// Kyle, 2026-10-17: "we need to slightly lower the standard position now." A
// quarter inch below the page's middle.
export const CENTRE_DROP_CSS_PX = 24;
// Kyle, 2026-10-17, on a phone: "Move the brain up under the title." The top
// of the brain 100 px down the page, a little under the title's rule on every
// phone (76 to 88 px down).
export const PHONE_BRAIN_TOP_CSS_PX = 100;

export function centresOnPage(width) {
  return width > PHONE_MAX_WIDTH;
}

/** CSS pixels on the page as a height at the camera's target. */
export function cssPxToWorld(px, { height, viewportHeight }) {
  return (px / height) * viewportHeight;
}

/**
 * The specimen's offset that puts the brain's centre on the camera's target,
 * the page's middle, then `drop` lower. `brainCentre` is the brain's centre
 * below (negative) or above the specimen's origin, at a scale of 1, in the
 * arrival pose. A phone uses `phoneShift`, which puts the brain under the
 * title, once its scene has measured it; until then, and on the landing, it
 * keeps the game's height.
 */
export function centreShiftFor({ width, brainCentre, scale, gameShift, drop = 0, phoneShift = null }) {
  if (!centresOnPage(width)) return phoneShift ?? gameShift;
  if (brainCentre === null || brainCentre === undefined) return gameShift;
  return -brainCentre * scale + drop;
}

/**
 * The specimen's offset corrected so the brain's top, now at `topPx` down the
 * page, lands at `targetTopPx`.
 */
export function shiftToTop({ shift, topPx, targetTopPx, height, viewportHeight }) {
  return shift + cssPxToWorld(topPx - targetTopPx, { height, viewportHeight });
}

/**
 * The camera looks down a little, so a brain centred in the world lands a few
 * pixels off the page's middle. `ndcCentre` is where its silhouette's centre
 * landed (above the middle is positive, in normalized device units); the
 * brain's centre is moved by that much, at the depth of the camera's target.
 */
export function refineBrainCentre({ brainCentre, ndcCentre, viewportHeight, scale }) {
  if (!ndcCentre) return brainCentre;
  return brainCentre + (ndcCentre * viewportHeight) / 2 / scale;
}

/** The specimen's height: today's formula, with the game's shift lifted toward the centred one. */
export function composeSpecimenY({ baseY, gameShift, centreShift, lift, panY, responsiveOffset }) {
  return baseY + gameShift + (centreShift - gameShift) * lift + panY + responsiveOffset;
}

// A sine ease: gentle at both ends, its fastest only about 1.6 times the average.
function easeInOutSine(t) {
  return (1 - Math.cos(Math.PI * t)) / 2;
}

/** The lift at `now` during a slide from `from` to `to` begun at `startedAt`. */
export function slideLift({ from, to, startedAt, now, durationMs = COMPOSITION_SLIDE_MS }) {
  const t = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
  if (t >= 1) return to;
  return from + (to - from) * easeInOutSine(t);
}
