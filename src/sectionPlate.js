/**
 * The midline section (Kyle, 2026-10-11): in Study, the 3D brain turns to its
 * left side and a drawing of it divided along the midline is laid over it,
 * like a lift-the-flap anatomy plate. The plate fills the brain's own outline
 * on screen, so the two meet. Kyle will mask the plate next.
 */

export const SECTION_PLATE = {
  src: '/section/midsagittal.png',
  // Drawn from the left with the front to the left: the left lateral pose.
  view: 'left_lateral',
  alt: 'The brain divided along the midline, seen from the left: the corpus callosum, thalamus, brain stem and cerebellum.',
};

/** The screen rectangle around a set of projected points, or null. */
export function screenBounds(points) {
  if (!points || points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { left: Math.round(minX), top: Math.round(minY), width: Math.round(maxX - minX), height: Math.round(maxY - minY) };
}

/** Where the plate goes: exactly over the brain's outline. */
export function plateBox(bounds) {
  return { position: 'absolute', left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
}

/** The plate belongs to Study and to a still brain. */
export function shouldCloseSection({ gamePhase, control }) {
  return gamePhase !== 'study' || control === 'player_holding' || control === 'guide_moving';
}
