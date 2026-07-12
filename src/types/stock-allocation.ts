export type StockStatus = 'NOT_CALCULATED' | 'STOCK_READY' | 'PARTIAL_STOCK' | 'OUT_OF_STOCK';

export interface StockCalculationResult {
  success: boolean;
  results: Array<{
    order_id: string;
    stock_status: StockStatus;
  }>;
  count: number;
}
