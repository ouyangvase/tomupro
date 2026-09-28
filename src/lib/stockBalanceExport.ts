import { format } from 'date-fns';
import type { StockBalance } from '@/types/database';
import type { XlsxCellValue } from '@/lib/xlsxExport';

export const STOCK_BALANCE_EXPORT_HEADERS = [
  'Owner',
  'Warehouse',
  'SKU Code',
  'Product',
  'Balance',
  'Last Movement',
];

function formatLastMovement(value: string | null | undefined) {
  if (!value) return '-';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : format(date, 'yyyy-MM-dd HH:mm');
}

export function toStockBalanceExportRows(rows: StockBalance[]): XlsxCellValue[][] {
  return [
    STOCK_BALANCE_EXPORT_HEADERS,
    ...rows.map((row) => [
      row.owner_name || '-',
      row.warehouse_name || '-',
      row.sku_code || '-',
      row.sku_name || '-',
      Number(row.balance_qty) || 0,
      formatLastMovement(row.last_movement_time),
    ]),
  ];
}
