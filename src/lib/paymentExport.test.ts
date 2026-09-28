import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportOrderLines, exportRunnerOrderLines, parseCSV } from './csv';

afterEach(() => vi.unstubAllGlobals());
describe('payment exports', () => {
  it.each([exportOrderLines, exportRunnerOrderLines])('keeps sales and payments once per multi-line order', async exporter => {
    let file: Blob | undefined;
    vi.stubGlobal('document', { createElement: () => ({ click() {} }) });
    vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { file = blob; return 'blob:fixture'; } });
    exporter([{
      id: 'payment-order', order_code: 'PAYMENT-72', total_amount: 72, cod_amount: 42,
      payment_method: 'COD', payment_plan: 'PARTIAL_TRANSFER_COD', receipt_status: 'confirmed',
      driver_cash_amount: 42, driver_transfer_amount: 0,
      order_items: [{ qty: 2, price: 42, line_total: 42, sku_label: 'A' }, { qty: 1, price: 30, line_total: 30, sku_label: 'B' }],
    }], 'payment-export');
    const rows = parseCSV(await file!.text());
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, row) => sum + Number(row.sales_value_once || 0), 0)).toBe(72);
    expect(rows.reduce((sum, row) => sum + Number(row.transferpaid || 0), 0)).toBe(30);
    expect(rows.reduce((sum, row) => sum + Number(row.codcollected || 0), 0)).toBe(42);
    expect(rows[0].coddue).toBe('0');
    expect(rows[0].outstanding).toBe('0');
  });
});
