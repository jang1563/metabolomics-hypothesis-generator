export const DEFAULT_THRESHOLDS = Object.freeze({
  minAbsLog2fc: 0.5,
  maxQvalue: 0.05,
});

export function benjaminiHochberg(pvalues) {
  const sorted = pvalues
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value);
  const adjusted = Array(pvalues.length).fill(1);
  let runningMinimum = 1;

  for (let position = sorted.length - 1; position >= 0; position -= 1) {
    const candidate = (sorted[position].value * sorted.length) / (position + 1);
    runningMinimum = Math.min(runningMinimum, candidate, 1);
    adjusted[sorted[position].index] = runningMinimum;
  }

  return adjusted;
}

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function evidenceScore(row) {
  const effectComponent = clamp(Math.abs(row.log2fc) / 3, 0, 1);
  const multiplicityComponent = clamp(-Math.log10(Math.max(row.qvalue, 1e-12)) / 6, 0, 1);
  return Math.round((effectComponent * 0.55 + multiplicityComponent * 0.45) * 100);
}

function summarizePathways(passingRows) {
  const grouped = new Map();
  passingRows.forEach((row) => {
    if (row.pathway === 'Unassigned') return;
    if (!grouped.has(row.pathway)) grouped.set(row.pathway, []);
    grouped.get(row.pathway).push(row);
  });

  return [...grouped.entries()]
    .filter(([, rows]) => rows.length >= 2)
    .map(([name, rows]) => {
      const up = rows.filter((row) => row.log2fc > 0).length;
      const down = rows.filter((row) => row.log2fc < 0).length;
      const directionConsistency = Math.max(up, down) / rows.length;
      const coverage = Math.min(rows.length / 3, 1);
      const score = Math.round(
        clamp(mean(rows.map((row) => row.score)) * 0.7 + directionConsistency * 20 + coverage * 10, 0, 100),
      );
      return {
        name,
        count: rows.length,
        up,
        down,
        directionConsistency,
        score,
        rows: [...rows].sort((left, right) => right.score - left.score),
      };
    })
    .sort((left, right) => right.score - left.score || right.count - left.count || left.name.localeCompare(right.name));
}

export function analyzeDataset(dataset, thresholds = DEFAULT_THRESHOLDS) {
  const corrected = dataset.rows.every((row) => row.qvalue !== null)
    ? dataset.rows.map((row) => row.qvalue)
    : benjaminiHochberg(dataset.rows.map((row) => row.pvalue));

  const scoredRows = dataset.rows.map((row, index) => {
    const normalized = { ...row, qvalue: corrected[index] };
    return { ...normalized, score: evidenceScore(normalized) };
  });

  const passingRows = scoredRows
    .filter(
      (row) => Math.abs(row.log2fc) >= thresholds.minAbsLog2fc && row.qvalue <= thresholds.maxQvalue,
    )
    .sort((left, right) => right.score - left.score || left.qvalue - right.qvalue || left.metabolite.localeCompare(right.metabolite));

  return {
    thresholds: { ...thresholds },
    significanceSource: dataset.significanceSource,
    contrast: dataset.contrast ?? null,
    rows: scoredRows,
    passingRows,
    increased: passingRows.filter((row) => row.log2fc > 0),
    decreased: passingRows.filter((row) => row.log2fc < 0),
    pathways: summarizePathways(passingRows),
    summary: {
      total: scoredRows.length,
      passing: passingRows.length,
      increased: passingRows.filter((row) => row.log2fc > 0).length,
      decreased: passingRows.filter((row) => row.log2fc < 0).length,
    },
  };
}
