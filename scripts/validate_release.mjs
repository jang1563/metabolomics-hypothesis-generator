import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { analyzeDataset } from '../src/lib/analysis.js';
import { parseCsv, prepareDataset } from '../src/lib/csv.js';
import { buildHypotheses, createReport } from '../src/lib/report.js';

const readText = (path) => readFileSync(path, 'utf8');
const packageMetadata = JSON.parse(readText('package.json'));
const manifest = JSON.parse(readText('release/public_release_manifest.json'));
const datasetMetadata = JSON.parse(readText('src/data/synthetic_demo_metadata.json'));
const csv = readText('src/data/synthetic_demo.csv');
const sha256 = createHash('sha256').update(csv).digest('hex');

if (packageMetadata.version !== manifest.version || datasetMetadata.version !== manifest.version) {
  throw new Error('Package, release manifest, and synthetic dataset versions must match.');
}
if (manifest.release_ref !== `v${manifest.version}`) throw new Error('Release ref must match the version.');
if (!datasetMetadata.synthetic) throw new Error('The demo dataset must be explicitly synthetic.');
if (!datasetMetadata.provenance.toLowerCase().includes('not derived from')) {
  throw new Error('Synthetic provenance must explicitly exclude external sources.');
}
if (manifest.network_mode !== 'local-only') throw new Error('Release must remain local-only.');
if (sha256 !== manifest.artifacts.synthetic_demo.sha256) throw new Error('Synthetic dataset SHA256 mismatch.');

const dataset = prepareDataset(parseCsv(csv));
const analysis = analyzeDataset(dataset);
const hypotheses = buildHypotheses(analysis);
const report = createReport(analysis, {
  name: 'synthetic_demo.csv',
  kind: 'synthetic-demo',
  provenance: datasetMetadata.provenance,
});

if (dataset.rows.length !== manifest.artifacts.synthetic_demo.rows) throw new Error('Synthetic row count mismatch.');
if (hypotheses.length !== 3) throw new Error('Synthetic demo must produce exactly three hypotheses.');
if (report.mode !== 'deterministic-local') throw new Error('Report mode mismatch.');
if (!report.source.synthetic || report.source.contrast !== datasetMetadata.contrast) {
  throw new Error('Synthetic source identity or contrast mismatch.');
}
if (!readText('README.md').includes('Evidence scores are not probabilities')) {
  throw new Error('README must preserve the scientific claim boundary.');
}

console.log(`RELEASE_VALIDATION_OK version=${manifest.version} paths=${manifest.paths.length} rows=${dataset.rows.length} hypotheses=${hypotheses.length}`);
