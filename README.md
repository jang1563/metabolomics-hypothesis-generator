# Metabolomics Hypothesis Workbench

[![CI](https://github.com/jang1563/metabolomics-hypothesis-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/jang1563/metabolomics-hypothesis-generator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-87f5b9.svg)](LICENSE)
[![Local only](https://img.shields.io/badge/runtime-local--only-80c9ff.svg)](docs/RELEASE_TRUST.md)

A local-first research prototype for turning differential metabolomics tables into ranked, testable validation candidates. The workbench validates the input schema, applies Benjamini–Hochberg correction when needed, computes a disclosed evidence score, and produces deterministic reports.

**No credentials, telemetry, model calls, literature lookups, or analysis-time external requests are used.** Try the [live synthetic demo](https://jang1563.github.io/metabolomics-hypothesis-generator/) or run it locally.

## Why this public version is different

The workbench deliberately separates evidence prioritization from scientific certainty:

- Evidence scores are not probabilities that a hypothesis is true.
- Candidate statements do not claim causality, diagnostic validity, or literature support.
- Sample-size, power, posterior, and interval estimates are not invented from summary tables.
- Every reported evidence item resolves to an exact input row.
- Re-running the same input and thresholds produces the same report.

## Quick start

```bash
git clone https://github.com/jang1563/metabolomics-hypothesis-generator.git
cd metabolomics-hypothesis-generator
npm ci
npm run dev
```

Open the local address printed by Vite and select **Run synthetic demo**. The fixture is hand-authored and contains no participant, specimen, or clinical data.

## Input contract

Provide a CSV file no larger than 2 MB with these fields:

| Field | Required | Accepted names | Meaning |
|---|---:|---|---|
| Metabolite | Yes | `metabolite`, `compound`, `compound_name`, `feature_name`, `analyte` | Feature label |
| Effect | Yes | `log2FC`, `log2_fold_change`, `logFC` | Signed base-2 log fold change |
| Significance | Yes | p-value or q-value/FDR aliases | Number in `[0, 1]` |
| Pathway | No | `pathway`, `pathway_name`, `class`, `category` | Optional grouping |
| Feature ID | No | `feature_id`, `row_id`, `id` | Unique row identity |
| Contrast | No | `contrast`, `comparison`, `comparison_label` | One consistent effect-direction label |

Raw `fold_change`, `fc`, or `ratio` columns fail closed because their scale and direction are ambiguous. If q-values are absent, the workbench applies Benjamini–Hochberg correction across all provided p-values. That correction is meaningful only when the upload contains the intended full testing family; a prefiltered hit list cannot recover valid multiplicity control. Prefer upstream q-values or a complete unfiltered p-value table.

## Deterministic method

For every threshold-passing row:

```text
effect_component       = clamp(abs(log2FC) / 3, 0, 1)
multiplicity_component = clamp(-log10(max(q, 1e-12)) / 6, 0, 1)
evidence_score         = round(100 × (0.55 × effect_component
                                      + 0.45 × multiplicity_component))
```

The score ranks evidence within the uploaded table. It is not calibrated across studies and must not be interpreted as a posterior probability, confidence level, or biomarker performance estimate. See [Methods and scientific boundaries](docs/METHODS.md) for the full contract.

## Outputs

The browser renders:

1. a validated dataset summary;
2. threshold-passing rows with BH-adjusted q-values;
3. pathway coherence (only for assigned groups with at least two passing features), reciprocal-axis, and compact-panel candidates;
4. explicit predictions and validation next steps; and
5. a machine-readable JSON report with an input fingerprint.

The fingerprint is a deterministic FNV-1a identifier for run comparison, not a cryptographic integrity guarantee. Release artifacts use SHA-256 separately.

## Synthetic demo provenance

[`src/data/synthetic_demo.csv`](src/data/synthetic_demo.csv) contains 16 fictional rows created solely to exercise the software. It is not derived from participants, specimens, publications, or clinical records. Exact column semantics and limitations are recorded in [`synthetic_demo_metadata.json`](src/data/synthetic_demo_metadata.json).

## Validation

```bash
npm run check
npm run audit
git diff --check
```

`npm run check` covers the CSV parser, p-value boundaries, BH correction, deterministic reports, evidence-row integrity, the exact public path allowlist, current and reachable-history hygiene, release metadata, and a production build.

## Repository map

| Path | Purpose |
|---|---|
| `src/lib/csv.js` | Fail-closed CSV parsing and schema validation |
| `src/lib/analysis.js` | BH correction, evidence scoring, and pathway summaries |
| `src/lib/report.js` | Deterministic candidate and report generation |
| `src/data/` | Explicitly synthetic demonstration fixture and metadata |
| `tests/` | Pure-function regression and integrity tests |
| `scripts/` | Public-tree/history and release gates |
| `release/public_release_manifest.json` | Machine-readable release boundary |
| `docs/RELEASE_TRUST.md` | Human-readable trust and non-claim surface |

## Intended use and limitations

This software is for exploratory prioritization, teaching, and software evaluation. It is not a medical device, diagnostic tool, pathway enrichment engine, literature-review system, or substitute for a preregistered statistical analysis. Uploaded data remain in the active browser tab, but users remain responsible for local access controls and appropriate handling of their own files.

## Citation and license

Citation metadata are available in [`CITATION.cff`](CITATION.cff). Code, documentation, and the synthetic demonstration fixture are released under the [MIT License](LICENSE).
