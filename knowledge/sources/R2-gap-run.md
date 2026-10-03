# Brain Game Knowledge Base, Gap-Closing Run: Tracts, Circuits, Layers, Receptors, Crosswalks and Verification

The most important result of this run is a correction: Brenda Milner has not died. As of early October 2026, current sources describe her as living, aged 108 (born 15 July 1918), so any death date in the previous report must be removed.\[1\] The four missing rungs (tracts, circuits, layers and columns, receptors) can now be filled from textbook-consensus material. For the region crosswalk, UBERON plus Desikan-Killiany plus Brodmann plus HCP-MMP1.0 is the only combination that gives honest "overlaps" relations for game regions that are functional areas.

## TL;DR

- **Verification:** Brenda Milner is alive at 108 as of October 2026, so delete the previous death date. The 2026 Kavli Prize in Neuroscience went to Holt, Martin, Schuman and Steward, and the 2026 Brain Prize to Ginty and Ernfors. The 2026 Nobel Prize in Physiology or Medicine is not announced until 5 October 2026. Neuralink reported 21 trial participants on 28 January 2026. The FDA approved tenecteplase for acute ischemic stroke on 3 March 2025.
- **New content:** Sections A to D give child-safe, structured entries for 17 tract groups, 13 circuits, cortical layers and columns, and the major receptor families, with region-ID mappings and flags on debated science (IFOF in monkeys, the LeDoux "low road", columns as a basic unit, tractography false positives).
- **Licenses:** UBERON (CC BY 3.0), the Yeo atlas (MIT, via CBIG), NeuroQuery code (BSD-3) and FreeSurfer (BSD-like) can be shipped in a public app with attribution. Cognitive Atlas content is CC BY-SA 3.0 US and Neurosynth data is ODbL, so both carry share-alike obligations. HCP-MMP1.0 sits under the HCP Open Access Data Use Terms. NeuroNames has no confirmed open license, so use its ID numbers only.

## Key Findings

1. **One factual error in the previous report.** Brenda Milner is alive. Wikipedia lists her as aged 108,\[1\] and McGill's 27th Annual Neuropsychology Day booklet (11 May 2026) describes her in the present tense as the Dorothy J. Killam Professor.\[1\]\[2\]\[3\] No obituary from McGill, The Neuro or a major newspaper turned up.
2. **Tracts are best taught as "cables between our painted regions".** Nearly every tract in Part A links two or more game regions. The arcuate fasciculus (6 and 13 via 9) and the corticospinal tract (5 to 20) are the anchor examples.
3. **Circuits are loops.** The basal ganglia, cerebellum and thalamus all sit in loops that start and end in cortex, which gives Sylvi and Rollo one theme: "the brain talks to itself in circles".
4. **Midbrain (15) and brainstem (20) fall outside every cortical atlas** (Desikan-Killiany, HCP-MMP1.0, Yeo). They map cleanly only in UBERON and NeuroNames.
5. **Neurosynth-style evidence is imaging-only and correlational.** Label it "imaging meta-analysis" and never present it as proof that a region "does" a function (the reverse-inference problem, Poldrack 2006 and 2011).

---

## Part A. Relationships: White-Matter Tracts

**Methods.** Diffusion MRI tractography infers fiber paths from how water moves along axons. Dissection, especially the Klingler technique (freezing formalin-fixed brains so fibers separate, introduced by Joseph Klingler in the 1930s), shows real bundles in post-mortem tissue. Tract-tracing in monkeys (Schmahmann and Pandya, Fiber Pathways of the Brain, 2006) is the gold standard for primates. The main human reference is Catani and Thiebaut de Schotten, Atlas of Human Brain Connections (2012).

**Tractography limitation (state it whenever tracts are shown).** In Maier-Hein et al. 2017 (Nature Communications 8:1349), 20 research groups submitted 96 pipelines on a synthetic phantom with 25 known bundles. The paper's abstract reports that most state-of-the-art algorithms recovered about 90 percent of the ground-truth bundles to at least some extent, but the same tractograms contained many more invalid than valid bundles, and half of these invalid bundles occurred systematically across research groups. Every tract picture is a model, not a photograph.

### A1. Arcuate fasciculus (AR-kyoo-ate fuh-SIK-yoo-lus)
- **Connects:** Broca's area (6) and premotor cortex (3) with Wernicke's area (13), superior temporal gyrus (12) and the inferior parietal lobe, including the angular gyrus (9).
- **Catani 2005 three-segment model** (Catani, Jones and ffytche, Annals of Neurology 57:8-16): a **long (direct) segment** linking Broca's and Wernicke's territories; an **anterior (indirect) segment** linking Broca's territory to "Geschwind's territory" in the inferior parietal lobule; and a **posterior (indirect) segment** linking Geschwind's territory to Wernicke's territory.\[4\]\[5\] The authors proposed that the direct path supports phonological functions such as repetition, and the indirect path supports semantic functions.\[6\]
- **Damage:** Classically **conduction aphasia** (poor repetition, phonemic errors, fairly good comprehension). Debated: supramarginal cortex is also implicated, and the parallel-pathway model helps explain why presentations vary.\[5\]
- **Child-friendly:** "A curved bridge that lets the listening part of your brain pass words to the speaking part."

### A2. Superior longitudinal fasciculus I, II, III (soo-PEER-ee-er lon-jih-TOO-dih-nul)
- **SLF I:** Superior parietal lobule (8) and precuneus (10) to SMA (4), dorsal premotor (3) and dorsal prefrontal cortex (1). Goal-directed movement and spatial attention to the body.
- **SLF II:** Angular gyrus region (9) to dorsolateral prefrontal cortex (1). Spatial attention and working memory. Thiebaut de Schotten et al. 2011 (Nature Neuroscience) linked right-sided SLF II lateralization to visuospatial attention bias (single study).
- **SLF III:** Supramarginal gyrus to ventral premotor (3) and pars opercularis (6). Hand and mouth action, imitation, articulation.
- **Damage:** Right-sided damage is linked to **hemispatial neglect**; left-sided damage to apraxia and speech problems.
- **Child-friendly:** "Three stacked highways along the top of your brain, carrying 'where is it?' messages to your planning areas."

### A3. Uncinate fasciculus (UN-sin-ate)
- **Connects:** Anterior temporal lobe (rostral 12, near the amygdala) to orbitofrontal cortex (2) and ventral prefrontal cortex (1). Hook-shaped.
- **Function and damage:** Links emotion and memory to value and supports semantic knowledge of people and objects. Implicated in semantic dementia and behavioral-variant frontotemporal dementia.
- **Child-friendly:** "A hook-shaped cable joining your meaning-memory area to your 'is this good or bad?' area."

### A4. Cingulum bundle (SING-gyoo-lum)
- **Connects:** Runs inside the cingulate gyrus (16) from subgenual frontal cortex to the parahippocampal and entorhinal cortex, with branches to precuneus (10) and medial prefrontal cortex (1).
- **Function and damage:** Attention, emotion regulation and memory; part of the extended Papez circuit. Altered microstructure is reported in Alzheimer's disease, depression and chronic pain (imaging associations).
- **Child-friendly:** "A belt around the middle of your brain, linking feelings to memories."

### A5. Inferior longitudinal fasciculus (ILF)
- **Connects:** Visual association cortex (18) and fusiform gyrus (14) to the anterior temporal lobe (rostral 12).
- **Function and damage:** The "what is it?" stream into memory; damage causes visual agnosia, prosopagnosia and some forms of pure alexia.
- **Child-friendly:** "A cable from your seeing area to your memory area, so you know what you're looking at."

