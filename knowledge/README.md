# Brain Game Knowledge Base

The knowledge graph behind Sylvi and Rollo. Anatomy, functions and neural networks, every fact cited, nothing served to the guides until the steward approves it.

Spec: [`ONTOLOGY.md`](ONTOLOGY.md) (v0.4). Schema version: [`schema/VERSION`](schema/VERSION).

## Layout

| Path | What it is |
|---|---|
| `vocabulary/vocabulary.yaml` | Closed term lists. Every enumerated value in data comes from here. |
| `schema/` | Classes, relations and value types (declarative YAML) plus `VERSION`. |
| `data/*.yaml` | Our facts: nodes and assertions, each with full provenance. |
| `kb/` | Narrative markdown (three registers) for ElevenLabs depth. |
| `sources/` | The two research reports every locator points into (R1, R2). |
| `fixtures/` | Real records that must pass, and one broken record per error code. |
| `competency/questions.yaml` | Questions the graph must answer. A failing one is a regression. |
| `review/` | Steward review sheets. |
| `lib/` | Loader, validator, reasoner, queries, outputs, review. |
| `tests/` | Vitest suites (run with the rest of the repo). |

Regions, divisions and views are never defined here. They are joined from `src/data/brainRegions.json`, `src/data/regionGeometry.json` and the vocabulary. Data records may only annotate them.

## Commands

```bash
npm run kb -- validate              # typed errors, exits 1 on any
npm run kb -- preview               # proposed + approved -> knowledge/build/ (git-ignored)
npm run kb -- review:export         # knowledge/review/review-<date>.csv
npm run kb -- review:import <csv>   # write steward decisions back into data/
npm run kb -- compile               # approved only -> src/data/brainGraph.json + knowledge/dist/
npx vitest run knowledge            # schema, validation, reasoner, competency, outputs, review, originality, real data
```

`compile` also writes `knowledge/dist/pronunciations.pls` (ElevenLabs pronunciation dictionary), `CREDITS.md` and `coverage.md`.

## Steward review

1. `npm run kb -- review:export` and open the CSV in Numbers, Excel or Sheets.
2. Start with rows where **conflict** is filled: the two reports disagree. Approve one, reject the other.
3. Then rows with a **reviewNote**: the extractor or the audit flagged something (a location chosen without a source, a withdrawn claim, a pointing convention).
4. Everything else can be approved in bulk by source section (sort by `locator`).
5. Write `approve` or `reject` in **decision**; leave blank to decide later. Anything else is refused.
6. `npm run kb -- review:import <file>`, then `npm run kb -- compile`.

Approval is recorded per record (`approvedBy`, `approvedOn`). Nothing is deleted; superseded facts keep a pointer to their replacement.

## Rules the tests enforce

- 22 typed validation codes; nothing is auto-corrected.
- Every fact cites a Source; no Wikipedia, news, blogs or pop-science.
- Broca's (6) and Wernicke's (13) are left-only.
- Every hidden structure can be pointed at; anything not on the model never points.
- Debated science is held as a contested pair, never as a plain fact.
- Every myth is corrected, by a graph fact or by its own cited correction.
- No text field shares 8 or more consecutive words with the source material.
- The extractor never approves its own facts.
