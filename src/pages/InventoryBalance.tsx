import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { usePaginatedStockBalance } from '@/hooks/usePaginatedStockBalance';
import { useProducts, useCreateProduct, useUpdateProduct, useBulkUpdateProducts } from '@/hooks/useProducts';
import {
  getRunnerStockLocationKey,
  useRunnerStockLocations,
  useUpsertRunnerStockLocation,
} from '@/hooks/useRunnerStockLocations';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useVisibleUserIds } from '@/hooks/useTeamVisibility';
import { useBindings } from '@/hooks/useBindings';
import { useManagerRunnerBindings } from '@/hooks/useManagerRunnerBindings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import {
  ArrowLeftRight, Eye, Users, User, UsersRound, Search, Package,
  AlertTriangle, Plus, Edit, CheckCircle, XCircle,
  MapPin,
} from 'lucide-react';
import { StockTransferDialog } from '@/components/inventory/StockTransferDialog';
import { VisibilityManagementDialog } from '@/components/inventory/VisibilityManagementDialog';
import { ManagerGroupsDialog } from '@/components/inventory/ManagerGroupsDialog';
import { MobileStockCard } from '@/components/mobile/MobileStockCard';
import { MobileProductCard } from '@/components/mobile/MobileProductCard';
import { MobileBulkActionsBar } from '@/components/mobile/MobileBulkActionsBar';
import { QueryWrapper } from '@/components/ui/query-wrapper';
import { useIsMobile } from '@/hooks/use-mobile';
import { PageHero } from '@/components/dashboard/PageHero';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { cn } from '@/lib/utils';
import type { StockBalance } from '@/types/database';
import type { Product } from '@/types/database';

// placeholder: StockBalanceRow type
interface StockBalanceRow extends StockBalance {
  _key: string;
}

const isRunnerHolderRole = (value: string | null | undefined) => value === 'runner' || value === 'driver';

