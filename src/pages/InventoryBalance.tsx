import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { useFilteredStockBalance } from '@/hooks/useStockVisibility';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ArrowLeftRight, Eye, Users } from 'lucide-react';
import { StockTransferDialog } from '@/components/inventory/StockTransferDialog';
import { VisibilityManagementDialog } from '@/components/inventory/VisibilityManagementDialog';
import { ManagerGroupsDialog } from '@/components/inventory/ManagerGroupsDialog';
import type { StockBalance } from '@/types/database';

interface StockBalanceRow extends StockBalance {
  _key: string;
}
export default function InventoryBalance() {
  const { profile } = useAuth();
  const { data: stockBalance = [], isLoading } = useFilteredStockBalance();
  const { data: users = [] } = useUsers();
  
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [transferOpen, setTransferOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  
  const salespersons = users.filter(u => u.role === 'salesperson');
  const managers = users.filter(u => u.role === 'manager');
  
  // Get unique owners from visible stock
  const visibleOwners = [...new Set(stockBalance.map(s => s.owner_user_id))];
  const ownerOptions = salespersons.filter(sp => visibleOwners.includes(sp.id));
  
  // Apply owner filter and add unique key
  const filteredStock: StockBalanceRow[] = (ownerFilter === 'all' 
    ? stockBalance 
    : stockBalance.filter(s => s.owner_user_id === ownerFilter)
  ).map((s, idx) => ({
    ...s,
    _key: `${s.warehouse_id}-${s.product_id || idx}`,
  }));

  const columns: Column<StockBalanceRow>[] = [
    { key: 'owner_name', header: 'Owner', sortable: true, render: (s) => (
      <Badge variant="outline">{s.owner_name}</Badge>
    )},
    { key: 'warehouse_name', header: 'Warehouse', sortable: true },
    { key: 'sku_code', header: 'SKU Code', render: (s) => s.sku_code || '-' },
    { key: 'sku_name', header: 'Product', sortable: true, render: (s) => s.sku_name || '-' },
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Stock Balance</h1>
            <p className="text-muted-foreground">
              {isAdmin ? 'View and manage all inventory' : 
               isManager ? 'View team inventory' : 'View your inventory'}
            </p>
          </div>
          
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGroupsOpen(true)}>
                <Users className="h-4 w-4 mr-2" /> Manager Groups
              </Button>
              <Button variant="outline" onClick={() => setVisibilityOpen(true)}>
                <Eye className="h-4 w-4 mr-2" /> Visibility
              </Button>
              <Button onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="h-4 w-4 mr-2" /> Transfer Stock
              </Button>
            </div>
          )}
        </div>
        
        {(isAdmin || isManager || ownerOptions.length > 1) && (
          <div className="flex gap-4">
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {ownerOptions.map(sp => (
                  <SelectItem key={sp.id} value={sp.id}>{sp.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DataGrid<StockBalanceRow>
          data={filteredStock}
          columns={columns}
          keyField="_key"
          loading={isLoading}
          emptyMessage="No stock data available"
          onExport={() => {}}
        />
      </div>
      
      {isAdmin && (
        <>
          <StockTransferDialog 
            open={transferOpen} 
            onOpenChange={setTransferOpen}
            salespersons={salespersons}
          />
          <VisibilityManagementDialog
            open={visibilityOpen}
            onOpenChange={setVisibilityOpen}
            users={users}
          />
          <ManagerGroupsDialog
            open={groupsOpen}
            onOpenChange={setGroupsOpen}
            managers={managers}
            salespersons={salespersons}
          />
        </>
      )}
    </AppLayout>
  );
}
