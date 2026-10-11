/**
 * The names the app listens for in the guide's words, so the brain can light
 * what is said as it is said. Only full anatomical names and well-established
 * synonyms: "Broca's area" lights region 6, but "Broca" alone never does (the
 * limbic note says "what Broca called the limbic lobe"). Ambiguous phrases
 * such as "sensory cortex" are left out on purpose.
 */
import brainRegions from '../data/brainRegions.json';

// Region id -> extra names beyond the region's own. The fusiform gyrus lies
// inside region 14; the midbrain, pons and medulla inside region 20.
const REGION_ALIASES = {
  1: ['prefrontal'],
  2: ['orbitofrontal'],
  3: ['premotor'],
  4: ['supplementary motor'],
  5: ['motor cortex', 'motor strip'],
  6: ["Broca's area", 'Broca area'],
  7: ['somatosensory cortex'],
  8: ['somatosensory association'],
  11: ['auditory cortex'],
  13: ["Wernicke's area", 'Wernicke area'],
  14: ['inferior temporal', 'fusiform gyrus'],
  15: ['piriform', 'olfactory cortex'],
  16: ['cingulate', 'cingulate gyrus'],
  17: ['visual cortex'],
  19: ['cerebellar cortex'],
  20: ['brainstem', 'midbrain', 'pons', 'medulla', 'medulla oblongata'],
};

// Cerebellum and Brain Stem are each one painted region of the same name, so
// they are heard as regions; the five lobes are heard as lobes.
const REGION_NAMES = new Set(brainRegions.regions.map(({ name }) => name));
const SPOKEN_LOBES = brainRegions.divisions.map(({ name }) => name).filter((name) => !REGION_NAMES.has(name));

function phrasePattern(phrase) {
  const words = phrase
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]?"));
  return words.join('\\s+');
}

function buildVocabulary() {
  const entries = [];
  for (const { id, name } of brainRegions.regions) {
    for (const phrase of [name, ...(REGION_ALIASES[id] ?? [])]) {
      entries.push({ body: phrasePattern(phrase), target: { kind: 'region', id } });
    }
  }
  // "frontal lobe" or "temporal lobes"; the bare adjective is never enough.
  for (const lobe of SPOKEN_LOBES) {
    entries.push({ body: `${phrasePattern(lobe.replace(/\s+Lobe$/, ''))}\\s+lobes?`, target: { kind: 'lobe', lobe } });
  }
  return entries.map(({ body, target }) => ({ target, pattern: new RegExp(`(?<![\\w'’])${body}(?![\\w])`, 'gi') }));
}

const VOCABULARY = buildVocabulary();

/** Removes voice-engine cues like [warm] or [laughs] from the guide's text. */
export function stripExpressiveTags(text) {
  return String(text ?? '')
    .replace(/\[[a-z][a-z \-']*\]/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .trim();
}

/**
 * Every name in the text, in the order spoken, longest first where names
 * overlap: [{ start, end, phrase, target }], target { kind: 'region', id } or
 * { kind: 'lobe', lobe }.
 */
export function findSpokenNames(text) {
  const source = String(text ?? '');
  const found = [];
  for (const { target, pattern } of VOCABULARY) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
      found.push({ start: match.index, end: match.index + match[0].length, phrase: match[0], target });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const chosen = [];
  for (const name of found) {
    const last = chosen.at(-1);
    if (last && name.start < last.end) continue;
    chosen.push(name);
  }
  return chosen;
}
