import { unzipSync } from 'fflate';
import { downloadXlsxWorkbook } from '@/lib/xlsxExport';

export const INBOUND_TEMPLATE_HEADERS = [
  'Username',
  'SKU Code',
  'Quantity',
  'Inbound Date',
  'Reference Number',
  'Remark',
] as const;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const PRESELECT_SCORE = 95;
const SUGGEST_SCORE = 80;
const textDecoder = new TextDecoder();

export interface InboundUserCandidate {
  id: string;
  display_name: string;
  email: string | null;
}

export interface InboundProductCandidate {
  id: string;
  owner_user_id: string;
  sku_code: string | null;
  sku_name: string;
}

export interface ParsedInboundRow {
  row_number: number;
  username_raw: string;
  sku_raw: string;
  quantity_raw: string;
  inbound_date_raw: string;
  reference_number: string;
  remark: string;
}

export interface PreparedInboundRow extends ParsedInboundRow {
  matched_user_id: string | null;
  suggested_user_id: string | null;
  user_match_state: 'Exact' | 'Suggested' | 'No Match' | 'Invalid';
  user_match_score: number;
  matched_product_id: string | null;
  suggested_product_id: string | null;
  product_match_state: 'Exact' | 'Suggested' | 'No Match' | 'Invalid';
  product_match_score: number;
}

interface MatchResult {
  matchedId: string | null;
  suggestedId: string | null;
  state: 'Exact' | 'Suggested' | 'No Match' | 'Invalid';
  score: number;
}

function parseXml(xml: string, label: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) {
    throw new Error(`The workbook contains invalid ${label} XML`);
  }
  return document;
}

function decodeXmlFile(files: Record<string, Uint8Array>, path: string) {
  const content = files[path];
  if (!content) throw new Error(`The workbook is missing ${path}`);
  return textDecoder.decode(content);
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, index - 1);
}

function excelSerialToIsoDate(value: string) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return value;
  const utc = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return excelSerialToIsoDate(trimmed);

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return trimmed;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function sharedStrings(files: Record<string, Uint8Array>) {
  const content = files['xl/sharedStrings.xml'];
  if (!content) return [] as string[];
  const document = parseXml(textDecoder.decode(content), 'shared strings');
  return Array.from(document.getElementsByTagName('si')).map((node) => (
    Array.from(node.getElementsByTagName('t')).map((text) => text.textContent || '').join('')
  ));
}

function firstWorksheetPath(files: Record<string, Uint8Array>) {
  const workbook = parseXml(decodeXmlFile(files, 'xl/workbook.xml'), 'workbook');
  const firstSheet = workbook.getElementsByTagName('sheet')[0];
  if (!firstSheet) throw new Error('The workbook does not contain a worksheet');
  const relationId = firstSheet.getAttribute('r:id');
  if (!relationId) throw new Error('The first worksheet relationship is missing');

  const relationships = parseXml(
    decodeXmlFile(files, 'xl/_rels/workbook.xml.rels'),
    'workbook relationships',
  );
  const relationship = Array.from(relationships.getElementsByTagName('Relationship'))
    .find((node) => node.getAttribute('Id') === relationId);
  const target = relationship?.getAttribute('Target');
  if (!target) throw new Error('The first worksheet file is missing');
  return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
}

function cellValue(cell: Element, strings: string[]) {
  const type = cell.getAttribute('t');
  const valueNode = cell.getElementsByTagName('v')[0];
  const formulaNode = cell.getElementsByTagName('f')[0];
  const inlineText = Array.from(cell.getElementsByTagName('t'))
    .map((node) => node.textContent || '')
    .join('');

  if (formulaNode && !valueNode && !inlineText) {
    throw new Error(`Formula-only cell ${cell.getAttribute('r') || ''} is not supported`);
  }
  if (type === 'inlineStr') return inlineText;

  const raw = valueNode?.textContent || '';
  if (type === 's') return strings[Number(raw)] || '';
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  return raw;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

export async function parseInboundWorkbook(file: File): Promise<ParsedInboundRow[]> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Only .xlsx workbooks are supported');
  }
  if (file.size === 0) throw new Error('The selected workbook is empty');
  if (file.size > MAX_FILE_BYTES) throw new Error('Workbook exceeds the 5MB limit');

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('Workbook is encrypted, password-protected, or not a valid .xlsx file');
  }

  if (Object.keys(files).some((path) => /vbaProject\.bin|macrosheets|dialogsheets/i.test(path))) {
    throw new Error('Macro-enabled workbooks are not supported');
  }

  const worksheetPath = firstWorksheetPath(files);
  const worksheet = parseXml(decodeXmlFile(files, worksheetPath), 'worksheet');
  const strings = sharedStrings(files);
  const xmlRows = Array.from(worksheet.getElementsByTagName('row'));
  if (xmlRows.length === 0) throw new Error('The workbook does not contain any rows');

  const matrix = xmlRows.map((row, index) => {
    const values: string[] = [];
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      values[columnIndex(cell.getAttribute('r') || 'A1')] = cellValue(cell, strings).trim();
    }
    const xmlRowNumber = Number(row.getAttribute('r'));
    return {
      rowNumber: Number.isSafeInteger(xmlRowNumber) && xmlRowNumber > 0 ? xmlRowNumber : index + 1,
      values,
    };
  });

  const headers = matrix[0].values.map((header) => header || '');
  const normalizedHeaders = headers.map(normalizeHeader);
  const duplicateHeaders = normalizedHeaders.filter((header, index) => (
    header && normalizedHeaders.indexOf(header) !== index
  ));
  if (duplicateHeaders.length > 0) {
    throw new Error(`Duplicate header: ${duplicateHeaders[0]}`);
  }

  const required = INBOUND_TEMPLATE_HEADERS.map(normalizeHeader);
  const missing = required.filter((header) => !normalizedHeaders.includes(header));
  if (missing.length > 0) throw new Error(`Missing required header: ${missing[0]}`);

  const nonEmptyRows = matrix.slice(1).filter((row) => row.values.some((value) => value?.trim()));
  if (nonEmptyRows.length === 0) throw new Error('The workbook contains headers but no data rows');
  if (nonEmptyRows.length > MAX_ROWS) throw new Error(`Workbook exceeds the ${MAX_ROWS} row limit`);

  const headerIndex = new Map(normalizedHeaders.map((header, index) => [header, index]));
  const read = (row: string[], header: string) => row[headerIndex.get(normalizeHeader(header)) ?? -1] || '';

  return nonEmptyRows.map((row) => ({
    row_number: row.rowNumber,
    username_raw: read(row.values, 'Username'),
    sku_raw: read(row.values, 'SKU Code'),
    quantity_raw: read(row.values, 'Quantity'),
    inbound_date_raw: normalizeDate(read(row.values, 'Inbound Date')),
    reference_number: read(row.values, 'Reference Number'),
    remark: read(row.values, 'Remark'),
  }));
}

