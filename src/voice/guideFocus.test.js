import { describe, expect, it } from 'vitest';
import brainRegions from '../data/brainRegions.json';

const focusModule = await import('./guideFocus.js').catch(() => ({}));
const { guideFocusEntry, LOBE_PANELS } = focusModule;

const regionsOf = (lobe) => brainRegions.divisions.find(({ name }) => name === lobe).regions;
const REGION = new Map(brainRegions.regions.map((r) => [r.id, r]));
const regionEntry = (id) => ({
  kind: 'region',
  id,
  name: REGION.get(id).name,
  subtitle: REGION.get(id).subtitle,
  description: REGION.get(id).clickDescription,
});

// Kyle: when the guide shows something, the left panel shows its text, as it
// does when the player clicks a region. Lobe text approved 2026-10-10.
describe('The left panel follows the guide', () => {
  it('holds the five approved lobe entries, word for word', () => {
    expect(LOBE_PANELS).toEqual({
      'Frontal Lobe': {
        subtitle: 'The Province of Will',
        description:
          'The largest lobe, about a third of the cortex. It plans, decides and keeps personality and emotion in check. At its rear edge it issues the commands for voluntary movement, and in most people, on the left, for speech.',
      },
      'Parietal Lobe': {
        subtitle: "The Body's Cartographer",
        description:
          'It receives touch, temperature, pressure and pain, and works out where the body is and where things lie around it, guiding the hand to what the eye has found.',
      },
      'Temporal Lobe': {
        subtitle: 'Hall of Sound and Memory',
        description:
          'It hears, understands language, and recognises faces and objects. On its inner side it helps lay down new memories.',
      },
      'Limbic Lobe': {
        subtitle: 'The Border of Feeling',
        description:
          "Named by Broca in 1878 for the border it traces around the brain's core, it binds emotion to memory and attention. Only its cingulate cortex is shown on this specimen; the parahippocampal gyrus and hippocampal formation lie hidden within.",
      },
      'Occipital Lobe': {
        subtitle: 'The Theatre of Sight',
        description:
          'It turns light into vision, from the first detection of edges to depth and motion, then passes what it sees forward: to the temporal lobe to be recognised, to the parietal lobe to be located.',
      },
    });
  });

  it('keeps the house style: no em dashes, no left-brain/right-brain talk', () => {
    for (const { subtitle, description } of Object.values(LOBE_PANELS)) {
      expect(`${subtitle} ${description}`).not.toMatch(/—/);
      expect(description).not.toMatch(/(left|right)[- ]brain/i);
    }
  });

  it("shows a region's own entry when one region is lit", () => {
    expect(guideFocusEntry([6])).toEqual(regionEntry(6));
    expect(guideFocusEntry(6)).toEqual(regionEntry(6));
  });

  it("shows a lobe's entry when a whole lobe is lit", () => {
    expect(guideFocusEntry(regionsOf('Frontal Lobe'))).toEqual({
      kind: 'lobe',
      lobe: 'Frontal Lobe',
      name: 'Frontal Lobe',
      subtitle: 'The Province of Will',
      description: LOBE_PANELS['Frontal Lobe'].description,
    });
  });

  it('shows the focused region during a tour stop', () => {
    expect(guideFocusEntry(regionsOf('Frontal Lobe'), [6])).toEqual(regionEntry(6));
  });

  it('reuses the region entries for the Cerebellum and the Brain Stem', () => {
    expect(guideFocusEntry(regionsOf('Cerebellum'))).toEqual(regionEntry(19));
    expect(guideFocusEntry(regionsOf('Brain Stem'))).toEqual(regionEntry(20));
  });

  it('shows nothing when nothing is lit or the lit set is not one thing', () => {
    expect(guideFocusEntry(null)).toBeNull();
    expect(guideFocusEntry([])).toBeNull();
    expect(guideFocusEntry([3, 17])).toBeNull();
  });
});
