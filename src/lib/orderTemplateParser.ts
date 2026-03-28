/**
 * Order Template Parser
 *
 * Parses pasted text templates into structured order data.
 *
 * Expected format:
 *   CUSTOMER NAME
 *   PHONE NUMBER
 *   ADDRESS LINE(S)
 *
 *   QTY X SKU_NAME $PRICE (OPTIONAL_NOTE)
 *   REMARK/RUNNER_HINT
 */

import { isScientificNotation } from '@/lib/phone';

export interface ParsedOrderLine {
  qty: number;
  skuNameRaw: string;
  matchedProductId: string | null;
  matchedProductName: string | null;
  price: number;
  lineNotes: string;
  confidence: 'exact' | 'fuzzy' | 'unmatched';
}

export interface ParsedOrder {
  customerName: string;
  phone: string;
  address: string;
  items: ParsedOrderLine[];
  remark: string;
  runnerHint: string;
  parseWarnings: string[];
}

export type ProductRef = {
  id: string;
  sku_code: string | null;
  sku_name: string;
};

// Detect if a line looks like an item line (starts with qty pattern)
const ITEM_LINE_RE = /^\d+\s*[xX×]\s+/;
// Alternate: just a number followed by non-digit (e.g., "1 SAHIYYA PLUS $69")
const ITEM_LINE_ALT_RE = /^\d+\s+[A-Z]/i;
// Phone pattern: mostly digits, at least 6
const PHONE_RE = /^[\+]?\d[\d\s\-]{5,}$/;
// Price extraction
const PRICE_RE = /[\$]\s*(\d+(?:\.\d{1,2})?)|BND\s*(\d+(?:\.\d{1,2})?)/i;
// Trailing price (standalone number at end after sku name)
const TRAILING_PRICE_RE = /\s+(\d+(?:\.\d{1,2})?)\s*(?:\([^)]*\))?\s*$/;
// Parenthesized note at end of line
const PAREN_NOTE_RE = /\(([^)]*)\)\s*$/;

function isItemLine(line: string): boolean {
  return ITEM_LINE_RE.test(line) || (ITEM_LINE_ALT_RE.test(line) && /\$|\bBND\b|\d{2,}/.test(line));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]+/g, '');
}

function matchProduct(skuRaw: string, products: ProductRef[]): { id: string | null; name: string | null; confidence: 'exact' | 'fuzzy' | 'unmatched' } {
  const trimmed = skuRaw.trim();
  if (!trimmed) return { id: null, name: null, confidence: 'unmatched' };

  // Exact sku_name match (case-insensitive)
  for (const p of products) {
    if (p.sku_name.toLowerCase() === trimmed.toLowerCase()) {
      return { id: p.id, name: p.sku_name, confidence: 'exact' };
    }
  }

  // Exact sku_code match
  for (const p of products) {
    if (p.sku_code && p.sku_code.toLowerCase() === trimmed.toLowerCase()) {
      return { id: p.id, name: p.sku_name, confidence: 'exact' };
    }
  }

  // Fuzzy: normalized contains
  const normInput = normalize(trimmed);
  let bestMatch: ProductRef | null = null;
  let bestScore = 0;

  for (const p of products) {
    const normName = normalize(p.sku_name);
    const normCode = p.sku_code ? normalize(p.sku_code) : '';

    // Check if input contains product name or vice versa
    if (normName.includes(normInput) || normInput.includes(normName)) {
      const score = Math.min(normInput.length, normName.length) / Math.max(normInput.length, normName.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = p;
      }
    }
    if (normCode && (normCode.includes(normInput) || normInput.includes(normCode))) {
      const score = Math.min(normInput.length, normCode.length) / Math.max(normInput.length, normCode.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = p;
      }
    }
  }

  if (bestMatch && bestScore > 0.4) {
    return { id: bestMatch.id, name: bestMatch.sku_name, confidence: 'fuzzy' };
  }

  return { id: null, name: null, confidence: 'unmatched' };
}