### A6. Inferior fronto-occipital fasciculus (IFOF)
- **Connects:** Occipital cortex (17, 18), fusiform and posterior temporal cortex (14) and frontal cortex (1, 2, 6) through the extreme and external capsules.
- **Function:** Proposed roles in semantics and reading; intraoperative stimulation can produce semantic errors (Duffau's group).
- **Debate:** Schmahmann and Pandya's macaque tract-tracing found no direct fronto-occipital bundle and described an extreme capsule fasciculus instead; some later monkey work reports a candidate homolog. **Unresolved.** Present it as "a human pathway whose monkey equivalent is still debated".
- **Child-friendly:** "One of the longest cables in the brain, linking the seeing back to the thinking front."

### A7. Frontal aslant tract (uh-SLANT)
- **Connects:** SMA and pre-SMA (4) with pars opercularis (6). Characterized by Catani et al. 2012 (Cortex).
- **Function and damage:** Speech initiation and verbal fluency; damage contributes to reduced fluency and stuttering-like signs in the post-surgical **SMA syndrome**.
- **Child-friendly:** "A slanted slide from your 'get ready to move' area to your talking area."

### A8. Middle longitudinal fasciculus (MdLF)
- **Connects:** Superior temporal gyrus and temporal pole (12) with angular gyrus (9), superior parietal lobule (8), precuneus (10) and occipital cortex. Described in monkeys (Seltzer and Pandya 1984) and humans (Makris et al. 2009).
- **Function:** Uncertain; proposed roles in auditory-language integration and attention. Evidence is mainly tractography, so flag it as less established. No firm syndrome.
- **Child-friendly:** "A middle-lane cable that scientists are still figuring out."

### A9. Fornix (FOR-niks)
- **Connects:** Hippocampus (not a game region) to the mammillary bodies, septal nuclei and anterior thalamus; the main hippocampal output.
- **Function and damage:** Episodic memory; damage (for example during third-ventricle cyst surgery) causes anterograde amnesia. Fornix deep brain stimulation for Alzheimer's disease is experimental.
- **Child-friendly:** "An arch-shaped cable that carries new memories out of your memory-maker."

### A10. Corpus callosum (KOR-pus kuh-LOH-sum)
- **Parts:** The **rostrum and genu**, with the **forceps minor**, link the prefrontal (1) and orbitofrontal (2) cortices. The **body** links motor, sensory and parietal areas (3, 4, 5, 7, 8). The **splenium**, with the **forceps major**, links visual areas (17, 18), precuneus (10) and parts of the temporal lobe.
- **Damage:** Split-brain disconnection syndromes, alien hand, and **alexia without agraphia** (left occipital lesion plus splenium damage).
- **Child-friendly:** "The giant bridge between your left and right brain, made of hundreds of millions of tiny wires."

### A11. Anterior commissure (KOM-ih-shur)
- **Connects:** Anterior temporal lobes across the midline, plus olfactory structures including piriform cortex (alternate region 15). Smell and temporal-lobe communication. Some split-brain patients kept limited transfer through it.
- **Child-friendly:** "A small extra bridge near the front, carrying smell messages across."

### A12. Internal capsule and corona radiata (kuh-ROH-nuh ray-dee-AH-tuh)
- **Anterior limb:** Thalamus to prefrontal cortex (1, 2) and frontopontine fibers; a deep brain stimulation target region in severe obsessive-compulsive disorder (clinical information only).
- **Genu:** Corticobulbar fibers from face motor cortex (5) to cranial nerve nuclei (20).
- **Posterior limb:** Corticospinal fibers from 5, 3 and 4, and sensory thalamocortical fibers to 7. Behind it run the optic radiation (to 17) and auditory radiation (to 11).
- **Damage:** A small lacunar stroke in the posterior limb can cause **pure motor hemiparesis** because fibers are packed so tightly.
- **Child-friendly:** "A narrow tunnel where brain cables squeeze together; above it they fan out like a crown."

### A13. Corticospinal tract (KOR-tih-koh-SPY-nul)
- **Path:** Regions 5, 3, 4 and 7, through the corona radiata and posterior limb of the internal capsule, the cerebral peduncle in the midbrain (15), the basilar pons and the medullary pyramids (20), to the spinal cord. Most fibers cross at the pyramidal decussation (see Part F).
- **Damage:** Upper motor neuron signs (weakness, spasticity, brisk reflexes, Babinski sign) on the opposite side if above the decussation. ALS affects these neurons.
- **Child-friendly:** "The main 'move!' cable from the top of your brain down your spine; it crosses over, so the left brain moves the right hand."

### A14. Optic radiations and Meyer's loop (MY-erz)
- **Connects:** Lateral geniculate nucleus to primary visual cortex (17). **Meyer's loop** carries upper-field fibers forward around the temporal horn.
- **Damage:** Meyer's loop injury (for example in temporal lobe epilepsy surgery) causes a contralateral **superior quadrantanopia**, "pie in the sky". Tractography is used before surgery to spare it.
- **Child-friendly:** "The cable carrying pictures to the back of your brain; one part takes a little detour."

### A15. Cerebellar peduncles (peh-DUNG-kulz)
- **Superior:** Mainly output, from the dentate nucleus through the midbrain (15), where it crosses, to the red nucleus and VL thalamus, then cortex (5, 1).
- **Middle:** The largest; entirely input from the pontine nuclei (20) to the opposite cerebellum (19).
- **Inferior:** Input from the spinal cord, inferior olive and vestibular nuclei through the medulla (20).
- **Damage:** Ataxia, intention tremor and dysmetria.
- **Child-friendly:** "Three pairs of handles attaching your balance-and-timing brain to the brainstem."

### A16. Medial forebrain bundle (MFB)
- **Connects:** Ventral tegmental area in the midbrain (15) and lateral hypothalamus with nucleus accumbens, orbitofrontal (2) and prefrontal cortex (1), carrying dopamine, noradrenaline and serotonin axons.
- **Function:** Reward and motivation; the classic self-stimulation site of Olds and Milner 1954 (Peter Milner, Brenda Milner's husband).\[1\] MFB deep brain stimulation for depression is experimental.
- **Child-friendly:** "The brain's 'that was great, do it again!' cable."

### A17. U-fibers (short association fibers)
- **What they are:** Short fibers just under the cortex linking neighbouring gyri, for example 5 with 7 and 17 with 18. Hard to image because they lie so close to the cortex.
- **Child-friendly:** "Tiny U-shaped bridges connecting next-door neighbours on the brain's wrinkly surface."

---

## Part B. Neurons and Networks: Circuits

### B1. Cortico-basal ganglia-thalamo-cortical loops
- **Five loops (Alexander, DeLong and Strick 1986, Annual Review of Neuroscience):**
  - **Motor:** SMA (4), premotor (3), M1 (5), S1 (7) to putamen, GPi/SNr, VL/VA thalamus, back to SMA and motor cortex.
  - **Oculomotor:** Frontal eye fields (within 1 and 3) and posterior parietal (8) to caudate body, GPi/SNr, VA/MD thalamus, back to the frontal eye fields.
  - **Dorsolateral prefrontal:** dlPFC (1) to dorsolateral caudate, GPi/SNr, VA/MD thalamus, back to dlPFC.
  - **Lateral orbitofrontal:** OFC (2) to ventromedial caudate, GPi/SNr, VA/MD thalamus, back to OFC.
  - **Anterior cingulate (limbic):** ACC (16) to nucleus accumbens, ventral pallidum, MD thalamus, back to ACC.
- **Signal flow:**
  1. **Direct ("go"):** Cortex excites D1 striatal neurons, which inhibit GPi/SNr, releasing the thalamus to excite cortex.
  2. **Indirect ("no-go"):** D2 striatal neurons inhibit GPe, which releases the subthalamic nucleus (STN) to excite GPi/SNr and suppress the thalamus.
  3. **Hyperdirect:** Cortex to STN to GPi, a fast brake (Nambu and colleagues).
  4. Dopamine from the SNc excites D1 neurons and inhibits D2 neurons.
- **Current view:** Cui et al. 2013 (Nature) found direct and indirect pathway neurons co-activate when movement starts, supporting a model where one action is selected while competitors are suppressed.
- **Neurotransmitters:** Glutamate, GABA, dopamine, substance P, enkephalin, dynorphin.
- **Failure:** Parkinson's disease (too much "no-go"), Huntington's disease (early indirect-pathway loss, chorea), hemiballismus (STN lesion); obsessive-compulsive disorder and Tourette syndrome are associated with orbitofrontal and limbic loops.
- **Analogy:** "A theater crew: cortex suggests actors, the basal ganglia hold most back, and only the chosen one gets the spotlight."

### B2. Cerebro-cerebellar loop
- **Flow:** Cortex (5, 3, 1, 8) sends corticopontine fibers through the cerebral peduncle (15) to the pontine nuclei (20). Pontine fibers cross and enter the cerebellum (19) through the middle peduncle as mossy fibers, drive granule cells and parallel fibers onto Purkinje cells (climbing fibers come from the inferior olive). Purkinje cells inhibit the dentate nucleus, whose output crosses in the superior peduncle to the VL thalamus and back to motor and prefrontal cortex. The double crossing means each cerebellar half controls the same side of the body.
- **Neurotransmitters:** Glutamate (mossy, parallel, climbing fibers, nuclear output); GABA (Purkinje cells).
- **Failure:** Ataxia and dysmetria; the **cerebellar cognitive affective syndrome** (Schmahmann and Sherman 1998, Brain) adds executive, spatial, language and emotional changes.
- **Analogy:** "A coach comparing your plan with your move and whispering corrections."

### B3. Thalamocortical loops and thalamic reticular nucleus (TRN)
- **Components and flow:** Relay nuclei (LGN to 17, MGN to 11, VPL/VPM to 7, VL to 5) send glutamate mainly to layer IV; layer VI sends feedback to the same nucleus. The TRN, a GABAergic shell, receives branches of both streams and inhibits relay neurons to gate channels.
- **Function:** Sensory gating, attention (Crick's 1984 "searchlight" hypothesis, still a hypothesis), sleep spindles, and the switch between tonic waking and burst firing in deep sleep.
- **Failure:** Absence epilepsy (about 3 Hz spike-and-wave, involving T-type calcium channels).
- **Analogy:** "A school office deciding which messages reach the classroom."

### B4. Papez circuit (1937) and modern view
- **Flow:** Hippocampus via fornix to mammillary bodies, via mammillothalamic tract to anterior thalamus, to cingulate cortex (16), via cingulum to parahippocampal and entorhinal cortex, back to the hippocampus. Papez proposed it as the circuit for emotion.
- **Modern view:** Now seen mainly as an **episodic memory** system (Aggleton and colleagues); emotion depends more on the amygdala, OFC (2) and ventromedial PFC (1).
- **Failure:** Korsakoff syndrome (thiamine deficiency damaging mammillary bodies and thalamus), amnesia after fornix or anterior thalamic damage.
- **Analogy:** "A memory merry-go-round that a new experience rides until it is saved."

### B5. Amygdala fear circuit (LeDoux low road and high road)
- **Flow (from rat fear conditioning):** The **low road** runs from sensory thalamus straight to the lateral amygdala (fast, crude). The **high road** runs through sensory cortex (11, 17, 18) to the amygdala (slower, detailed). The central nucleus then drives the hypothalamus (hormones), periaqueductal gray in the midbrain (15, freezing) and brainstem nuclei (20, startle, heart rate). Ventromedial PFC (1, 2) and hippocampus regulate extinction and context.
- **Neurotransmitters:** Glutamate, GABA, noradrenaline, CRH.
- **Critiques:** Pessoa and Adolphs 2010 (Nature Reviews Neuroscience) argued a fast subcortical visual route is not needed in primates. LeDoux and Pine 2016 (American Journal of Psychiatry) separate defensive survival circuits from the conscious feeling of fear and reject the "fear center" label. Patient S.M., with bilateral amygdala damage, felt panic on inhaling CO2 (Feinstein et al. 2013, Nature Neuroscience).
- **Failure:** Anxiety disorders and PTSD (associations); Urbach-Wiethe disease.
- **Analogy:** "A smoke alarm that beeps fast, plus a firefighter in the front of the brain who checks if it's real."

### B6. Mesolimbic and mesocortical dopamine reward circuit
- **Flow:** VTA (15) to nucleus accumbens, amygdala and hippocampus (mesolimbic), and to prefrontal (1), OFC (2) and ACC (16) (mesocortical).
- **Reward prediction error:** Schultz, Dayan and Montague 1997 (Science) showed dopamine neurons fire to unexpected rewards, shift to predictive cues after learning, and dip when an expected reward fails to arrive, matching temporal-difference learning.
- **Failure:** Addiction, anhedonia in depression (association), positive symptoms in schizophrenia (hyperdopamine model).
- **Analogy:** "A surprise meter that jumps when something is better than expected."

### B7. Nigrostriatal pathway
- **Flow:** Substantia nigra pars compacta (15) to dorsal striatum, releasing dopamine onto D1 and D2 receptors. Supports movement start-up, vigor and habits.
- **Failure:** **Parkinson's disease**; motor signs appear after a large share of nigral neurons are lost (textbook estimates often cite 50 to 70 percent; not re-verified here). D2-blocking antipsychotics can cause parkinsonism.
- **Analogy:** "A battery pack for the movement 'go' system."

### B8. Hippocampal trisynaptic circuit
- **Flow:** (1) Entorhinal layer II sends the **perforant path** to dentate gyrus granule cells; (2) **mossy fibers** go to CA3, which also excites itself recurrently; (3) **Schaffer collaterals** go to CA1; CA1 projects to the subiculum and back to entorhinal layers V and VI. A direct path also runs from entorhinal layer III to CA1.
- **Function:** Episodic and spatial memory; pattern separation (dentate) and completion (CA3) are computational models. Bliss and Lømo described long-term potentiation at the perforant path in 1973.
- **Failure:** Alzheimer's disease begins here (Braak staging); CA1 is vulnerable to low oxygen; hippocampal sclerosis in temporal lobe epilepsy; patient H.M.
- **Analogy:** "A three-stop relay race that turns today into a memory for tomorrow."

### B9. Spinal reflex arcs
- **Stretch reflex:** Muscle spindle Ia afferent makes one glutamatergic synapse on an alpha motor neuron, contracting the same muscle (knee jerk), while a glycinergic interneuron relaxes the opposing muscle.
- **Withdrawal and crossed-extensor:** Pain input through interneurons flexes the same limb and extends the opposite limb to hold body weight.
- **Failure:** Corticospinal lesions cause brisk reflexes and the Babinski sign; nerve damage reduces reflexes. Regions 5 and 20 modulate reflexes from above.
- **Analogy:** "Your spine answers 'ouch!' before the message reaches your brain."

### B10. Central pattern generators
- **Walking:** Spinal interneuron networks produce alternating rhythms (Graham Brown's 1911 half-center model). The mesencephalic locomotor region (15) switches walking on; cortex (5, 3) and cerebellum (19) refine it.
- **Breathing:** The **pre-Bötzinger complex** in the ventrolateral medulla (20) generates inspiratory rhythm (Smith et al. 1991, Science). Opioids depress it, which is why opioid overdose can stop breathing (mechanism only).
- **Failure:** Central apnea, congenital central hypoventilation syndrome (PHOX2B).
- **Analogy:** "A built-in drummer keeping the beat for breathing and walking."

### B11. Ascending arousal system
- **Components:** Locus coeruleus (pons, 20, noradrenaline); raphe nuclei (15, 20, serotonin); pontine PPT and LDT (acetylcholine); basal forebrain (acetylcholine); tuberomammillary nucleus (histamine); lateral hypothalamus (orexin); VTA (dopamine).
- **Flow:** Projections through the thalamus and directly to cortex keep it awake; the VLPO inhibits them in sleep in a "flip-flop switch" (Saper and colleagues) stabilized by orexin. The historical root is Moruzzi and Magoun 1949.
- **Failure:** Narcolepsy type 1 (loss of orexin neurons); coma after bilateral brainstem tegmentum or thalamic damage.
- **Date-stamped note:** A reader-prediction article in The Scientist says Mignot and Yanagisawa received the 2026 Lasker Basic Medical Research Award for orexin; treat as unverified.\[7\]
- **Analogy:** "The brain's dimmer switch."

### B12. Vestibulo-ocular reflex (VOR)
- **Flow:** Semicircular canal hair cells, vestibular nerve (CN VIII), vestibular nuclei (20), then crossed fibers in the medial longitudinal fasciculus to the abducens (pons) and oculomotor (midbrain, 15) nuclei. Eyes move opposite to the head. The cerebellar flocculus (19) tunes the gain.
- **Failure:** Oscillopsia after vestibular loss; tested in coma examinations.
- **Analogy:** "A camera stabilizer for your eyes."

### B13. HPA stress axis
- **Flow:** Hypothalamic paraventricular nucleus releases CRH and vasopressin, the anterior pituitary releases ACTH, and the adrenal cortex releases cortisol. Cortisol feeds back on the hippocampus, PFC (1), hypothalamus and pituitary. The amygdala drives the axis; the hippocampus and medial PFC restrain it.
- **Failure:** Cushing syndrome, Addison disease; altered regulation is associated with depression and PTSD.
- **Analogy:** "A three-step alarm chain with a cortisol 'all clear' coming back."

---

## Part C. Cortical Layers and Columns

### C1. The six neocortical layers
| Layer | Main cells | Main inputs | Main outputs |
|---|---|---|---|
| I Molecular | Few neurons; pyramidal dendrite tufts | Feedback cortical, matrix thalamus | Local |
| II External granular | Small pyramidal and granule cells | Local and cortical | Cortico-cortical |
| III External pyramidal | Medium pyramidal cells | Cortical, layer IV | Feedforward cortical, callosal |
| IV Internal granular | Spiny stellate cells | Core thalamic relay | Layers II and III |
| V Internal pyramidal | Large pyramidal (Betz cells in area 4) | Layers II, III, VI | Spinal cord, brainstem, pons, striatum |
| VI Multiform | Corticothalamic cells | Cortical, thalamic | Thalamic feedback |

### C2. Motor versus sensory cortex
- **Region 5 (M1, area 4):** **Agranular**; layer IV nearly absent; thick layer V with Betz cells. Regions 3 and 4 (area 6) are also agranular but lack Betz cells.
- **Region 7 (S1):** Area 3b is **granular koniocortex** with thick layer IV fed by the VPL and VPM.
- **Region 11 (A1, area 41):** Koniocortex fed by the MGN.
- **Region 17 (V1):** The most granular cortex, with layer IV split into 4A, 4B, 4Cα and 4Cβ. The **stria of Gennari**, a myelinated band in layer 4B visible to the naked eye, was described by Francesco Gennari in the late 1700s and gives "striate cortex" its name.
- **Teaching line:** "Sending areas have a thick layer V; receiving areas have a thick layer IV."

### C3. Allocortex versus neocortex
Neocortex has six layers and makes up most human cortex. Allocortex has three: the **archicortex** (hippocampus) and the **paleocortex** (**piriform** olfactory cortex, alternate region 15).\[8\] Transitional cortex includes the entorhinal cortex and parts of the cingulate (16).

### C4. Brodmann's method
Korbinian Brodmann (1909) used Nissl stains and drew borders where layer thickness, cell size and density changed, numbering about 43 to 52 areas depending on how they are counted. The numbers reflect sampling order, not function. Julich-Brain and HCP-MMP1.0 refine his maps.

### C5. Columns and minicolumns
- **Mountcastle 1957:** In cat somatosensory cortex, neurons along a vertical penetration shared a submodality; he proposed the column as a unit, and later minicolumns of about 80 to 100 neurons.
- **Hubel and Wiesel:** Ocular dominance and orientation columns and "hypercolumns" in V1 (17); Nobel Prize 1981.
- **Debate:** Horton and Adams 2005 (Philosophical Transactions of the Royal Society B), "The cortical column: a structure without a function", noted that squirrel monkeys can have or lack ocular dominance columns while seeing normally. **Teach as:** "Columns clearly exist in some areas; whether they are the basic building block is debated."

### C6. Canonical microcircuit (Douglas and Martin)
From cat V1 (1989; 2004 Annual Review of Neuroscience update): thalamus to layer IV, to II and III, to V, to VI, with recurrent excitation balanced by inhibition. Thalamic synapses are a small fraction of input, so cortex amplifies weak signals. This is a model.

### C7. Feedforward and feedback (Felleman and Van Essen 1991)
In Cerebral Cortex (1991), they ranked macaque visual areas by laminar patterns. **Feedforward** projections start mainly in layer III and end in layer IV; **feedback** projections start mainly in layers V and VI and end outside layer IV, especially layer I. Markov et al. 2014 graded hierarchy by supragranular neuron fraction. For the game: feedforward 17 to 18 to 14; feedback 1 to 18.

### C8. Cortical thickness
Fischl and Dale 2000 (PNAS 97:11050-11055) report that human cortical thickness varies between 1 and 4.5 mm, with an overall average of about 2.5 mm (2.5 ± 0.7 mm across 30 subjects). In their data the anterior bank of the central sulcus (area 4, region 5) measured 2.69 mm against 1.81 mm for the posterior bank (area 3, region 7), and they note that sensory areas such as V1 (17) are among the thinnest in the cortex. MRI estimates depend on method.

---

## Part D. Molecules: Receptors

**Information only, never advice.** Substance content describes mechanism only.

### D1. Ionotropic versus metabotropic
**Ionotropic** receptors are ligand-gated ion channels that act within milliseconds. **Metabotropic** receptors are G-protein-coupled receptors that act over hundreds of milliseconds to minutes through second messengers. **Child-friendly:** "Ionotropic receptors are doors that swing open; metabotropic receptors are doorbells that send a message inside."

### D2. Major receptor families
| Family | Type | Key facts |
|---|---|---|
| AMPA | Ionotropic | Most fast excitation |
| NMDA | Ionotropic, Ca2+ | Mg2+ block; needs glutamate, co-agonist and depolarization; LTP "coincidence detector"; ketamine blocks it |
| Kainate | Ionotropic | Pre- and postsynaptic modulation |
| GABA-A | Ionotropic Cl- | Main fast inhibition; benzodiazepines, alcohol and barbiturates enhance it |
| GABA-B | Metabotropic (Gi/o) | Slow inhibition via K+ channels; baclofen is an agonist |
| Nicotinic ACh | Ionotropic | Neuromuscular junction; brain α4β2 and α7; nicotine is an agonist |
| Muscarinic M1 to M5 | Metabotropic | M1, M3, M5 Gq; M2, M4 Gi |
| Dopamine D1, D5 | Metabotropic (Gs) | Direct pathway; prefrontal working memory |
| Dopamine D2, D3, D4 | Metabotropic (Gi) | Indirect pathway; autoreceptors; antipsychotic target |
| 5-HT1, 2, 4 to 7 | Metabotropic | About 14 subtypes; 5-HT2A is the main psychedelic target |
| 5-HT3 | **Ionotropic exception** | Cation channel; ondansetron blocks it |
| Adrenergic α1, α2, β1 to β3 | Metabotropic | α2 is a presynaptic brake; β1 heart rate; β2 airways |
| Opioid μ, δ, κ | Metabotropic (Gi/o) | μ: pain relief and respiratory depression; κ: dysphoria |
| Cannabinoid CB1 | Metabotropic (Gi/o) | Among the most abundant brain GPCRs; retrograde signalling; THC is a partial agonist |

### D3. Voltage-gated channels
- **Sodium (Nav1.1 to 1.9):** Action potential upstroke; blocked by tetrodotoxin and local anesthetics; SCN1A mutations cause Dravet syndrome.
- **Potassium:** Repolarization and firing patterns; KCNQ mutations cause some epilepsies.
- **Calcium (L, N, P/Q, R, T):** N and P/Q trigger transmitter release; T type drives thalamic bursts and is blocked by ethosuximide.

### D4. Familiar substances (mechanism only)
Caffeine blocks adenosine A1 and A2A receptors. Alcohol enhances GABA-A and inhibits NMDA receptors. Benzodiazepines increase how often GABA-A channels open. Nicotine activates nicotinic receptors, including those on VTA dopamine neurons.

### D5. Receptor atlases
Hansen et al. 2022 (Nature Neuroscience 25:1569-1581) compiled PET tracer maps for 19 receptors and transporters across 9 neurotransmitter systems from a combined total of 1,238 healthy participants (718 male, 520 female), showing that receptor profiles follow the sensory-to-association gradient; the data are shared at github.com/netneurolab/hansen_receptors. Check the data license before shipping and verify any density claim against the published maps.

---

## Part E. Ontology Crosswalk

### E1. Region crosswalk
Status key: **V** means verified on EBI OLS, InterLex or AmiGO this run; **M** means from memory or secondary sources and **must be checked** via https://www.ebi.ac.uk/ols/ontologies/uberon/terms?iri=http://purl.obolibrary.org/obo/UBERON_XXXXXXX. DK is Desikan-Killiany; NN is the NeuroNames xref in Uberon.

| ID | Region | UBERON (status) | NN | DK label(s) | Brodmann | HCP-MMP1.0 examples | Relation and fit |
|---|---|---|---|---|---|---|---|
| 1 | Prefrontal | 0000451 prefrontal cortex (V)\[9\] | 1072 (Wikidata gives 2429: conflict)\[9\]\[10\] | superiorfrontal, rostral/caudal middlefrontal, frontalpole | 8, 9, 10, 46 | 46, 9-46d, 8Ad, 9a, 10d, FEF | UBERON equivalent; DK and HCP contain |
| 2 | Orbitofrontal | 0004167 (M) | verify | lateral/medial orbitofrontal, parsorbitalis | 11, 12/47, 13, 14 | OFC, pOFC, 11l, 13l, 47m | UBERON equivalent; DK contains |
| 3 | Premotor | No verified term; parent precentral gyrus 0002703 (V)\[11\] | verify | precentral (anterior), caudalmiddlefrontal | 6 lateral | 6d, 6v, 6r, 6a, 55b | **Poor fit**; overlaps only |
| 4 | SMA | No verified term (M) | verify | superiorfrontal (posterior medial), paracentral | 6 medial | 6ma, 6mp, SCEF | **Poor fit** in DK; HCP near-equivalent |
| 5 | Primary motor | 0001384 primary motor cortex (V); part_of precentral gyrus 0002703 (V)\[11\]\[12\] | 89 (precentral); BA4 0013535 NN 1014\[11\]\[13\] | precentral | 4 | 4 | UBERON and HCP equivalent; DK contains |
| 6 | Broca's (left) | No verified term; pars opercularis/triangularis about 0002981, 0002982 (M) | verify | parsopercularis, parstriangularis | 44, 45 | 44, 45 | DK and BA near-equivalent; variable |
| 7 | Primary somatosensory | Postcentral gyrus 0002581 (V)\[14\] | 105\[15\] | postcentral | 3a, 3b, 1, 2 | 3a, 3b, 1, 2 | part_of postcentral; HCP equivalent |
| 8 | Superior parietal | 0006094 (M) | verify | superiorparietal | 5, 7 | 7AL, 7PL, 7PC, MIP, VIP, LIP | DK equivalent; HCP contains |
| 9 | Angular gyrus | 0002686 (M) | verify | inferiorparietal (posterior) | 39 | PGi, PGs, PGp | DK contains; HCP equivalent |
| 10 | Precuneus | 0006093 precuneus cortex (V)\[16\] | 110\[16\] | precuneus | 7 medial, 31 | 7m, 7Pm, PCV, POS2 | Equivalent; HCP contains\[17\]\[18\] |
| 11 | Primary auditory | 0003939 transverse gyrus of Heschl (V); separate A1 term likely 0034751 (M) | 134 (anterior transverse temporal 0002773, V)\[19\] | transversetemporal | 41 | A1 | part_of Heschl's gyrus; DK contains |
| 12 | Superior temporal | 0002769 (M, high confidence) | verify | superiortemporal, bankssts | 22, 41, 42, 38 | A4, A5, STGa, TA2 | DK equivalent; contains 11 and 13 |
| 13 | Wernicke's (left) | No standard term (M); parent superior temporal gyrus | Wikipedia 1233 (unverified)\[20\] | superiortemporal (posterior), bankssts, supramarginal | 22 posterior; some add 39, 40 | A5, STV, PSL, TPOJ1 | **Poor fit**; definitions vary; overlaps only |
| 14 | Fusiform | 0002766 (M, high confidence) | verify | fusiform | 37 | FFC, VVC, PIT | DK equivalent; HCP contains |
| 15 | Midbrain | 0001891 (M, high confidence) | verify | Not in DK; FreeSurfer aseg "Brain-Stem" | n/a | n/a | **Outside cortical atlases** |
| 15-alt | Piriform | 0002590 (M) | verify | Not in DK | 51 (broad numbering) | Not standard | Allocortex; poor fit |
| 16 | Cingulate | 0003027 (M); ACC 0009835 (V)\[21\] | verify | rostral/caudal anteriorcingulate, posteriorcingulate, isthmuscingulate | 23, 24, 25, 31, 32 | a24, p24, 24dd, d23ab, 31a, RSC | DK union equivalent; HCP contains |
| 17 | Primary visual | 0002436 (M); parent visual cortex 0000411 (V)\[22\] | verify | pericalcarine (plus parts of cuneus, lingual) | 17 | V1 | DK overlaps; HCP equivalent |
| 18 | Visual association | "visual association cortex" and "extrastriate cortex" exist under 0000411 (IDs to verify)\[22\] | verify | lateraloccipital, cuneus, lingual | 18, 19 | V2, V3, V4, MT, MST, LO1 to LO3 | DK overlaps; HCP contains |
| 19 | Cerebellum | 0002037 (V)\[23\] | Wikidata 643\[24\] | Not in DK (aseg cerebellum labels) | n/a | CIFTI cerebellum | Outside cortical atlases |
| 20 | Pons and medulla | 0000988, 0001896 (M); brainstem 0002298 (M) | verify | Not in DK (aseg "Brain-Stem") | n/a | n/a | part_of brainstem (UBERON brainstem includes midbrain) |

**Rule:** Desikan-Killiany (Desikan et al. 2006, NeuroImage; 34 cortical labels per hemisphere) is a gyral atlas, so functional areas such as 3, 4, 6, 13 and 17 get "overlaps" or "contains", never "equivalent". HCP-MMP1.0 (Glasser et al. 2016, Nature; 180 areas per hemisphere) is the best key for 5, 7, 11 and 17.

### E2. Function concepts
IDs are shown only where verified on cognitiveatlas.org this run; otherwise "verify" (via cognitiveatlas.org/api/search). Roles: P primary, C contributing. Evidence: L lesion, S stimulation, I imaging meta-analysis, T textbook consensus.

| Function | Cognitive Atlas (status) | Plain definition | Regions (role, evidence) |
|---|---|---|---|
| Working memory | Present; sub-concepts verified: spatial working memory trm_4a3fd79d0b1e0, phonological working memory trm_4a3fd79d0ac9e\[25\]\[26\] | Holding and using information for seconds | 1 P (L, I); 8, 10 C (I); 6 C verbal (I) |
| Episodic memory | Verify (parent "memory" trm_4a3fd79d0a891 verified)\[27\] | Remembering personal events | Hippocampus P; 10, 9 C (I) |
| Semantic memory | Verify | Knowing facts and meanings | Rostral 12 P (L); 9, 14 C (I) |
| Procedural memory | Verify | Learning skills | Basal ganglia P; 19 P (L); 4, 3 C (I) |
| Speech production | Verify | Planning and saying words | 6 P (L, S); 5 P (S); 4 C (L, S) |
| Language comprehension | Verify | Understanding words | 13 P (L); 12 P (I); 9 C (I) |
| Reading | Verify | Turning print into sound and meaning | 14 left P (L, I); 9 C (L) |
| Writing | Verify | Producing written language | 3 left C (L, S); 8, 9 C (L) |
| Emotion | Verify | Feelings and bodily reactions | Amygdala P; 2 P (L); 16 P (I) |
| Fear | Verify | Response to threat | Amygdala P (L, I); 15 PAG C (S) |
| Decision making | Verify | Choosing between options | 2 P (L); 1 P (I); 16 C (I) |
| Attention | Verify | Selecting what to focus on | 8 P (I); 1 FEF P (S, I); 9 right C (L) |
| Motor control | Verify | Planning and executing movement | 5 P (L, S); 3, 4 P (S); 19 P (L) |
| Balance | Likely absent | Keeping steady | 19 P (L); 20 P (T) |
| Vision | Verify | Seeing | 17 P (L, S); 18 P (L, S, I) |
| Hearing | Verify | Hearing | 11 P (L, S); 12 C (I) |
| Touch | Verify | Feeling touch | 7 P (L, S); 8 C (I) |
| Pain | Verify | Unpleasant sensation linked to harm | 7 C (S); 16 C (I, L); 15 PAG C (S) |
| Smell | Verify | Smelling | 15-alt piriform P (T); 2 C (L, I) |
| Taste | Verify | Tasting | Insula P; 2 C (I) |
| Face recognition | Verify | Knowing whose face it is | 14 P (L, S, I) |
| Spatial navigation | Verify | Finding your way | Hippocampus P; 10, 16 posterior C (I, L) |
| Planning | Verify | Ordering steps toward a goal | 1 P (L); 4, 19 C |
| Theory of mind | Verify | Thinking about others' thoughts | 9 P (I); 1 medial P (I); 10 C (I) |
| Music | Verify | Perceiving and making music | 11, 12 P (L, I); 3, 19 C (I) |
| Numerical cognition | Verify | Understanding numbers | Intraparietal sulcus (8/9) P (L, I) |
| Sleep and arousal | Verify | Being awake or asleep | 20, 15 P (L, T); hypothalamus P |
| Hunger | Likely absent | Wanting food | Hypothalamus P (T); 2 C (I) |
| Thermoregulation | Likely absent | Keeping body temperature right | Hypothalamus P (T) |
| Breathing | Likely absent | Automatic breathing rhythm | 20 P (L, T) |
| Consciousness | Verify | Being aware | 20, 15 P (L); thalamus P; 10 C (I); debated |

### E3. Neurosynth and NeuroQuery
- **What they measure:** Neurosynth (Yarkoni et al. 2011, Nature Methods) automatically extracts activation coordinates from papers and links them to term frequency in abstracts.\[28\] Its **uniformity test** shows where activation is consistently reported for a term; its **association test** shows where activation is more likely for studies using the term than not, so it is more selective. Version 0.7 (July 2018) covers 14,371 studies; Dockès et al. 2020 (eLife) report that it holds 448,255 unique locations and term frequencies for 3,228 terms, of which 1,335 are used in the online tool. NeuroQuery (Dockès et al. 2020, eLife) predicts maps from text across 13,459 full-text papers and 7,547 terms and handles rare terms better.\[29\]\[30\]
- **Limits:** Reverse inference is weak unless a region is selective (Poldrack 2006, Trends in Cognitive Sciences; Poldrack 2011, Neuron). Evidence is imaging-only, coordinate-based, a frozen literature snapshot, and prone to publication bias. Example: Lieberman and Eisenberger 2015 used Neurosynth to claim dorsal ACC (16) is pain-selective, which Wager and colleagues disputed in 2016.
- **Maintenance (October 2026):** The Neurosynth Python package is deprecated in favor of NiMARE.\[31\]\[32\] Neurosynth Compose, built on NeuroStore and NiMARE, is described in an Imaging Neuroscience paper that notes ongoing efforts to secure sustainable funding.\[33\]\[34\] NiMARE releases continued through at least December 2025 (0.6.2rc1), and Neurosynth Compose has recent maintenance releases on Zenodo.\[35\]\[36\] The original NeuroQuery GitHub repository was archived in April 2020.\[37\] Treat all as small, funding-dependent academic projects.
- **Qualitative associations** (from documentation and papers; no numbers): working memory with dlPFC (1) and parietal (8, 9); fear with the amygdala and medial PFC/OFC (2); pain with insula, dorsal ACC (16) and S1 (7); faces with fusiform (14); language with left IFG (6) and posterior STG (12, 13); motor with M1 (5) and SMA (4); auditory with Heschl's gyrus (11); visual with occipital cortex (17, 18); theory of mind with TPJ (9), medial PFC (1) and precuneus (10). Verify each map live before quoting.

### E4. Yeo 7 and 17 networks
- **7 networks** (Yeo et al. 2011, Journal of Neurophysiology, 1,000 subjects): Visual, Somatomotor, Dorsal Attention, Ventral Attention (Salience), Limbic, Frontoparietal Control, Default.\[38\]\[39\]
- **17 networks** (common Schaefer/Kong labels): VisCent, VisPeri; SomMotA, SomMotB; DorsAttnA, DorsAttnB; SalVentAttnA, SalVentAttnB; LimbicA, LimbicB; ContA, ContB, ContC; DefaultA, DefaultB, DefaultC; TempPar.

All rows are **approximate, literature-based**.

| ID | Region | Yeo-7 (main / secondary) | Yeo-17 likely |
|---|---|---|---|
| 1 | Prefrontal | Frontoparietal / Default | ContA, ContB; DefaultA, DefaultB |
| 2 | OFC | Limbic / Default | LimbicB |
| 3 | Premotor | Somatomotor / Dorsal Attention | SomMotA; DorsAttnB |
| 4 | SMA | Somatomotor / Ventral Attention (pre-SMA) | SomMotA; SalVentAttnA |
| 5 | M1 | Somatomotor | SomMotA, SomMotB |
| 6 | Broca's | Default / Frontoparietal | DefaultB; ContB |
| 7 | S1 | Somatomotor | SomMotA, SomMotB |
| 8 | Superior parietal | Dorsal Attention | DorsAttnA |
| 9 | Angular gyrus | Default / Frontoparietal | DefaultA, DefaultB; ContB |
| 10 | Precuneus | Default / Frontoparietal | DefaultA; ContC |
| 11 | A1 | Somatomotor (auditory) | SomMotB |
| 12 | STG | Somatomotor / Ventral Attention, Default | SomMotB; DefaultB |
| 13 | Wernicke's | Default / Ventral Attention | TempPar; DefaultB |
| 14 | Fusiform | Visual / Dorsal Attention, Limbic | VisCent; DorsAttnA |
| 15 | Midbrain | Outside cortical parcellation | n/a |
| 16 | Cingulate | Ventral Attention (dorsal); Default (PCC); Limbic (subgenual) | SalVentAttnB; DefaultA |
| 17 | V1 | Visual | VisCent, VisPeri |
| 18 | Visual association | Visual / Dorsal Attention | VisCent; DorsAttnA |
| 19 | Cerebellum | All 7 represented (Buckner et al. 2011, J Neurophysiol) | Buckner cerebellar map |
| 20 | Pons and medulla | Outside cortical parcellation | n/a |

Choi et al. 2012 (J Neurophysiol) mapped the striatum: caudate mainly frontoparietal and default, putamen somatomotor, ventral striatum limbic. Alternatives include Gordon et al. 2016 (333 parcels) and Schaefer et al. 2018 (100 to 1,000 parcels). Precision mapping (Gordon et al. 2017, Neuron; Braga and Buckner 2017, Neuron) shows network borders vary between individuals.

### E5. Licenses and reuse terms
| Source | License / terms | Ship in a public app? | Where stated |
|---|---|---|---|
| UBERON | CC BY 3.0 | Yes, with attribution | https://obofoundry.org/ontology/uberon.html |
| NeuroNames / BrainInfo | "Copyright 1991-present UW"; a 2003 chapter says incorporation requires written permission\[40\]\[41\] | ID numbers only; seek permission before copying text | http://braininfo.rprc.washington.edu/; https://link.springer.com/chapter/10.1007/978-1-4615-1079-6_18 |
| Desikan-Killiany (FreeSurfer) | FreeSurfer Software License v1.0 (BSD-like)\[42\]\[43\] | Yes, with attribution and Desikan 2006 citation | https://surfer.nmr.mgh.harvard.edu/fswiki/FreeSurferSoftwareLicense |
| HCP-MMP1.0 | WU-Minn HCP Open Access Data Use Terms (redistribution under same terms); fsaverage projection on figshare is CC BY 4.0\[44\]\[45\] | Yes with HCP terms and acknowledgement | https://balsa.wustl.edu/kN62N; https://figshare.com/articles/dataset/HCP-MMP1_0_projected_on_fsaverage/3498446 |
| Cognitive Atlas | CC BY-SA 3.0 US\[46\] | Yes; adapted text stays CC BY-SA | https://www.cognitiveatlas.org/api |
| Neurosynth data | ODbL 1.0\[47\] | Yes; derived databases must be ODbL | https://github.com/elifesciences-publications/neurosynth-data |
| NeuroQuery | Code BSD-3; paper CC BY\[37\]\[48\] | Yes, with attribution | https://elifesciences.org/articles/53385 |
| Yeo 2011 atlas | MIT (CBIG)\[38\]\[49\] | Yes, with copyright notice | https://github.com/ThomasYeoLab/CBIG |

---

## Part F. Verification Pass

| Claim | Status (as of 3 Oct 2026) | Source URLs |
|---|---|---|
| Brenda Milner death date and age | **Previous report wrong if it gave a death date.** Alive, born 15 July 1918, aged 108\[1\] | https://en.wikipedia.org/wiki/Brenda_Milner; https://www.mcgill.ca/neuro/files/neuro/neuropsychology_day_booklet_2026.pdf |
| Kavli Prize 2026 (neuroscience) | Holt, Martin, Schuman, Steward, for local protein translation in neurons; announced 10 June 2026; USD 1 million shared\[50\]\[51\] | https://www.kavliprize.org/prizes/neuroscience/2026 |
| Brain Prize 2026 | Ginty and Ernfors, for the cellular architecture of touch and pain; announced 5 March, presented 20 May 2026; EUR 1.3 million\[52\]\[53\]\[54\] | https://brainprize.org/winners/touch-and-pain-2026 |
| 2026 Nobel Prize in Physiology or Medicine | **Not yet announced**; scheduled 5 October 2026, 11:30 CEST at the earliest\[55\]\[56\] | https://www.nobelprize.org/prizes/about/prize-announcement-dates/ |
| Neuralink participants | 21 enrolled worldwide per the company on 28 January 2026 (Reuters), an increase from the 12 people the company said in September 2025 had received its chips, with a reported record of zero serious device-related adverse events; the Neurapod fan blog reports that patient 26, Vancouver police Sgt. Lee Marten (the first Canadian recipient), was implanted on 20 May 2026 and refers to the first 27 trial participants (not company-confirmed) | https://www.aol.com/articles/elon-musks-neuralink-says-21-183038116.html; https://www.neurapod.com/blog/neuralink-update-2026 |
| Tenecteplase FDA approval | 3 March 2025, acute ischemic stroke in adults, based on the AcT trial\[57\]\[58\] | https://www.gene.com/media/press-releases/15053/2025-03-03/fda-approves-genentechs-tnkase-in-acute-; https://pmc.ncbi.nlm.nih.gov/articles/PMC12000023/ |
| Betz cell share | Not re-verified; classic counts (Lassek) give about 34,000 Betz cells against about 1 million pyramidal tract axons, roughly 3 percent | Lassek 1940s; Kandel |
| Optic chiasm crossing | Not re-verified; usual figure about 53 percent crossed (Kupfer et al. 1967) | Kupfer, Chumbley and Downer 1967, J Anat |
| Pyramidal decussation | Not re-verified; textbooks range about 75 to 90 percent; use "most, about 85 to 90 percent" | Purves; Nolte |
| Corpus callosum axons | Not re-verified; about 200 million (Aboitiz et al. 1992, Brain Research), some estimates up to 250 million | Aboitiz et al. 1992 |
| CSF production | Not re-verified; about 500 mL per day, about 150 mL present at once; choroid plexus share debated | Blumenfeld |

---

## Coverage Summary

| Rung | Anatomy | Function | Relationships | Neurons and Networks |
|---|---|---|---|---|
| Molecules | Partial | Covered (D) | Partial | Covered (D) |
| Neurons | Covered | Covered | Partial | Covered |
| Circuits | Covered (B) | Covered (B) | Covered (B) | **Now covered (B)** |
| Layers and columns | **Now covered (C)** | Covered (C2) | Covered (C7) | Covered (C5, C6) |
| Regions | Covered (E1) | Covered (E2) | **Now covered (A)** | Covered (E4) |
| Networks | Covered (E4) | Covered (E3) | Covered | Covered |
| Whole brain and body | Covered | Covered (B9 to B13) | Covered | Partial |

## Recommendations
1. **Fix the Milner entry now** and re-check her status at every content release.
2. **Ship UBERON plus HCP-MMP1.0 plus Yeo** as the open crosswalk backbone; use NeuroNames only as ID numbers.
3. **Before launch, verify every "M" UBERON ID and every Cognitive Atlas ID**, roughly 15 and 30 lookups.
4. **Label evidence types in the voice script:** "Brain scans suggest..." for imaging, "Patients with damage here..." for lesions.
5. **Isolate share-alike content:** keep any quoted Cognitive Atlas definitions in a separate CC BY-SA file and write the game's own definitions.
6. **Update date-stamped items** after 5 October 2026 (Nobel) and quarterly (Neuralink).

## Caveats
- Several Part F numbers and most Cognitive Atlas IDs were not re-checked against a fetched source in this run and are marked as such.
- UBERON IDs marked "M" come from memory or secondary sources; the prefrontal NeuroNames xref (1072) conflicts with Wikidata (2429).\[9\]\[10\]
- Debated or single-study claims are flagged: IFOF homology, MdLF function, the LeDoux low road, columns as a basic unit, dACC pain selectivity, SLF II lateralization, and experimental deep brain stimulation targets.
- No medical advice is implied; substance content describes mechanism only.

## Sources

1. [Brenda Milner](https://en.wikipedia.org/wiki/Brenda_Milner)
2. [27TH ANNUAL NEUROPSYCHOLOGY DAY May 11, 2026](https://www.mcgill.ca/neuro/files/neuro/neuropsychology_day_booklet_2026.pdf)
3. [Brenda Milner](https://www.thecanadianencyclopedia.ca/en/article/brenda-milner)
4. [Frontiers](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2013.00749/full)
5. [(Open Access) Perisylvian language networks of the human brain. (2005)](https://scispace.com/papers/perisylvian-language-networks-of-the-human-brain-4qbveymi5b)
6. [Perisylvian language networks of the human brain - Catani - 2005 - Annals of Neurology - Wiley Online Library](https://onlinelibrary.wiley.com/doi/full/10.1002/ana.20319)
7. [Who Will Win the 2026 Nobel Prize? Scientists Make Their Predictions](https://www.the-scientist.com/who-will-win-the-2026-nobel-prize-scientists-make-their-predictions-75076)
8. [Ebi](https://www.ebi.ac.uk/ols/ontologies/uberon/terms?iri=http://purl.obolibrary.org/obo/UBERON_0014734)
9. [UBERON:0000451 - prefrontal cortex](https://ebi.ac.uk/ols4/ontologies/uberon/entities/http:/purl.obolibrary.org/obo/UBERON_0000451)
10. [prefrontal cortex - Wikidata](https://www.wikidata.org/wiki/Q18680)
11. [Ebi](https://www.ebi.ac.uk/ols/ontologies/uberon/terms?iri=http://purl.obolibrary.org/obo/UBERON_0002703)
12. [Brain regions equated rather than part of: Primary Motor Cortex lists synonym precentral gyrus · Issue #3217 · obophenotype/uberon](https://github.com/obophenotype/uberon/issues/3217)
13. [UBERON:0013535](https://www.ebi.ac.uk/ols4/ontologies/uberon/terms?iri=http%3A%2F%2Fpurl.obolibrary.org%2Fobo%2FUBERON_0013535)
14. [UBERON:0002581](https://www.ebi.ac.uk/ols4/ontologies/uberon/terms?iri=http%3A%2F%2Fpurl.obolibrary.org%2Fobo%2FUBERON_0002581)
15. [Ebi](https://www.ebi.ac.uk/ols/ontologies/uberon/terms?iri=http://purl.obolibrary.org/obo/UBERON_0002581)
16. [UBERON:0006093 - precuneus cortex](https://ebi.ac.uk/ols4/ontologies/uberon/entities/http:/purl.obolibrary.org/obo/UBERON_0006093)
17. [Ebi](https://www.ebi.ac.uk/ols/ontologies/uberon/terms?iri=http://purl.obolibrary.org/obo/UBERON_0006093)
18. [Characteristic cortico-cortical connection profile of human precuneus revealed by probabilistic tractography](https://www.nature.com/articles/s41598-023-29251-2)
19. [AmiGO 2: Term Details for "anterior transverse temporal gyrus" (UBERON:0002773)](https://amigo.geneontology.org/amigo/term/UBERON:0002773)
20. [Wernicke's area](https://en.wikipedia.org/wiki/Wernicke's_area)
21. [UBERON:0009835](https://ebi.ac.uk/ols4/ontologies/uberon/entities/http:/purl.obolibrary.org/obo/UBERON_0009835)
22. [UBERON:0000411](https://ebi.ac.uk/ols4/ontologies/uberon/entities/http:/purl.obolibrary.org/obo/UBERON_0000411)
23. [Cerebellum UBERON:0002037 (ilx\_0101963)](https://scicrunch.org/scicrunch/interlex/view/ilx_0101963)
24. [cerebellum - Wikidata](https://www.wikidata.org/wiki/Q130983)
25. [Spatial Working Memory](https://www.cognitiveatlas.org/concept/id/trm_4a3fd79d0b1e0/)
26. [Phonological Working Memory](https://www.cognitiveatlas.org/concept/id/trm_4a3fd79d0ac9e/)
27. [Memory](https://www.cognitiveatlas.org/concept/id/trm_4a3fd79d0a891/)
28. [Mining the neuroimaging literature](https://elifesciences.org/articles/94909.pdf)
29. [NeuroQuery, comprehensive meta-analysis of human brain mapping - Equipe Data, Intelligence and Graphs](https://hal.inria.fr/DIG/hal-02485642v2)
30. [NeuroQuery, comprehensive meta-analysis of human brain mapping — Lacuna](https://lacuna.tiptreesystems.com/work/neuroquery-comprehensive-meta-analysis-of-human-brain-mapping/wrk_b930c69fba231ecf218c5ae3c97b2278)
31. [The Neurostuff Ecosystem](https://neurostuff.github.io/)
32. [neurosynth - Google Groups](https://groups.google.com/g/neurosynthlist)
33. [Announcing: Neurosynth Compose!](https://groups.google.com/g/neurosynthlist/c/4YE7CsBeUN0)
34. [Neurosynth Compose: A web-based platform for flexible and reproducible neuroimaging meta-analysis](https://direct.mit.edu/imag/article/doi/10.1162/IMAG.a.1114/134783/Neurosynth-Compose-A-web-based-platform-for)
35. [neurostuff/NiMARE: 0.6.2rc1](https://zenodo.org/records/17969692)
36. [Neurosynth Compose](https://zenodo.org/records/20034525)
37. [GitHub - elifesciences-publications/neuroquery](https://github.com/elifesciences-publications/neuroquery)
38. [Yeo 2011 atlas - Nilearn](https://nilearn.github.io/dev/modules/description/yeo_2011.html)
39. [Spatial Topography of Individual-Specific Cortical Networks Predicts Human Cognition, Personality, and Emotion - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6519695/)
40. [BrainInfo](https://link.springer.com/chapter/10.1007/978-1-4615-1079-6_18)
41. [BrainInfo](http://braininfo.rprc.washington.edu/)
42. [PreviousReleaseNotes - Free Surfer Wiki](https://surfer.nmr.mgh.harvard.edu/fswiki/PreviousReleaseNotes)
43. [FreeSurfer Software License Agreement Version 1.0, February 2011](https://ri.itservices.manchester.ac.uk/csf-apps/wp-content/uploads/freesurfer_license_accessed_20141027.pdf)
44. [MMP1.0 210V Parcellation on flatmaps](https://balsa.wustl.edu/kN62N)
45. [Item - HCP-MMP1.0 projected on fsaverage - figshare - Figshare](https://figshare.com/articles/dataset/HCP-MMP1_0_projected_on_fsaverage/3498446)
46. [Cognitive Atlas API](https://www.cognitiveatlas.org/api)
47. [GitHub - elifesciences-publications/neurosynth-data · GitHub](https://github.com/elifesciences-publications/neurosynth-data)
48. [NeuroQuery, comprehensive meta-analysis of human brain mapping](https://elifesciences.org/articles/53385)
49. [GitHub - ThomasYeoLab/CBIG · GitHub](https://github.com/ThomasYeoLab/CBIG)
50. [The Kavli Prize in Neuroscience 2026 Laureates](https://www.eurekalert.org/news-releases/1131723)
51. [2026 Kavli Prize in Neuroscience](https://www.kavliprize.org/prizes/neuroscience/2026)
52. [Two neurobiologists win 2026 Brain Prize for discovering mechanics of touch](https://www.thetransmitter.org/somatosensation/two-neurobiologists-win-2026-brain-prize-for-discovering-mechanics-of-touch/)
53. [The Brain Prize](https://brainprize.org/)
54. [Touch and pain](https://brainprize.org/winners/touch-and-pain-2026)
55. [Prize announcement dates - NobelPrize.org](https://www.nobelprize.org/prizes/about/prize-announcement-dates/)
56. [All Nobel Prizes in Physiology or Medicine - NobelPrize.org](https://www.nobelprize.org/prizes/lists/all-nobel-laureates-in-physiology-or-medicine/)
57. [Genentech: Press Releases](https://www.gene.com/media/press-releases/15053/2025-03-03/fda-approves-genentechs-tnkase-in-acute-)
58. [Tenecteplase is here: navigating the shift of a stroke thrombolytic in the United States prior to FDA approval: a mini-review on rationale, barriers, and pathways - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12000023/)
