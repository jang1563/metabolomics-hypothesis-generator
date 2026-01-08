import React, { useState, useCallback } from 'react';
import { Upload, FileText, Beaker, Brain, FlaskConical, BarChart3, Settings, Loader2, AlertCircle, CheckCircle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

// ============ CONFIGURATION ============
const DEFAULT_CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 2000,  // Reduced to avoid rate limits and truncation
  temperature: 0.7,
};

// ============ SYSTEM PROMPTS ============
const SYSTEM_PROMPTS = {
  hypothesis: `You are an expert in systems biology, metabolomics, and biomedical research.
You analyze differential metabolomics data and generate scientific hypotheses.

CRITICAL REQUIREMENTS:
1. Each hypothesis must be SPECIFIC and TESTABLE
2. Evidence must cite EXACT metabolite names and fold-change values from the provided data
3. Mechanisms must connect to known biochemistry with specific pathway names
4. Confidence levels must be justified with explicit Bayesian reasoning
5. Predictions must be experimentally verifiable

For each hypothesis, assess:
- Prior probability (based on existing literature)
- Likelihood (how well the data supports this hypothesis)
- Posterior probability (updated belief after seeing data)

OUTPUT FORMAT: JSON array with structured hypothesis objects.`,

  experimental: `You are an expert in experimental design for metabolomics and biomedical research.
Given a hypothesis, design a rigorous experimental validation protocol.

Include:
1. Primary experiment with controls
2. Sample size calculations with power analysis
3. Expected outcomes and decision criteria
4. Timeline and resource estimates
5. Potential pitfalls and mitigation strategies
6. Alternative approaches if primary experiment fails

OUTPUT FORMAT: Structured experimental protocol in JSON.`,

  literature: `You are a scientific literature expert specializing in metabolomics and systems biology.
Analyze the provided metabolites and findings in the context of published research.

Provide:
1. Relevant PubMed references (cite specific PMIDs if known)
2. Key findings from related studies
3. How current data aligns or conflicts with literature
4. Knowledge gaps that this data could address
5. Suggested follow-up literature searches

OUTPUT FORMAT: Structured literature analysis in JSON.`
};

// ============ HYPOTHESIS TYPES ============
const HYPOTHESIS_TYPES = [
  { id: 'mechanisms', label: 'Biological Mechanisms', icon: '🧬', 
    prompt: 'Generate hypotheses about the biological mechanisms underlying these metabolic changes.' },
  { id: 'disease', label: 'Disease Association', icon: '🏥',
    prompt: 'Generate hypotheses about disease associations and clinical implications of these metabolic patterns.' },
  { id: 'biomarkers', label: 'Biomarker Discovery', icon: '🎯',
    prompt: 'Identify potential biomarker panels from these metabolic changes.' },
  { id: 'therapeutics', label: 'Therapeutic Targets', icon: '💊',
    prompt: 'Propose therapeutic interventions based on these metabolic findings.' },
  { id: 'pathways', label: 'Pathway Analysis', icon: '🔄',
    prompt: 'Analyze pathway-level changes and their biological significance.' },
  { id: 'custom', label: 'Custom Query', icon: '✨',
    prompt: '' }
];

// ============ UTILITY FUNCTIONS ============
const parseCSV = (text) => {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const data = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, i) => {
      row[h] = isNaN(values[i]) ? values[i] : parseFloat(values[i]);
    });
    return row;
  });
  return { headers, data };
};

const detectColumns = (headers) => {
  const patterns = {
    metabolite: /^(metabolite|compound|name|id|feature)/i,
    foldChange: /^(fc|fold.?change|log2fc|logfc|ratio)/i,
    pValue: /^(p.?val|pvalue|p$|fdr|q.?val|adj)/i,
    pathway: /^(pathway|kegg|hmdb|class|category|super)/i
  };
  
  const detected = {};
  headers.forEach(h => {
    Object.entries(patterns).forEach(([key, pattern]) => {
      if (pattern.test(h) && !detected[key]) {
        detected[key] = h;
      }
    });
  });
  return detected;
};

