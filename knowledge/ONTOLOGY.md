# Brain Game Ontology (v0.4, IMPLEMENTED)

Status: implemented on branch kb/ontology. Date: 2026-10-02. Supersedes v0.3.
v0.2 resolved the 13 framework points. v0.3 fills the gaps inside the ontology itself: complete class and relation specs, missing classes, debated science, quantities, spoken text, audience policy, laterality, output contract, ID lifecycle, Neo4j mapping, coverage gates and the extraction protocol.

## Changes in v0.4 (found while building and extracting)

- **Schema format:** declarative YAML (`schema/classes.yaml`, `relations.yaml`, `value-types.yaml`) read by our own validator, instead of hand-written JSON Schema files. One readable source, uniform typed errors, cross-record rules in the same engine.
- **Person:** `living` is required; `born` and `died` are optional and only filled when the source material states them. `died: null` no longer doubles as "living".
- **Structure.diffuse:** for structures that are everywhere (white matter, blood-brain barrier, central nervous system); exempt from the pointer rule.
- **OVERLAPS (new relation):** a structure that straddles painted regions without being part of one (cuneus over 17 and 18, paracentral lobule over 5 and 7).
- **R3 pointer order:** PART_OF a region, LIES_BENEATH a region, PART_OF chain, then OVERLAPS, then BOUNDS (a sulcus points at the region it bounds).
- **Universal assertion props:** `confidence` and `stance` (asserts or disputes). Debated and disputed claims are kept as debates and never count as positive facts.
- **DEBUNKS:** may start from a node whose sourced fact corrects the myth (for example the neuron count). **Myth.standaloneCorrection:** true when the myth's own cited correction is the evidence and no graph fact carries it; approved like any fact.
- **AFFECTS.lateralization:** for conditions tied to one side (hemispatial neglect, right).
- **Region.coverageExemptions:** a region may be exempt from a gate with a recorded reason (15 and 20 sit outside cortical network atlases; 9 and 13 are single gyri or areas with no named substructure).
- **Vocabulary additions:** conditionKind (demyelinating, csf_disorder, cranial_nerve_disorder, genetic), cellKind (receptor_cell, vascular_cell), coverageGate, stance, license.
- **VISIBLE_FROM** means "among the most prominent regions from that view" (`labelsPerView` lists ten per view). The views coverage gate was dropped for that reason.
- **Originality guard:** no text field may share 8 or more consecutive words with the source material. The two research reports now live in `knowledge/sources/` so every locator resolves to a versioned file.

## Locked decisions

- No repainting. The 20 painted regions and colours are fixed; names and text may change.
- Region names describe the tissue the paint covers. Repo names stay for 8, 14, 15, 20; KB text changes to match.
- The AI guide (Sylvi or Rollo) controls both views: the 3D brain now, the graph view later.
- No triple store, no RDF. Files in git are canonical. The compile step emits JSON for runtime and, later, a Neo4j import for the graph view.
- Hybrid knowledge: the structured graph is authoritative; the narrative KB is uploaded to ElevenLabs for depth. When they disagree, the graph wins.
- Steward: Kyle. Nothing unapproved reaches the guides.

## Layout

```
knowledge/
  vocabulary/      closed term lists
  schema/          JSON Schema per class, per relation, per value type + VERSION
  data/            our instance records, one file per class
  fixtures/valid/  real records that must pass
  fixtures/invalid/ real records broken one rule each, with expected error code
  competency/      questions with expected answers
  review/          generated review sheets and imported decisions
  kb/              narrative markdown
  CHANGELOG.md     data changes (separate from schema VERSION)
scripts/
  kb-validate.mjs  kb-compile.mjs  kb-review.mjs
output/
  src/data/brainGraph.json       runtime graph (agent tools, game)
  agent/pronunciations.pls       ElevenLabs pronunciation dictionary
  CREDITS.md                     generated attribution
  neo4j/import.cypher            later, graph view
```

All tooling runs in Node and Vitest.

---

## 1. Vocabulary (closed term lists)

