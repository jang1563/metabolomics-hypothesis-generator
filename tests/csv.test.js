import test from 'node:test';
import assert from 'node:assert/strict';
import { DatasetError, detectColumns, parseCsv, prepareDataset } from '../src/lib/csv.js';

test('quoted commas, CRLF, and p=0 are parsed without data loss', () => {
  const csv = [
    'feature_id,metabolite,log2FC,pvalue,pathway',
    'A-1,"Citrate, isotopologue",1.2,0,"TCA, core"',
    'A-2,Lactate,-0.8,0.05,Glycolysis',
  ].join('\r\n');
  const dataset = prepareDataset(parseCsv(csv));

  assert.equal(dataset.rows[0].metabolite, 'Citrate, isotopologue');
  assert.equal(dataset.rows[0].pathway, 'TCA, core');
  assert.equal(dataset.rows[0].pvalue, 0);
  assert.equal(dataset.rows[1].log2fc, -0.8);
});

test('raw fold-change columns fail closed', () => {
  const parsed = parseCsv('metabolite,fold_change,pvalue\nLactate,2.1,0.01');
  assert.throws(() => detectColumns(parsed.headers), /ambiguous.*signed log2FC/i);
});

test('duplicate headers are rejected case-insensitively', () => {
  assert.throws(
    () => parseCsv('metabolite,log2FC,Metabolite,pvalue\nLactate,1,Lactate,0.01'),
    /headers must be unique/i,
  );
});

test('multiple semantic aliases fail closed', () => {
  assert.throws(
    () => prepareDataset(parseCsv('metabolite,log2FC,logFC,pvalue\nLactate,1.2,1.2,0.01')),
    /Multiple columns match log2fc/i,
  );
});

test('missing required columns and invalid probabilities are rejected', () => {
  assert.throws(
    () => prepareDataset(parseCsv('metabolite,pvalue\nLactate,0.01')),
    /signed log2FC column is required/i,
  );
  assert.throws(
    () => prepareDataset(parseCsv('metabolite,log2FC,pvalue\nLactate,1.2,1.2')),
    /between 0 and 1/i,
  );
});

test('unclosed quotes surface a DatasetError', () => {
  assert.throws(
    () => parseCsv('metabolite,log2FC,pvalue\n"Lactate,1.2,0.01'),
    DatasetError,
  );
});

test('one contrast is preserved and mixed contrasts are rejected', () => {
  const dataset = prepareDataset(parseCsv(
    'metabolite,log2FC,pvalue,contrast\nLactate,1.2,0.01,A vs B\nCitrate,-1.1,0.02,A vs B',
  ));
  assert.equal(dataset.contrast, 'A vs B');
  assert.throws(
    () => prepareDataset(parseCsv(
      'metabolite,log2FC,pvalue,contrast\nLactate,1.2,0.01,A vs B\nCitrate,-1.1,0.02,C vs D',
    )),
    /one consistent contrast/i,
  );
});