// Robust JSON parser that handles truncated/malformed responses
const parseJSONSafely = (text, isArray = true) => {
  if (!text) return null;

  // First try direct parse
  try {
    const match = isArray ? text.match(/\[[\s\S]*\]/) : text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (e) {
    // Continue to repair attempts
  }

  // Try to repair truncated JSON
  let jsonStr = isArray ? text.match(/\[[\s\S]*/)?.[0] : text.match(/\{[\s\S]*/)?.[0];
  if (!jsonStr) return null;

  // Remove trailing incomplete content more aggressively
  // Remove incomplete string values
  jsonStr = jsonStr.replace(/,\s*"[^"]*$/, '');
  // Remove incomplete key-value pairs
  jsonStr = jsonStr.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
  jsonStr = jsonStr.replace(/,\s*"[^"]*":\s*\[[^\]]*$/, '');
  jsonStr = jsonStr.replace(/,\s*"[^"]*":\s*$/, '');
  // Remove trailing commas
  jsonStr = jsonStr.replace(/,\s*$/, '');
  // Remove incomplete nested objects at the end
  jsonStr = jsonStr.replace(/,\s*\{[^}]*$/, '');

  // Count brackets and braces (accounting for those inside strings)
  let inString = false;
  let escape = false;
  let brackets = 0;
  let braces = 0;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '[') brackets++;
      else if (char === ']') brackets--;
      else if (char === '{') braces++;
      else if (char === '}') braces--;
    }
  }

  // Close any open structures
  for (let i = 0; i < braces; i++) {
    jsonStr += '}';
  }
  for (let i = 0; i < brackets; i++) {
    jsonStr += ']';
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Try removing the last incomplete object from array
    if (isArray) {
      try {
        // Find the last complete object by finding last "},"
        const lastCompleteIdx = jsonStr.lastIndexOf('},');
        if (lastCompleteIdx > 0) {
          const truncated = jsonStr.substring(0, lastCompleteIdx + 1) + ']';
          return JSON.parse(truncated);
        }
      } catch (e2) {
        // Continue to next attempt
      }
    }

    // Final attempt: extract individual complete objects
    try {
      if (isArray) {
        const objects = [];
        // Match complete top-level objects more carefully
        let depth = 0;
        let start = -1;

        for (let i = 0; i < jsonStr.length; i++) {
          const char = jsonStr[i];
          if (char === '{' && depth === 0) {
            start = i;
          }
          if (char === '{') depth++;
          if (char === '}') depth--;
          if (char === '}' && depth === 0 && start !== -1) {
            try {
              const objStr = jsonStr.substring(start, i + 1);
              objects.push(JSON.parse(objStr));
            } catch (e3) {
              // Skip malformed object
            }
            start = -1;
          }
        }
        if (objects.length > 0) return objects;
      }
    } catch (e2) {
      // Give up
    }
    return null;
  }
};

const summarizeData = (data, columns) => {
  if (!data || data.length === 0) return null;
  
  const fcCol = columns.foldChange;
  const pCol = columns.pValue;
  const nameCol = columns.metabolite;
  
  const significant = data.filter(row => {
    const fc = Math.abs(row[fcCol] || 0);
    const p = row[pCol] || 1;
    return fc > 0.5 && p < 0.05;
  });
  
  const increased = significant.filter(row => row[fcCol] > 0);
  const decreased = significant.filter(row => row[fcCol] < 0);
  
  const topIncreased = [...increased].sort((a, b) => b[fcCol] - a[fcCol]).slice(0, 10);
  const topDecreased = [...decreased].sort((a, b) => a[fcCol] - b[fcCol]).slice(0, 10);
  
  return {
    total: data.length,
    significant: significant.length,
    increased: increased.length,
    decreased: decreased.length,
    topIncreased,
    topDecreased,
    columns
  };
};