| Vocabulary | Terms |
|---|---|
| `role` | primary, contributing |
| `evidence` | lesion, stimulation, imaging, textbook |
| `lateralization` | left, right, bilateral |
| `visibility` | surface, partly, hidden, not_present |
| `structureKind` | lobe, gyrus, sulcus, fissure, nucleus, cortex_area, ventricle, cranial_nerve, cell_layer, gland, tissue |
| `tractKind` | association, commissural, projection |
| `cellKind` | neuron, glia |
| `moleculeKind` | neurotransmitter, neuromodulator, receptor, ion_channel, hormone |
| `processKind` | signalling, plasticity, development, maintenance |
| `conditionKind` | neurodegenerative, vascular, seizure, injury, tumour, developmental |
| `networkRole` | hub, node |
| `endpoint` | origin, termination, via |
| `confidence` | established, approximate, debated |
| `matchType` | exact, close, broader, narrower, related |
| `xrefScheme` | uberon, desikan, brodmann, hcp_mmp, neuronames, cognitive_atlas, yeo7, yeo17 |
| `sourceType` | textbook, peer_reviewed, reference_atlas, plain_language |
| `status` | proposed, approved, rejected, superseded |
| `method` | human, ai_extracted, derived |
| `audience` | all, teen, adult |
| `aliasKind` | common, abbreviation, historical, spoken, misnomer |
| `register` | child, curious, expert |
| `viewId` | left_lateral, right_lateral, anterior, posterior, superior, inferior |

Adding a term bumps the schema version. Data edits never do.

## 2. Value types (reused across classes)

| Type | Fields | Rules |
|---|---|---|
| `Text` | `child`, `curious`, `expert` (all optional strings) | child at most 30 words, curious at most 80, expert at most 200. No numbers in `child` except one approximate. |
| `Pronunciation` | `respelling` (e.g. "BROH-kuh"), `ipa` (optional) | Compiled into the ElevenLabs pronunciation dictionary. |
| `Alias` | `text`, `kind` (aliasKind) | `misnomer` aliases resolve but the guide corrects them. |
| `Xref` | `scheme`, `value`, `matchType`, `verified` (bool), `verifiedOn` | `exact` requires verified plus steward approval. |
| `Quantity` | `value`, `low`, `high`, `unit`, `approx` (bool), `validAsOf`, `sources` | `approx: true` makes the guide say "about". The guide picks one quantity per answer. |
| `Provenance` | `sources`, `locator`, `license`, `method`, `assertedBy`, `assertedOn`, `status`, `approvedBy`, `approvedOn`, `supersededBy`, `supersededOn`, `audience` | Required on every assertion and on every node. |

## 3. Classes

Every node has: `id`, `label`, `provenance`. Optional on every node: `aliases`, `pronunciation`, `text` (Text), `audience` (default `all`).

| Class | Required | Optional | Notes |
|---|---|---|---|
| **Region** | `id` (`region:1` to `region:20`) | `aliases`, `xrefs` | Reference only. Name, description, factoid, hex live in brainRegions.json and are joined at compile. |
| **Division** | `id`, `label` | | The 7 divisions from brainRegions.json, joined by divisionId. |
| **Structure** | `kind` (structureKind), `visibility` | `lateralization` (when the structure exists on one side, e.g. VWFA), `xrefs`, `quantities` | Anything anatomical that is not one of the 20: fusiform gyrus, hippocampus, insula, midbrain, central sulcus, lateral fissure, cranial nerves, ventricles. |
| **Function** | `plainDefinition` (our words) | `distributed` (bool), `xrefs` (cognitive_atlas) | A mental or bodily capacity: speech production, working memory, balance. |
| **Phenomenon** | `plainDefinition` | | An experience players name: phantom limb, tip-of-the-tongue, deja vu. Explained through `EXPLAINED_BY`. |
| **Network** | `atlas` | `yeoLabel`, `xrefs` | Default mode, salience, frontoparietal control, dorsal attention, ventral attention, somatomotor, visual, limbic, plus the language network (non-Yeo, `atlas: fedorenko`). |
| **Tract** | `kind` (tractKind) | `quantities` (e.g. callosal axons) | Arcuate fasciculus, corticospinal tract, corpus callosum, fornix. |
| **Circuit** | `summary` | | Papez, cortico-basal ganglia loops, cerebro-cerebellar loop, reward circuit. |
| **CellType** | `kind` (cellKind) | `quantities` | Pyramidal, Purkinje, Betz, granule, astrocyte, oligodendrocyte, microglia. |
| **Molecule** | `kind` (moleculeKind) | | Glutamate, GABA, dopamine, serotonin, acetylcholine; NMDA, AMPA, GABA-A receptors. |
| **Process** | `kind` (processKind) | | Action potential, synaptic transmission, LTP, LTD, myelination, neurogenesis. |
| **Artery** | | | ACA, MCA, PCA, basilar, vertebral. |
| **Condition** | `kind` (conditionKind) | | Parkinson's, Alzheimer's, stroke, epilepsy, concussion, aphasia. Always informational (see section 7). |
| **Myth** | `statement`, `correction` (Text) | | "Left brain logical, right brain creative." "We use 10% of our brain." First-class so the guide can recognise and correct them. |
| **Person** | `born` | `died` (null if living), `statusCheckedOn` (required when `died` is null) | Broca, Wernicke, Penfield, Milner, Sylvius, Rolando. |
| **Source** | `type` (sourceType), `citation`, `license` | `authors`, `year`, `title`, `publisher`, `edition`, `doi`, `url` | Every assertion cites at least one. |
| **Doc** | `path`, `kbId` | `registers` | A narrative KB file. Joined to its front matter. |
| **Word** | `text`, `tier` (1 to 4) | | Word-bank entry. Joined to WORD_BANK; its target and alternates are derived (rule R7). |
| **View** | `id` (viewId) | | The six standard views. Matches the `rotate_to_view` enum. |
| **Guide** | `id` (`guide:sylvi`, `guide:rollo`), `label` | | Persona anchors. The KB stays name-free; the guide record tells the agent which fissure is its namesake. |