export function normalizeMatchValue(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    for (let index = 0; index <= right.length; index += 1) previous[index] = current[index];
  }

  return previous[right.length];
}

export function similarityScore(left: string, right: string) {
  const normalizedLeft = normalizeMatchValue(left);
  const normalizedRight = normalizeMatchValue(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 100;
  const longest = Math.max(normalizedLeft.length, normalizedRight.length);
  return Math.max(0, Math.round((1 - levenshteinDistance(normalizedLeft, normalizedRight) / longest) * 100));
}

function bestMatch(rawValue: string, candidates: Array<{ id: string; aliases: string[] }>): MatchResult {
  const normalized = normalizeMatchValue(rawValue);
  if (!normalized) return { matchedId: null, suggestedId: null, state: 'Invalid', score: 0 };

  let bestId: string | null = null;
  let bestScore = 0;
  let exact = false;

  for (const candidate of candidates) {
    for (const alias of candidate.aliases) {
      const score = similarityScore(rawValue, alias);
      if (score > bestScore) {
        bestId = candidate.id;
        bestScore = score;
        exact = normalizeMatchValue(alias) === normalized;
      }
    }
  }

  if (!bestId || bestScore < SUGGEST_SCORE) {
    return { matchedId: null, suggestedId: null, state: 'No Match', score: bestScore };
  }
  if (exact) return { matchedId: bestId, suggestedId: bestId, state: 'Exact', score: 100 };
  if (bestScore >= PRESELECT_SCORE) {
    return { matchedId: bestId, suggestedId: bestId, state: 'Suggested', score: bestScore };
  }
  return { matchedId: null, suggestedId: bestId, state: 'Suggested', score: bestScore };
}

export function matchInboundUser(rawValue: string, users: InboundUserCandidate[]) {
  return bestMatch(rawValue, users.map((user) => ({
    id: user.id,
    aliases: [
      user.display_name,
      user.email || '',
      user.email?.split('@')[0] || '',
    ].filter(Boolean),
  })));
}

export function matchInboundProduct(rawValue: string, products: InboundProductCandidate[]) {
  return bestMatch(rawValue, products.map((product) => ({
    id: product.id,
    aliases: [product.sku_code || '', product.sku_name].filter(Boolean),
  })));
}

export function prepareInboundRows(
  rows: ParsedInboundRow[],
  users: InboundUserCandidate[],
  products: InboundProductCandidate[],
): PreparedInboundRow[] {
  return rows.map((row) => {
    const userMatch = matchInboundUser(row.username_raw, users);
    const ownerId = userMatch.matchedId || userMatch.suggestedId;
    const productMatch = matchInboundProduct(
      row.sku_raw,
      ownerId ? products.filter((product) => product.owner_user_id === ownerId) : [],
    );

    return {
      ...row,
      matched_user_id: userMatch.matchedId,
      suggested_user_id: userMatch.suggestedId,
      user_match_state: userMatch.state,
      user_match_score: userMatch.score,
      matched_product_id: userMatch.matchedId ? productMatch.matchedId : null,
      suggested_product_id: productMatch.suggestedId,
      product_match_state: productMatch.state,
      product_match_score: productMatch.score,
    };
  });
}

export async function sha256File(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function downloadInboundTemplate() {
  downloadXlsxWorkbook([
    {
      name: 'Inbound Upload',
      rows: [
        [...INBOUND_TEMPLATE_HEADERS],
      ],
    },
    {
      name: 'Instructions',
      rows: [
        ['Runner Inbound Excel Import'],
        ['Required columns', 'Username, SKU Code, Quantity, Inbound Date'],
        ['Username', 'Use the receiving user display name or email address.'],
        ['SKU Code', 'Use the SKU owned by that receiving user.'],
        ['Quantity', 'Positive whole numbers only.'],
        ['Inbound Date', 'Use YYYY-MM-DD.'],
        ['Reference Number', 'Optional shipment or supplier reference.'],
        ['Remark', 'Optional note visible on the inbound shipment.'],
        ['Limits', 'Maximum 2,000 rows and 5MB. Only .xlsx files are accepted.'],
        ['Review', 'Uploading never creates stock. Review and confirm all matches first.'],
      ],
    },
    {
      name: 'Sample',
      rows: [
        [...INBOUND_TEMPLATE_HEADERS],
        ['Sample User', 'SKU001', 10, '2026-07-30', 'REF-001', 'Example only - replace this row'],
      ],
    },
  ], `TOMUPRO-Inbound-Template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
