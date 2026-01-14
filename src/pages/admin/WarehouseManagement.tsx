import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { 
  useWarehouses, 
  useWarehouseStats, 
  useCreateWarehouse, 
  useUpdateWarehouse,
  useBackfillWarehouses,
  WarehouseWithOwner 
} from '@/hooks/useWarehouses';
import { Search, Plus, Pencil, Warehouse as WarehouseIcon, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import type { WarehouseType } from '@/types/database';
import { Navigate } from 'react-router-dom';

export default function WarehouseManagement() {
  const { role } = useAuth();
  const { data: warehouses, isLoading } = useWarehouses();
  const { data: stats, isLoading: statsLoading } = useWarehouseStats();
  const { data: users } = useUsers();
  const createWarehouse = useCreateWarehouse();
  const updateWarehouse = useUpdateWarehouse();
  const backfillWarehouses = useBackfillWarehouses();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'SALESPERSON' | 'RUNNER' | 'MANAGER'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseWithOwner | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<WarehouseType>('SALESPERSON');
  const [formOwner, setFormOwner] = useState('');
  const [formActive, setFormActive] = useState(true);

  // Admin-only access
  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const filteredWarehouses = useMemo(() => {
    if (!warehouses) return [];
    
    return warehouses.filter(wh => {
      const matchesSearch = 
        wh.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wh.owner?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wh.owner?.email?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = 
        statusFilter === 'all' || 
        (statusFilter === 'active' && wh.is_active) ||
        (statusFilter === 'inactive' && !wh.is_active);
      
      const matchesType =
        typeFilter === 'all' || wh.warehouse_type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [warehouses, searchQuery, statusFilter, typeFilter]);

  const openCreateDialog = () => {
    setEditingWarehouse(null);
    setFormName('');
    setFormType('SALESPERSON');
    setFormOwner('');
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEditDialog = (wh: WarehouseWithOwner) => {
    setEditingWarehouse(wh);
    setFormName(wh.name);
    setFormType(wh.warehouse_type);
    setFormOwner(wh.owner_user_id);
    setFormActive(wh.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formOwner) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (editingWarehouse) {
      await updateWarehouse.mutateAsync({
        id: editingWarehouse.id,
        name: formName,
        owner_user_id: formOwner,
        is_active: formActive,
      });
    } else {
      await createWarehouse.mutateAsync({
        name: formName,
        warehouse_type: formType,
        owner_user_id: formOwner,
        is_active: formActive,
      });
    }
    setDialogOpen(false);
  };

  const handleBackfill = async () => {
    await backfillWarehouses.mutateAsync();
  };

  const eligibleOwners = useMemo(() => {
    if (!users) return [];
    if (editingWarehouse) {
      // When editing, allow changing to any user of matching role
      return users.filter(u => 
        (formType === 'SALESPERSON' && u.role === 'salesperson') ||
        (formType === 'RUNNER' && u.role === 'runner') ||
        (formType === 'MANAGER' && u.role === 'manager')
      );
    }
    // For new warehouses, filter by type
    return users.filter(u => 
      (formType === 'SALESPERSON' && u.role === 'salesperson') ||
      (formType === 'RUNNER' && u.role === 'runner') ||
      (formType === 'MANAGER' && u.role === 'manager')
    );
  }, [users, formType, editingWarehouse]);

  const columns = [
    {
      key: 'name',
      header: 'Warehouse Name',
      sortable: true,
      render: (wh: WarehouseWithOwner) => (
        <div className="flex items-center gap-2">
          <WarehouseIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{wh.name}</span>
        </div>
      ),
    },
    {
      key: 'warehouse_type',
      header: 'Type',
      sortable: true,
      render: (wh: WarehouseWithOwner) => (
        <Badge variant="secondary" className="capitalize">
          {wh.warehouse_type.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      sortable: true,
      render: (wh: WarehouseWithOwner) => (
        <div>
          <div className="font-medium">{wh.owner?.display_name || 'Unknown'}</div>
          <div className="text-xs text-muted-foreground">{wh.owner?.email}</div>
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      render: (wh: WarehouseWithOwner) => (
        <Badge variant={wh.is_active ? 'default' : 'outline'}>
          {wh.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (wh: WarehouseWithOwner) => format(new Date(wh.created_at), 'dd MMM yyyy'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (wh: WarehouseWithOwner) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openEditDialog(wh)}
        >
          <Pencil className="h-4 w-4 mr-1" />
          Edit
        </Button>
      ),
    },
  ];

  const totalMissing = (stats?.salespersonsMissing.length || 0) + (stats?.runnersMissing.length || 0) + (stats?.managersMissing?.length || 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Warehouse Management</h1>
            <p className="text-muted-foreground">Manage all warehouses in the system</p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Create Warehouse
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Warehouses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{stats?.totalWarehouses || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Salespersons
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    {stats?.salespersonsWithWarehouse} / {stats?.totalSalespersons}
                  </span>
                  {stats?.salespersonsMissing.length === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Runners
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    {stats?.runnersWithWarehouse} / {stats?.totalRunners}
                  </span>
                  {stats?.runnersMissing.length === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Managers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    {stats?.managersWithWarehouse || 0} / {stats?.totalManagers || 0}
                  </span>
                  {(stats?.managersMissing?.length || 0) === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Missing Warehouses
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <span className="text-2xl font-bold text-destructive">
                    {totalMissing}
                  </span>
                  {totalMissing > 0 && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleBackfill}
                      disabled={backfillWarehouses.isPending}
                    >
                      {backfillWarehouses.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Backfill
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Missing Users Warning */}
        {!statsLoading && totalMissing > 0 && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-5 w-5" />
                Users Without Warehouses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats?.salespersonsMissing && stats.salespersonsMissing.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Salespersons ({stats.salespersonsMissing.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {stats.salespersonsMissing.map(sp => (
                      <Badge key={sp.id} variant="outline" className="text-xs">
                        {sp.display_name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {stats?.runnersMissing && stats.runnersMissing.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Runners ({stats.runnersMissing.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {stats.runnersMissing.map(r => (
                      <Badge key={r.id} variant="outline" className="text-xs">
                        {r.display_name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {stats?.managersMissing && stats.managersMissing.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Managers ({stats.managersMissing.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {stats.managersMissing.map(m => (
                      <Badge key={m.id} variant="outline" className="text-xs">
                        {m.display_name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="SALESPERSON">Salesperson</SelectItem>
              <SelectItem value="RUNNER">Runner</SelectItem>
              <SelectItem value="MANAGER">Manager</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <DataGrid
          data={filteredWarehouses}
          columns={columns}
          loading={isLoading}
          keyField="id"
        />

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingWarehouse ? 'Edit Warehouse' : 'Create Warehouse'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Warehouse Name *</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Enter warehouse name"
                />
              </div>

              {!editingWarehouse && (
                <div className="space-y-2">
                  <Label htmlFor="type">Warehouse Type *</Label>
                  <Select value={formType} onValueChange={(v) => setFormType(v as WarehouseType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALESPERSON">Salesperson</SelectItem>
                      <SelectItem value="RUNNER">Runner</SelectItem>
                      <SelectItem value="MANAGER">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="owner">Owner *</Label>
                <Select value={formOwner} onValueChange={setFormOwner}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleOwners.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.display_name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="active">Active Status</Label>
                <Switch
                  id="active"
                  checked={formActive}
                  onCheckedChange={setFormActive}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                disabled={createWarehouse.isPending || updateWarehouse.isPending}
              >
                {editingWarehouse ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
