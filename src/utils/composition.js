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
 * arrival pose.
 */
export function centreShiftFor({ width, brainCentre, scale, gameShift, drop = 0 }) {
  if (!centresOnPage(width) || brainCentre === null || brainCentre === undefined) return gameShift;
  return -brainCentre * scale + drop;
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