export default function InventoryBalance() {
  const { profile, role } = useAuth();
  const { data: users = [] } = useUsers();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: userDirectory = [] } = useUserDirectory();
  const { visibleUserIds } = useVisibleUserIds();
  const { data: salespersonRunnerBindings = [] } = useBindings(
    role === 'salesperson' && profile?.id ? { salespersonId: profile.id } : undefined
  );
  const { data: managerRunnerBindings = [] } = useManagerRunnerBindings({
    managerId: role === 'manager' ? profile?.id : undefined,
  });
  const isMobile = useIsMobile();

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const canFilterStockHolders = role === 'salesperson' || role === 'manager';
  const canEdit = role === 'admin' || role === 'salesperson' || role === 'manager';
  const canEditStockLocation = role === 'runner';

  // Sub-tab: stock vs products
  const [activeSection, setActiveSection] = useState<'stock' | 'products'>('stock');

  // Shared state
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockTab, setStockTab] = useState<'my' | 'team'>('my');

  // Stock-specific state
  const [hideZeroBalance, setHideZeroBalance] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [stockLocationOpen, setStockLocationOpen] = useState(false);
  const [editingStockLocation, setEditingStockLocation] = useState<StockBalanceRow | null>(null);
  const [stockLocationRemark, setStockLocationRemark] = useState('');

  // Products-specific state
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ sku_name: '', sku_code: '' });

  // Product mutations
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const bulkUpdateProducts = useBulkUpdateProducts();

  // Determine effective owner ID for stock queries
  const effectiveOwnerId = useMemo(() => {
    if (isManager && stockTab === 'my') return profile?.id || null;
    if (ownerFilter !== 'all') return ownerFilter;
    return null;
  }, [isManager, stockTab, ownerFilter, profile?.id]);

  // Paginated stock balance
  const {
    data: stockRows,
    isLoading: stockLoading,
    isFetching: stockFetching,
    error: stockError,
    pagination,
    stats,
    statsLoading,
    setPage,
    setPageSize,
    refetch: refetchStock,
  } = usePaginatedStockBalance({
    search: searchQuery || undefined,
    ownerId: effectiveOwnerId,
    hideZero: hideZeroBalance,
  });

  // Products data
  const { data: products, isLoading: productsLoading } = useProducts(includeInactive);

  // Users for admin actions
  const salespersons = users.filter(u => u.role === 'salesperson');
  const managers = users.filter(u => u.role === 'manager');
  const transferEligibleUsers = users.filter(u => u.role === 'salesperson' || u.role === 'manager');

  const userLookup = useMemo(() => {
    const map = new Map<string, { id: string; display_name: string; email?: string | null; role?: string }>();

    userDirectory.forEach((u) => {
      map.set(u.id, {
        id: u.id,
        display_name: u.display_name || u.email || 'Unknown user',
        email: u.email,
        role: u.role,
      });
    });

    users.forEach((u) => {
      map.set(u.id, {
        id: u.id,
        display_name: u.display_name || u.email || 'Unknown user',
        email: u.email,
        role: u.role,
      });
    });

    return map;
  }, [userDirectory, users]);

  const stockHolderOptions = useMemo(() => {
    const options = new Map<string, { id: string; display_name: string; role?: string }>();
    const addFilterOption = (
      id: string | null | undefined,
      fallbackName: string | null | undefined,
      roleLabel?: string
    ) => {
      if (!id || options.has(id)) return;
      const user = userLookup.get(id);
      options.set(id, {
        id,
        display_name: fallbackName || user?.display_name || 'Unknown user',
        role: roleLabel || user?.role,
      });
    };

    if (profile?.id && canFilterStockHolders) {
      addFilterOption(profile.id, `${profile.display_name || profile.email || 'Me'} (Me)`, role || undefined);
    }

    if (role === 'salesperson') {
      salespersonRunnerBindings.forEach((binding) => {
        addFilterOption(
          binding.runner_id,
          binding.runner?.display_name || binding.runner?.email,
          'runner'
        );
      });
    }

    if (role === 'manager') {
      teamMembers.forEach((member) => {
        addFilterOption(member.id, member.display_name || member.email, member.role);
      });

      managerRunnerBindings.forEach((binding) => {
        addFilterOption(
          binding.runner_id,
          binding.runner?.display_name || binding.runner?.email,
          'runner'
        );
      });
    }

    return Array.from(options.values()).sort((a, b) => {
      if (a.id === profile?.id) return -1;
      if (b.id === profile?.id) return 1;
      if (isRunnerHolderRole(a.role) && !isRunnerHolderRole(b.role)) return -1;
      if (isRunnerHolderRole(b.role) && !isRunnerHolderRole(a.role)) return 1;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [
    profile?.id,
    profile?.display_name,
    profile?.email,
    canFilterStockHolders,
    role,
    teamMembers,
    salespersonRunnerBindings,
    managerRunnerBindings,
    userLookup,
  ]);

  // Owner filter options
  const ownerOptions = useMemo(() => {
    if (canFilterStockHolders) {
      return stockHolderOptions;
    }
    if (isManager) {
      const teamIds = [profile?.id, ...teamMembers.map(t => t.id)];
      return users.filter(u => teamIds.includes(u.id));
    }
    return users.filter(u => u.role === 'salesperson' || u.role === 'manager');
  }, [canFilterStockHolders, stockHolderOptions, isManager, profile?.id, teamMembers, users]);

  const showOwnerFilter = activeSection === 'products'
    ? (isAdmin || isManager)
    : (isAdmin || (isManager && stockTab === 'team') || role === 'salesperson');
  const ownerFilterPlaceholder = activeSection === 'stock' && canFilterStockHolders
    ? 'All Stock Holders'
    : 'All Owners';
  const ownerFilterLabel = ownerFilterPlaceholder;
  const holderHeader = canFilterStockHolders ? 'Held By' : 'Owner';
  const holderDetailLabel = canFilterStockHolders ? 'Held By' : 'Owner';
  const getHolderRole = (userId: string | null | undefined) => userLookup.get(userId || '')?.role;

  // Product owner filter options
  const productOwnerOptions = useMemo(() => {
    if (role === 'admin') {
      const ownerIds = new Set(products?.map(p => p.owner_user_id).filter(Boolean) || []);
      return userDirectory
        .filter(u => ownerIds.has(u.id))
        .map(u => ({ id: u.id, name: u.display_name, role: u.role }));
    }
    if (role === 'manager' && visibleUserIds) {
      return userDirectory
        .filter(u => visibleUserIds.includes(u.id))
        .map(u => ({
          id: u.id,
          name: u.id === profile?.id ? `${u.display_name} (Me)` : u.display_name,
          role: u.role,
        }));
    }
    return [];
  }, [role, products, userDirectory, visibleUserIds, profile?.id]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let filtered = products || [];
    if (ownerFilter !== 'all') {
      filtered = filtered.filter(p => p.owner_user_id === ownerFilter);
    }
    const q = searchQuery.toLowerCase();
    if (q) {
      filtered = filtered.filter(p =>
        p.sku_name.toLowerCase().includes(q) ||
        (p.sku_code || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [products, searchQuery, ownerFilter]);

  // Stats from server
  const totalSkus = stats?.total_skus ?? 0;
  const totalQty = stats?.total_qty ?? 0;
  const healthyCount = stats?.healthy_count ?? 0;
  const lowOutCount = stats?.low_out_count ?? 0;
  const healthPercent = totalSkus > 0 ? Math.round((healthyCount / totalSkus) * 100) : 100;

  // Stock balance rows with key
  const stockData: StockBalanceRow[] = useMemo(() => {
    return stockRows.map((s, idx) => ({
      ...s,
      _key: `${s.warehouse_id}-${s.product_id || idx}`,
    }));
  }, [stockRows]);

  const { data: stockLocationByKey = {} } = useRunnerStockLocations(stockData);
  const upsertStockLocation = useUpsertRunnerStockLocation();

  const openStockLocationEditor = (stock: StockBalanceRow) => {
    const existing = stockLocationByKey[getRunnerStockLocationKey(stock)]?.remark || '';
    setEditingStockLocation(stock);
    setStockLocationRemark(existing);
    setStockLocationOpen(true);
  };

  const handleSaveStockLocation = async () => {
    if (!editingStockLocation) return;
    await upsertStockLocation.mutateAsync({
      warehouseId: editingStockLocation.warehouse_id,
      productId: editingStockLocation.product_id,
      remark: stockLocationRemark,
    });
    setStockLocationOpen(false);
    setEditingStockLocation(null);
    setStockLocationRemark('');
  };

  // Stock columns
  const stockColumns: Column<StockBalanceRow>[] = [
    {
      key: 'owner_name', header: holderHeader, sortable: true, render: (s) => {
        const holderRole = getHolderRole(s.owner_user_id);

        return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{s.owner_name}</Badge>
          {isRunnerHolderRole(holderRole) && (
            <Badge variant="secondary" className="text-xs">Runner</Badge>
          )}
          {s.owner_user_id === profile?.id && (
            <Badge variant="secondary" className="text-xs">You</Badge>
          )}
        </div>
        );
      },
    },
    { key: 'warehouse_name', header: 'Warehouse', sortable: true },
    ...(canEditStockLocation ? [{
      key: 'stock_location',
      header: 'Stock Location',
      minWidth: '160px',
      preferredWidth: '14vw',
      render: (s: StockBalanceRow) => {
        const remark = stockLocationByKey[getRunnerStockLocationKey(s)]?.remark;
        return (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'h-auto min-h-8 max-w-full justify-start gap-2 rounded-lg px-2 py-1 text-left',
              remark ? 'text-foreground' : 'text-muted-foreground'
            )}
            onClick={(event) => {
              event.stopPropagation();
              openStockLocationEditor(s);
            }}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{remark || 'Add location'}</span>
          </Button>
        );
      },
    }] : []),
    {
      key: 'sku_code', header: 'SKU Code', render: (s) => (
        <span className="font-mono text-sm">{s.sku_code || '-'}</span>
      ),
    },
    { key: 'sku_name', header: 'Product', sortable: true, render: (s) => s.sku_name || '-' },
    {
      key: 'balance_qty', header: 'Balance', sortable: true, render: (s) => {
        const qty = Number(s.balance_qty);
        return (
          <div className="flex items-center gap-3 min-w-[120px]">
            <Badge variant={qty > 0 ? 'default' : 'destructive'} className="min-w-[40px] justify-center">
              {qty}
            </Badge>
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  qty <= 0 ? 'bg-destructive' : qty <= 5 ? 'bg-[hsl(var(--status-warning))]' : 'bg-[hsl(var(--status-success))]'
                )}
                style={{ width: `${Math.max(qty > 0 ? Math.min((qty / 100) * 100, 100) : 4, 4)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'last_movement_time', header: 'Last Movement', sortable: true, render: (s) =>
        s.last_movement_time ? format(new Date(s.last_movement_time), 'MMM dd, HH:mm') : '-',
    },
  ];

  // Product columns
  const productColumns: Column<Product & { creator?: { display_name: string } }>[] = [
    { key: 'sku_name', header: 'Product Name', sortable: true },
    { key: 'sku_code', header: 'SKU Code', sortable: true, render: (p) => p.sku_code || '-' },
    {
      key: 'is_active', header: 'Status', sortable: true, render: (p) => (
        <Badge variant={p.is_active ? 'default' : 'secondary'}>
          {p.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    { key: 'creator', header: 'Created By', render: (p) => (p as any).creator?.display_name || '-' },
    {
      key: 'created_at', header: 'Created', sortable: true,
      render: (p) => new Date(p.created_at).toLocaleDateString(),
    },
    ...(canEdit ? [{
      key: 'actions' as const,
      header: 'Actions',
      render: (p: Product) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(p)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleToggleActive(p)}>
            {p.is_active ? <XCircle className="h-4 w-4 text-destructive" /> : <CheckCircle className="h-4 w-4 text-primary" />}
          </Button>
        </div>
      ),
    }] : []),
  ];

  // Product handlers
  const handleOpenCreate = () => {
    setEditingProduct(null);
    setFormData({ sku_name: '', sku_code: '' });
    setDialogOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({ sku_name: product.sku_name, sku_code: product.sku_code || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.sku_name.trim()) return;
    if (editingProduct) {
      await updateProduct.mutateAsync({
        id: editingProduct.id,
        sku_name: formData.sku_name,
        sku_code: formData.sku_code || null,
      });
    } else {
      await createProduct.mutateAsync({
        sku_name: formData.sku_name,
        sku_code: formData.sku_code || null,
        created_by: profile!.id,
        owner_user_id: profile!.id,
      });
    }
    setDialogOpen(false);
  };

  const handleToggleActive = async (product: Product) => {
    await updateProduct.mutateAsync({ id: product.id, is_active: !product.is_active });
  };

  const handleBulkActivate = async () => {
    await bulkUpdateProducts.mutateAsync({ ids: selectedRows, updates: { is_active: true } });
    setSelectedRows([]);
  };

  const handleBulkDeactivate = async () => {
    await bulkUpdateProducts.mutateAsync({ ids: selectedRows, updates: { is_active: false } });
    setSelectedRows([]);
  };

  // Sub-tab switcher component
  const SectionTabs = () => (
    <Tabs
      value={activeSection}
      onValueChange={(v) => {
        setActiveSection(v as 'stock' | 'products');
        setSearchQuery('');
        setOwnerFilter('all');
        setSelectedRows([]);
      }}
    >
      <TabsList>
        <TabsTrigger value="stock" className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          Stock Balance
        </TabsTrigger>
        <TabsTrigger value="products" className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          Products
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  // ───────────── MOBILE VIEW ─────────────
  const stockLocationDialog = (
    <Dialog
      open={stockLocationOpen}
      onOpenChange={(open) => {
        setStockLocationOpen(open);
        if (!open) {
          setEditingStockLocation(null);
          setStockLocationRemark('');
        }
      }}
    >
      <DialogContent className="max-w-md border bg-background p-6 text-foreground">
        <DialogHeader>
          <DialogTitle>Stock Location</DialogTitle>
          <DialogDescription>
            Record where this stock is kept, for example Shelf Rack A level 3.1.
          </DialogDescription>
        </DialogHeader>

        {editingStockLocation && (
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="font-semibold">{editingStockLocation.sku_name || 'Unknown Product'}</div>
            <div className="text-muted-foreground">
              {[editingStockLocation.sku_code, editingStockLocation.warehouse_name].filter(Boolean).join(' - ')}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="runner-stock-location">Location remark</Label>
          <Textarea
            id="runner-stock-location"
            value={stockLocationRemark}
            onChange={(event) => setStockLocationRemark(event.target.value.slice(0, 180))}
            placeholder="e.g. Shelf Rack A, level 3.1"
            className="min-h-[110px] resize-none"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Visible only as your runner stock location note.</span>
            <span>{stockLocationRemark.length}/180</span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setStockLocationOpen(false)}
            disabled={upsertStockLocation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveStockLocation}
            disabled={!editingStockLocation || upsertStockLocation.isPending}
          >
            {upsertStockLocation.isPending ? 'Saving...' : 'Save Location'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isMobile) {
    return (
      <AppLayout>
        <div className="space-y-4 pb-20">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Inventory
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? 'View and manage all inventory' :
                isManager ? 'View your inventory and team stock' : 'View your inventory'}
            </p>
          </div>

          {/* Stats (always visible) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-xl p-4 border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total SKUs</p>
              <p className="text-2xl font-bold">{totalSkus.toLocaleString()}</p>
            </div>
            <div className="bg-card rounded-xl p-4 border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Qty</p>
              <p className="text-2xl font-bold">{totalQty.toLocaleString()}</p>
            </div>
          </div>

          {/* Section tabs */}
          <SectionTabs />

          {/* Manager stock tabs */}
          {activeSection === 'stock' && isManager && (
            <Tabs value={stockTab} onValueChange={(v) => {
              setStockTab(v as 'my' | 'team');
              setOwnerFilter('all');
            }}>
              <TabsList className="w-full">
                <TabsTrigger value="my" className="flex-1 flex items-center gap-2">
                  <User className="h-4 w-4" /> My Stock
                </TabsTrigger>
                <TabsTrigger value="team" className="flex-1 flex items-center gap-2">
                  <UsersRound className="h-4 w-4" /> Team Stock
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={activeSection === 'stock' ? 'Search stock...' : 'Search products...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-11"
            />
          </div>

          {/* Section-specific controls */}
          <div className="flex gap-2 flex-wrap">
            {activeSection === 'stock' && (
              <div className="flex items-center gap-2">
                <Switch checked={hideZeroBalance} onCheckedChange={setHideZeroBalance} id="hide-zero-mobile" />
                <Label htmlFor="hide-zero-mobile" className="text-sm">Hide zero balance</Label>
              </div>
            )}
            {activeSection === 'products' && (
              <>
                <Select
                  value={includeInactive ? 'all' : 'active'}
                  onValueChange={(v) => setIncludeInactive(v === 'all')}
                >
                  <SelectTrigger className="h-10 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="all">All Products</SelectItem>
                  </SelectContent>
                </Select>
                {canEdit && (
                  <Button size="sm" onClick={handleOpenCreate}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Owner / stock holder filter */}
          {showOwnerFilter && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={ownerFilterPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ownerFilterLabel}</SelectItem>
                {(activeSection === 'stock' ? ownerOptions : productOwnerOptions).map(u => (
                  <SelectItem key={'id' in u ? u.id : u.id} value={'id' in u ? u.id : u.id}>
                    <div className="flex items-center gap-2">
                      <span>{'display_name' in u ? u.display_name : (u as any).name}</span>
                      {activeSection === 'stock' && 'role' in u && isRunnerHolderRole(u.role) && (
                        <Badge variant="secondary" className="text-[10px]">Runner</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Content */}
          {activeSection === 'stock' ? (
            <QueryWrapper
              isLoading={stockLoading}
              isError={!!stockError}
              error={stockError as Error}
              isEmpty={stockData.length === 0}
              onRetry={() => refetchStock()}
              loadingMessage="Loading stock data..."
              emptyMessage={
                isManager && stockTab === 'my'
                  ? 'No stock in your warehouse yet. Acknowledge inbound shipments to add stock.'
                  : searchQuery ? 'No products match your search' : 'No stock data available'
              }
              emptyIcon={<Package className="h-10 w-10 text-muted-foreground/50" />}
            >
              <div className="space-y-3">
                {stockData.map((stock) => (
                  <MobileStockCard
                    key={stock._key}
                    productName={stock.sku_name || 'Unknown Product'}
                    skuCode={stock.sku_code || undefined}
                    balance={Number(stock.balance_qty) || 0}
                    ownerName={stock.owner_name || 'Unknown'}
                    ownerLabel={holderDetailLabel}
                    ownerRole={getHolderRole(stock.owner_user_id)}
                    warehouseName={stock.warehouse_name || undefined}
                    lastMovement={stock.last_movement_time}
                    isOwnStock={stock.owner_user_id === profile?.id}
                    stockLocationRemark={stockLocationByKey[getRunnerStockLocationKey(stock)]?.remark || null}
                    canEditStockLocation={canEditStockLocation}
                    onEditStockLocation={() => openStockLocationEditor(stock)}
                  />
                ))}
              </div>
              {/* Mobile pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage(pagination.page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage(pagination.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </QueryWrapper>
          ) : (
            <>
              {productsLoading ? (
                <div className="flex items-center justify-center gap-3 py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-muted-foreground">Loading...</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery ? 'No products match your search' : 'No products available'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredProducts.map((product) => (
                    <MobileProductCard
                      key={product.id}
                      id={product.id}
                      productName={product.sku_name}
                      skuCode={product.sku_code || undefined}
                      isActive={product.is_active}
                      creatorName={(product as any).creator?.display_name}
                      createdAt={product.created_at}
                      selectable={canEdit}
                      isSelected={selectedRows.includes(product.id)}
                      onSelectionChange={(checked) => {
                        if (checked) setSelectedRows(prev => [...prev, product.id]);
                        else setSelectedRows(prev => prev.filter(r => r !== product.id));
                      }}
                      onEdit={() => handleOpenEdit(product)}
                      onToggleActive={() => handleToggleActive(product)}
                      canEdit={canEdit}
                    />
                  ))}
                </div>
              )}
              {canEdit && (
                <MobileBulkActionsBar
                  selectedCount={selectedRows.length}
                  onClearSelection={() => setSelectedRows([])}
                >
                  <Button size="sm" onClick={handleBulkActivate}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Activate
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleBulkDeactivate}>
                    <XCircle className="h-4 w-4 mr-1" /> Deactivate
                  </Button>
                </MobileBulkActionsBar>
              )}
            </>
          )}
        </div>

        {stockLocationDialog}

        {/* Product Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input
                  value={formData.sku_name}
                  onChange={(e) => setFormData({ ...formData, sku_name: e.target.value })}
                  placeholder="e.g., Widget Pro"
                />
              </div>
              <div className="space-y-2">
                <Label>SKU Code</Label>
                <Input
                  value={formData.sku_code}
                  onChange={(e) => setFormData({ ...formData, sku_code: e.target.value })}
                  placeholder="e.g., WGT-001"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={!formData.sku_name.trim() || createProduct.isPending || updateProduct.isPending}
              >
                {createProduct.isPending || updateProduct.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppLayout>
    );
  }

  // ───────────── DESKTOP VIEW ─────────────
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Hero */}
        <PageHero
          icon={<Package className="h-6 w-6 text-primary" />}
          title="Inventory Management"
          subtitle={isAdmin ? 'View and manage all inventory and products' :
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

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <p className="text-xs font-medium text-muted-foreground mb-1">Total SKUs</p>
              <p className="text-2xl font-bold"><AnimatedCounter value={totalSkus} /></p>
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
              <p className="text-2xl font-bold text-[hsl(var(--status-success))]"><AnimatedCounter value={healthyCount} /></p>
            </CardContent>
          </Card>

          <Card className={cn('relative overflow-hidden border-border/50', lowOutCount > 0 && 'border-destructive/30')}>
            <div className="absolute top-0 right-0 w-16 h-16 bg-destructive/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <div className="flex items-center gap-1.5 mb-1">
                {lowOutCount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                <p className="text-xs font-medium text-muted-foreground">Low / Out of Stock</p>
              </div>
              <p className={cn('text-2xl font-bold', lowOutCount > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                <AnimatedCounter value={lowOutCount} />
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/50">
            <CardContent className="pt-5 pb-4 relative">
              <p className="text-xs font-medium text-muted-foreground mb-2">Inventory Health</p>
              <div className="flex items-center gap-2">
                <p className={cn('text-xl font-bold',
                  healthPercent >= 80 ? 'text-[hsl(var(--status-success))]' : healthPercent >= 50 ? 'text-[hsl(var(--status-warning))]' : 'text-destructive'
                )}>
                  <AnimatedCounter value={healthPercent} suffix="%" />
                </p>
              </div>
              <Progress value={healthPercent} className="h-1.5 mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Section tabs + manager stock tabs */}
        <div className="flex items-center gap-4 flex-wrap">
          <SectionTabs />

          {activeSection === 'stock' && isManager && (
            <Tabs value={stockTab} onValueChange={(v) => {
              setStockTab(v as 'my' | 'team');
              setOwnerFilter('all');
            }}>
              <TabsList>
                <TabsTrigger value="my" className="flex items-center gap-2">
                  <User className="h-4 w-4" /> My Stock
                </TabsTrigger>
                <TabsTrigger value="team" className="flex items-center gap-2">
                  <UsersRound className="h-4 w-4" /> Team Stock
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-4 items-center">
          {activeSection === 'stock' && (
            <div className="flex items-center gap-2">
              <Switch checked={hideZeroBalance} onCheckedChange={setHideZeroBalance} id="hide-zero" />
              <Label htmlFor="hide-zero" className="text-sm cursor-pointer">Hide zero balance</Label>
            </div>
          )}

          {activeSection === 'products' && (
            <>
              <Select
                value={includeInactive ? 'all' : 'active'}
                onValueChange={(v) => setIncludeInactive(v === 'all')}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="all">All Products</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {/* Owner / stock holder filter */}
          {showOwnerFilter && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder={ownerFilterPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ownerFilterLabel}</SelectItem>
                {(activeSection === 'stock' ? ownerOptions : productOwnerOptions).map(u => (
                  <SelectItem key={'id' in u ? u.id : u.id} value={'id' in u ? u.id : u.id}>
                    <div className="flex items-center gap-2">
                      <span>{'display_name' in u ? u.display_name : (u as any).name}</span>
                      {activeSection === 'stock' && 'role' in u && isRunnerHolderRole(u.role) && (
                        <Badge variant="secondary" className="text-[10px]">Runner</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Products-specific buttons */}
          {activeSection === 'products' && (
            <>
              {canEdit && selectedRows.length > 0 && (
                <div className="flex gap-2 ml-auto">
                  <Button size="sm" variant="outline" onClick={handleBulkActivate}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Activate ({selectedRows.length})
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleBulkDeactivate}>
                    <XCircle className="h-4 w-4 mr-1" /> Deactivate ({selectedRows.length})
                  </Button>
                </div>
              )}
              {canEdit && (
                <Button onClick={handleOpenCreate} className="ml-auto">
                  <Plus className="h-4 w-4 mr-2" /> Add Product
                </Button>
              )}
            </>
          )}
        </div>

        {/* Data grid */}
        {activeSection === 'stock' ? (
          <DataGrid<StockBalanceRow>
            data={stockData}
            columns={stockColumns}
            keyField="_key"
            loading={stockLoading}
            emptyMessage={
              isManager && stockTab === 'my'
                ? 'No stock in your warehouse yet. Acknowledge inbound shipments to add stock.'
                : 'No stock data available'
            }
            onExport={() => {}}
            serverPagination={{
              enabled: true,
              page: pagination.page,
              pageSize: pagination.pageSize,
              totalCount: pagination.totalCount,
              totalPages: pagination.totalPages,
              onPageChange: setPage,
              onPageSizeChange: setPageSize,
              isFetching: stockFetching,
            }}
            onSearchChange={setSearchQuery}
          />
        ) : (
          <DataGrid
            data={filteredProducts}
            columns={productColumns}
            loading={productsLoading}
            keyField="id"
            selectable={canEdit}
            selectedRows={selectedRows}
            onSelectionChange={setSelectedRows}
            onSearchChange={setSearchQuery}
          />
        )}
      </div>

      {stockLocationDialog}

      {/* Admin dialogs */}
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

      {/* Product Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Product Name *</Label>
              <Input
                value={formData.sku_name}
                onChange={(e) => setFormData({ ...formData, sku_name: e.target.value })}
                placeholder="e.g., Widget Pro"
              />
            </div>
            <div className="space-y-2">
              <Label>SKU Code</Label>
              <Input
                value={formData.sku_code}
                onChange={(e) => setFormData({ ...formData, sku_code: e.target.value })}
                placeholder="e.g., WGT-001"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!formData.sku_name.trim() || createProduct.isPending || updateProduct.isPending}
            >
              {createProduct.isPending || updateProduct.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
