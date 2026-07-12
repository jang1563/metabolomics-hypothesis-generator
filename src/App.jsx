import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Beaker,
  CheckCircle2,
  ChevronRight,
  Download,
  FileCheck2,
  FlaskConical,
  Layers3,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  Upload,
} from 'lucide-react';
import syntheticCsv from './data/synthetic_demo.csv?raw';
import syntheticMetadata from './data/synthetic_demo_metadata.json';
import { analyzeDataset, DEFAULT_THRESHOLDS } from './lib/analysis.js';
import { DatasetError, parseCsv, prepareDataset } from './lib/csv.js';
import { buildHypotheses, createReport } from './lib/report.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const formatQvalue = (value) => (value < 0.001 ? value.toExponential(1) : value.toFixed(3));
const formatEffect = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)}`;

function Metric({ icon: Icon, label, value, tone, testId }) {
  return (
    <article className={`metric metric--${tone}`} data-testid={testId}>
      <span className="metric__icon"><Icon size={18} aria-hidden="true" /></span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Score({ value }) {
  return (
    <div className="score" aria-label={`Evidence score ${value} out of 100`}>
      <div className="score__label">
        <span>Evidence score</span>
        <strong>{value}</strong>
      </div>
      <div className="score__track" aria-hidden="true">
        <div className="score__fill" style={{ '--score-width': `${value}%` }} />
      </div>
      <small>Ranking heuristic, not a probability</small>
    </div>
  );
}

function HypothesisCard({ hypothesis, index }) {
  return (
    <article className="hypothesis-card" data-testid={`hypothesis-${index + 1}`}>
      <div className="hypothesis-card__heading">
        <div>
          <span className="eyebrow">{String(index + 1).padStart(2, '0')} · {hypothesis.category}</span>
          <h3>{hypothesis.title}</h3>
        </div>
        <Score value={hypothesis.evidence_score} />
      </div>

      <p className="hypothesis-card__statement">{hypothesis.statement}</p>
      <p className="score-rationale">{hypothesis.score_rationale}</p>

      <div className="evidence-list" aria-label="Evidence rows">
        {hypothesis.evidence.map((item) => (
          <div className="evidence-row" key={item.feature_id}>
            <div>
              <strong>{item.metabolite}</strong>
              <span>{item.pathway} · {item.feature_id}</span>
            </div>
            <span className={item.log2fc > 0 ? 'effect effect--up' : 'effect effect--down'}>
              {formatEffect(item.log2fc)} log2FC
            </span>
            <span className="qvalue">q {formatQvalue(item.qvalue)}</span>
          </div>
        ))}
      </div>

      <div className="hypothesis-card__actions">
        <div>
          <span className="section-label">Testable prediction</span>
          <p>{hypothesis.prediction}</p>
        </div>
        <div>
          <span className="section-label">Validation next step</span>
          <p>{hypothesis.validation}</p>
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [dataset, setDataset] = useState(null);
  const [source, setSource] = useState(null);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [error, setError] = useState('');
  const [showAllRows, setShowAllRows] = useState(false);
  const fileInput = useRef(null);
  const uploadButton = useRef(null);

  const analysis = useMemo(
    () => (dataset ? analyzeDataset(dataset, thresholds) : null),
    [dataset, thresholds],
  );
  const hypotheses = useMemo(() => (analysis ? buildHypotheses(analysis) : []), [analysis]);

  const loadCsv = (text, sourceDescriptor) => {
    try {
      const prepared = prepareDataset(parseCsv(text));
      setDataset(prepared);
      setSource(sourceDescriptor);
      setThresholds(DEFAULT_THRESHOLDS);
      setShowAllRows(false);
      setError('');
    } catch (caught) {
      setDataset(null);
      setSource(null);
      setError(caught instanceof DatasetError ? caught.message : 'The dataset could not be analyzed.');
    }
  };

  const loadSyntheticDemo = () => loadCsv(syntheticCsv, {
    name: 'synthetic_demo.csv',
    kind: 'synthetic-demo',
    provenance: syntheticMetadata.provenance,
  });

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Choose a CSV file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('CSV files must be 2 MB or smaller.');
      return;
    }
    loadCsv(await file.text(), { name: file.name, kind: 'local-upload' });
  };

  const reset = () => {
    setDataset(null);
    setSource(null);
    setThresholds(DEFAULT_THRESHOLDS);
    setShowAllRows(false);
    setError('');
    uploadButton.current?.focus();
  };

  const downloadReport = () => {
    const report = createReport(analysis, source);
    const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${source.name.replace(/\.csv$/i, '') || 'metabolomics'}-report.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const visibleRows = analysis
    ? analysis.passingRows.slice(0, showAllRows ? analysis.passingRows.length : 6)
    : [];
  const isSyntheticDemo = source?.kind === 'synthetic-demo';

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Metabolomics Hypothesis Workbench home">
          <span className="brand__mark"><Beaker size={21} aria-hidden="true" /></span>
          <span>
            <strong>Metabolomics</strong>
            <small>Hypothesis Workbench</small>
          </span>
        </a>
        <div className="privacy-badge"><LockKeyhole size={15} aria-hidden="true" /> Local-only analysis</div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero__copy">
            <span className="eyebrow"><Sparkles size={14} aria-hidden="true" /> Deterministic research prototype</span>
            <h1>Turn differential metabolomics tables into <em>testable priorities.</em></h1>
            <p className="hero__lead">
              Validate schema, control multiplicity, rank evidence, and generate cautious validation candidates—without API keys or external data transfer.
            </p>
            <div className="hero__actions">
              <button className="button button--primary" onClick={loadSyntheticDemo} data-testid="load-demo">
                <Play size={17} fill="currentColor" aria-hidden="true" /> Run synthetic demo
              </button>
              <button
                ref={uploadButton}
                className="button button--secondary"
                type="button"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={17} aria-hidden="true" /> Analyze local CSV
              </button>
              <input
                ref={fileInput}
                id="csv-upload"
                data-testid="file-input"
                className="visually-hidden"
                type="file"
                tabIndex={-1}
                accept=".csv,text/csv"
                onChange={handleFile}
              />
            </div>
            <div className="hero__notes">
              <span><ShieldCheck size={15} aria-hidden="true" /> No analysis-time network calls</span>
              <span><FileCheck2 size={15} aria-hidden="true" /> Auditable scoring</span>
              <span><TableProperties size={15} aria-hidden="true" /> Strict CSV validation</span>
            </div>
          </div>

          <aside className="method-card" aria-label="Workflow overview">
            <div className="method-card__header">
              <span>Analysis contract</span>
              <span className="status-dot">v0.1.0</span>
            </div>
            {[
              ['01', 'Validate', 'Require metabolite, signed log2FC, and p/q columns.'],
              ['02', 'Prioritize', 'Apply BH correction and a disclosed evidence score.'],
              ['03', 'Translate', 'Produce falsifiable candidates and validation steps.'],
            ].map(([number, title, text]) => (
              <div className="method-step" key={number}>
                <span>{number}</span>
                <div><strong>{title}</strong><p>{text}</p></div>
              </div>
            ))}
            <div className="method-card__limit">
              <AlertTriangle size={16} aria-hidden="true" /> Scores are priorities, not posterior probabilities.
            </div>
          </aside>
        </section>

        {error && (
          <div className="alert" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button>
          </div>
        )}

        {!analysis && (
          <section className="empty-state">
            <div className="empty-state__icon"><Activity size={28} aria-hidden="true" /></div>
            <div>
              <span className="eyebrow">Ready for a dataset</span>
              <h2>Start with the documented synthetic fixture.</h2>
              <p>The demo is the fastest way to inspect the complete workflow. Local uploads never leave this browser tab.</p>
            </div>
            <ChevronRight size={24} aria-hidden="true" />
          </section>
        )}

        {analysis && (
          <div className="workspace" data-testid="analysis-workspace">
            <section className="dataset-bar">
              <div>
                <span className="dataset-bar__icon"><TableProperties size={18} aria-hidden="true" /></span>
                <div>
                  <span className="eyebrow">Active dataset</span>
                  <strong>{source.name}</strong>
                </div>
              </div>
              <div className="dataset-bar__meta">
                {isSyntheticDemo && <span className="tag tag--synthetic">Synthetic fixture</span>}
                <span className="tag">{analysis.contrast ?? 'Contrast not supplied'}</span>
                <span className="tag">{analysis.significanceSource}</span>
                <button className="text-button" type="button" onClick={reset}>
                  <RotateCcw size={14} aria-hidden="true" /> Reset
                </button>
              </div>
            </section>

            {isSyntheticDemo && (
              <section className="synthetic-notice">
                <CheckCircle2 size={18} aria-hidden="true" />
                <p><strong>{syntheticMetadata.name}.</strong> {syntheticMetadata.provenance}. It cannot support biological or clinical claims.</p>
              </section>
            )}

            <section className="controls" aria-labelledby="threshold-heading">
              <div className="section-heading section-heading--compact">
                <div>
                  <span className="eyebrow"><SlidersHorizontal size={14} aria-hidden="true" /> Transparent thresholds</span>
                  <h2 id="threshold-heading">Evidence filter</h2>
                </div>
                <p>Changes recompute immediately from the same local rows.</p>
              </div>
              <div className="control-grid">
                <label>
                  <span>Minimum |log2FC|</span>
                  <strong>{thresholds.minAbsLog2fc.toFixed(1)}</strong>
                  <input
                    aria-label="Minimum absolute log2 fold change"
                    type="range"
                    min="0.1"
                    max="2"
                    step="0.1"
                    value={thresholds.minAbsLog2fc}
                    onChange={(event) => setThresholds((current) => ({ ...current, minAbsLog2fc: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  <span>Maximum q-value</span>
                  <strong>{thresholds.maxQvalue.toFixed(2)}</strong>
                  <select
                    aria-label="Maximum q-value"
                    value={thresholds.maxQvalue}
                    onChange={(event) => setThresholds((current) => ({ ...current, maxQvalue: Number(event.target.value) }))}
                  >
                    <option value="0.01">0.01</option>
                    <option value="0.05">0.05</option>
                    <option value="0.1">0.10</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="metrics" aria-label="Dataset summary">
              <Metric icon={Layers3} label="Input features" value={analysis.summary.total} tone="neutral" testId="summary-features" />
              <Metric icon={CheckCircle2} label="Passing filter" value={analysis.summary.passing} tone="accent" testId="summary-passing" />
              <Metric icon={ArrowUpRight} label="Increased" value={analysis.summary.increased} tone="up" testId="summary-increased" />
              <Metric icon={ArrowDownRight} label="Decreased" value={analysis.summary.decreased} tone="down" testId="summary-decreased" />
            </section>

            <section className="evidence-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Ranked input evidence</span>
                  <h2>Threshold-passing signals</h2>
                </div>
                <p>Score = 55% effect magnitude + 45% multiplicity support. It is only a ranking aid.</p>
              </div>

              {visibleRows.length > 0 ? (
                <div className="table-shell">
                  <table>
                    <thead><tr><th>Feature</th><th>Pathway</th><th>log2FC</th><th>q-value</th><th>Score</th></tr></thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.metabolite}</strong><small>{row.id}</small></td>
                          <td>{row.pathway}</td>
                          <td><span className={row.log2fc > 0 ? 'effect effect--up' : 'effect effect--down'}>{formatEffect(row.log2fc)}</span></td>
                          <td>{formatQvalue(row.qvalue)}</td>
                          <td><span className="table-score">{row.score}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {analysis.passingRows.length > 6 && (
                    <button className="table-toggle" type="button" onClick={() => setShowAllRows((current) => !current)}>
                      {showAllRows ? 'Show top 6' : `Show all ${analysis.passingRows.length}`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="no-results"><FlaskConical size={24} aria-hidden="true" /> No rows pass the selected thresholds.</div>
              )}
            </section>

            <section className="hypotheses-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Deterministic translation</span>
                  <h2>Candidate validation hypotheses</h2>
                </div>
                {hypotheses.length > 0 && (
                  <button className="button button--export" type="button" onClick={downloadReport}>
                    <Download size={16} aria-hidden="true" /> Export JSON
                  </button>
                )}
              </div>
              <div className="hypothesis-list">
                {hypotheses.map((hypothesis, index) => (
                  <HypothesisCard hypothesis={hypothesis} index={index} key={hypothesis.id} />
                ))}
              </div>
            </section>

            <section className="boundary-grid">
              <article>
                <ShieldCheck size={22} aria-hidden="true" />
                <h3>What this tool does</h3>
                <ul>
                  <li>Validates an explicit differential-data schema</li>
                  <li>Applies BH correction when only p-values are provided</li>
                  <li>Produces repeatable rankings and falsifiable next steps</li>
                </ul>
              </article>
              <article>
                <AlertTriangle size={22} aria-hidden="true" />
                <h3>What it does not do</h3>
                <ul>
                  <li>Estimate posterior probabilities or credible intervals</li>
                  <li>Search literature or verify mechanisms</li>
                  <li>Provide diagnostic decisions or validated study-specific protocols</li>
                </ul>
              </article>
            </section>
          </div>
        )}
      </main>

      <footer>
        <div><Beaker size={16} aria-hidden="true" /> Metabolomics Hypothesis Workbench</div>
        <p>Local-first research software · MIT licensed · Synthetic demo included</p>
      </footer>
    </div>
  );
}
