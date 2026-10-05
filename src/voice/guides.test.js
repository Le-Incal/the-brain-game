import { describe, expect, it } from 'vitest';

const guidesModule = await import('./guides.js').catch(() => ({}));
const { GUIDES, GUIDE_STORAGE_KEY, normalizeGuide, readSavedGuide, saveGuide, studyEntryStep } = guidesModule;

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

const blockedStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('SecurityError');
  },
};

describe('M2: the two guides', () => {
  it('are Sylvi and Rollo', () => {
    expect(GUIDES).toEqual([
      { id: 'sylvi', name: 'Sylvi' },
      { id: 'rollo', name: 'Rollo' },
    ]);
  });

  it('normalises a stored or spoken guide id, rejecting anything else', () => {
    expect(normalizeGuide('sylvi')).toBe('sylvi');
    expect(normalizeGuide(' Rollo ')).toBe('rollo');
    for (const value of ['rolo', 'specimen', '', null, undefined, 3]) {
      expect(normalizeGuide(value), String(value)).toBeNull();
    }
  });
});

describe('M2: first entry asks the player to pick a guide', () => {
  it('asks when no guide has been chosen', () => {
    expect(studyEntryStep(null)).toBe('pick-guide');
  });

  it('goes straight into Study mode once a guide is chosen', () => {
    expect(studyEntryStep('sylvi')).toBe('study');
    expect(studyEntryStep('rollo')).toBe('study');
  });

  it('asks again if the saved value is not a guide', () => {
    expect(studyEntryStep('rolo')).toBe('pick-guide');
  });
});

describe('M2: the choice is remembered in this browser', () => {
  it('saves and reads back the chosen guide', () => {
    const storage = memoryStorage();
    expect(readSavedGuide(storage)).toBeNull();
    expect(saveGuide(storage, 'Sylvi')).toBe(true);
    expect(storage.data[GUIDE_STORAGE_KEY]).toBe('sylvi');
    expect(readSavedGuide(storage)).toBe('sylvi');
  });

  it('refuses to save something that is not a guide', () => {
    const storage = memoryStorage();
    expect(saveGuide(storage, 'specimen')).toBe(false);
    expect(readSavedGuide(storage)).toBeNull();
  });

  it('ignores a corrupted saved value', () => {
    expect(readSavedGuide(memoryStorage({ [GUIDE_STORAGE_KEY]: 'nobody' }))).toBeNull();
  });

  it('falls back to asking when storage is blocked or missing', () => {
    expect(readSavedGuide(blockedStorage)).toBeNull();
    expect(saveGuide(blockedStorage, 'rollo')).toBe(false);
    expect(readSavedGuide(undefined)).toBeNull();
  });
});
