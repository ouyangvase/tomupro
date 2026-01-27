import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Edit2, Trash2, Eye, EyeOff, Package, ShoppingCart, Warehouse, ArrowDownToLine, Shield, History, Users } from 'lucide-react';
import { useDataShares, useCreateDataShare, useUpdateDataShare, useDeleteDataShare, useAccessAuditLogs } from '@/hooks/useDataSharing';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import type { UserDataShare } from '@/types/data-sharing';
import { format } from 'date-fns';

export default function DataSharingAdmin() {
  const { data: shares = [], isLoading } = useDataShares();
  const { data: auditLogs = [], isLoading: logsLoading } = useAccessAuditLogs();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingShare, setEditingShare] = useState<UserDataShare | null>(null);

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
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Viewer</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Scopes</TableHead>
            <TableHead>Can Operate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shares.map((share) => (
            <TableRow key={share.id}>
              <TableCell>
                <div>
                  <div className="font-medium">{share.viewer?.display_name || 'Unknown'}</div>
                  <div className="text-xs text-muted-foreground">{share.viewer?.role}</div>
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{share.subject?.display_name || 'Unknown'}</div>
                  <div className="text-xs text-muted-foreground">{share.subject?.role}</div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {share.scope_orders && (
                    <Badge variant="secondary" className="text-xs">
                      <ShoppingCart className="h-3 w-3 mr-1" />
                      Orders
                    </Badge>
                  )}
                  {share.scope_products && (
                    <Badge variant="secondary" className="text-xs">
                      <Package className="h-3 w-3 mr-1" />
                      Products
                    </Badge>
                  )}
                  {share.scope_stock_balance && (
                    <Badge variant="secondary" className="text-xs">
                      <Warehouse className="h-3 w-3 mr-1" />
                      Stock
                    </Badge>
                  )}
                  {share.scope_inbound && (
                    <Badge variant="secondary" className="text-xs">
                      <ArrowDownToLine className="h-3 w-3 mr-1" />
                      Inbound
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {share.can_operate ? (
                  <Badge variant="default" className="bg-green-600">
                    <Shield className="h-3 w-3 mr-1" />
                    Yes
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
              <TableCell className="text-sm text-muted-foreground">
                {format(new Date(share.created_at), 'dd MMM yyyy')}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(share)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => updateShare.mutate({ 
                      id: share.id, 
                      active: !share.active 
                    })}
                  >
                    {share.active ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
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
    </Card>
  );
}

function CreateShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: users = [] } = useUserDirectory();
  const createShare = useCreateDataShare();
  
  const [viewerId, setViewerId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [scopeOrders, setScopeOrders] = useState(true);
  const [scopeProducts, setScopeProducts] = useState(true);
  const [scopeStock, setScopeStock] = useState(true);
  const [scopeInbound, setScopeInbound] = useState(false);
  const [canOperate, setCanOperate] = useState(false);

  const resetForm = () => {
    setViewerId('');
    setSubjectId('');
    setScopeOrders(true);
    setScopeProducts(true);
    setScopeStock(true);
    setScopeInbound(false);
    setCanOperate(false);
  };

  const handleCreate = async () => {
    await createShare.mutateAsync({
      viewer_user_id: viewerId,
      subject_user_id: subjectId,
      scope_orders: scopeOrders,
      scope_products: scopeProducts,
      scope_stock_balance: scopeStock,
      scope_inbound: scopeInbound,
      can_operate: canOperate,
      active: true,
    });
    resetForm();
    onOpenChange(false);
  };

  const userOptions = users
    .filter(u => u.role !== 'admin')
    .map(u => ({
      value: u.id,
      label: `${u.display_name} (${u.role})`,
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Data Share</DialogTitle>
          <DialogDescription>
            Grant a user permission to view another user's data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Viewer (who can see)</Label>
            <SearchableSelect
              options={userOptions.filter(o => o.value !== subjectId)}
              value={viewerId}
              onValueChange={setViewerId}
              placeholder="Select viewer..."
            />
          </div>

          <div className="space-y-2">
            <Label>Subject (whose data is shared)</Label>
            <SearchableSelect
              options={userOptions.filter(o => o.value !== viewerId)}
              value={subjectId}
              onValueChange={setSubjectId}
              placeholder="Select subject..."
            />
          </div>

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
            disabled={!viewerId || !subjectId || createShare.isPending}
          >
            {createShare.isPending ? 'Creating...' : 'Create Share'}
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
  const [canOperate, setCanOperate] = useState(share.can_operate);
  const [active, setActive] = useState(share.active);

  const handleUpdate = async () => {
    await updateShare.mutateAsync({
      id: share.id,
      scope_orders: scopeOrders,
      scope_products: scopeProducts,
      scope_stock_balance: scopeStock,
      scope_inbound: scopeInbound,
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
