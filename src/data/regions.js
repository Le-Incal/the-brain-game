/**
 * Brain Region Data
 * 
 * Two-tier architecture:
 * - Tier 1: 8 physical meshes (the GLB geometry)
 * - Tier 2: 14 functional zones (painted via vertex color/regionId attribute)
 * 
 * This file defines the functional zones, their display properties,
 * and the word bank for the game.
 */

// ── Region Color Palette ────────────────────────────────────
// Victorian hand-tinted anatomical illustration colors.
// Semi-transparent washes that blend behind the dark linework.
export const REGION_COLORS = {
  prefrontal:                [0.82, 0.72, 0.50],  // Dusty gold
  motor:                     [0.65, 0.75, 0.60],  // Sage green
  broca:                     [0.72, 0.58, 0.68],  // Mauve
  eyeMotor:                  [0.60, 0.65, 0.72],  // Slate blue
  emotional:                 [0.78, 0.60, 0.50],  // Terra cotta
  sensory:                   [0.75, 0.65, 0.62],  // Muted rose
  somatosensoryAssociation:  [0.70, 0.72, 0.65],  // Parchment sage
  sensoryAssociation:        [0.65, 0.68, 0.72],  // Cool slate
  auditory:                  [0.86, 0.60, 0.70],  // Bright antique rose
  wernicke:                  [0.68, 0.60, 0.70],  // Lavender
  olfactory:                 [0.75, 0.70, 0.55],  // Parchment ochre
  association:               [0.66, 0.58, 0.78],  // Faded blue-violet
  visual:                    [0.62, 0.70, 0.68],  // Sage slate
  cerebellum:                [0.72, 0.65, 0.58],  // Sandy ochre
};

// ── Functional Zone Definitions ─────────────────────────────
export const REGIONS = [
  {
    id: 0,
    key: 'prefrontal',
    name: 'Higher Mental Functions',
    subtitle: 'Prefrontal Cortex',
    parentMesh: 'frontal',
    color: REGION_COLORS.prefrontal,
    description: 'Planning, decision-making, personality, complex thought',
    labelPosition: [0.45, 0.55, 0.35],
  },
  {
    id: 1,
    key: 'motor',
    name: 'Motor Function Area',
    subtitle: 'Primary Motor Cortex',
    parentMesh: 'frontal',
    color: REGION_COLORS.motor,
    description: 'Voluntary movement initiation and control',
    labelPosition: [0.15, 0.65, 0.20],
  },
  {
    id: 2,
    key: 'broca',
    name: "Broca's Area",
    subtitle: 'Inferior Frontal Gyrus (Left)',
    parentMesh: 'frontal_left',
    color: REGION_COLORS.broca,
    description: 'Speech production, language processing',
    labelPosition: [0.35, 0.25, 0.55],
  },
  {
    id: 3,
    key: 'eyeMotor',
    name: 'Eye Motor Area',
    subtitle: 'Frontal Eye Fields',
    parentMesh: 'frontal',
    color: REGION_COLORS.eyeMotor,
    description: 'Voluntary eye movement and tracking',
    labelPosition: [0.30, 0.50, 0.40],
  },
  {
    id: 4,
    key: 'emotional',
    name: 'Emotional Area',
    subtitle: 'Orbitofrontal / Ventromedial Prefrontal',
    parentMesh: 'frontal',
    color: REGION_COLORS.emotional,
    description: 'Emotional regulation, social behavior',
    labelPosition: [0.40, 0.10, 0.45],
  },
  {
    id: 5,
    key: 'sensory',
    name: 'Sensory Area',
    subtitle: 'Primary Somatosensory Cortex',
    parentMesh: 'parietal',
    color: REGION_COLORS.sensory,
    description: 'Touch, temperature, pain processing',
    labelPosition: [-0.05, 0.65, 0.18],
  },
  {
    id: 6,
    key: 'somatosensoryAssociation',
    name: 'Somatosensory Association Area',
    subtitle: 'Superior Parietal Lobule',
    parentMesh: 'parietal',
    color: REGION_COLORS.somatosensoryAssociation,
    description: 'Integration of sensory information, spatial awareness',
    labelPosition: [-0.20, 0.60, 0.10],
  },
  {
    id: 7,
    key: 'sensoryAssociation',
    name: 'Sensory Association Area',
    subtitle: 'Inferior Parietal Lobule',
    parentMesh: 'parietal',
    color: REGION_COLORS.sensoryAssociation,
    description: 'Higher-order sensory interpretation',
    labelPosition: [-0.30, 0.45, 0.25],
  },
  {
    id: 8,
    key: 'auditory',
    name: 'Auditory Area',
    subtitle: 'Primary Auditory Cortex',
    parentMesh: 'temporal',
    color: REGION_COLORS.auditory,
    description: 'Primary sound processing',
    labelPosition: [0.05, -0.10, 0.60],
  },
  {
    id: 9,
    key: 'wernicke',
    name: "Wernicke's Area",
    subtitle: 'Posterior Superior Temporal Gyrus (Left)',
    parentMesh: 'temporal_left',
    color: REGION_COLORS.wernicke,
    description: 'Language comprehension, semantic processing',
    labelPosition: [-0.15, -0.05, 0.55],
  },
  {
    id: 10,
    key: 'olfactory',
    name: 'Olfactory Area',
    subtitle: 'Piriform Cortex',
    parentMesh: 'temporal',
    color: REGION_COLORS.olfactory,
    description: 'Smell processing',
    labelPosition: [0.25, -0.25, 0.50],
  },
  {
    id: 11,
    key: 'association',
    name: 'Association Area',
    subtitle: 'Temporal Association Cortex',
    parentMesh: 'temporal',
    color: REGION_COLORS.association,
    description: 'Memory formation, object recognition',
    labelPosition: [-0.05, -0.20, 0.45],
  },
  {
    id: 12,
    key: 'visual',
    name: 'Visual Area',
    subtitle: 'Primary & Associative Visual Cortex',
    parentMesh: 'occipital',
    color: REGION_COLORS.visual,
    description: 'Primary and associative visual processing',
    labelPosition: [-0.55, 0.20, 0.15],
  },
  {
    id: 13,
    key: 'cerebellum',
    name: 'Motor Functions',
    subtitle: 'Cerebellum',
    parentMesh: 'cerebellum',
    color: REGION_COLORS.cerebellum,
    description: 'Balance, coordination, motor learning, timing',
    labelPosition: [-0.55, -0.30, 0.20],
  },
];

