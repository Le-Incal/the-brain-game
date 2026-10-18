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
/*
 * Kyle, 2026-10-17, on a phone: "Move the brain up under the title", then "the
 * brain still sits too high I want you to center it between the top and
 * bottom text." The brain's middle sits halfway between the title's rule and
 * the top of the three lines of conversation, as index.html and the guide's
 * column lay them out:
 *   the rule: the header's padding, clamp(16px, 3vh, 28px), then 60 px of
 *   title, subtitle and rule (80 px down at 390 x 664);
 *   the conversation: the column ends 44 px above the page's foot (and the
 *   safe area), over the switches (24 + 14), the field (41 + 14) and three
 *   lines (66), so 203 px up (461 px down at 390 x 664).
 */
export const PHONE_TITLE_BLOCK_PX = 60;
export const PHONE_CONVERSATION_RISE_PX = 203;
// Kyle, 2026-10-17: "I think the brain can sit a little lower again." 24 px
// below the middle, keeping at least 16 px above the conversation.
export const PHONE_BRAIN_DROP_PX = 24;
export const PHONE_BRAIN_MIN_GAP_PX = 16;

/** Where a phone's brain, `brainPx` tall, has its middle, in CSS px down the page. */
export function phoneBrainMiddlePx({ height, safeBottom = 0, brainPx = 0 }) {
  const titleRule = Math.min(28, Math.max(16, 0.03 * height)) + PHONE_TITLE_BLOCK_PX;
  const conversationTop = height - safeBottom - PHONE_CONVERSATION_RISE_PX;
  const spare = (conversationTop - titleRule - brainPx) / 2 - PHONE_BRAIN_MIN_GAP_PX;
  return (titleRule + conversationTop) / 2 + Math.max(0, Math.min(PHONE_BRAIN_DROP_PX, spare));
}

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
