import brainRegions from './brainRegions.json';
import regionGeometry from './regionGeometry.json';

export const ATLAS = brainRegions;
export const DIVISIONS = brainRegions.divisions;
export const GAMEPLAY_NOTES = brainRegions.gameplayNotes;

// Regions 6 and 13 are painted on the anatomical left hemisphere only, because
// language is lateralised. A click on the mirrored right-hand tissue is a
// different region, not the same one seen from the other side.
export const LATERALIZED_REGION_IDS = new Set(
  brainRegions.gameplayNotes.lateralized
);

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function hexToRgb(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export const REGIONS = brainRegions.regions.map((region) => {
  const geometry = regionGeometry.regions[String(region.id)];
  const rgb = hexToRgb(region.hex);
  return {
    ...region,
    key: slugify(region.name),
    rgb,
    color: rgb.map((channel) => channel / 255),
    // The panel copy and the anchor are authored and measured respectively;
    // neither is invented here.
    description: region.clickDescription,
    centroid: geometry.anchor,
    vertices: geometry.vertexCount,
  };
});

export const REGION_IDS = REGIONS.map(({ id }) => id);
export const REGION_ID_SET = new Set(REGION_IDS);
export const REGION_BY_ID = new Map(REGIONS.map((region) => [region.id, region]));
export const getRegionById = (id) => REGION_BY_ID.get(Number(id)) ?? null;

export const LABELS_PER_VIEW = regionGeometry.labelsPerView;
export const VIEW_LABEL_IDS = Object.fromEntries(
  Object.entries(regionGeometry.labelsPerView).map(([view, labels]) => [
    view,
    labels.map(({ id }) => id),
  ])
);

// Each entry targets an exact atlas region. Alternates are included only where
// the named behaviour genuinely depends on another represented atlas region.
export const WORD_BANK = [
  { word: 'VISION', targetRegion: 17, tier: 1, factoid: 'Primary visual cortex contains a retinotopic map of the visual field.' },
  { word: 'HEARING', targetRegion: 11, tier: 1, factoid: 'Primary auditory cortex is tonotopically organised by sound frequency.' },
  { word: 'SPEECH', targetRegion: 6, tier: 1, acceptAlternates: [5], factoid: "Broca's area participates in articulatory planning within a distributed language network." },
  { word: 'TOUCH', targetRegion: 7, tier: 1, factoid: 'Primary somatosensory cortex contains a body map that magnifies the hands and lips.' },
  { word: 'MOVEMENT', targetRegion: 5, tier: 1, acceptAlternates: [3, 4, 19], factoid: 'Primary motor cortex executes voluntary movement while premotor, supplementary motor and cerebellar systems shape it.' },
  { word: 'BALANCE', targetRegion: 19, tier: 1, factoid: 'The cerebellum integrates vestibular and proprioceptive signals for posture and balance.' },
  { word: 'SMELL', targetRegion: 15, tier: 1, factoid: 'Piriform cortex is primary olfactory cortex.' },
  { word: 'SEEING COLOUR', targetRegion: 18, tier: 1, factoid: 'Colour constancy depends on visual association cortex beyond V1.' },
  { word: 'LISTENING TO MUSIC', targetRegion: 11, tier: 1, acceptAlternates: [12], factoid: 'Music begins with auditory cortical analysis and recruits temporal association systems.' },
  { word: 'SAYING HELLO', targetRegion: 6, tier: 1, acceptAlternates: [5], factoid: 'Speech production links Broca-region planning with motor execution.' },
  { word: 'FEELING HEAT', targetRegion: 7, tier: 1, factoid: 'Thermal signals contribute to processing in primary somatosensory cortex.' },
  { word: 'KEEPING BALANCE', targetRegion: 19, tier: 1, factoid: 'Cerebellar circuits continuously adjust posture and movement timing.' },

  { word: 'PLANNING A TRIP', targetRegion: 1, tier: 2, factoid: 'Prefrontal cortex supports goal-directed planning and working memory.' },
  { word: 'CATCHING A BALL', targetRegion: 19, tier: 2, acceptAlternates: [3, 5, 8], factoid: 'Catching recruits cerebellar prediction, visuospatial transformation and motor systems.' },
  { word: 'READING ALOUD', targetRegion: 9, tier: 2, acceptAlternates: [6, 13, 18], factoid: 'Reading aloud links visual word forms and meaning to language and articulatory networks.' },
  { word: 'FEELING EMOTION', targetRegion: 2, tier: 2, acceptAlternates: [16, 1], factoid: 'Orbitofrontal, cingulate and prefrontal systems contribute distinct parts of emotional regulation.' },
  { word: 'UNDERSTANDING WORDS', targetRegion: 13, tier: 2, acceptAlternates: [9, 12], factoid: "Wernicke's region is one node in a distributed lexical-semantic network." },
  { word: 'RECOGNISING A FACE', targetRegion: 14, tier: 2, acceptAlternates: [18], factoid: "Inferior temporal cortex contains a fusiform patch strongly specialised for face recognition." },
  { word: 'WALKING', targetRegion: 5, tier: 2, acceptAlternates: [3, 4, 19], factoid: 'Locomotion depends on coordinated cortical, brain-stem and cerebellar systems.' },
  { word: 'DECIDING WHAT TO EAT', targetRegion: 2, tier: 2, acceptAlternates: [1], factoid: 'Orbitofrontal cortex updates subjective value while prefrontal systems maintain goals.' },
  { word: 'NAMING AN OBJECT', targetRegion: 14, tier: 2, acceptAlternates: [13], factoid: 'Object identity and lexical access recruit temporal and language networks.' },
  { word: 'TYPING ON A KEYBOARD', targetRegion: 5, tier: 2, acceptAlternates: [3, 4, 19], factoid: 'Skilled finger sequences recruit motor planning, execution and cerebellar prediction.' },
  { word: 'REMEMBERING A SMELL', targetRegion: 15, tier: 2, acceptAlternates: [14], factoid: 'Piriform cortex connects olfactory identity to medial temporal memory systems.' },
  { word: 'FEELING EMPATHY', targetRegion: 1, tier: 2, acceptAlternates: [16, 2], factoid: 'Empathy is distributed across social-cognitive and affective networks.' },
  { word: 'READING A MAP', targetRegion: 8, tier: 2, acceptAlternates: [9, 18], factoid: 'Parietal cortex integrates visuospatial relationships and reference frames.' },
  { word: 'ERROR DETECTION', targetRegion: 16, tier: 2, acceptAlternates: [1], factoid: 'Cingulate cortex signals conflict and the need for greater control.' },
  { word: 'STARTING A SEQUENCE', targetRegion: 4, tier: 2, acceptAlternates: [3], factoid: 'Supplementary motor area is especially important for internally generated sequences.' },

  { word: 'UNDERSTANDING SARCASM', targetRegion: 12, tier: 3, acceptAlternates: [1, 13], factoid: 'Sarcasm comprehension integrates prosody, language, context and social inference.' },
  { word: 'PHONE VIBRATING IN POCKET', targetRegion: 7, tier: 3, acceptAlternates: [8], factoid: 'Somatosensory signals are interpreted against predictive body models.' },
  { word: 'KNOWING WHERE YOUR HAND IS', targetRegion: 8, tier: 3, acceptAlternates: [7], factoid: "Somatosensory association cortex integrates proprioception into a body-centred spatial map." },
  { word: 'PLAYING PIANO FROM MEMORY', targetRegion: 19, tier: 3, acceptAlternates: [3, 4, 5], factoid: 'Practised sequences depend on cortico-cerebellar timing and motor planning.' },
  { word: 'JUDGING DISTANCE', targetRegion: 8, tier: 3, acceptAlternates: [18], factoid: 'Distance judgments combine visual depth cues with parietal spatial computation.' },
  { word: 'DETECTING A LIE', targetRegion: 1, tier: 3, acceptAlternates: [16, 12], factoid: 'There is no lie centre; monitoring and social inference recruit a distributed network.' },
  { word: 'MENTAL ROTATION', targetRegion: 8, tier: 3, acceptAlternates: [18], factoid: "Mental rotation strongly recruits parietal visuospatial systems." },
  { word: 'HEARING YOUR NAME IN NOISE', targetRegion: 11, tier: 3, acceptAlternates: [1, 13], factoid: 'Selective listening links auditory analysis with attention and language.' },
  { word: 'WRITING YOUR SIGNATURE', targetRegion: 5, tier: 3, acceptAlternates: [3, 4, 19], factoid: 'An overlearned signature is produced by coordinated motor planning and execution.' },
  { word: 'RECOGNISING A MELODY', targetRegion: 12, tier: 3, acceptAlternates: [11], factoid: 'Melody recognition extends from auditory cortex into temporal association cortex.' },
  { word: 'POINTING TO A STAR', targetRegion: 8, tier: 3, acceptAlternates: [3, 5, 18], factoid: 'Visually guided reaching transforms retinal coordinates into body-centred action.' },
  { word: 'IMAGINING A SCENE', targetRegion: 10, tier: 3, acceptAlternates: [18], factoid: 'Precuneus contributes to first-person visuospatial imagery.' },
  { word: 'VALUE REVERSAL', targetRegion: 2, tier: 3, factoid: 'Orbitofrontal cortex revises outcome values when contingencies change.' },

  { word: 'PHANTOM LIMB SENSATION', targetRegion: 7, tier: 4, acceptAlternates: [8], factoid: 'Cortical remapping is one contributor to phantom limb sensation.' },
  { word: 'TIP-OF-THE-TONGUE', targetRegion: 13, tier: 4, acceptAlternates: [12, 6], factoid: 'Tip-of-the-tongue states expose separable semantic and phonological retrieval processes.' },
  { word: 'ABSOLUTE PITCH', targetRegion: 11, tier: 4, acceptAlternates: [12], factoid: 'Absolute pitch is associated with specialised auditory and temporal network organisation.' },
  { word: 'MORAL REASONING', targetRegion: 1, tier: 4, acceptAlternates: [2, 16], factoid: 'Moral judgment integrates rule representation, value and affect rather than residing in one centre.' },
  { word: 'PROSODY OF SPEECH', targetRegion: 12, tier: 4, acceptAlternates: [11, 13], factoid: 'Speech prosody depends strongly on temporal auditory association systems.' },
  { word: 'BLINDSIGHT', targetRegion: 17, tier: 4, acceptAlternates: [18], factoid: 'Residual visual guidance after V1 damage reveals alternate subcortical and extrastriate routes.' },
  { word: 'CEREBELLAR TIMING', targetRegion: 19, tier: 4, factoid: 'The cerebellum contributes precise timing to movement, cognition and language.' },
  { word: 'WORKING MEMORY SPAN', targetRegion: 1, tier: 4, factoid: 'Prefrontal cortex maintains task-relevant information in the absence of sensory input.' },
  { word: 'BODY SCHEMA UPDATE', targetRegion: 8, tier: 4, acceptAlternates: [7], factoid: 'Parietal body maps are continuously updated by somatosensory input.' },
  { word: 'SEMANTIC PRIMING', targetRegion: 14, tier: 4, acceptAlternates: [9, 13], factoid: 'Semantic priming reflects spreading activation across distributed temporal-language networks.' },
  { word: 'LOCKED-IN SYNDROME', targetRegion: 20, tier: 4, factoid: 'Ventral pontine injury can abolish voluntary movement while preserving cognition.' },
  { word: 'PAIN UNPLEASANTNESS', targetRegion: 16, tier: 4, factoid: 'Cingulate cortex contributes to the affective unpleasantness of pain.' },
  { word: 'SELF-REFERENTIAL THOUGHT', targetRegion: 10, tier: 4, acceptAlternates: [1, 16], factoid: 'Precuneus is a highly connected node of the default mode network.' },
];
