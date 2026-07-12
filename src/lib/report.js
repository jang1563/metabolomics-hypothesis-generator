const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

const evidenceItem = (row) => ({
  feature_id: row.id,
  metabolite: row.metabolite,
  log2fc: row.log2fc,
  qvalue: row.qvalue,
  pathway: row.pathway,
  contrast: row.contrast,
  evidence_score: row.score,
});

const sharedLimitations = [
  'Evidence scores rank the supplied rows; they are not probabilities that a hypothesis is true.',
  'The workbench does not infer causality, diagnostic performance, or literature support.',
  'Independent cohorts, targeted assays, and a preregistered analysis are required for confirmation.',
];

export function buildHypotheses(analysis) {
  if (analysis.passingRows.length === 0) return [];

  const hypotheses = [];
  const leadingPathway = analysis.pathways[0];
  if (leadingPathway) {
    const evidence = leadingPathway.rows.slice(0, 3);
    const requiredReplication = Math.max(1, Math.ceil((evidence.length * 2) / 3));
    hypotheses.push({
      id: 'pathway-coherence',
      category: 'Pathway coherence',
      title: `${leadingPathway.name} is the leading coordinated signal`,
      statement: `Features assigned to ${leadingPathway.name} form the strongest pathway-level pattern under the selected thresholds and should be prioritized for independent validation.`,
      evidence_score: leadingPathway.score,
      score_rationale: `${leadingPathway.count} passing feature${leadingPathway.count === 1 ? '' : 's'}; ${Math.round(leadingPathway.directionConsistency * 100)}% directional consistency.`,
      evidence: evidence.map(evidenceItem),
      prediction: `In an independent cohort, at least ${requiredReplication} of the ${evidence.length} listed signals should retain direction and pass the preregistered effect threshold.`,
      validation: 'Re-quantify the listed metabolites with a targeted assay, blind sample labels, and test a prespecified pathway-level contrast with multiplicity control.',
      limitations: sharedLimitations,
    });
  }

  const topIncrease = analysis.increased[0];
  const topDecrease = analysis.decreased[0];
  if (topIncrease && topDecrease) {
    hypotheses.push({
      id: 'reciprocal-axis',
      category: 'Reciprocal axis',
      title: `${topIncrease.metabolite} / ${topDecrease.metabolite} define an opposing signal axis`,
      statement: 'The highest-ranked positive and negative signals define a compact directional contrast that can be tested for replication without assigning a causal mechanism.',
      evidence_score: Math.round(mean([topIncrease.score, topDecrease.score])),
      score_rationale: 'Mean evidence score of the highest-ranked positive and negative features.',
      evidence: [topIncrease, topDecrease].map(evidenceItem),
      prediction: 'Both features should retain their observed directions in an independent cohort, and their signed contrast should differ from zero.',
      validation: 'Use targeted quantification, estimate the paired directional contrast with uncertainty intervals, and report failures to replicate either component.',
      limitations: sharedLimitations,
    });
  } else {
    const evidence = analysis.passingRows.slice(0, 2);
    hypotheses.push({
      id: 'directional-stability',
      category: 'Directional stability',
      title: 'The leading signals show a single-direction response',
      statement: 'The current thresholded set is directionally one-sided and should be tested for stability under threshold and cohort perturbations.',
      evidence_score: Math.round(mean(evidence.map((row) => row.score))),
      score_rationale: 'Mean evidence score of the strongest available features.',
      evidence: evidence.map(evidenceItem),
      prediction: 'The leading features should preserve direction across reasonable threshold choices and an independent cohort.',
      validation: 'Repeat the analysis across prespecified thresholds and validate the leading features with an orthogonal assay.',
      limitations: sharedLimitations,
    });
  }

  const panel = analysis.passingRows.slice(0, 3);
  hypotheses.push({
    id: 'compact-panel',
    category: 'Compact panel',
    title: `${panel.length}-feature panel captures the strongest input evidence`,
    statement: 'A compact panel of the highest-ranked features is a testable candidate signature, but it is not yet a validated biomarker.',
    evidence_score: Math.round(mean(panel.map((row) => row.score))),
    score_rationale: `Mean evidence score across the top ${panel.length} threshold-passing features.`,
    evidence: panel.map(evidenceItem),
    prediction: 'A model specified before evaluation should outperform an intercept-only baseline on held-out data without changing panel membership.',
    validation: 'Freeze the panel and decision rule, evaluate with nested resampling or an external cohort, and report calibration and uncertainty alongside discrimination.',
    limitations: sharedLimitations,
  });

  return hypotheses;
}

export function fingerprintRows(rows) {
  const canonical = JSON.stringify(
    rows.map(({ id, metabolite, log2fc, pvalue, qvalue, pathway, contrast }) => ({
      id,
      metabolite,
      log2fc,
      pvalue,
      qvalue,
      pathway,
      contrast,
    })),
  );
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createReport(analysis, source) {
  const sourceKind = source.kind === 'synthetic-demo' ? 'synthetic-demo' : 'local-upload';
  return {
    schema_version: '0.1.0',
    mode: 'deterministic-local',
    source: {
      name: source.name,
      kind: sourceKind,
      synthetic: sourceKind === 'synthetic-demo',
      provenance: sourceKind === 'synthetic-demo' ? source.provenance : null,
      contrast: analysis.contrast,
    },
    input_fingerprint: fingerprintRows(analysis.rows),
    significance_source: analysis.significanceSource,
    thresholds: analysis.thresholds,
    summary: analysis.summary,
    hypotheses: buildHypotheses(analysis),
    method_limits: sharedLimitations,
  };
}
