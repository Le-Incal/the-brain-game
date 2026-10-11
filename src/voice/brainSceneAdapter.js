import { guideFocusEntry } from './guideFocus.js';

/**
 * Connects the M1 scene commands to the real BrainScene and App.
 *
 * The scene supplies motion, the guide's highlight and the frame conversion.
 * Colour goes through App state, never straight to the scene, so the
 * on-screen toggle always shows what the guide changed.
 */
export function createBrainSceneAdapter({
  scene,
  getMode,
  getColourRegions,
  setColourRegions,
  // The left panel's entry for what the guide is showing, or null.
  onGuideFocus = () => {},
}) {
  return {
    controls: scene.controls,
    toSpecimenSpace: (point) => scene.toSpecimenSpace(point),
    toSpecimenDirection: (direction) => scene.toSpecimenDirection(direction),
    // One focus at a time: the guide lighting a region clears the player's
    // selection (and its description); a player click clears the guide's light.
    // `focus`: regions given full emphasis over the rest of what is lit (a
    // tour stop's lobe stays washed while the named region stands out).
    setHighlight: (regionId, { focus = null } = {}) => {
      if (regionId !== null && regionId !== undefined) scene.clearSelection?.();
      if (focus) scene.setVoiceHighlight(regionId, { focus });
      else scene.setVoiceHighlight(regionId);
      onGuideFocus(guideFocusEntry(regionId, focus));
    },
    playerSelected: (regionId) => {
      if (regionId !== null && regionId !== undefined) {
        scene.setVoiceHighlight(null);
        onGuideFocus(null);
      }
    },
    getHighlight: () => scene.getVoiceHighlight(),
    setColourRegions,
    getColourRegions,
    getMode,
    /** Leaving Study mode: the game never inherits the guide's highlight. */
    resetForGame: () => {
      scene.setVoiceHighlight(null);
      onGuideFocus(null);
    },
  };
}
