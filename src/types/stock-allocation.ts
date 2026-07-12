export type StockStatus = 'NOT_CALCULATED' | 'STOCK_READY' | 'PARTIAL_STOCK' | 'OUT_OF_STOCK';

export interface StockAllocation {
  id: string;
  order_id: string;
  order_item_id: string;
  product_id: string;
  warehouse_id: string | null;
  owner_user_id: string;
  qty_required: number;
  qty_allocated: number;
  qty_shortage: number;
  created_at: string;
  calculated_by: string | null;
  // Joined
  product?: {
    id: string;
    sku_code: string;
    sku_name: string;
  };
}

export interface StockCalculationResult {
  success: boolean;
  results: Array<{
    order_id: string;
    stock_status: StockStatus;
  }>;
  count: number;
}
