# Methods and scientific boundaries

## Scope

Metabolomics Hypothesis Workbench converts an already-computed differential table into deterministic evidence rankings and cautious validation candidates. It does not process raw spectra, normalize intensities, impute missing values, fit differential models, annotate unknown peaks, perform enrichment, retrieve literature, or estimate causal effects.

## Input validation

The parser supports RFC-style quoted commas, doubled quotes, CRLF or LF line endings, and blank trailing rows. It fails closed on:

- blank or duplicate headers;
- unclosed quoted fields;
- missing metabolite, signed log2FC, or significance columns;
- duplicate feature identifiers;
- missing or non-finite effects;
- p/q-values outside `[0, 1]`; and
- ambiguous raw fold-change columns.

The effect column must be a signed base-2 log fold change. This prevents a ratio such as `0.5` from being treated as a negative effect or a raw fold change such as `2` from being treated as a two-bit change.

## Multiplicity adjustment

If a q-value/FDR column is supplied, it is used as provided and validated. Otherwise, the Benjamini–Hochberg step-up procedure is applied across all p-values in the uploaded table. This is valid only when the table represents the intended testing family; applying it to a prefiltered hit list does not restore multiplicity control. Upstream q-values or a complete unfiltered p-value table are preferred. Zero is preserved as a valid p-value and capped only inside the logarithm used for ranking.

## Evidence score

The default inclusion thresholds are `|log2FC| ≥ 0.5` and `q ≤ 0.05`. For each included feature:

```text
effect_component       = clamp(|log2FC| / 3, 0, 1)
multiplicity_component = clamp(-log10(max(q, 1e-12)) / 6, 0, 1)
score                   = round(100 × (0.55 × effect_component
                                       + 0.45 × multiplicity_component))
```

The fixed divisors keep the display bounded; they are not fitted calibration parameters. The score is an ordinal prioritization heuristic for the current input table. It is not a posterior probability, false-discovery estimate, confidence interval, effect certainty, or cross-study benchmark.

Pathway candidates use an equally fixed aggregation:

```text
direction_consistency = max(number_up, number_down) / number_in_pathway
coverage              = min(number_in_pathway / 3, 1)
pathway_score          = round(clamp(0.70 × mean(feature_scores)
                                     + 20 × direction_consistency
                                     + 10 × coverage, 0, 100))
```

Reciprocal-axis and compact-panel scores are the arithmetic mean of their displayed feature scores. These aggregate scores inherit the same non-probabilistic interpretation.

## Candidate templates

The application emits up to three deterministic templates when at least one row passes:

1. **Pathway coherence** selects the pathway with the strongest combination of row evidence, pathway coverage, and directional consistency. `Unassigned` groups and pathways with fewer than two passing features are excluded.
2. **Reciprocal axis** pairs the highest-ranked positive and negative signals. If one direction is absent, a directional-stability template is used instead.
3. **Compact panel** freezes the three highest-ranked passing features as a candidate multivariate signature.

These templates generate falsifiable predictions and generic validation steps without assigning an unobserved mechanism. Each evidence object records the exact feature ID, label, effect, q-value, pathway, and score from the analyzed table.

## Local-only execution

The analysis source performs no outbound request. CSV parsing, correction, scoring, rendering, and JSON export occur in memory in the active tab. The release gate rejects common browser network-call primitives anywhere under `src/`.

Static hosting still involves downloading the application assets from the host. After load, analysis does not transmit the uploaded table. There is no telemetry or persistent local storage.

## Synthetic fixture

The bundled demo is a hand-authored software fixture. Its values were chosen to exercise positive, negative, passing, and non-passing rows across several illustrative pathway labels. It must not be used as empirical evidence or compared with a biological study.

## Verification boundary

The automated suite verifies deterministic software behavior and metadata integrity. It does not establish biological validity, generalization, calibration, analytical assay performance, or suitability for clinical decision-making.