function parseItemLine(line: string, products: ProductRef[]): ParsedOrderLine {
  let remaining = line.trim();
  let lineNotes = '';

  // Extract parenthesized note
  const parenMatch = remaining.match(PAREN_NOTE_RE);
  if (parenMatch) {
    lineNotes = parenMatch[1].trim();
    remaining = remaining.replace(PAREN_NOTE_RE, '').trim();
  }

  // Extract quantity
  let qty = 1;
  const qtyMatch = remaining.match(/^(\d+)\s*[xX×]?\s+/);
  if (qtyMatch) {
    qty = parseInt(qtyMatch[1], 10) || 1;
    remaining = remaining.slice(qtyMatch[0].length).trim();
  }

  // Extract price
  let price = 0;
  const priceMatch = remaining.match(PRICE_RE);
  if (priceMatch) {
    price = parseFloat(priceMatch[1] || priceMatch[2]) || 0;
    remaining = remaining.replace(PRICE_RE, '').trim();
  } else {
    // Try trailing number as price
    const trailingMatch = remaining.match(TRAILING_PRICE_RE);
    if (trailingMatch) {
      price = parseFloat(trailingMatch[1]) || 0;
      remaining = remaining.replace(/\s+\d+(?:\.\d{1,2})?\s*$/, '').trim();
    }
  }

  const skuNameRaw = remaining.trim();
  const match = matchProduct(skuNameRaw, products);

  return {
    qty,
    skuNameRaw,
    matchedProductId: match.id,
    matchedProductName: match.name,
    price,
    lineNotes,
    confidence: match.confidence,
  };
}

export function parseOrderTemplate(text: string, products: ProductRef[]): ParsedOrder {
  const warnings: string[] = [];
  const lines = text.split('\n').map(l => l.trim());

  // Split into sections by blank lines
  const sections: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line === '') {
      if (current.length > 0) {
        sections.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current);

  if (sections.length === 0) {
    return { customerName: '', phone: '', address: '', items: [], remark: '', runnerHint: '', parseWarnings: ['Empty input'] };
  }

  // Section 1: Customer info
  const infoSection = sections[0];
  let customerName = '';
  let phone = '';
  const addressParts: string[] = [];

  for (let i = 0; i < infoSection.length; i++) {
    const line = infoSection[i];
    if (i === 0) {
      // First line is always customer name
      customerName = line;
    } else if (!phone && PHONE_RE.test(line.replace(/[\s\-\+]/g, '').length >= 6 ? line : '___')) {
      // Check if it looks like a phone number
      const cleaned = line.replace(/[\s\-]/g, '');
      if (/^\+?\d{6,}$/.test(cleaned)) {
        // Reject scientific notation (e.g. 6.28776E+12)
        if (isScientificNotation(line.trim())) {
          warnings.push(`Phone "${line.trim()}" appears to be in scientific notation (corrupted by Excel). Please enter the actual phone number.`);
          phone = line; // still store it so user can see and fix it
        } else {
          phone = line;
        }
      } else {
        addressParts.push(line);
      }
    } else if (!phone && /^\d{6,}$/.test(line.replace(/[\s\-]/g, ''))) {
      phone = line;
    } else if (!phone && isScientificNotation(line.trim())) {
      // Catch scientific notation that doesn't match the phone regex above
      warnings.push(`Phone "${line.trim()}" appears to be in scientific notation (corrupted by Excel). Please enter the actual phone number.`);
      phone = line;
    } else {
      addressParts.push(line);
    }
  }

  const address = addressParts.join('\n');

  // Section 2+: Items and remarks
  const items: ParsedOrderLine[] = [];
  let remark = '';
  let runnerHint = '';

  for (let s = 1; s < sections.length; s++) {
    const section = sections[s];
    for (let i = 0; i < section.length; i++) {
      const line = section[i];
      if (isItemLine(line)) {
        items.push(parseItemLine(line, products));
      } else if (items.length > 0) {
        // Non-item line after items = remark/runner line
        if (line.includes('/')) {
          const parts = line.split('/');
          remark = parts[0].trim();
          runnerHint = parts.slice(1).join('/').trim();
        } else {
          remark = line;
        }
      } else {
        // Could be continuation of address or unrecognized
        if (!address && s === 1) {
          // Treat as address continuation
          addressParts.push(line);
        } else {
          warnings.push(`Could not parse line: "${line}"`);
        }
      }
    }
  }

  // If no items found from sections, try parsing all non-info lines as potential items
  if (items.length === 0 && sections.length === 1 && infoSection.length > 2) {
    // Single block: try to find item lines within
    for (let i = 2; i < infoSection.length; i++) {
      if (isItemLine(infoSection[i])) {
        items.push(parseItemLine(infoSection[i], products));
      }
    }
  }

  return {
    customerName,
    phone,
    address: address || addressParts.join('\n'),
    items,
    remark,
    runnerHint,
    parseWarnings: warnings,
  };
}
