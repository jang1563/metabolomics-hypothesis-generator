import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDataset, benjaminiHochberg, evidenceScore } from '../src/lib/analysis.js';

test('Benjamini-Hochberg correction matches a known vector', () => {
  const actual = benjaminiHochberg([0.01, 0.04, 0.03, 0.002]);
  assert.deepEqual(actual.map((value) => Number(value.toFixed(3))), [0.02, 0.04, 0.04, 0.008]);
});

test('threshold boundaries are inclusive and p=0 remains maximally supported', () => {
  const dataset = {
    significanceSource: 'BH-adjusted p-value',
    rows: [
      { id: 'a', metabolite: 'A', log2fc: 0.5, pvalue: 0, qvalue: null, pathway: 'Path A' },
      { id: 'b', metabolite: 'B', log2fc: -0.49, pvalue: 0.001, qvalue: null, pathway: 'Path B' },
    ],
  };
  const analysis = analyzeDataset(dataset, { minAbsLog2fc: 0.5, maxQvalue: 0.05 });

  assert.deepEqual(analysis.passingRows.map((row) => row.id), ['a']);
  assert.equal(analysis.rows[0].qvalue, 0);
  assert.ok(evidenceScore(analysis.rows[0]) > evidenceScore(analysis.rows[1]));
});

test('provided q-values are preserved instead of corrected again', () => {
  const dataset = {
    significanceSource: 'provided q-value/FDR',
    rows: [
      { id: 'a', metabolite: 'A', log2fc: 1.1, pvalue: 0.9, qvalue: 0.02, pathway: 'Path A' },
    ],
  };
  const analysis = analyzeDataset(dataset);
  assert.equal(analysis.rows[0].qvalue, 0.02);
  assert.equal(analysis.summary.passing, 1);
});
