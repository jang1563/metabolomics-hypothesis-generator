# Metabolomics Hypothesis Generator

🧬 **AI-powered hypothesis generation from differential metabolomics data with Bayesian uncertainty quantification**

![Screenshot](docs/screenshot.png)

## Features

### Core Functionality
- **📤 Data Upload**: Upload CSV files with differential metabolomics results
- **🔬 Automatic Detection**: Auto-detects metabolite, fold-change, p-value, and pathway columns
- **📊 Data Summary**: Visualizes significant changes, top increased/decreased metabolites

### Hypothesis Generation
- **🧬 Multiple Hypothesis Types**:
  - Biological Mechanisms
  - Disease Association
  - Biomarker Discovery
  - Therapeutic Targets
  - Pathway Analysis
  - Custom Queries

### Advanced Features
- **📈 Bayesian Uncertainty Quantification**:
  - Prior probability (based on literature)
  - Likelihood (how well data supports hypothesis)
  - Posterior probability (updated belief)
  - 95% Confidence intervals

- **🧪 Experimental Design Automation**:
  - Primary experiment with controls
  - Power analysis and sample size calculation
  - Expected outcomes and decision criteria
  - Timeline and resource estimates
  - Potential pitfalls and mitigations

- **📚 Literature Analysis**:
  - Relevant PubMed references
  - Key findings from related studies
  - Knowledge gaps identification

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Anthropic API key

### Setup

```bash
# Clone or download this directory
cd metabolomics-hypothesis-generator

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will open at `http://localhost:3000`

### Get Your API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new key
5. Copy and paste into the application

## Usage

### 1. Upload Your Data

Prepare a CSV file with your differential metabolomics results:

```csv
metabolite,log2FC,pvalue,pathway
Glucose,-1.52,0.0012,Carbohydrate metabolism
Lactate,2.34,0.00008,Energy metabolism
...
```

**Required columns:**
- `metabolite` (or `compound`, `name`, `id`, `feature`)
- `log2FC` (or `fold_change`, `fc`, `ratio`)
- `pvalue` (or `p`, `fdr`, `qvalue`, `adj_pvalue`)

**Optional columns:**
- `pathway` (or `kegg`, `hmdb`, `class`, `category`)

### 2. Analyze Your Data

After uploading, the tool will:
- Auto-detect column mappings
- Calculate summary statistics
- Identify top changed metabolites
- Generate literature context (optional)

### 3. Generate Hypotheses

1. Select a hypothesis type (or write a custom query)
2. Click "Generate Hypotheses with Bayesian Analysis"
3. Review the ranked hypotheses with:
   - Evidence from your data
   - Proposed mechanisms
   - Bayesian confidence estimates
   - Testable predictions

### 4. Design Experiments

For any hypothesis:
1. Click "Generate Experimental Protocol"
2. Get a complete validation plan with:
   - Experimental design
   - Power analysis
   - Timeline
   - Resource estimates

## Sample Data

A sample dataset is included (`sample_data.csv`) to test the application.

## Configuration

### API Settings (Settings tab)

| Setting | Description | Default |
|---------|-------------|---------|
| Model | Claude model to use | claude-sonnet-4-20250514 |
| Max Tokens | Maximum response length | 4000 |
| Temperature | Creativity (0=focused, 1=creative) | 0.7 |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    User Interface                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐ │
│  │ Upload  │ │ Analyze │ │Generate │ │ Results   │ │
│  └────┬────┘ └────┬────┘ └────┬────┘ └─────┬─────┘ │
└───────┼──────────┼──────────┼─────────────┼────────┘
        │          │          │             │
        ▼          ▼          ▼             ▼
┌─────────────────────────────────────────────────────┐
│                  Data Processing                     │
│  ┌──────────┐ ┌───────────┐ ┌─────────────────────┐ │
│  │CSV Parse │ │Auto-Detect│ │ Context Builder     │ │
│  └──────────┘ └───────────┘ └─────────────────────┘ │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                   Claude API                         │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐  │
│  │ Hypothesis   │ │ Experimental │ │ Literature  │  │
│  │ Generation   │ │ Design       │ │ Analysis    │  │
│  └──────────────┘ └──────────────┘ └─────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Bayesian Analysis Explained

For each hypothesis, the system estimates:

1. **Prior P(H)**: Probability the hypothesis is true *before* seeing your data
   - Based on existing literature and biological plausibility
   
2. **Likelihood P(D|H)**: Probability of observing your data *if* the hypothesis is true
   - How well the metabolite changes fit the proposed mechanism
   
3. **Posterior P(H|D)**: Updated probability *after* seeing your data
   - Calculated using Bayes' theorem: P(H|D) = P(D|H) × P(H) / P(D)

This provides a principled uncertainty quantification rather than just "high/medium/low" confidence.

## Future Extensions

- [ ] Integration with HMDB/KEGG for automatic pathway enrichment
- [ ] Multi-omics integration (proteomics, transcriptomics)
- [ ] Fine-tuning on PubMed/bioRxiv corpus
- [ ] Active learning for hypothesis refinement
- [ ] Export to standard formats (Word, PDF)

## License

MIT License

## Author

JangKeun Kim - [GitHub](https://github.com/jangkeun)

---

*Built with React, Vite, Tailwind CSS, and the Anthropic Claude API*
