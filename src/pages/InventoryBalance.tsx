import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { useStockBalance } from '@/hooks/useInventory';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { StockBalance } from '@/types/database';

export default function InventoryBalance() {
  const { data: stockBalance = [], isLoading } = useStockBalance();

  const columns: Column<StockBalance>[] = [
    { key: 'warehouse_name', header: 'Warehouse', sortable: true },
    { key: 'owner_name', header: 'Owner', sortable: true },
    { key: 'sku_code', header: 'SKU Code', render: (s) => s.sku_code || '-' },
    { key: 'sku_name', header: 'Product', sortable: true },
    { key: 'balance_qty', header: 'Balance', sortable: true, render: (s) => (
      <Badge variant={Number(s.balance_qty) > 0 ? 'default' : 'destructive'}>
        {s.balance_qty}
      </Badge>
    )},
    { key: 'last_movement_time', header: 'Last Movement', sortable: true, render: (s) => 
      s.last_movement_time ? format(new Date(s.last_movement_time), 'MMM dd, HH:mm') : '-' 
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Stock Balance</h1>
          <p className="text-muted-foreground">View inventory across all warehouses</p>
        </div>

        <DataGrid
          data={stockBalance}
          columns={columns}
          keyField="product_id"
          loading={isLoading}
          emptyMessage="No stock data available"
          onExport={() => {}}
        />
      </div>
    </AppLayout>
  );
}