// ── Word Bank ───────────────────────────────────────────────
// Each word maps to a primary target region.
// acceptAlternates: additional region IDs that are also scientifically correct.
// tier: 1=obvious, 2=functional, 3=nuanced, 4=expert
// factoid: shown on correct placement (Victorian typeset)

export const WORD_BANK = [
  // ── Tier 1: Obvious ──
  { word: 'VISION', targetRegion: 12, tier: 1, factoid: 'The primary visual cortex, area V1, contains a retinotopic map of the visual field.' },
  { word: 'HEARING', targetRegion: 8, tier: 1, factoid: 'The primary auditory cortex is arranged tonotopically, mapping sound frequency to spatial location.' },
  { word: 'SPEECH', targetRegion: 2, tier: 1, factoid: "Broca's Area, named for Pierre Paul Broca, 1861. The seat of articulate speech." },
  { word: 'TOUCH', targetRegion: 5, tier: 1, factoid: 'The somatosensory cortex contains a distorted body map where hands and lips claim disproportionate territory.' },
  { word: 'MOVEMENT', targetRegion: 1, tier: 1, factoid: 'The primary motor cortex sends descending signals through the corticospinal tract to drive voluntary movement.' },
  { word: 'BALANCE', targetRegion: 13, tier: 1, factoid: 'The cerebellum contains more neurons than the entire cerebral cortex combined.' },
  { word: 'SMELL', targetRegion: 10, tier: 1, factoid: 'Olfaction is the only sense that bypasses the thalamus, projecting directly to cortex.' },

  // ── Tier 2: Functional ──
  { word: 'PLANNING A TRIP', targetRegion: 0, tier: 2, factoid: 'The prefrontal cortex orchestrates thoughts and actions in accordance with internal goals.' },
  { word: 'CATCHING A BALL', targetRegion: 13, tier: 2, acceptAlternates: [1], factoid: 'The cerebellum computes precise timing predictions essential for intercepting moving objects.' },
  { word: 'READING ALOUD', targetRegion: 2, tier: 2, acceptAlternates: [12, 9], factoid: 'Reading aloud requires visual decoding, semantic comprehension, and motor speech planning in concert.' },
  { word: 'FEELING EMOTION', targetRegion: 4, tier: 2, factoid: 'The ventromedial prefrontal cortex integrates emotional signals into decision-making.' },
  { word: 'UNDERSTANDING WORDS', targetRegion: 9, tier: 2, factoid: "Wernicke's area transforms acoustic patterns into meaning, described by Carl Wernicke in 1874." },
  { word: 'RECOGNISING A FACE', targetRegion: 11, tier: 2, acceptAlternates: [12], factoid: 'Face recognition depends on the fusiform face area in the temporal lobe, discovered by Nancy Kanwisher.' },
  { word: 'LOOKING LEFT', targetRegion: 3, tier: 2, factoid: 'The frontal eye fields coordinate voluntary saccadic eye movements.' },

  // ── Tier 3: Nuanced ──
  { word: 'UNDERSTANDING SARCASM', targetRegion: 11, tier: 3, acceptAlternates: [0], factoid: 'Sarcasm comprehension requires integrating tone, context, and social knowledge across multiple networks.' },
  { word: 'PHONE VIBRATING IN POCKET', targetRegion: 5, tier: 3, acceptAlternates: [6], factoid: 'Phantom phone vibrations reveal how the brain constantly predicts and interprets sensory input.' },
  { word: 'KNOWING WHERE YOUR HAND IS', targetRegion: 6, tier: 3, factoid: 'Proprioception, the sixth sense, depends on somatosensory association areas integrating muscle and joint signals.' },
  { word: 'PLAYING PIANO FROM MEMORY', targetRegion: 13, tier: 3, acceptAlternates: [1, 0], factoid: 'Motor learning in the cerebellum converts conscious sequences into automatic procedural memory.' },
  { word: 'JUDGING DISTANCE', targetRegion: 7, tier: 3, acceptAlternates: [12], factoid: 'The inferior parietal lobule integrates visual and proprioceptive cues for spatial judgments.' },

  // ── Tier 4: Expert ──
  { word: 'PHANTOM LIMB SENSATION', targetRegion: 6, tier: 4, factoid: 'Ramachandran demonstrated that cortical remapping after amputation generates phantom sensations.' },
  { word: 'TIP-OF-THE-TONGUE', targetRegion: 9, tier: 4, acceptAlternates: [11], factoid: 'Tip-of-the-tongue states reveal the separation between semantic knowledge and phonological retrieval.' },
  { word: 'ABSOLUTE PITCH', targetRegion: 8, tier: 4, acceptAlternates: [11], factoid: 'Absolute pitch involves an enlarged left planum temporale and unique patterns of auditory cortical activation.' },
  { word: 'MORAL REASONING', targetRegion: 0, tier: 4, acceptAlternates: [4], factoid: 'Patients with prefrontal damage can know moral rules yet fail to apply them, as in the case of Phineas Gage.' },

  // ── Expanded bank (~50) for V1 testing ──
  // Tier 1
  { word: 'SEEING COLOUR', targetRegion: 12, tier: 1, factoid: 'Colour vision depends on cone photoreceptors feeding specialised pathways into visual cortex.' },
  { word: 'WALKING', targetRegion: 1, tier: 1, acceptAlternates: [13], factoid: 'Locomotion recruits primary motor cortex alongside cerebellar timing circuits.' },
  { word: 'TASTE OF LEMON', targetRegion: 10, tier: 1, acceptAlternates: [4], factoid: 'Gustation and olfaction intertwine; piriform cortex sits at the hub of smell, with orbitofrontal valuation.' },
  { word: 'LISTENING TO MUSIC', targetRegion: 8, tier: 1, factoid: 'Primary auditory cortex in Heschl\'s gyrus is the first cortical stop for sound.' },
  { word: 'SAYING HELLO', targetRegion: 2, tier: 1, factoid: 'Articulating speech recruits Broca\'s area and adjacent motor speech networks.' },
  { word: 'FEELING HEAT', targetRegion: 5, tier: 1, factoid: 'Thermosensory signals arrive in primary somatosensory cortex via the spinothalamic pathway.' },
  { word: 'KEEPING BALANCE', targetRegion: 13, tier: 1, factoid: 'Vestibular and proprioceptive streams converge in the cerebellum for postural control.' },

  // Tier 2
  { word: 'DECIDING WHAT TO EAT', targetRegion: 0, tier: 2, acceptAlternates: [4], factoid: 'Prefrontal and orbitofrontal cortex weigh options against goals and affective value.' },
  { word: 'TRACKING A BIRD', targetRegion: 3, tier: 2, acceptAlternates: [12], factoid: 'Smooth pursuit and saccades are guided by frontal eye fields working with visual cortex.' },
  { word: 'NAMING AN OBJECT', targetRegion: 9, tier: 2, acceptAlternates: [11], factoid: 'Lexical retrieval links temporal association cortex with Wernicke\'s comprehension networks.' },
  { word: 'TYPING ON A KEYBOARD', targetRegion: 1, tier: 2, acceptAlternates: [13], factoid: 'Skilled finger sequences engage motor cortex and cerebellar predictive control.' },
  { word: 'REMEMBERING A SMELL', targetRegion: 10, tier: 2, acceptAlternates: [11], factoid: 'Olfactory memory tightly couples piriform cortex with medial temporal systems.' },
  { word: 'FEELING EMPATHY', targetRegion: 4, tier: 2, acceptAlternates: [0], factoid: 'Social-affective processing recruits ventromedial prefrontal and related networks.' },
  { word: 'READING A MAP', targetRegion: 6, tier: 2, acceptAlternates: [7], factoid: 'Spatial layouts draw on superior parietal and inferior parietal association cortex.' },

  // Tier 3
  { word: 'DETECTING A LIE', targetRegion: 0, tier: 3, acceptAlternates: [11], factoid: 'Lie detection is a network problem: prefrontal monitoring plus temporal social cognition.' },
  { word: 'MENTAL ROTATION', targetRegion: 6, tier: 3, acceptAlternates: [7], factoid: 'Imagining object rotation is a classic parietal spatial computation.' },
  { word: 'HEARING YOUR NAME IN NOISE', targetRegion: 8, tier: 3, acceptAlternates: [0], factoid: 'Cocktail-party listening blends auditory cortex with prefrontal attentional selection.' },
  { word: 'WRITING YOUR SIGNATURE', targetRegion: 1, tier: 3, acceptAlternates: [13], factoid: 'Overlearned motor programs live in cortico-cerebellar loops once practiced.' },
  { word: 'RECOGNISING A MELODY', targetRegion: 8, tier: 3, acceptAlternates: [11], factoid: 'Melody recognition spans auditory cortex and superior temporal association areas.' },
  { word: 'KNOWING YOU ARE HUNGRY', targetRegion: 4, tier: 3, acceptAlternates: [0], factoid: 'Interoceptive drives are integrated in orbitofrontal and medial prefrontal circuits.' },
  { word: 'POINTING TO A STAR', targetRegion: 7, tier: 3, acceptAlternates: [12, 1], factoid: 'Visually guided reaching binds parietal spatial maps to motor output.' },

  // Tier 4
  { word: 'SYNAESTHESIA', targetRegion: 7, tier: 4, acceptAlternates: [12, 8], factoid: 'Cross-modal synaesthesia likely reflects atypical connectivity among sensory association cortices.' },
  { word: 'PROSODY OF SPEECH', targetRegion: 11, tier: 4, acceptAlternates: [8], factoid: 'Emotional tone of speech is often right-lateralised in temporal association cortex.' },
  { word: 'BLINDSIGHT', targetRegion: 12, tier: 4, factoid: 'Residual visual guidance after V1 damage shows subcortical and extrastriate routes can still act.' },
  { word: 'CEREBELLAR TIMING', targetRegion: 13, tier: 4, factoid: 'The cerebellum contributes millisecond-scale timing far beyond balance alone.' },
  { word: 'WORKING MEMORY SPAN', targetRegion: 0, tier: 4, factoid: 'Dorsolateral prefrontal cortex maintains and manipulates information over brief delays.' },
  { word: 'BODY SCHEMA UPDATE', targetRegion: 6, tier: 4, acceptAlternates: [5], factoid: 'The body schema is a parietal construct continuously updated by somatosensory input.' },
  { word: 'SEMANTIC PRIMING', targetRegion: 9, tier: 4, acceptAlternates: [11], factoid: 'Meaning spreads through temporal language networks before a word is fully retrieved.' },
];
