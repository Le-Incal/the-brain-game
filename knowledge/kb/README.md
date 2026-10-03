# Sylvi and Rollo Knowledge Base: Foundations

Status: DRAFT v0.1, 2026-10-02. Foundation layer only (anatomy, cells, physiology).
Region files (01 to 20), history, lifespan, tumors and stroke come next.

## The guides

- Two guides share this KB: **Sylvi** (named for the Sylvian, or lateral, fissure) and **Rollo**
  (named for the fissure of Rolando, the old name for the central sulcus).
- The KB stays name-free. The persona prompt supplies the name and voice at runtime.
- Neither guide ever claims to be Sylvius or Rolando, the real anatomists. Asked about the name,
  the guide faces its fissure (Sylvi: regions 11 and 12; Rollo: regions 5 and 7) and explains it.

## Contract with brain_regions.json

- `brain_regions.json` is canon for the 20 game regions. If this KB disagrees, the JSON wins.
- Every file lists `game_regions` in its front matter. The agent uses these IDs to call
  `face_region` or `highlight_region`. An empty list means the structure is not paintable
  on the model, and the agent should say so instead of rotating.
- `visible_on_model` tells the agent whether it can point at the thing:
  `surface`, `partly`, `hidden` (inside the brain), or `not_present` (outside the model,
  such as the spinal cord or peripheral nerves).

## Schema: every entry answers four questions

1. What it is
2. How it functions
3. What it's connected to
4. What it controls

## Three registers in every file

| Section | Listener | Rule |
|---|---|---|
| In one breath | Child, or anyone new | One or two sentences. Concrete. Body-referenced. No jargon. |
| The tour | Curious adult | The four questions, plain words, one memorable fact. |
| For the expert | Student, clinician, researcher | Numbers, mechanisms, named structures, open questions. |

Plus three support sections:

- **Say it:** pronunciation for the voice. Feed these into the ElevenLabs pronunciation dictionary too.
- **Common questions:** phrased the way players ask them, so retrieval matches speech.
- **Careful with:** myths, outdated figures, and corrections to popular sources. The agent never contradicts these.

## Voice rules for anything retrieved from here

- Facts are written in neutral third person. The persona prompt turns them into first person
  ("my corpus callosum") at speaking time.
- Never read numbers as a list. Pick one number per answer.
- When a number is uncertain, say "about" and give the consensus figure, not the extreme.

## Upload notes (ElevenLabs)

- One file per topic. Every file is well above the 500-byte RAG minimum.
- Upload everything in `anatomy/`, `cells/`, `physiology/`. Do NOT upload this README,
  `SOURCES_AND_CORRECTIONS.md`, or anything in `sources/`. Those are for us.
- `sources/brainfacts_reading_list.md` is the prioritized BrainFacts.org sourcing plan for the
  next batches (regions, history, lifespan, tumors, stroke).
- Total size is a few hundred KB, far under the 20 MB non-enterprise cap.

## File map

| File | Covers QBI source(s) |
|---|---|
| anatomy/central_nervous_system.md | Central nervous system |
| anatomy/lobes.md | Lobes of the brain |
| anatomy/gyri_and_sulci.md | (not on QBI; StatPearls, Radiopaedia) |
| anatomy/gyri_and_sulci_questions.md | Player Q&A on folds, children to experts |
| anatomy/spinal_cord.md | The spinal cord |
| anatomy/peripheral_nervous_system.md | Peripheral nervous system |
| anatomy/forebrain.md | The forebrain |
| anatomy/midbrain.md | The midbrain |
| anatomy/hindbrain.md | The hindbrain |
| anatomy/limbic_system.md | The limbic system |
| anatomy/corpus_callosum.md | Corpus callosum |
| anatomy/blood_brain_barrier.md | Blood-brain barrier |
| cells/neuron.md | What is a neuron? |
| cells/neuron_types.md | Types of neurons |
| cells/axon.md | Axons |
| cells/glia.md | What are glia? + Types of glia |
| cells/mitochondria.md | Mitochondria |
| physiology/how_neurons_signal.md | How do neurons work? + Action potentials and synapses |
| physiology/neurotransmitters.md | What are neurotransmitters? |
| physiology/synaptic_plasticity.md | What is synaptic plasticity? + Long-term synaptic plasticity |
| physiology/neurogenesis.md | What is neurogenesis? + Adult neurogenesis |