## 4. Relations

Every relation is an assertion with full provenance. Domain and range are enforced by the validator.

| Relation | Domain → Range | Properties |
|---|---|---|
| `PART_OF` | Region → Division; Structure → Region, Structure | |
| `LIES_BENEATH` | Structure → Region | `hint` (spoken, first person) |
| `BOUNDS` | Structure (sulcus, fissure) → Region, Structure | `side` (e.g. "anterior") |
| `ADJACENT_TO` | Region ↔ Region; Structure ↔ Structure | symmetric |
| `SUPPORTED_BY` | Function → Region, Structure | `role`, `evidence`, `lateralization`, `confidence` |
| `EXPLAINED_BY` | Phenomenon → Function, Region, Structure | `confidence` |
| `MEMBER_OF` | Region, Structure → Network | `role` (networkRole), `confidence` |
| `SUBSERVES` | Network → Function | `confidence` |
| `CONNECTS` | Tract → Region, Structure | `endpoint` |
| `INCLUDES` | Circuit → Region, Structure, Tract | `order` |
| `CONTAINS_CELL` | Region, Structure → CellType | |
| `RELEASES` | CellType → Molecule | |
| `ACTS_ON` | Molecule (transmitter) → Molecule (receptor) | |
| `PRODUCED_IN` | Molecule → Structure | e.g. dopamine in substantia nigra |
| `PARTICIPATES_IN` | Structure, CellType, Molecule → Process | |
| `SUPPLIED_BY` | Region, Structure → Artery | `portion` (optional) |
| `AFFECTS` | Condition → Region, Structure, CellType | |
| `IMPAIRS` | Condition → Function | `sign` (spoken description of the effect) |
| `DESCRIBED` | Person → anything | `year` |
| `NAMED_AFTER` | Region, Structure, Phenomenon, Condition, Guide → Person | |
| `DEBUNKS` | Assertion → Myth | the approved facts that correct the myth |
| `CONTESTS` | Assertion → Assertion | for debated science (section 6) |
| `ANCHORED_ON` | Guide → Structure | Sylvi → lateral fissure; Rollo → central sulcus |
| `ABOUT` | Doc → anything | from KB front matter `about:` list |
| `EXPRESSES` | Word → Function, Phenomenon | |
| `VISIBLE_FROM` | Region → View | `fraction`; **derived** from regionGeometry.labelsPerView, never asserted |

## 5. Laterality model

- Nodes are bilateral concepts by default. There is one `structure:hippocampus`, not a left and right copy.
- Side lives on edges (`lateralization`) or on a node that truly exists on one side (`lateralization: left` on region 6, region 13, VWFA).
- Rule R4 propagates node laterality to everything `PART_OF` it.
- Lateralization is a population statement. Edges to left-dominant language carry a Quantity where the source gives one (about 95% of right-handers, about 70% of left-handers), so the guide never states laterality as absolute.

