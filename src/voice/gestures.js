/**
 * How strongly the guide's speaking motion plays. The motion itself is puppet
 * speech (puppet.js, Kyle 2026-10-13), which replaced a slow sway.
 *
 * Gestures rotate their own outer group in the scene, so facing a region,
 * the specimen-space conversion and the reported view are unaffected, and
 * they never count as the guide moving the brain.
 */

/**
 * Full strength while the brain is free; half while a region or lobe stays lit
 * and still, so the brain never sits dead while the guide talks; none while
 * it is moving or showcasing, held or explored, or with reduced motion.
 */
export function gestureStrength({ control, highlighted, reducedMotion }) {
  if (reducedMotion || control !== 'guide_free') return 0;
  return highlighted ? 0.5 : 1;
}
