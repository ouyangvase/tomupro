import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts, useCreateProduct, useUpdateProduct, useBulkUpdateProducts } from '@/hooks/useProducts';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { TeamViewToggle, useTeamViewState } from '@/components/filters/TeamViewToggle';
import { useVisibleUserIds } from '@/hooks/useTeamVisibility';
import { Package, Plus, Edit, CheckCircle, XCircle } from 'lucide-react';
import type { Product } from '@/types/database';

export default function ProductsPage() {
  const { profile, role } = useAuth();
  const { data: userDirectory = [] } = useUserDirectory();
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data: products, isLoading } = useProducts(includeInactive);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const bulkUpdateProducts = useBulkUpdateProducts();
  
  // Team view state for managers
  const { viewMode, setViewMode, selectedMember, setSelectedMember, isManager } = useTeamViewState('my');
  const { visibleUserIds } = useVisibleUserIds();

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ sku_name: '', sku_code: '' });

  const canEdit = role === 'admin' || role === 'salesperson' || role === 'manager';

  // Build owner filter options based on role
  const ownerOptions = useMemo(() => {
    if (role === 'admin') {
      // Admin: show all users who have products
      const ownerIds = new Set(products?.map(p => p.owner_user_id).filter(Boolean) || []);
      return userDirectory
        .filter(u => ownerIds.has(u.id))
        .map(u => ({ id: u.id, name: u.display_name, role: u.role }));
    }
    if (role === 'manager' && visibleUserIds) {
      // Manager: only show self + team members
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

  // Filter products by search, owner, and team view mode
  const filteredProducts = useMemo(() => {
    let filtered = products || [];
    
    // Apply team view mode filtering for managers
    if (isManager && viewMode === 'my') {
      filtered = filtered.filter(p => p.owner_user_id === profile?.id);
    } else if (isManager && viewMode === 'team' && selectedMember !== 'all') {
      filtered = filtered.filter(p => p.owner_user_id === selectedMember);
    }
    
    // Apply owner filter
    if (ownerFilter !== 'all') {
      filtered = filtered.filter(p => p.owner_user_id === ownerFilter);
    }
    
    // Apply search filter
    const q = searchQuery.toLowerCase();
    if (q) {
      filtered = filtered.filter(p =>
        p.sku_name.toLowerCase().includes(q) ||
        (p.sku_code || '').toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [products, searchQuery, ownerFilter, isManager, viewMode, selectedMember, profile?.id]);

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
    await updateProduct.mutateAsync({
      id: product.id,
      is_active: !product.is_active,
    });
  };

  const handleBulkActivate = async () => {
    await bulkUpdateProducts.mutateAsync({
      ids: selectedRows,
      updates: { is_active: true },
    });
    setSelectedRows([]);
  };

  const handleBulkDeactivate = async () => {
    await bulkUpdateProducts.mutateAsync({
      ids: selectedRows,
      updates: { is_active: false },
    });
    setSelectedRows([]);
  };

  const columns: Column<Product & { creator?: { display_name: string } }>[] = [
    {
      key: 'sku_name',
      header: 'Product Name',
      sortable: true,
    },
    {
      key: 'sku_code',
      header: 'SKU Code',
      sortable: true,
      render: (p) => p.sku_code || '-',
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      render: (p) => (
        <Badge variant={p.is_active ? 'default' : 'secondary'}>
          {p.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'creator',
      header: 'Created By',
      render: (p) => p.creator?.display_name || '-',
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (p) => new Date(p.created_at).toLocaleDateString(),
    },
    ...(canEdit
      ? [
          {
            key: 'actions' as const,
            header: 'Actions',
            render: (p: Product) => (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(p)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggleActive(p)}
                >
                  {p.is_active ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  )}
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Products</h1>
              <p className="text-muted-foreground">Manage your product catalog</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <TeamViewToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              selectedMember={selectedMember}
              onMemberChange={setSelectedMember}
            />
            {canEdit && (
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <Input
            placeholder="Search by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
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
          
          {/* Owner filter - for admin/manager */}
          {(role === 'admin' || role === 'manager') && ownerOptions.length > 0 && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {ownerOptions.map(opt => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.name}
                    {opt.role === 'manager' && <Badge variant="secondary" className="ml-2 text-xs">Manager</Badge>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {canEdit && selectedRows.length > 0 && (
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={handleBulkActivate}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Activate ({selectedRows.length})
              </Button>
              <Button size="sm" variant="outline" onClick={handleBulkDeactivate}>
                <XCircle className="h-4 w-4 mr-1" />
                Deactivate ({selectedRows.length})
              </Button>
            </div>
          )}
        </div>

        <DataGrid
          data={filteredProducts}
          columns={columns}
          loading={isLoading}
          keyField="id"
          selectable={canEdit}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
        />
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </DialogTitle>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
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
