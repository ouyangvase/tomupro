import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { useFilteredStockBalance } from '@/hooks/useStockVisibility';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { ArrowLeftRight, Eye, Users, User, UsersRound, Search, Package, AlertTriangle, TrendingDown, BarChart3, Warehouse } from 'lucide-react';
import { StockTransferDialog } from '@/components/inventory/StockTransferDialog';
import { VisibilityManagementDialog } from '@/components/inventory/VisibilityManagementDialog';
import { ManagerGroupsDialog } from '@/components/inventory/ManagerGroupsDialog';
import { MobileStockCard } from '@/components/mobile/MobileStockCard';
import { QueryWrapper } from '@/components/ui/query-wrapper';
import { useIsMobile } from '@/hooks/use-mobile';
import { PageHero } from '@/components/dashboard/PageHero';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { cn } from '@/lib/utils';
import type { StockBalance } from '@/types/database';

interface StockBalanceRow extends StockBalance {
  _key: string;
}

export default function InventoryBalance() {
  const { profile } = useAuth();
  const { data: stockBalance = [], isLoading, isError, error, refetch } = useFilteredStockBalance();
  const { data: users = [] } = useUsers();
  const { data: teamMembers = [] } = useTeamMembers();
  const isMobile = useIsMobile();
  
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [stockTab, setStockTab] = useState<'my' | 'team'>('my');
  
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  
  const salespersons = users.filter(u => u.role === 'salesperson');
  const managers = users.filter(u => u.role === 'manager');
  const transferEligibleUsers = users.filter(u => u.role === 'salesperson' || u.role === 'manager');
  
  const visibleOwners = [...new Set(stockBalance.map(s => s.owner_user_id))];
  
  const ownerOptions = useMemo(() => {
    if (isManager) {
      const teamIds = [profile?.id, ...teamMembers.map(t => t.id)];
      return users.filter(u => teamIds.includes(u.id) && visibleOwners.includes(u.id));
    }
    return users.filter(u => 
      (u.role === 'salesperson' || u.role === 'manager') && 
      visibleOwners.includes(u.id)
    );
  }, [isManager, profile?.id, teamMembers, users, visibleOwners]);
  
  const filteredStock: StockBalanceRow[] = useMemo(() => {
    let filtered = stockBalance;
    
    if (isManager) {
      if (stockTab === 'my') {
        filtered = filtered.filter(s => s.owner_user_id === profile?.id);
      } else {
        const teamIds = [profile?.id, ...teamMembers.map(t => t.id)];
        filtered = filtered.filter(s => teamIds.includes(s.owner_user_id));
      }
    }
    
    if (ownerFilter !== 'all') {
      filtered = filtered.filter(s => s.owner_user_id === ownerFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.sku_name?.toLowerCase().includes(query) ||
        s.sku_code?.toLowerCase().includes(query) ||
        s.owner_name?.toLowerCase().includes(query)
      );
    }
    
    return filtered.map((s, idx) => ({
      ...s,
      _key: `${s.warehouse_id}-${s.product_id || idx}`,
    }));
  }, [stockBalance, ownerFilter, searchQuery, isManager, stockTab, profile?.id, teamMembers]);

  const currentOwnerOptions = useMemo(() => {
    if (isManager && stockTab === 'my') {
      return users.filter(u => u.id === profile?.id);
    }
    return ownerOptions;
  }, [isManager, stockTab, profile?.id, users, ownerOptions]);

  // Inventory health metrics
  const totalItems = filteredStock.length;
  const totalQty = filteredStock.reduce((sum, s) => sum + Number(s.balance_qty || 0), 0);
  const lowStockItems = filteredStock.filter(s => Number(s.balance_qty || 0) <= 0);
  const healthyItems = filteredStock.filter(s => Number(s.balance_qty || 0) > 10);
  const uniqueOwners = new Set(filteredStock.map(s => s.owner_user_id)).size;
  const healthPercent = totalItems > 0 ? Math.round((healthyItems.length / totalItems) * 100) : 100;

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
    { key: 'sku_code', header: 'SKU Code', render: (s) => (
      <span className="font-mono text-sm">{s.sku_code || '-'}</span>
    )},
    { key: 'sku_name', header: 'Product', sortable: true, render: (s) => s.sku_name || '-' },
    { key: 'balance_qty', header: 'Balance', sortable: true, render: (s) => {
      const qty = Number(s.balance_qty);
      const maxQty = Math.max(...filteredStock.map(r => Number(r.balance_qty || 0)), 1);
      const percent = Math.max(0, (qty / maxQty) * 100);
      return (
        <div className="flex items-center gap-3 min-w-[120px]">
          <Badge variant={qty > 0 ? 'default' : 'destructive'} className="min-w-[40px] justify-center">
            {qty}
          </Badge>
          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                qty <= 0 ? "bg-destructive" : qty <= 5 ? "bg-[hsl(var(--status-warning))]" : "bg-[hsl(var(--status-success))]"
              )}
              style={{ width: `${Math.max(percent, 4)}%` }}
            />
          </div>
        </div>
      );
    }},
    { key: 'last_movement_time', header: 'Last Movement', sortable: true, render: (s) => 
      s.last_movement_time ? format(new Date(s.last_movement_time), 'MMM dd, HH:mm') : '-' 
    },
  ];

  // Mobile view
  if (isMobile) {
    return (
      <AppLayout>
        <div className="space-y-4 pb-20">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Stock Balance
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? 'View and manage all inventory' : 
               isManager ? 'View your inventory and team stock' : 'View your inventory'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-xl p-4 border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total SKUs</p>
              <p className="text-2xl font-bold">{totalItems}</p>
            </div>
            <div className="bg-card rounded-xl p-4 border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Qty</p>
              <p className="text-2xl font-bold">{totalQty.toLocaleString()}</p>
            </div>
          </div>

          {isManager && (
            <Tabs value={stockTab} onValueChange={(v) => {
              setStockTab(v as 'my' | 'team');
              setOwnerFilter('all');
            }}>
              <TabsList className="w-full">
                <TabsTrigger value="my" className="flex-1 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  My Stock
                </TabsTrigger>
                <TabsTrigger value="team" className="flex-1 flex items-center gap-2">
                  <UsersRound className="h-4 w-4" />
                  Team Stock
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-11"
            />
          </div>

          {(isAdmin || (isManager && stockTab === 'team')) && currentOwnerOptions.length > 1 && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All Owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {currentOwnerOptions.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <QueryWrapper
            isLoading={isLoading}
            isError={isError}
            error={error as Error}
            isEmpty={filteredStock.length === 0}
            onRetry={() => refetch()}
            loadingMessage="Loading stock data..."
            emptyMessage={
              isManager && stockTab === 'my' 
                ? "No stock in your warehouse yet. Acknowledge inbound shipments to add stock."
                : searchQuery ? "No products match your search" : "No stock data available"
            }
            emptyIcon={<Package className="h-10 w-10 text-muted-foreground/50" />}
          >
            <div className="space-y-3">
              {filteredStock.map((stock) => (
                <MobileStockCard
                  key={stock._key}
                  productName={stock.sku_name || 'Unknown Product'}
                  skuCode={stock.sku_code || undefined}
                  balance={Number(stock.balance_qty) || 0}
                  ownerName={stock.owner_name || 'Unknown'}
                  warehouseName={stock.warehouse_name || undefined}
                  lastMovement={stock.last_movement_time}
                  isOwnStock={stock.owner_user_id === profile?.id}
                />
              ))}
            </div>
          </QueryWrapper>
        </div>
      </AppLayout>
    );
  }

  // Desktop view
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Hero */}
        <PageHero
          icon={Package}
          title="Stock Balance"
          subtitle={isAdmin ? 'View and manage all inventory' : 
                   isManager ? 'View your inventory and team stock' : 'View your inventory'}
          actions={isAdmin ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGroupsOpen(true)} className="rounded-xl">
                <Users className="h-4 w-4 mr-2" /> Manager Groups
              </Button>
              <Button variant="outline" onClick={() => setVisibilityOpen(true)} className="rounded-xl">
                <Eye className="h-4 w-4 mr-2" /> Visibility
              </Button>
              <Button onClick={() => setTransferOpen(true)} className="rounded-xl">
                <ArrowLeftRight className="h-4 w-4 mr-2" /> Transfer Stock
              </Button>
            </div>
          ) : undefined}
        />

        {/* Inventory Health Metrics */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <p className="text-xs font-medium text-muted-foreground mb-1">Total SKUs</p>
              <p className="text-2xl font-bold"><AnimatedCounter value={totalItems} /></p>
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 right-0 w-16 h-16 bg-[hsl(var(--status-success)/0.1)] rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <p className="text-xs font-medium text-muted-foreground mb-1">Total Quantity</p>
              <p className="text-2xl font-bold"><AnimatedCounter value={totalQty} /></p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 right-0 w-16 h-16 bg-[hsl(var(--status-success)/0.1)] rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <p className="text-xs font-medium text-muted-foreground mb-1">Healthy Stock</p>
              <p className="text-2xl font-bold text-[hsl(var(--status-success))]"><AnimatedCounter value={healthyItems.length} /></p>
            </CardContent>
          </Card>

          <Card className={cn("relative overflow-hidden border-border/50", lowStockItems.length > 0 && "border-destructive/30")}>
            <div className="absolute top-0 right-0 w-16 h-16 bg-destructive/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <div className="flex items-center gap-1.5 mb-1">
                {lowStockItems.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                <p className="text-xs font-medium text-muted-foreground">Low / Out of Stock</p>
              </div>
              <p className={cn("text-2xl font-bold", lowStockItems.length > 0 ? "text-destructive" : "text-muted-foreground")}>
                <AnimatedCounter value={lowStockItems.length} />
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/50">
            <CardContent className="pt-5 pb-4 relative">
              <p className="text-xs font-medium text-muted-foreground mb-2">Inventory Health</p>
              <div className="flex items-center gap-2">
                <p className={cn("text-xl font-bold",
                  healthPercent >= 80 ? "text-[hsl(var(--status-success))]" : healthPercent >= 50 ? "text-[hsl(var(--status-warning))]" : "text-destructive"
                )}>
                  <AnimatedCounter value={healthPercent} suffix="%" />
                </p>
              </div>
              <Progress value={healthPercent} className="h-1.5 mt-2" />
            </CardContent>
          </Card>
        </div>
        
        {/* Manager Stock Tabs */}
        {isManager && (
          <Tabs value={stockTab} onValueChange={(v) => {
            setStockTab(v as 'my' | 'team');
            setOwnerFilter('all');
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
        
        {/* Owner filter */}
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
