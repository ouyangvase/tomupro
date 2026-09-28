import { describe, expect, it } from 'vitest';
import { STOCK_BALANCE_EXPORT_HEADERS, toStockBalanceExportRows } from './stockBalanceExport';

describe('stock balance export', () => {
  it('exports the visible stock fields in the expected order', () => {
    expect(toStockBalanceExportRows([{
      warehouse_id: 'warehouse-1',
      warehouse_name: "XiaoLi's Warehouse",
      owner_user_id: 'owner-1',
      owner_name: 'XiaoLi',
      product_id: 'product-1',
      sku_code: 'BIS01',
      sku_name: 'RED PERFUME',
      balance_qty: 9,
      last_movement_time: '2026-08-19T03:40:00.000Z',
    }])).toEqual([
      STOCK_BALANCE_EXPORT_HEADERS,
      ['XiaoLi', "XiaoLi's Warehouse", 'BIS01', 'RED PERFUME', 9, '2026-08-19 11:40'],
    ]);
  });

  it('keeps an empty export row safe when a movement timestamp is missing', () => {
    expect(toStockBalanceExportRows([{
      warehouse_id: 'warehouse-1',
      warehouse_name: 'Warehouse',
      owner_user_id: 'owner-1',
      owner_name: 'Owner',
      product_id: 'product-1',
      sku_code: null,
      sku_name: 'Product',
      balance_qty: 0,
      last_movement_time: null as unknown as string,
    }])[1]).toEqual(['Owner', 'Warehouse', '-', 'Product', 0, '-']);
  });
});