## 6. Debated science

- A debate is two or more approved assertions, each `confidence: debated`, linked by `CONTESTS`, each with its own sources.
- Rule: a `debated` assertion must have a `CONTESTS` partner or a `debateNote` with at least two sources.
- Voice rule: when a debated fact is retrieved, the guide presents both sides in one sentence each, then says the question is open.
- Imaging-only evidence gets `inferenceCaveat: reverse_inference` automatically at compile; the guide says "brain scans suggest".
- Examples to seed: adult human neurogenesis; dorsal ACC pain selectivity; the LeDoux low road; columns as a basic unit; Wernicke's area boundaries.

## 7. Audience and safety policy

- Every node and assertion has `audience` (default `all`). The agent receives only content at or below the session audience (V1 default: `all`).
- Condition nodes default to `teen`. Survival, mortality and prognosis quantities are `adult` and never appear in the `child` register.
- Every Condition carries `informationalOnly: true`. When any Condition content is retrieved, the guide adds the medical boundary line ("I can explain how it works; a doctor can speak to anyone's own situation").
- Substances: mechanism only (`Molecule` acting on receptors). No dosing, no effects framed as recommendations.
- Myths are never stated without their correction in the same turn.

## 8. Text ownership

| Text | Owned by |
|---|---|
| Region name, subtitle, description, factoid | brainRegions.json |
| Labels, aliases, pronunciation, Text registers for every other class | the graph |
| Long narrative, history, extended explanation | KB markdown (Doc) |

A test fails if the graph defines region text (`REGION_REDEFINED`) or a Doc contradicts a graph label for the same id (`NAME_DRIFT`).

## 9. ID lifecycle

- Format: `^[a-z]+:[a-z0-9]+(-[a-z0-9]+)*$`; regions are `region:1` to `region:20`.
- IDs are immutable. A rename changes `label` and adds the old name as an `historical` alias.
- A retired node keeps its record with `status: superseded` and `replacedBy`. Its ID is never reused.
- External IDs only ever appear in `xrefs`.

## 10. Provenance and governance

Assertion record (unchanged from v0.2, plus `audience`):

```yaml
id: assert:speech-production--region-6
subject: function:speech-production
predicate: SUPPORTED_BY
object: region:6
props: { role: primary, evidence: [lesion, stimulation], lateralization: left, confidence: established }
provenance:
  sources: [source:dronkers-2007, source:kandel-6e]
  locator: "Region Report s1.6; Gap Run E2"
  license: CC-BY-4.0
  method: ai_extracted
  assertedBy: extractor:claude
  assertedOn: 2026-10-02
  status: proposed
  audience: all
```

- Schema has its own semantic version; data changes go in CHANGELOG.md.
- Lifecycle: proposed → approved or rejected; approved → superseded. Nothing is deleted. Only approved compiles.
- Time-sensitive values need `validAsOf` and `reviewBy`. The news layer stays out of V1.
- Second approver (a neuroscience reviewer) required for `confidence: debated` once one is appointed.

## 11. Validation (typed errors, no auto-correct)

| Code | Rule |
|---|---|
| `SCHEMA_SHAPE` | Record fails its JSON Schema |
| `UNKNOWN_TERM` | Value not in the vocabulary |
| `UNKNOWN_ID` | Edge endpoint does not exist |
| `DUPLICATE_ID` | ID used twice |
| `BAD_DOMAIN` | Relation used between the wrong classes |
| `MISSING_PROVENANCE` | Provenance incomplete |
| `FORBIDDEN_SOURCE` | Source type outside the vocabulary (news, blog, pop-science) |
| `NO_PRIMARY` | Function has no primary edge and is not `distributed` |
| `LATERALITY_VIOLATION` | Edge to a left-only node is not left |
| `UNPOINTABLE` | Hidden or partly visible structure has no path to a region |
| `FALSE_POINTER` | not_present structure has a path to a region |
| `REGION_REDEFINED` | Graph defines a field owned by brainRegions.json |
| `NAME_DRIFT` | KB markdown or graph label conflicts with canonical name |
| `UNPAIRED_DEBATE` | Debated assertion without CONTESTS partner or debateNote |
| `MYTH_UNCORRECTED` | Myth without at least one approved DEBUNKS assertion |
| `TEXT_TOO_LONG` | Register exceeds its word limit |
| `AUDIENCE_LEAK` | Adult quantity reachable in the child register |
| `STALE_PERSON` | Living person unchecked for more than 180 days |
| `SHARE_ALIKE_LEAK` | CC BY-SA or ODbL text outside its labelled file |
| `UNSAFE_IDENTITY` | `exact` match without verification and approval |
| `ORPHAN_SUPERSEDE` | Superseded record without replacement and date |
| `DERIVATION_CONFLICT` | A derived fact contradicts an approved fact |

