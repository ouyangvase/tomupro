import { z } from 'zod';
import { isScientificNotation } from '@/lib/phone';

/**
 * Parses various date formats and returns YYYY-MM-DD or empty string
 * Supports: YYYY-MM-DD, M/D/YYYY, D/M/YYYY, MM/DD/YYYY, DD/MM/YYYY, etc.
 */
function parseFlexibleDate(value: string): string {
  if (!value || !value.trim()) return '';
  
  const trimmed = value.trim();
  
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  // Handle slash-separated formats (M/D/YYYY, D/M/YYYY, MM/DD/YYYY, etc.)
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, part1, part2, year] = slashMatch;
    const num1 = parseInt(part1, 10);
    const num2 = parseInt(part2, 10);
    
    // Heuristic: if first number > 12, assume D/M/YYYY, otherwise M/D/YYYY
    let month: number, day: number;
    if (num1 > 12) {
      day = num1;
      month = num2;
    } else if (num2 > 12) {
      month = num1;
      day = num2;
    } else {
      // Default to M/D/YYYY (US format)
      month = num1;
      day = num2;
    }
    
    // Validate ranges
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  
  // Handle dash-separated formats (D-M-YYYY, M-D-YYYY)
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, part1, part2, year] = dashMatch;
    const num1 = parseInt(part1, 10);
    const num2 = parseInt(part2, 10);
    
    let month: number, day: number;
    if (num1 > 12) {
      day = num1;
      month = num2;
    } else if (num2 > 12) {
      month = num1;
      day = num2;
    } else {
      month = num1;
      day = num2;
    }
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  
  return '';
}

// Validation schema for CSV order line imports
export const orderLineSchema = z.object({
  order_ref: z.string().min(1, 'order_ref is required (system will not generate)').max(100, 'order_ref too long'),
  order_date: z.string().transform(parseFlexibleDate),
  customer_name: z.string().min(1, 'Customer name is required').max(255, 'Customer name too long'),
  phone: z.string().min(1, 'Phone is required').max(50, 'Phone too long').refine(
    (val) => !isScientificNotation(val),
    'Phone number format invalid (scientific notation like 6.28E+12 detected). Please format the phone column as TEXT in your spreadsheet and re-export.'
  ),
  address: z.string().min(1, 'Address is required').max(500, 'Address too long'),
  area: z.string().max(100).optional().default(''),
  channel: z.string().max(100).optional().default(''),
  payment_method: z.string().transform(val => {
    const upper = val?.toUpperCase?.() || '';
    return upper === 'TRANSFER' ? 'TRANSFER' : 'COD';
  }),
  expected_pickup_date: z.string().transform(parseFlexibleDate),
  notes: z.string().max(1000).optional().default(''),
  sku_name_or_code: z.string().min(1, 'SKU code is required for all order items').max(255, 'SKU too long'),
  qty: z.string().transform((val) => {
    const num = parseInt(val || '1', 10);
    if (isNaN(num) || num < 0 || num > 99999) return 1;
    return num;
  }),
  price: z.string().transform((val) => {
    const num = parseFloat(val || '0');
    if (isNaN(num) || num < 0 || num > 999999999) return 0;
    return num;
  }),
});

export type ValidatedOrderLine = z.infer<typeof orderLineSchema>;

export interface ValidationResult {
  valid: ValidatedOrderLine[];
  errors: { row: number; message: string }[];
}

/**
 * Validates an array of parsed CSV rows against the order line schema
 */
export function validateOrderLines(rows: Record<string, string>[]): ValidationResult {
  const valid: ValidatedOrderLine[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((row, index) => {
    try {
      const validated = orderLineSchema.parse({
        order_ref: sanitizeString(row.order_ref),
        order_date: sanitizeString(row.order_date),
        customer_name: sanitizeString(row.customer_name),
        phone: sanitizeString(row.phone),
        address: sanitizeString(row.address),
        area: sanitizeString(row.area),
        channel: sanitizeString(row.channel),
        payment_method: sanitizeString(row.payment_method),
        expected_pickup_date: sanitizeString(row.expected_pickup_date),
        notes: sanitizeString(row.notes),
        sku_name_or_code: sanitizeString(row.sku_name_or_code),
        qty: sanitizeString(row.qty),
        price: sanitizeString(row.price),
      });
      valid.push(validated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        errors.push({ row: index + 2, message: messages }); // +2 for header row + 1-indexed
      } else {
        errors.push({ row: index + 2, message: 'Unknown validation error' });
      }
    }
  });

  // Check for duplicate SKUs within the same order_ref
  const orderSkuMap = new Map<string, Map<string, number[]>>();
  valid.forEach((row, idx) => {
    const orderRef = row.order_ref.trim().toLowerCase();
    const sku = row.sku_name_or_code.trim().toLowerCase();
    
    if (!orderSkuMap.has(orderRef)) {
      orderSkuMap.set(orderRef, new Map());
    }
    const skuMap = orderSkuMap.get(orderRef)!;
    
    if (!skuMap.has(sku)) {
      skuMap.set(sku, []);
    }
    skuMap.get(sku)!.push(idx + 2); // CSV row number (1-indexed + header)
  });

  // Report duplicate SKU errors
  for (const [orderRef, skuMap] of orderSkuMap) {
    for (const [sku, rowNumbers] of skuMap) {
      if (rowNumbers.length > 1) {
        errors.push({
          row: rowNumbers[0],
          message: `Duplicate SKU detected: "${sku}" appears ${rowNumbers.length} times in order "${orderRef}" (rows: ${rowNumbers.join(', ')}). Each SKU can only appear once per order.`
        });
      }
    }
  }

  return { valid, errors };
}

/**
 * Sanitizes string input to prevent injection and ensure safe processing
 */
function sanitizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  // Remove control characters except newlines and tabs
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
