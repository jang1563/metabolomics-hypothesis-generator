import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { analyzeDataset } from '../src/lib/analysis.js';
import { parseCsv, prepareDataset } from '../src/lib/csv.js';
import { buildHypotheses, createReport, fingerprintRows } from '../src/lib/report.js';

const syntheticCsv = readFileSync(new URL('../src/data/synthetic_demo.csv', import.meta.url), 'utf8');
const dataset = prepareDataset(parseCsv(syntheticCsv));
const analysis = analyzeDataset(dataset);

test('synthetic demo produces three deterministic hypotheses', () => {
  const first = buildHypotheses(analysis);
  const second = buildHypotheses(analysis);
  assert.equal(first.length, 3);
  assert.deepEqual(first, second);
});

test('every evidence reference resolves exactly to an analyzed input row', () => {
  const sourceById = new Map(analysis.rows.map((row) => [row.id, row]));
  for (const hypothesis of buildHypotheses(analysis)) {
    for (const evidence of hypothesis.evidence) {
      const source = sourceById.get(evidence.feature_id);
      assert.ok(source, `Missing source row ${evidence.feature_id}`);
      assert.equal(evidence.metabolite, source.metabolite);
      assert.equal(evidence.log2fc, source.log2fc);
      assert.equal(evidence.qvalue, source.qvalue);
    }
  }
});

test('report identity and output are stable for the same input', () => {
  const source = {
    name: 'synthetic_demo.csv',
    kind: 'synthetic-demo',
    provenance: 'Hand-authored fictional values',
  };
  const report = createReport(analysis, source);
  assert.equal(report.mode, 'deterministic-local');
  assert.equal(report.input_fingerprint, fingerprintRows(analysis.rows));
  assert.equal(report.source.synthetic, true);
  assert.equal(report.source.contrast, 'Simulated condition vs control');
  assert.deepEqual(report, createReport(analysis, source));
  assert.ok(report.method_limits.every((limit) => !/posterior|credible interval/i.test(limit)));
  assert.equal(
    createHash('sha256').update(JSON.stringify(report)).digest('hex'),
    'c3cc15941ba47e07c4fbde07c6fbaef735f8798547463107891a5d555a491367',
  );
});

test('a user upload cannot claim synthetic provenance by filename', () => {
  const report = createReport(analysis, {
    name: 'synthetic_demo.csv',
    kind: 'local-upload',
    provenance: 'Untrusted provenance text',
  });
  assert.equal(report.source.kind, 'local-upload');
  assert.equal(report.source.synthetic, false);
  assert.equal(report.source.provenance, null);
});

test('machine evidence preserves full normalized numeric precision', () => {
  const preciseDataset = {
    significanceSource: 'provided q-value/FDR',
    contrast: 'A vs B',
    rows: [
      { id: 'a', metabolite: 'A', log2fc: 1.23456789, pvalue: null, qvalue: 0.0123456789, pathway: 'Path A', contrast: 'A vs B' },
      { id: 'b', metabolite: 'B', log2fc: -0.87654321, pvalue: null, qvalue: 0.0234567891, pathway: 'Path A', contrast: 'A vs B' },
    ],
  };
  const evidence = buildHypotheses(analyzeDataset(preciseDataset))
    .flatMap((hypothesis) => hypothesis.evidence)
    .find((item) => item.feature_id === 'a');
  assert.equal(evidence.log2fc, 1.23456789);
  assert.equal(evidence.qvalue, 0.0123456789);
});

test('pathway coherence requires at least two assigned passing features', () => {
  for (const pathway of ['Unassigned', 'Singleton pathway']) {
    const singleDataset = {
      significanceSource: 'provided q-value/FDR',
      rows: [
        { id: pathway, metabolite: 'A', log2fc: 1.2, pvalue: null, qvalue: 0.01, pathway, contrast: null },
      ],
    };
    const hypotheses = buildHypotheses(analyzeDataset(singleDataset));
    assert.equal(hypotheses.some((item) => item.id === 'pathway-coherence'), false);
  }
});

test('reciprocal template describes evidence ranking rather than effect magnitude', () => {
  const reciprocal = buildHypotheses(analysis).find((item) => item.id === 'reciprocal-axis');
  assert.match(reciprocal.statement, /highest-ranked positive and negative signals/i);
  assert.doesNotMatch(reciprocal.statement, /strongest.*effects/i);
});
