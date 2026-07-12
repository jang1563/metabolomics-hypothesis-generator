export class DatasetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatasetError';
  }
}

const isBlankRow = (row) => row.every((value) => value.trim() === '');

export function parseCsv(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new DatasetError('The CSV file is empty.');
  }

  const matrix = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  const finishRow = () => {
    row.push(value.trim());
    if (!isBlankRow(row)) matrix.push(row);
    row = [];
    value = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      if (value.trim() !== '') {
        throw new DatasetError('A quoted field must begin at the start of a value.');
      }
      inQuotes = true;
    } else if (character === ',') {
      row.push(value.trim());
      value = '';
    } else if (character === '\n') {
      finishRow();
    } else if (character === '\r') {
      if (text[index + 1] !== '\n') finishRow();
    } else {
      value += character;
    }
  }

  if (inQuotes) throw new DatasetError('The CSV contains an unclosed quoted field.');
  if (value !== '' || row.length > 0) finishRow();
  if (matrix.length < 2) throw new DatasetError('The CSV must include a header and at least one data row.');

  const headers = matrix[0].map((header, index) => {
    const cleaned = index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim();
    if (!cleaned) throw new DatasetError('CSV headers cannot be blank.');
    return cleaned;
  });

  const normalized = headers.map((header) => header.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new DatasetError('CSV headers must be unique.');
  }

  const rows = matrix.slice(1).map((values, index) => {
    if (values.length > headers.length) {
      throw new DatasetError(`Row ${index + 2} has more values than the header.`);
    }
    const padded = [...values, ...Array(headers.length - values.length).fill('')];
    return Object.fromEntries(headers.map((header, columnIndex) => [header, padded[columnIndex]]));
  });

  return { headers, rows };
}

const normalizeHeader = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const aliases = {
  metabolite: ['metabolite', 'compound', 'compoundname', 'featurename', 'analyte'],
  log2fc: ['log2fc', 'log2foldchange', 'logfc'],
  pvalue: ['p', 'pvalue', 'pval'],
  qvalue: ['q', 'qvalue', 'qval', 'fdr', 'padj', 'adjustedpvalue', 'adjpvalue'],
  pathway: ['pathway', 'pathwayname', 'class', 'category'],
  featureId: ['featureid', 'rowid', 'id'],
  contrast: ['contrast', 'comparison', 'comparisonlabel'],
};

const rawFoldAliases = new Set(['fc', 'foldchange', 'ratio']);

function findHeader(headers, names, label) {
  const matches = headers.filter((header) => names.includes(normalizeHeader(header)));
  if (matches.length > 1) {
    throw new DatasetError(`Multiple columns match ${label}: ${matches.join(', ')}.`);
  }
  return matches[0];
}

export function detectColumns(headers) {
  const mapping = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [key, findHeader(headers, names, key)]),
  );

  if (!mapping.metabolite) {
    throw new DatasetError('A metabolite column is required. Supported names include metabolite and compound.');
  }
  if (!mapping.log2fc) {
    const ambiguous = headers.find((header) => rawFoldAliases.has(normalizeHeader(header)));
    if (ambiguous) {
      throw new DatasetError(
        `Column “${ambiguous}” is ambiguous. Convert the effect to a signed log2FC column before analysis.`,
      );
    }
    throw new DatasetError('A signed log2FC column is required.');
  }
  if (!mapping.pvalue && !mapping.qvalue) {
    throw new DatasetError('A p-value or q-value/FDR column is required.');
  }

  return mapping;
}

function parseFiniteNumber(rawValue, label, rowNumber) {
  if (rawValue === '') throw new DatasetError(`${label} is missing on row ${rowNumber}.`);
  const value = Number(rawValue);
  if (!Number.isFinite(value)) throw new DatasetError(`${label} must be finite on row ${rowNumber}.`);
  return value;
}

function parseProbability(rawValue, label, rowNumber) {
  const value = parseFiniteNumber(rawValue, label, rowNumber);
  if (value < 0 || value > 1) {
    throw new DatasetError(`${label} must be between 0 and 1 on row ${rowNumber}.`);
  }
  return value;
}

export function prepareDataset(parsed) {
  const mapping = detectColumns(parsed.headers);
  const rows = parsed.rows.map((row, index) => {
    const rowNumber = index + 2;
    const metabolite = row[mapping.metabolite].trim();
    if (!metabolite) throw new DatasetError(`Metabolite is missing on row ${rowNumber}.`);

    return {
      id: mapping.featureId && row[mapping.featureId].trim()
        ? row[mapping.featureId].trim()
        : `row-${String(index + 1).padStart(3, '0')}`,
      metabolite,
      log2fc: parseFiniteNumber(row[mapping.log2fc], 'log2FC', rowNumber),
      pvalue: mapping.pvalue ? parseProbability(row[mapping.pvalue], 'p-value', rowNumber) : null,
      qvalue: mapping.qvalue ? parseProbability(row[mapping.qvalue], 'q-value', rowNumber) : null,
      pathway: mapping.pathway && row[mapping.pathway].trim() ? row[mapping.pathway].trim() : 'Unassigned',
      contrast: mapping.contrast && row[mapping.contrast].trim() ? row[mapping.contrast].trim() : null,
    };
  });

  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) throw new DatasetError('Feature identifiers must be unique.');
  const contrasts = [...new Set(rows.map((row) => row.contrast).filter(Boolean))];
  if (contrasts.length > 1) {
    throw new DatasetError('A dataset must contain one consistent contrast label.');
  }

  return {
    rows,
    mapping,
    significanceSource: mapping.qvalue ? 'provided q-value/FDR' : 'BH-adjusted p-value',
    contrast: contrasts[0] ?? null,
  };
}