## 12. Reasoner (compile-time, before anything reaches the LLM)

| Rule | Derives |
|---|---|
| R1 | Transitive PART_OF (fusiform → region 14 → temporal lobe) |
| R2 | Inverses for every relation (HAS_PART, SUPPORTS, HAS_MEMBER, CONNECTED_BY) |
| R3 | `pointTo` and `hint` for every Structure, from PART_OF or LIES_BENEATH |
| R4 | Laterality inheritance down PART_OF |
| R5 | Region `involvedIn` Function via MEMBER_OF and SUBSERVES (`approximate`, never `primary`) |
| R6 | Region `connectedVia` Tract when both are CONNECTS endpoints |
| R7 | Word target (primary region) and alternates (contributing regions), checked against the level 1 division containment rule |
| R8 | `VISIBLE_FROM` per region from regionGeometry.labelsPerView |
| R9 | `inferenceCaveat` on imaging-only edges |
| R10 | Per-region myth list (myths whose DEBUNKS assertions touch the region) |

Derived facts carry `method: derived`, the rule ID and the source assertion IDs. They are never written back.

## 13. Output contract

**`src/data/brainGraph.json`**

```json
{
  "schemaVersion": "0.3.0",
  "dataVersion": "2026-10-02.1",
  "builtAt": "ISO timestamp",
  "nodes": { "structure:hippocampus": { "class": "Structure", "label": "...", "pointTo": "region:14", "hint": "..." } },
  "edges": [ { "id": "...", "type": "SUPPORTED_BY", "from": "...", "to": "...", "props": {}, "derived": false } ],
  "byRegion": { "6": { "structures": [], "functions": [], "networks": [], "tracts": [], "conditions": [], "myths": [], "people": [], "views": [] } },
  "aliases": { "broca's area": "region:6", "the little brain": "region:19", "fusiform": "structure:fusiform-gyrus" }
}
```

**Tool responses** (additive to the M1 contract; existing fields never change):

| Tool | Returns |
|---|---|
| `lookup_region` | existing fields + `structures`, `functions` (role, evidence, lateralization, confidence), `networks`, `tracts`, `myths` |
| `lookup_structure` (new) | `{ ok, structure, pointTo, hint, visibility }` |
| `lookup_function` (new) | `{ ok, function, regions: [{ id, role, evidence }], distributed }` |
| `lookup_network` (new) | `{ ok, network, members: [{ id, role }], functions }` |
| graph view (later) | `show_network`, `trace_path(from, to)`, `switch_view(massing or network)` |

## 14. Neo4j mapping (graph view, later)

- Class → node label. Relation → relationship type. Derived edges carry `derived: true`.
- Neo4j properties cannot be nested maps, so:
  - `Xref` becomes `(:ExternalConcept {scheme, value})` nodes joined by `MATCHES {matchType, verified}`.
  - `Text` flattens to `textChild`, `textCurious`, `textExpert`.
  - `Quantity` becomes `(:Quantity)` nodes joined by `HAS_QUANTITY`.
  - Provenance flattens onto the relationship (arrays of strings are allowed) and adds `CITES` edges to Source nodes so citations are visible in the graph view.
- Region nodes carry their 3D centroid so the graph view starts in the brain's shape.

## 15. Coverage gates (release)

- Every region: at least two Function edges (at least one primary, or an explicit `noPrimary` note), at least one Network, at least one Structure or an explicit `noSubstructures` note, at least one View.
- Every Function in the word bank: at least one primary region.
- Every hidden or partly visible Structure: a `hint`.
- Every class and every reasoner rule: covered by at least one competency question.
- Unverified xrefs: listed in a coverage report; zero allowed on `exact` matches.
- The compile writes `coverage.md`: counts per class, approval rate, unverified items, regions below the gate.

## 16. Attribution

