/**
 * The two guides, both this same brain: Sylvi (Sylvian fissure) and Rollo
 * (fissure of Rolando). The player picks one on first entering Study mode;
 * the choice is a per-browser convenience, so blocked storage just asks again.
 */
export const GUIDES = [
  { id: 'sylvi', name: 'Sylvi' },
  { id: 'rollo', name: 'Rollo' },
];

export const GUIDE_STORAGE_KEY = 'brain-game.guide';

const GUIDE_IDS = new Set(GUIDES.map(({ id }) => id));

export function normalizeGuide(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  return GUIDE_IDS.has(id) ? id : null;
}

export function studyEntryStep(savedGuide) {
  return normalizeGuide(savedGuide) ? 'study' : 'pick-guide';
}

export function readSavedGuide(storage) {
  try {
    return normalizeGuide(storage?.getItem(GUIDE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveGuide(storage, guide) {
  const id = normalizeGuide(guide);
  if (!id || !storage) return false;
  try {
    storage.setItem(GUIDE_STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}
