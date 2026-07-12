import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Edit2, Trash2, Eye, EyeOff, Package, ShoppingCart, Warehouse, ArrowDownToLine, Shield, History, Users, Truck, Receipt, ChevronDown, ChevronRight, UserPlus } from 'lucide-react';
import { useDataShares, useCreateDataShare, useUpdateDataShare, useDeleteDataShare, useAccessAuditLogs } from '@/hooks/useDataSharing';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import type { UserDataShare } from '@/types/data-sharing';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function DataSharingAdmin() {
  const { data: shares = [], isLoading } = useDataShares();
  const { data: auditLogs = [], isLoading: logsLoading } = useAccessAuditLogs();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingShare, setEditingShare] = useState<UserDataShare | null>(null);

  const activeShares = shares.filter(s => s.active);
  const inactiveShares = shares.filter(s => !s.active);
  const operableShares = shares.filter(s => s.can_operate && s.active);

  return (
      <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Data Sharing</h1>
          <p className="text-muted-foreground">
            Grant users permission to view and operate on other users' data
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Share
        </Button>
      </div>

      {/* Dashboard Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Shares</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{shares.length}</div>
            <p className="text-xs text-muted-foreground">
              All configured shares
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Eye className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeShares.length}</div>
            <p className="text-xs text-muted-foreground">
              Currently enabled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{inactiveShares.length}</div>
            <p className="text-xs text-muted-foreground">
              Disabled shares
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Can Operate</CardTitle>
            <Shield className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{operableShares.length}</div>
            <p className="text-xs text-muted-foreground">
              With write access
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="shares">
        <TabsList>
          <TabsTrigger value="shares" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Active Shares
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shares" className="mt-4">
          <SharesTable 
            shares={shares} 
            isLoading={isLoading} 
            onEdit={setEditingShare}
          />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogTable logs={auditLogs} isLoading={logsLoading} />
        </TabsContent>
      </Tabs>

      <CreateShareDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      
      {editingShare && (
        <EditShareDialog 
          share={editingShare} 
          open={!!editingShare} 
          onOpenChange={(open) => !open && setEditingShare(null)} 
        />
      )}
      </div>
  );
}

// Group shares by viewer_user_id
interface ViewerGroup {
  viewerId: string;
  viewerName: string;
  viewerRole: string;
  shares: UserDataShare[];
}

function ScopeBadges({ share }: { share: UserDataShare }) {
  return (
    <div className="flex flex-wrap gap-1">
      {share.scope_orders && (
        <Badge variant="secondary" className="text-xs">
          <ShoppingCart className="h-3 w-3 mr-1" />Orders
        </Badge>
      )}
      {share.scope_products && (
        <Badge variant="secondary" className="text-xs">
          <Package className="h-3 w-3 mr-1" />Products
        </Badge>
      )}
      {share.scope_stock_balance && (
        <Badge variant="secondary" className="text-xs">
          <Warehouse className="h-3 w-3 mr-1" />Stock
        </Badge>
      )}
      {share.scope_inbound && (
        <Badge variant="secondary" className="text-xs">
          <ArrowDownToLine className="h-3 w-3 mr-1" />Inbound
        </Badge>
      )}
      {share.scope_delivered_orders && (
        <Badge variant="secondary" className="text-xs">
          <Truck className="h-3 w-3 mr-1" />Delivered
        </Badge>
      )}
      {share.scope_claims && (
        <Badge variant="secondary" className="text-xs">
          <Receipt className="h-3 w-3 mr-1" />Claims
        </Badge>
      )}
    </div>
  );
}

function SharesTable({
  shares,
  isLoading,
  onEdit
}: {
  shares: UserDataShare[];
  isLoading: boolean;
  onEdit: (share: UserDataShare) => void;
}) {
  const updateShare = useUpdateDataShare();
  const deleteShare = useDeleteDataShare();
  const [expandedViewers, setExpandedViewers] = useState<Set<string>>(new Set());

  // Group shares by viewer
  const viewerGroups = useMemo<ViewerGroup[]>(() => {
    const map = new Map<string, ViewerGroup>();
    for (const share of shares) {
      const vid = share.viewer_user_id;
      if (!map.has(vid)) {
        map.set(vid, {
          viewerId: vid,
          viewerName: share.viewer?.display_name || 'Unknown',
          viewerRole: share.viewer?.role || '',
          shares: [],
        });
      }
      map.get(vid)!.shares.push(share);
    }
    // Sort groups by viewer name
    return Array.from(map.values()).sort((a, b) => a.viewerName.localeCompare(b.viewerName));
  }, [shares]);

  const toggleViewer = (viewerId: string) => {
    setExpandedViewers(prev => {
      const next = new Set(prev);
      if (next.has(viewerId)) next.delete(viewerId);
      else next.add(viewerId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (shares.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium">No data shares configured</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create a share to allow users to view each other's data
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {viewerGroups.map((group) => {
        const isExpanded = expandedViewers.has(group.viewerId);
        const activeCount = group.shares.filter(s => s.active).length;
        const operateCount = group.shares.filter(s => s.can_operate && s.active).length;

        return (
          <Card key={group.viewerId}>
            {/* Viewer header — click to expand/collapse */}
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors rounded-t-lg"
              onClick={() => toggleViewer(group.viewerId)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="text-left">
                  <div className="font-semibold text-sm">{group.viewerName}</div>
                  <div className="text-xs text-muted-foreground">{group.viewerRole}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {group.shares.length} {group.shares.length === 1 ? 'subject' : 'subjects'}
                </Badge>
                {activeCount > 0 && (
                  <Badge variant="default" className="text-xs">
                    {activeCount} active
                  </Badge>
                )}
                {operateCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    {operateCount} operate
                  </Badge>
                )}
              </div>
            </button>

            {/* Expanded: show subjects table */}
            {isExpanded && (
              <div className="border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-10">Subject</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Can Operate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.shares.map((share) => (
                      <TableRow key={share.id} className={cn(!share.active && 'opacity-50')}>
                        <TableCell className="pl-10">
                          <div>
                            <div className="font-medium text-sm">{share.subject?.display_name || 'Unknown'}</div>
                            <div className="text-xs text-muted-foreground">{share.subject?.role}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <ScopeBadges share={share} />
                        </TableCell>
                        <TableCell>
                          {share.can_operate ? (
                            <Badge variant="default" className="bg-green-600">
                              <Shield className="h-3 w-3 mr-1" />Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline">Read Only</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {share.active ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => onEdit(share)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => updateShare.mutate({ id: share.id, active: !share.active })}
                            >
                              {share.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm('Delete this share?')) {
                                  deleteShare.mutate(share.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function CreateShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: users = [] } = useUserDirectory();
  const { data: existingShares = [] } = useDataShares();
  const createShare = useCreateDataShare();

  const [viewerId, setViewerId] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [subjectSearch, setSubjectSearch] = useState('');
  const [scopeOrders, setScopeOrders] = useState(true);
  const [scopeProducts, setScopeProducts] = useState(true);
  const [scopeStock, setScopeStock] = useState(true);
  const [scopeInbound, setScopeInbound] = useState(false);
  const [scopeDeliveredOrders, setScopeDeliveredOrders] = useState(false);
  const [scopeClaims, setScopeClaims] = useState(false);
  const [canOperate, setCanOperate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const resetForm = () => {
    setViewerId('');
    setSelectedSubjects(new Set());
    setSubjectSearch('');
    setScopeOrders(true);
    setScopeProducts(true);
    setScopeStock(true);
    setScopeInbound(false);
    setScopeDeliveredOrders(false);
    setScopeClaims(false);
    setCanOperate(false);
  };

  // Subjects already shared with this viewer
  const existingSubjectIds = useMemo(() => {
    if (!viewerId) return new Set<string>();
    return new Set(existingShares.filter(s => s.viewer_user_id === viewerId).map(s => s.subject_user_id));
  }, [viewerId, existingShares]);

  const handleCreate = async () => {
    if (!viewerId || selectedSubjects.size === 0) return;
    setIsCreating(true);
    try {
      for (const subjectId of selectedSubjects) {
        await createShare.mutateAsync({
          viewer_user_id: viewerId,
          subject_user_id: subjectId,
          scope_orders: scopeOrders,
          scope_products: scopeProducts,
          scope_stock_balance: scopeStock,
          scope_inbound: scopeInbound,
          scope_delivered_orders: scopeDeliveredOrders,
          scope_claims: scopeClaims,
          can_operate: canOperate,
          active: true,
        });
      }
      resetForm();
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  const toggleSubject = (id: string) => {
    setSelectedSubjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const userOptions = users
    .filter(u => u.role !== 'admin')
    .map(u => ({
      value: u.id,
      label: `${u.display_name} (${u.role})`,
    }));

  // Available subjects: exclude the viewer and already-shared subjects
  const availableSubjects = users
    .filter(u => u.role !== 'admin' && u.id !== viewerId && !existingSubjectIds.has(u.id))
    .filter(u => {
      if (!subjectSearch) return true;
      const q = subjectSearch.toLowerCase();
      return u.display_name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
    });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Data Share</DialogTitle>
          <DialogDescription>
            Select a viewer and pick subjects whose data they can access
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Step 1: Pick Viewer */}
          <div className="space-y-2">
            <Label>Viewer (who can see)</Label>
            <SearchableSelect
              options={userOptions}
              value={viewerId}
              onValueChange={(v) => { setViewerId(v); setSelectedSubjects(new Set()); }}
              placeholder="Select viewer..."
            />
          </div>

          {/* Step 2: Pick Subjects (multi-select with checkboxes) */}
          {viewerId && (
            <div className="space-y-2">
              <Label>Subjects (whose data is shared)</Label>
              <Input
                placeholder="Search users..."
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="border rounded-lg max-h-[160px] overflow-y-auto">
                {availableSubjects.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    {existingSubjectIds.size > 0 ? 'All users already shared' : 'No users available'}
                  </div>
                ) : (
                  availableSubjects.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                    >
                      <Checkbox
                        checked={selectedSubjects.has(u.id)}
                        onCheckedChange={() => toggleSubject(u.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.display_name}</div>
                        <div className="text-xs text-muted-foreground">{u.role}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              {selectedSubjects.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedSubjects.size} {selectedSubjects.size === 1 ? 'subject' : 'subjects'} selected
                </p>
              )}
            </div>
          )}

          {/* Step 3: Scopes */}
          <div className="space-y-3">
            <Label>Scopes</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Orders</span>
                </div>
                <Switch checked={scopeOrders} onCheckedChange={setScopeOrders} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Products</span>
                </div>
                <Switch checked={scopeProducts} onCheckedChange={setScopeProducts} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Stock</span>
                </div>
                <Switch checked={scopeStock} onCheckedChange={setScopeStock} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Inbound</span>
                </div>
                <Switch checked={scopeInbound} onCheckedChange={setScopeInbound} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Delivered</span>
                </div>
                <Switch checked={scopeDeliveredOrders} onCheckedChange={setScopeDeliveredOrders} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Claims</span>
                </div>
                <Switch checked={scopeClaims} onCheckedChange={setScopeClaims} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Can Operate</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Allow viewer to perform actions on subject's data
              </p>
            </div>
            <Switch checked={canOperate} onCheckedChange={setCanOperate} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!viewerId || selectedSubjects.size === 0 || isCreating}
          >
            {isCreating ? 'Creating...' : `Create ${selectedSubjects.size > 1 ? `${selectedSubjects.size} Shares` : 'Share'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditShareDialog({ 
  share, 
  open, 
  onOpenChange 
}: { 
  share: UserDataShare; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const updateShare = useUpdateDataShare();
  
  const [scopeOrders, setScopeOrders] = useState(share.scope_orders);
  const [scopeProducts, setScopeProducts] = useState(share.scope_products);
  const [scopeStock, setScopeStock] = useState(share.scope_stock_balance);
  const [scopeInbound, setScopeInbound] = useState(share.scope_inbound);
  const [scopeDeliveredOrders, setScopeDeliveredOrders] = useState(share.scope_delivered_orders ?? false);
  const [scopeClaims, setScopeClaims] = useState(share.scope_claims ?? false);
  const [canOperate, setCanOperate] = useState(share.can_operate);
  const [active, setActive] = useState(share.active);

  const handleUpdate = async () => {
    await updateShare.mutateAsync({
      id: share.id,
      scope_orders: scopeOrders,
      scope_products: scopeProducts,
      scope_stock_balance: scopeStock,
      scope_inbound: scopeInbound,
      scope_delivered_orders: scopeDeliveredOrders,
      scope_claims: scopeClaims,
      can_operate: canOperate,
      active,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Data Share</DialogTitle>
          <DialogDescription>
            {share.viewer?.display_name} → {share.subject?.display_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <Label>Scopes</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Orders</span>
                </div>
                <Switch checked={scopeOrders} onCheckedChange={setScopeOrders} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Products</span>
                </div>
                <Switch checked={scopeProducts} onCheckedChange={setScopeProducts} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Stock</span>
                </div>
                <Switch checked={scopeStock} onCheckedChange={setScopeStock} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Inbound</span>
                </div>
                <Switch checked={scopeInbound} onCheckedChange={setScopeInbound} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Delivered</span>
                </div>
                <Switch checked={scopeDeliveredOrders} onCheckedChange={setScopeDeliveredOrders} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Claims</span>
                </div>
                <Switch checked={scopeClaims} onCheckedChange={setScopeClaims} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Can Operate</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Allow viewer to perform actions
              </p>
            </div>
            <Switch checked={canOperate} onCheckedChange={setCanOperate} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <span className="font-medium text-sm">Active</span>
              <p className="text-xs text-muted-foreground">
                Enable or disable this share
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpdate}
            disabled={updateShare.isPending}
          >
            {updateShare.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditLogTable({ logs, isLoading }: { logs: any[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium">No audit logs yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Activity will be logged when shares are created or modified
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Resource</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-sm text-muted-foreground">
                {format(new Date(log.created_at), 'dd MMM HH:mm')}
              </TableCell>
              <TableCell>{log.actor?.display_name || 'Unknown'}</TableCell>
              <TableCell>
                <Badge variant="outline">{log.action_type}</Badge>
              </TableCell>
              <TableCell>{log.subject?.display_name || '-'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {log.resource_type}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