The compile writes `CREDITS.md` from Source and licence data (UBERON CC BY 3.0, Yeo MIT, FreeSurfer, HCP terms, Cognitive Atlas CC BY-SA in its labelled file, Neurosynth ODbL if used). The game links to it.

## 17. Extraction protocol (how Claude proposes facts)

1. One claim per assertion. Never merge two claims into one record.
2. Every assertion carries a `locator` to the report section or KB file.
3. Region references are re-mapped to repo canon (fusiform → structure within region 14; midbrain → structure within region 20).
4. When the two reports disagree (for example, writing: premotor primary in one, contributing in the other), both are proposed and the review sheet shows a `conflict` row for the steward to decide.
5. Volatile facts (prizes, Neuralink, drug approvals) are skipped for V1.
6. Fan blogs, news briefs and Wikipedia are not cited as sources. Where a report relied on them, the fact is held back until a proper source is found.
7. Nothing is marked `approved` by the extractor.

## 18. Fixtures (written before data)

`fixtures/valid/`, one real record per class and relation: region 6; division frontal; structures fusiform gyrus, hippocampus, midbrain, central sulcus, lateral fissure; function speech production; phenomenon phantom limb; network default mode; tract arcuate fasciculus; circuit Papez; cell type Purkinje; molecule dopamine and D2 receptor; process LTP; artery MCA; condition Parkinson's disease; myth left-brain/right-brain; persons Broca, Milner, Sylvius; sources Dronkers 2007, Yeo 2011, Kandel; doc anatomy.lobes; word SPEECH; view left_lateral; guides Sylvi and Rollo; a debated pair (adult neurogenesis).

`fixtures/invalid/`: each valid fixture broken once, with its expected error code (all 22 codes covered).

## 19. Competency questions (seed set)

| Question | Expected |
|---|---|
| Which regions are primary for speech production? | {6, 5} |
| Is there a right-hemisphere Broca's area? | No |
| Where does the guide point for the hippocampus? | region 14, with hint |
| Where does the guide point for the spinal cord? | nowhere |
| Which tract connects Broca's and Wernicke's? | arcuate fasciculus |
| Which networks is the precuneus a hub of? | default mode |
| What part of region 14 recognises faces? | fusiform gyrus |
| What does region 20 contain? | midbrain, pons, medulla |
| Which cells in region 19 send its output? | Purkinje cells |
| What does Parkinson's disease affect, and what does it impair? | midbrain dopamine neurons; movement |
| Which artery supplies region 6? | MCA |
| Is "we use 10% of our brain" true? | No, with correction |
| Is adult human neurogenesis settled? | No, debated, both positions |
| Who is Sylvi named after, and where is it on me? | lateral fissure, Sylvius; regions 11 and 12 |
| Is Brenda Milner living? | yes, with check date |
| Which regions can the player see from the posterior view? | from regionGeometry |
| Which word-bank words accept region 9? | derived by R7 |

Grows to about 40 at launch; every class and rule covered.

## 20. KB alignment edits (text only)

| File | Change |
|---|---|
| `anatomy/lobes.md` | `8 Superior Parietal Lobule` → `8 Somatosensory Association Cortex`; `14 Fusiform` → `14 Inferior Temporal Cortex`; add `15 Piriform Cortex`; remove "Region 15 is unresolved" |
| `anatomy/gyri_and_sulci.md` | Fusiform row: "underside of region 14" |
| `anatomy/midbrain.md` | "region 20 is the pons and medulla" → "the midbrain is the top of region 20, the Brain Stem"; `game_regions: [20]` |
| `SOURCES_AND_CORRECTIONS.md` | Close region 15: piriform kept; midbrain is a structure within 20 |
| every KB file | add `about:` (graph ids) and `audience:` to front matter |

## 21. Execution order

1. Vocabulary
2. Value types, class and relation JSON Schemas, VERSION
3. Fixtures and competency questions; validator tests written and confirmed failing
4. Validator, then reasoner, until tests pass
5. Extraction into `proposed` assertions
6. First review sheet to the steward
7. Compile approved facts; competency questions and coverage gates pass
8. KB alignment; pronunciation dictionary and KB synced to ElevenLabs

## Remaining open items (steward calls, not schema gaps)

- Region 8 name: default "Somatosensory Association Cortex".
- Conditions in V1 and their audience levels.