// ============ MAIN COMPONENT ============
export default function MetabolomicsHypothesisGenerator() {
  // State
  const [apiKey, setApiKey] = useState('');
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState({});
  const [summary, setSummary] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [hypotheses, setHypotheses] = useState(null);
  const [experimentalDesign, setExperimentalDesign] = useState(null);
  const [literatureAnalysis, setLiteratureAnalysis] = useState(null);
  const [loading, setLoading] = useState({ hypotheses: false, experimental: false, literature: false });
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [expandedHypothesis, setExpandedHypothesis] = useState(null);

  // File Upload Handler
  const processFile = useCallback((file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const { headers, data: parsedData } = parseCSV(text);
        const detectedColumns = detectColumns(headers);

        setData(parsedData);
        setColumns(detectedColumns);
        setSummary(summarizeData(parsedData, detectedColumns));
        setError(null);
        setActiveTab('analyze');
      } catch (err) {
        setError(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    processFile(file);
  }, [processFile]);

  // Drag & Drop handlers
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.csv')) {
        processFile(file);
      } else {
        setError('Please upload a CSV file');
      }
    }
  }, [processFile]);

  // Build context from data
  const buildContext = useCallback(() => {
    if (!data || !summary) return '';
    
    const { metabolite: nameCol, foldChange: fcCol, pValue: pCol, pathway: pathCol } = columns;
    
    let context = `DIFFERENTIAL METABOLOMICS DATA SUMMARY
=====================================
Total metabolites: ${summary.total}
Significant changes (|FC| > 0.5, p < 0.05): ${summary.significant}
- Increased: ${summary.increased}
- Decreased: ${summary.decreased}

TOP INCREASED METABOLITES:
${summary.topIncreased.map(row => 
  `- ${row[nameCol]}: FC=${row[fcCol]?.toFixed(2)}, p=${row[pCol]?.toExponential(2)}${pathCol ? `, Pathway: ${row[pathCol]}` : ''}`
).join('\n')}

TOP DECREASED METABOLITES:
${summary.topDecreased.map(row => 
  `- ${row[nameCol]}: FC=${row[fcCol]?.toFixed(2)}, p=${row[pCol]?.toExponential(2)}${pathCol ? `, Pathway: ${row[pathCol]}` : ''}`
).join('\n')}

FULL SIGNIFICANT METABOLITES DATA:
${data.filter(row => Math.abs(row[fcCol] || 0) > 0.5 && (row[pCol] || 1) < 0.05)
  .slice(0, 50)
  .map(row => `${row[nameCol]}: FC=${row[fcCol]?.toFixed(3)}, p=${row[pCol]?.toExponential(2)}`)
  .join('\n')}
`;
    return context;
  }, [data, summary, columns]);

  // Claude API Call
  const callClaudeAPI = async (systemPrompt, userPrompt) => {
    if (!apiKey) {
      throw new Error('Please enter your Anthropic API key');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const responseData = await response.json();
    return responseData.content[0].text;
  };

  // Generate Hypotheses
  const generateHypotheses = async () => {
    if (!selectedType) return;
    
    setLoading(prev => ({ ...prev, hypotheses: true }));
    setError(null);
    setHypotheses(null);

    const typeConfig = HYPOTHESIS_TYPES.find(t => t.id === selectedType);
    const taskPrompt = selectedType === 'custom' ? customPrompt : typeConfig.prompt;

    try {
      const context = buildContext();
      const userPrompt = `${context}

TASK: ${taskPrompt}

Generate exactly 3 ranked hypotheses. For each hypothesis, provide:
1. rank (1-3)
2. title (brief)
3. hypothesis (full statement)
4. evidence (array of supporting data points with exact values)
5. mechanism (proposed biological mechanism with pathway names)
6. bayesian_analysis:
   - prior_probability (0-1, based on literature)
   - prior_rationale (why this prior)
   - likelihood (0-1, how well data supports)
   - likelihood_rationale (why this likelihood)
   - posterior_probability (0-1, updated belief)
   - confidence_interval ([lower, upper] 95% CI)
7. predictions (array of testable predictions)
8. literature_support (relevant studies/PMIDs)
9. alternative_explanations (what else could explain this)

Return ONLY valid JSON array, no other text.`;

      const response = await callClaudeAPI(SYSTEM_PROMPTS.hypothesis, userPrompt);

      // Parse JSON from response using robust parser
      const parsed = parseJSONSafely(response, true);
      if (parsed && parsed.length > 0) {
        setHypotheses(parsed);
        setActiveTab('results');
      } else {
        throw new Error('Could not parse hypotheses from response. Try reducing Max Tokens in Settings.');
      }
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(prev => ({ ...prev, hypotheses: false }));
  };

  // Generate Experimental Design
  const generateExperimentalDesign = async (hypothesis) => {
    setLoading(prev => ({ ...prev, experimental: true }));
    setError(null);

    try {
      const userPrompt = `HYPOTHESIS TO VALIDATE:
Title: ${hypothesis.title}
Statement: ${hypothesis.hypothesis}
Proposed Mechanism: ${hypothesis.mechanism}
Key Predictions: ${hypothesis.predictions?.join('; ')}

Design a comprehensive experimental validation protocol including:
1. primary_experiment:
   - objective
   - methodology (detailed steps)
   - controls (positive, negative, vehicle)
   - sample_groups (with n per group)
   - measurements (what to measure, how)
   - statistical_analysis (tests to use)
   
2. power_analysis:
   - effect_size_expected
   - alpha
   - power
   - sample_size_calculation
   
3. expected_outcomes:
   - if_hypothesis_true (specific predictions)
   - if_hypothesis_false (what would you see)
   - decision_criteria (how to conclude)
   
4. timeline:
   - phases (array with duration and activities)
   - total_duration
   
5. resources:
   - equipment
   - reagents
   - estimated_cost
   
6. potential_pitfalls:
   - risks (array of potential issues)
   - mitigations (how to address each)
   
7. alternative_approaches:
   - backup_experiments (if primary fails)

Return ONLY valid JSON object, no other text.`;

      const response = await callClaudeAPI(SYSTEM_PROMPTS.experimental, userPrompt);

      const parsed = parseJSONSafely(response, false);
      if (parsed) {
        setExperimentalDesign({ hypothesis: hypothesis.title, ...parsed });
      } else {
        throw new Error('Could not parse experimental design. Try reducing Max Tokens in Settings.');
      }
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(prev => ({ ...prev, experimental: false }));
  };

  // Generate Literature Analysis
  const generateLiteratureAnalysis = async () => {
    setLoading(prev => ({ ...prev, literature: true }));
    setError(null);

    try {
      const context = buildContext();
      const userPrompt = `${context}

Provide a comprehensive literature analysis:

1. key_metabolites_literature:
   - For each top changed metabolite, provide:
     - metabolite_name
     - known_functions
     - disease_associations
     - relevant_pmids (if known)
     
2. pathway_context:
   - affected_pathways
   - pathway_interactions
   - upstream_regulators
   - downstream_effects
   
3. similar_studies:
   - study_descriptions (array of relevant studies)
   - how_current_data_compares
   
4. knowledge_gaps:
   - what_is_unknown
   - how_this_data_helps
   
5. suggested_searches:
   - pubmed_queries (array of search strings)
   - databases_to_check

Return ONLY valid JSON object, no other text.`;

      const response = await callClaudeAPI(SYSTEM_PROMPTS.literature, userPrompt);

      const parsed = parseJSONSafely(response, false);
      if (parsed) {
        setLiteratureAnalysis(parsed);
      } else {
        throw new Error('Could not parse literature analysis. Try reducing Max Tokens in Settings.');
      }
    } catch (err) {
      setError(err.message);
    }
    
    setLoading(prev => ({ ...prev, literature: false }));
  };

  // ============ RENDER COMPONENTS ============
  
  const ConfidenceBadge = ({ probability, ci }) => {
    const level = probability >= 0.7 ? 'High' : probability >= 0.4 ? 'Medium' : 'Low';
    const colors = {
      High: 'bg-green-100 text-green-800 border-green-300',
      Medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      Low: 'bg-red-100 text-red-800 border-red-300'
    };
    return (
      <div className="flex items-center gap-2">
        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${colors[level]}`}>
          {level} ({(probability * 100).toFixed(0)}%)
        </span>
        {ci && (
          <span className="text-xs text-slate-500">
            95% CI: [{(ci[0] * 100).toFixed(0)}%, {(ci[1] * 100).toFixed(0)}%]
          </span>
        )}
      </div>
    );
  };

  const BayesianVisualization = ({ analysis }) => {
    if (!analysis) return null;
    
    const { prior_probability, likelihood, posterior_probability } = analysis;
    
    return (
      <div className="bg-slate-50 rounded-lg p-4 mt-4">
        <h5 className="font-semibold text-slate-700 mb-3">Bayesian Analysis</h5>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">Prior P(H)</div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full" 
                style={{ width: `${prior_probability * 100}%` }}
              />
            </div>
            <div className="text-sm font-medium mt-1">{(prior_probability * 100).toFixed(0)}%</div>
            <div className="text-xs text-slate-400 mt-1">{analysis.prior_rationale}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Likelihood P(D|H)</div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-500 rounded-full" 
                style={{ width: `${likelihood * 100}%` }}
              />
            </div>
            <div className="text-sm font-medium mt-1">{(likelihood * 100).toFixed(0)}%</div>
            <div className="text-xs text-slate-400 mt-1">{analysis.likelihood_rationale}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Posterior P(H|D)</div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 rounded-full" 
                style={{ width: `${posterior_probability * 100}%` }}
              />
            </div>
            <div className="text-sm font-medium mt-1">{(posterior_probability * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>
    );
  };

  // ============ MAIN RENDER ============
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Beaker className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold text-white">Metabolomics Hypothesis Generator</h1>
              <p className="text-sm text-slate-400">AI-powered scientific reasoning with Bayesian uncertainty</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="password"
              placeholder="Anthropic API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm w-64"
            />
            <button
              onClick={() => setActiveTab('settings')}
              className="p-2 text-slate-400 hover:text-white transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-slate-800/30 border-b border-slate-700">
        <div className="max-w-7xl mx-auto flex">
          {[
            { id: 'upload', label: 'Upload Data', icon: Upload },
            { id: 'analyze', label: 'Analyze', icon: BarChart3 },
            { id: 'generate', label: 'Generate', icon: Brain },
            { id: 'results', label: 'Results', icon: FileText },
            { id: 'experimental', label: 'Experimental Design', icon: FlaskConical },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-600 rounded-lg flex items-center gap-3 text-red-200">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-800 rounded-xl p-8 border border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4">Upload Metabolomics Data</h2>
              <p className="text-slate-400 mb-6">
                Upload a CSV file with differential metabolomics results. The file should contain columns for:
                metabolite names, fold changes, and p-values.
              </p>
              
              <label className="block">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 hover:border-blue-500'
                  }`}
                >
                  <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-blue-400' : 'text-slate-500'}`} />
                  <p className="text-slate-300 mb-2">
                    {isDragging ? 'Drop your CSV file here' : 'Drag & drop your CSV file here or click to browse'}
                  </p>
                  <p className="text-sm text-slate-500">Supports .csv files</p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </label>

              <div className="mt-6 p-4 bg-slate-700/50 rounded-lg">
                <h3 className="font-medium text-white mb-2">Expected Format:</h3>
                <pre className="text-xs text-slate-400 overflow-x-auto">
{`metabolite,log2FC,pvalue,pathway
Glucose,-1.5,0.001,Carbohydrate metabolism
Lactate,2.3,0.0001,Energy metabolism
Glutamine,-0.8,0.05,Amino acid metabolism`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Analyze Tab */}
        {activeTab === 'analyze' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Data Summary */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-lg font-bold text-white mb-4">Data Summary</h2>
              {summary ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <div className="text-3xl font-bold text-white">{summary.total}</div>
                      <div className="text-sm text-slate-400">Total Metabolites</div>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <div className="text-3xl font-bold text-blue-400">{summary.significant}</div>
                      <div className="text-sm text-slate-400">Significant Changes</div>
                    </div>
                    <div className="bg-green-900/30 rounded-lg p-4">
                      <div className="text-3xl font-bold text-green-400">{summary.increased}</div>
                      <div className="text-sm text-slate-400">Increased</div>
                    </div>
                    <div className="bg-red-900/30 rounded-lg p-4">
                      <div className="text-3xl font-bold text-red-400">{summary.decreased}</div>
                      <div className="text-sm text-slate-400">Decreased</div>
                    </div>
                  </div>

                  <div className="border-t border-slate-700 pt-4">
                    <h3 className="font-medium text-white mb-2">Detected Columns:</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(columns).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-slate-400">{key}:</span>
                          <span className="text-white">{value || 'Not detected'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400">Upload data to see summary</p>
              )}
            </div>

            {/* Top Changes */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-lg font-bold text-white mb-4">Top Changes</h2>
              {summary ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-green-400 mb-2">↑ Top Increased</h3>
                    <div className="space-y-1">
                      {summary.topIncreased.slice(0, 5).map((row, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-slate-300">{row[columns.metabolite]}</span>
                          <span className="text-green-400">+{row[columns.foldChange]?.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-red-400 mb-2">↓ Top Decreased</h3>
                    <div className="space-y-1">
                      {summary.topDecreased.slice(0, 5).map((row, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-slate-300">{row[columns.metabolite]}</span>
                          <span className="text-red-400">{row[columns.foldChange]?.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400">Upload data to see top changes</p>
              )}
            </div>

            {/* Literature Analysis Button */}
            <div className="lg:col-span-2">
              <button
                onClick={generateLiteratureAnalysis}
                disabled={!data || !apiKey || loading.literature}
                className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading.literature ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing Literature...</>
                ) : (
                  <><FileText className="w-5 h-5" /> Generate Literature Analysis</>
                )}
              </button>

              {literatureAnalysis && (
                <div className="mt-4 bg-slate-800 rounded-xl p-6 border border-slate-700">
                  <h3 className="font-bold text-white mb-4">Literature Analysis</h3>
                  <pre className="text-xs text-slate-300 overflow-auto max-h-64">
                    {JSON.stringify(literatureAnalysis, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generate Tab */}
        {activeTab === 'generate' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
              <h2 className="text-lg font-bold text-white mb-4">Select Hypothesis Type</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {HYPOTHESIS_TYPES.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      selectedType === type.id
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                    }`}
                  >
                    <div className="text-2xl mb-2">{type.icon}</div>
                    <div className="font-medium text-white">{type.label}</div>
                    {type.id !== 'custom' && (
                      <div className="text-xs text-slate-400 mt-1 line-clamp-2">{type.prompt}</div>
                    )}
                  </button>
                ))}
              </div>

              {selectedType === 'custom' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Custom Query
                  </label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Enter your specific question or hypothesis request..."
                    className="w-full h-32 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400"
                  />
                </div>
              )}
            </div>

            <button
              onClick={generateHypotheses}
              disabled={!data || !apiKey || !selectedType || loading.hypotheses}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading.hypotheses ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Generating Hypotheses...</>
              ) : (
                <><Brain className="w-5 h-5" /> Generate Hypotheses with Bayesian Analysis</>
              )}
            </button>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && (
          <div className="space-y-6">
            {hypotheses ? (
              hypotheses.map((hyp, idx) => (
                <div key={idx} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  {/* Header */}
                  <div 
                    className="p-6 cursor-pointer hover:bg-slate-700/50 transition-colors"
                    onClick={() => setExpandedHypothesis(expandedHypothesis === idx ? null : idx)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-4xl font-bold text-blue-400">#{hyp.rank}</span>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{hyp.title}</h3>
                          <p className="text-slate-400 text-sm mt-1 line-clamp-2">{hyp.hypothesis}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {hyp.bayesian_analysis && (
                          <ConfidenceBadge 
                            probability={hyp.bayesian_analysis.posterior_probability}
                            ci={hyp.bayesian_analysis.confidence_interval}
                          />
                        )}
                        {expandedHypothesis === idx ? (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedHypothesis === idx && (
                    <div className="px-6 pb-6 border-t border-slate-700">
                      {/* Bayesian Analysis */}
                      <BayesianVisualization analysis={hyp.bayesian_analysis} />

                      {/* Evidence */}
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
                          Supporting Evidence
                        </h4>
                        <ul className="space-y-1">
                          {hyp.evidence?.map((e, i) => (
                            <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                              <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                              {e}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Mechanism */}
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
                          Proposed Mechanism
                        </h4>
                        <p className="text-slate-300 text-sm bg-slate-700/50 p-4 rounded-lg">
                          {hyp.mechanism}
                        </p>
                      </div>

                      {/* Predictions */}
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
                          Testable Predictions
                        </h4>
                        <ul className="space-y-1">
                          {hyp.predictions?.map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                              <span className="text-yellow-400">→</span>
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Alternative Explanations */}
                      {hyp.alternative_explanations && (
                        <div className="mt-6">
                          <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
                            Alternative Explanations
                          </h4>
                          <p className="text-slate-400 text-sm italic">{hyp.alternative_explanations}</p>
                        </div>
                      )}

                      {/* Generate Experimental Design */}
                      <div className="mt-6 pt-6 border-t border-slate-700">
                        <button
                          onClick={() => generateExperimentalDesign(hyp)}
                          disabled={loading.experimental}
                          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                          {loading.experimental ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Designing...</>
                          ) : (
                            <><FlaskConical className="w-4 h-4" /> Generate Experimental Protocol</>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <Brain className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No hypotheses generated yet. Go to the Generate tab to start.</p>
              </div>
            )}
          </div>
        )}

        {/* Experimental Design Tab */}
        {activeTab === 'experimental' && (
          <div className="max-w-4xl mx-auto">
            {experimentalDesign ? (
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h2 className="text-xl font-bold text-white mb-2">
                  Experimental Protocol
                </h2>
                <p className="text-slate-400 mb-6">For hypothesis: {experimentalDesign.hypothesis}</p>
                
                <div className="space-y-6">
                  {/* Primary Experiment */}
                  {experimentalDesign.primary_experiment && (
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <h3 className="font-semibold text-white mb-3">Primary Experiment</h3>
                      <div className="space-y-2 text-sm text-slate-300">
                        <p><strong>Objective:</strong> {experimentalDesign.primary_experiment.objective}</p>
                        <p><strong>Methodology:</strong> {experimentalDesign.primary_experiment.methodology}</p>
                        <p><strong>Controls:</strong> {JSON.stringify(experimentalDesign.primary_experiment.controls)}</p>
                      </div>
                    </div>
                  )}

                  {/* Power Analysis */}
                  {experimentalDesign.power_analysis && (
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <h3 className="font-semibold text-white mb-3">Power Analysis</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-slate-400">Effect Size</div>
                          <div className="text-white font-medium">{experimentalDesign.power_analysis.effect_size_expected}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Alpha</div>
                          <div className="text-white font-medium">{experimentalDesign.power_analysis.alpha}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Power</div>
                          <div className="text-white font-medium">{experimentalDesign.power_analysis.power}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Sample Size</div>
                          <div className="text-white font-medium">{experimentalDesign.power_analysis.sample_size_calculation}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  {experimentalDesign.timeline && (
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      <h3 className="font-semibold text-white mb-3">Timeline</h3>
                      <p className="text-slate-300 text-sm">Total Duration: {experimentalDesign.timeline.total_duration}</p>
                      {experimentalDesign.timeline.phases && (
                        <div className="mt-2 space-y-1">
                          {experimentalDesign.timeline.phases.map((phase, i) => (
                            <div key={i} className="text-sm text-slate-400">
                              • {phase.activities || phase} ({phase.duration || ''})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Full JSON */}
                  <details className="bg-slate-700/50 rounded-lg p-4">
                    <summary className="font-semibold text-white cursor-pointer">Full Protocol (JSON)</summary>
                    <pre className="mt-4 text-xs text-slate-300 overflow-auto max-h-96">
                      {JSON.stringify(experimentalDesign, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <FlaskConical className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">
                  No experimental design generated yet. Generate hypotheses first, then click 
                  "Generate Experimental Protocol" on a hypothesis.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-lg font-bold text-white mb-6">API Settings</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Model
                  </label>
                  <select
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  >
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Recommended)</option>
                    <option value="claude-opus-4-20250514">Claude Opus 4</option>
                    <option value="claude-haiku-4-20250514">Claude Haiku 4 (Faster)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Max Tokens: {config.maxTokens}
                  </label>
                  <input
                    type="range"
                    min="1000"
                    max="8000"
                    step="500"
                    value={config.maxTokens}
                    onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Temperature: {config.temperature}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Lower = more focused, Higher = more creative
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mt-6">
              <h2 className="text-lg font-bold text-white mb-4">About This Tool</h2>
              <div className="text-sm text-slate-400 space-y-2">
                <p>
                  This tool uses Claude AI to generate scientific hypotheses from differential 
                  metabolomics data with Bayesian uncertainty quantification.
                </p>
                <p>Features:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Upload your own CSV data</li>
                  <li>Multiple hypothesis types (mechanisms, biomarkers, therapeutics)</li>
                  <li>Bayesian confidence estimation (prior, likelihood, posterior)</li>
                  <li>Automated experimental design generation</li>
                  <li>Literature context analysis</li>
                </ul>
                <p className="mt-4 text-slate-500">
                  Built for Anthropic Life Sciences Research Engineer application
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-slate-500 text-sm">
          <p>Metabolomics Hypothesis Generator • Powered by Claude API</p>
        </div>
      </footer>
    </div>
  );
}
