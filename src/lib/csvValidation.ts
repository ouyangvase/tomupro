import { z } from 'zod';

// Validation schema for CSV order line imports
export const orderLineSchema = z.object({
  order_ref: z.string().max(100).optional().default(''),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional().or(z.literal('')),
  customer_name: z.string().min(1, 'Customer name is required').max(255, 'Customer name too long'),
  phone: z.string().min(1, 'Phone is required').max(50, 'Phone too long'),
  address: z.string().min(1, 'Address is required').max(500, 'Address too long'),
  area: z.string().max(100).optional().default(''),
  channel: z.string().max(100).optional().default(''),
  payment_method: z.string().transform(val => {
    const upper = val?.toUpperCase?.() || '';
    return upper === 'TRANSFER' ? 'TRANSFER' : 'COD';
  }),
  expected_pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional().or(z.literal('')),
  notes: z.string().max(1000).optional().default(''),
  sku_name_or_code: z.string().max(255).optional().default(''),
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
