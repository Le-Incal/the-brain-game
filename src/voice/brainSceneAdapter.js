/**
 * Connects the M1 scene commands to the real BrainScene and App.
 *
 * The scene supplies motion, the guide's highlight and the frame conversion.
 * Colour and labels go through App state, never straight to the scene, so the
 * on-screen toggles always show what the guide changed.
 */
export function createBrainSceneAdapter({
  scene,
  getMode,
  getColourRegions,
  setColourRegions,
  getAnnotations,
  setAnnotations,
}) {
  return {
    controls: scene.controls,
    toSpecimenSpace: (point) => scene.toSpecimenSpace(point),
    toSpecimenDirection: (direction) => scene.toSpecimenDirection(direction),
    setHighlight: (regionId) => scene.setVoiceHighlight(regionId),
    getHighlight: () => scene.getVoiceHighlight(),
    setColourRegions,
    getColourRegions,
    setAnnotations,
    getAnnotations,
    getMode,
    /** Leaving Study mode: the game never inherits the guide's highlight. */
    resetForGame: () => scene.setVoiceHighlight(null),
  };
}
