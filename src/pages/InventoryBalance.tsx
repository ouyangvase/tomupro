import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { useFilteredStockBalance } from '@/hooks/useStockVisibility';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ArrowLeftRight, Eye, Users, User, UsersRound } from 'lucide-react';
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
  const { data: teamMembers = [] } = useTeamMembers();
  
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [transferOpen, setTransferOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  
  // Stock view tab for managers: 'my' | 'team'
  const [stockTab, setStockTab] = useState<'my' | 'team'>('my');
  
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  
  const salespersons = users.filter(u => u.role === 'salesperson');
  const managers = users.filter(u => u.role === 'manager');
  const transferEligibleUsers = users.filter(u => u.role === 'salesperson' || u.role === 'manager');
  
  // Get unique owners from visible stock
  const visibleOwners = [...new Set(stockBalance.map(s => s.owner_user_id))];
  
  // For managers, filter owner options to team members only
  const ownerOptions = useMemo(() => {
    if (isManager) {
      const teamIds = [profile?.id, ...teamMembers.map(t => t.id)];
      return users.filter(u => teamIds.includes(u.id) && visibleOwners.includes(u.id));
    }
    // Include both salespersons and managers for admin
    return users.filter(u => 
      (u.role === 'salesperson' || u.role === 'manager') && 
      visibleOwners.includes(u.id)
    );
  }, [isManager, profile?.id, teamMembers, users, visibleOwners]);
  
  // Apply owner filter and add unique key, with stock tab support for managers
  const filteredStock: StockBalanceRow[] = useMemo(() => {
    let filtered = stockBalance;
    
    // For managers, apply stock tab filter
    if (isManager) {
      if (stockTab === 'my') {
        // Only show manager's own stock
        filtered = filtered.filter(s => s.owner_user_id === profile?.id);
      } else {
        // Show manager's own stock + team salespersons' stock
        const teamIds = [profile?.id, ...teamMembers.map(t => t.id)];
        filtered = filtered.filter(s => teamIds.includes(s.owner_user_id));
      }
    }
    
    // Apply owner filter (within the tab scope)
    if (ownerFilter !== 'all') {
      filtered = filtered.filter(s => s.owner_user_id === ownerFilter);
    }
    
    return filtered.map((s, idx) => ({
      ...s,
      _key: `${s.warehouse_id}-${s.product_id || idx}`,
    }));
  }, [stockBalance, ownerFilter, isManager, stockTab, profile?.id, teamMembers]);

  // Get owner options based on current tab for managers
  const currentOwnerOptions = useMemo(() => {
    if (isManager && stockTab === 'my') {
      // Only show self in My Stock tab
      return users.filter(u => u.id === profile?.id);
    }
    return ownerOptions;
  }, [isManager, stockTab, profile?.id, users, ownerOptions]);

  const columns: Column<StockBalanceRow>[] = [
    { key: 'owner_name', header: 'Owner', sortable: true, render: (s) => (
      <div className="flex items-center gap-2">
        <Badge variant="outline">{s.owner_name}</Badge>
        {s.owner_user_id === profile?.id && (
          <Badge variant="secondary" className="text-xs">You</Badge>
        )}
      </div>
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
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Stock Balance</h1>
            <p className="text-muted-foreground">
              {isAdmin ? 'View and manage all inventory' : 
               isManager ? 'View your inventory and team stock' : 'View your inventory'}
            </p>
          </div>
          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
        </div>
        
        {/* Manager Stock Tabs */}
        {isManager && (
          <Tabs value={stockTab} onValueChange={(v) => {
            setStockTab(v as 'my' | 'team');
            setOwnerFilter('all'); // Reset owner filter when switching tabs
          }}>
            <TabsList>
              <TabsTrigger value="my" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                My Stock
              </TabsTrigger>
              <TabsTrigger value="team" className="flex items-center gap-2">
                <UsersRound className="h-4 w-4" />
                Team Stock
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        
        {/* Owner filter - show for admin, or manager in team view with multiple options */}
        {(isAdmin || (isManager && stockTab === 'team' && currentOwnerOptions.length > 1)) && (
          <div className="flex gap-4">
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Filter by owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {currentOwnerOptions.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    <div className="flex items-center gap-2">
                      <span>{u.display_name}</span>
                      <Badge variant="outline" className="text-xs capitalize">{u.role}</Badge>
                    </div>
                  </SelectItem>
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
          emptyMessage={
            isManager && stockTab === 'my' 
              ? "No stock in your warehouse yet. Acknowledge inbound shipments to add stock."
              : "No stock data available"
          }
          onExport={() => {}}
        />
      </div>
      
      {isAdmin && (
        <>
          <StockTransferDialog 
            open={transferOpen} 
            onOpenChange={setTransferOpen}
            users={transferEligibleUsers}
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
