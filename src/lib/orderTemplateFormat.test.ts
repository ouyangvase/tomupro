import { describe, expect, it } from 'vitest';
import { parseOrderTemplate } from './orderTemplateParser';
import { ORDER_PASTE_EXAMPLE, MULTI_SKU_TEMPLATE, templateTransferAmount } from './orderTemplateFormat';
import { parseCSV } from './csv';
import { validateOrderLines } from './csvValidation';
import { groupImportPayments } from './orderImportGroups';

const products = [{ id: 'a', sku_code: 'SKU-A', sku_name: 'Product A' }, { id: 'b', sku_code: 'SKU-B', sku_name: 'Product B' }];
describe('updated order templates', () => {
  it('parses partial payment, line totals and multiline notes without runner inference', () => {
    const order = parseOrderTemplate(ORDER_PASTE_EXAMPLE, products);
    expect(order.parseErrors).toEqual([]);
    expect(order.paymentPlan).toBe('PARTIAL_TRANSFER_COD');
    expect(order.transferAmount).toBe(30);
    expect(order.items.map(i => [i.qty, i.price, i.matchedProductId])).toEqual([[2, 42, 'a'], [1, 30, 'b']]);
    expect(order.remark).toBe('Call before delivery.\nUse the side entrance / blue gate.');
    expect(order.runnerHint).toBe('');
  });
  it.each([['COD', '0.00', 0], ['TRANSFER', '72.00', 72]])('supports %s', (plan, amount, expected) => {
    const order = parseOrderTemplate(ORDER_PASTE_EXAMPLE.replace('TRANSFER + COD', plan).replace('30.00\n\nItems:', amount + '\n\nItems:'), products);
    expect(order.parseErrors).toEqual([]);
    expect(order.transferAmount).toBe(expected);
  });
  it.each(['-1', '73', 'NaN', '1.001'])('rejects invalid transfer %s', amount => {
    expect(() => templateTransferAmount('PARTIAL_TRANSFER_COD', amount, 72)).toThrow();
  });
  it('continues to parse legacy text', () => {
    const order = parseOrderTemplate('CUSTOMER\n8888888\nADDRESS\n\n2 X SKU-A $42\nCall first/Runner', products);
    expect(order.items[0].price).toBe(42);
    expect(order.remark).toBe('Call first');
    expect(order.runnerHint).toBe('Runner');
  });
  it('imports the downloadable sample as one 72/30 order, not two transfers', () => {
    const result = validateOrderLines(parseCSV(MULTI_SKU_TEMPLATE));
    expect(result.errors).toEqual([]);
    const groups = groupImportPayments(result.valid);
    expect(groups.size).toBe(1);
    expect(groups.get('SAMPLE-001')).toMatchObject({ total: 72, transfer: 30 });
    expect(groups.get('SAMPLE-001')?.row.notes).toContain('side entrance / blue gate');
  });
  it('rejects conflicting notes or payments across item rows', () => {
    const { valid } = validateOrderLines(parseCSV(MULTI_SKU_TEMPLATE));
    expect(() => groupImportPayments([valid[0], { ...valid[1], notes: 'Different note' }])).toThrow('must match');
    expect(() => groupImportPayments([valid[0], { ...valid[1], transfer_amount: '20' }])).toThrow('must match');
  });
  it('rejects unknown payment modes and invalid quantities and amounts', () => {
    const rows = parseCSV(MULTI_SKU_TEMPLATE);
    for (const patch of [{payment_method:'CRYPTO'},{qty:'0'},{qty:'1.5'},{price:'-1'},{price:'abc'}]) {
      expect(validateOrderLines([{...rows[0],...patch}]).errors.length).toBeGreaterThan(0);
    }
  });
});
