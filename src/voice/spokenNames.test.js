import { describe, expect, it } from 'vitest';
import brainRegions from '../data/brainRegions.json';

const namesModule = await import('./spokenNames.js').catch(() => ({}));
const { findSpokenNames, stripExpressiveTags } = namesModule;

const targets = (text) => findSpokenNames(text).map(({ target }) => target);
const region = (id) => ({ kind: 'region', id });
const lobe = (name) => ({ kind: 'lobe', lobe: name });

// Follow the words: the app lights what the guide names. These are the names
// it listens for.
describe('Spoken names: what the guide can name', () => {
  it('knows every painted region by its own name', () => {
    for (const { id, name } of brainRegions.regions) {
      expect(targets(`Here is my ${name}.`), name).toEqual([region(id)]);
    }
  });

  it.each([
    ['my prefrontal cortex develops last', 1],
    ['the prefrontal regions mature late', 1],
    ['orbitofrontal', 2],
    ['the premotor areas', 3],
    ['my supplementary motor area', 4],
    ['the motor cortex sends commands', 5],
    ['the motor strip', 5],
    ["Broca's area", 6],
    ['Broca’s area', 6],
    ['Broca area', 6],
    ["Wernicke's area", 13],
    ['somatosensory cortex', 7],
    ['my auditory cortex', 11],
    ['the fusiform gyrus', 14],
    ['olfactory cortex', 15],
    ['the cingulate gyrus', 16],
    ['my visual cortex', 17],
    ['the brainstem', 20],
    ['my midbrain', 20],
    ['the pons', 20],
    ['the medulla', 20],
  ])('hears a common name: "%s"', (text, id) => {
    expect(targets(text)).toEqual([region(id)]);
  });

  it.each([
    ['my frontal lobe', 'Frontal Lobe'],
    ['both temporal lobes', 'Temporal Lobe'],
    ['the Parietal Lobe', 'Parietal Lobe'],
    ['my occipital lobe', 'Occipital Lobe'],
    ['the limbic lobe', 'Limbic Lobe'],
  ])('hears a lobe: "%s"', (text, name) => {
    expect(targets(text)).toEqual([lobe(name)]);
  });

  it('takes the longest name where names overlap', () => {
    expect(targets('my primary motor cortex')).toEqual([region(5)]);
    expect(targets('the somatosensory association cortex')).toEqual([region(8)]);
    expect(targets('my primary auditory cortex')).toEqual([region(11)]);
  });

  it('does not hear a name inside another word', () => {
    expect(targets('the premotor cortex')).toEqual([region(3)]);
    expect(targets('responsive')).toEqual([]);
  });

  it('lists names in the order they are spoken, with where each starts', () => {
    const text = "Broca's area talks to Wernicke's area through the angular gyrus.";
    expect(findSpokenNames(text).map(({ start, target }) => [start, target])).toEqual([
      [0, region(6)],
      [text.indexOf('Wernicke'), region(13)],
      [text.indexOf('angular'), region(9)],
    ]);
  });

  it.each([
    'what Broca called the limbic lobe',
    'the sensory cortex',
    'primary sensory areas mature early',
    'my cortex',
    'a temporal pattern',
    'frontal thinking',
  ])('stays quiet on ambiguous or partial words: "%s"', (text) => {
    expect(targets(text).filter((t) => t.kind === 'region')).toEqual([]);
  });

  it('still hears the lobe in "what Broca called the limbic lobe"', () => {
    expect(targets('what Broca called the limbic lobe')).toEqual([lobe('Limbic Lobe')]);
  });
});

describe('Expressive tags are never read as words', () => {
  it('removes voice-engine tags like [warm]', () => {
    expect(stripExpressiveTags('[warm] Ah, my cerebellum. [laughs] Quite busy.')).toBe('Ah, my cerebellum. Quite busy.');
    expect(stripExpressiveTags('[softly][excited] Hello')).toBe('Hello');
  });

  it('leaves ordinary text alone', () => {
    expect(stripExpressiveTags('Regions 6 and 13 sit on my left.')).toBe('Regions 6 and 13 sit on my left.');
  });
});
