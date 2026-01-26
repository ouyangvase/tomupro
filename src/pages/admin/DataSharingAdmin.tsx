import { useState } from "react";
import { ResponsiveLayout } from "@/components/layout/ResponsiveLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Edit2, Share2, ShieldCheck, Eye, Package, Warehouse, Inbox } from "lucide-react";
import { useAllDataShares, DataShare } from "@/hooks/useDataShares";
import { useCreateDataShare, useUpdateDataShare, useDeleteDataShare, useToggleDataShareActive } from "@/hooks/useDataShareMutations";
import { useUserDirectory } from "@/hooks/useUserDirectory";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-destructive/20 text-destructive',
  manager: 'bg-primary/20 text-primary',
  salesperson: 'bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))]',
  runner: 'bg-[hsl(var(--status-warning))]/20 text-[hsl(var(--status-warning))]',
  driver: 'bg-secondary text-secondary-foreground',
};

export default function DataSharingAdmin() {
  const { role } = useAuth();
  const { data: shares = [], isLoading } = useAllDataShares();
  const { data: users = [] } = useUserDirectory();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editShare, setEditShare] = useState<DataShare | null>(null);
  const [deleteShareId, setDeleteShareId] = useState<string | null>(null);
  
  // Filter out admins from user selection
  const selectableUsers = users.filter(u => u.role !== 'admin');
  
  if (role !== 'admin') {
    return (
      <ResponsiveLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access denied. Admin only.</p>
        </div>
      </ResponsiveLayout>
    );
  }
  
  return (
    <ResponsiveLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Share2 className="h-6 w-6 text-primary" />
              Data Sharing
            </h1>
            <p className="text-muted-foreground">
              Grant users access to view other users' data
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Share
              </Button>
            </DialogTrigger>
            <CreateShareDialog 
              users={selectableUsers} 
              onClose={() => setCreateDialogOpen(false)} 
            />
          </Dialog>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Active Shares</CardTitle>
            <CardDescription>
              Manage data visibility permissions between users
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : shares.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Share2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No data shares configured</p>
                <p className="text-sm">Create a share to allow users to view each other's data</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Viewer</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead>Can Operate</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shares.map(share => (
                    <ShareRow 
                      key={share.id} 
                      share={share} 
                      onEdit={() => setEditShare(share)}
                      onDelete={() => setDeleteShareId(share.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        
        {/* Edit Dialog */}
        {editShare && (
          <EditShareDialog 
            share={editShare} 
            onClose={() => setEditShare(null)} 
          />
        )}
        
        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteShareId} onOpenChange={() => setDeleteShareId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Data Share?</AlertDialogTitle>
              <AlertDialogDescription>
                This will immediately revoke the viewer's access to the subject's data. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <DeleteShareButton 
                shareId={deleteShareId!} 
                onComplete={() => setDeleteShareId(null)} 
              />
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ResponsiveLayout>
  );
}

function ShareRow({ 
  share, 
  onEdit, 
  onDelete 
}: { 
  share: DataShare; 
  onEdit: () => void;
  onDelete: () => void;
}) {
  const toggleActive = useToggleDataShareActive();
  
  const scopes = [
    share.scope_orders && { icon: ShieldCheck, label: 'Orders' },
    share.scope_products && { icon: Package, label: 'Products' },
    share.scope_stock_balance && { icon: Warehouse, label: 'Stock' },
    share.scope_inbound && { icon: Inbox, label: 'Inbound' },
  ].filter(Boolean) as { icon: typeof Eye; label: string }[];
  
  return (
    <TableRow className={!share.active ? 'opacity-50' : ''}>
      <TableCell>
        <div>
          <div className="font-medium">{share.viewer?.display_name || 'Unknown'}</div>
          <div className="text-xs text-muted-foreground">{share.viewer?.email}</div>
          <Badge variant="outline" className={ROLE_COLORS[share.viewer?.role || ''] || ''}>
            {share.viewer?.role}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <div>
          <div className="font-medium">{share.subject?.display_name || 'Unknown'}</div>
          <div className="text-xs text-muted-foreground">{share.subject?.email}</div>
          <Badge variant="outline" className={ROLE_COLORS[share.subject?.role || ''] || ''}>
            {share.subject?.role}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {scopes.map(s => (
            <Badge key={s.label} variant="secondary" className="text-xs">
              <s.icon className="h-3 w-3 mr-1" />
              {s.label}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={share.can_operate ? 'default' : 'outline'}>
          {share.can_operate ? 'Yes' : 'Read Only'}
        </Badge>
      </TableCell>
      <TableCell>
        <Switch 
          checked={share.active}
          onCheckedChange={(checked) => toggleActive.mutate({ id: share.id, active: checked })}
          disabled={toggleActive.isPending}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {format(new Date(share.created_at), 'MMM d, yyyy')}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CreateShareDialog({ 
  users, 
  onClose 
}: { 
  users: Array<{ id: string; display_name: string; email: string | null; role: string }>;
  onClose: () => void;
}) {
  const createShare = useCreateDataShare();
  
  const [viewerId, setViewerId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [scopeOrders, setScopeOrders] = useState(true);
  const [scopeProducts, setScopeProducts] = useState(true);
  const [scopeStockBalance, setScopeStockBalance] = useState(true);
  const [scopeInbound, setScopeInbound] = useState(false);
  const [canOperate, setCanOperate] = useState(false);
  
  const userOptions = users.map(u => ({
    value: u.id,
    label: `${u.display_name} (${u.role})`,
    searchLabel: `${u.display_name} ${u.email || ''} ${u.role}`,
  }));
  
  const handleSubmit = () => {
    if (!viewerId || !subjectId) return;
    
    createShare.mutate({
      viewer_user_id: viewerId,
      subject_user_id: subjectId,
      scope_orders: scopeOrders,
      scope_products: scopeProducts,
      scope_stock_balance: scopeStockBalance,
      scope_inbound: scopeInbound,
      can_operate: canOperate,
    }, {
      onSuccess: onClose,
    });
  };
  
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Create Data Share</DialogTitle>
        <DialogDescription>
          Grant a user permission to view another user's data
        </DialogDescription>
      </DialogHeader>
      
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Viewer (who gets access)</Label>
          <SearchableSelect
            options={userOptions.filter(o => o.value !== subjectId)}
            value={viewerId}
            onValueChange={setViewerId}
            placeholder="Select viewer..."
            allOption={{ label: 'Select viewer...', value: '' }}
          />
        </div>
        
        <div className="space-y-2">
          <Label>Subject (whose data is shared)</Label>
          <SearchableSelect
            options={userOptions.filter(o => o.value !== viewerId)}
            value={subjectId}
            onValueChange={setSubjectId}
            placeholder="Select subject..."
            allOption={{ label: 'Select subject...', value: '' }}
          />
        </div>
        
        <div className="space-y-3 pt-2">
          <Label className="text-muted-foreground">Data Scopes</Label>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="scope-orders" className="font-normal">Orders</Label>
            <Switch id="scope-orders" checked={scopeOrders} onCheckedChange={setScopeOrders} />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="scope-products" className="font-normal">Products</Label>
            <Switch id="scope-products" checked={scopeProducts} onCheckedChange={setScopeProducts} />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="scope-stock" className="font-normal">Stock Balance</Label>
            <Switch id="scope-stock" checked={scopeStockBalance} onCheckedChange={setScopeStockBalance} />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="scope-inbound" className="font-normal">Inbound</Label>
            <Switch id="scope-inbound" checked={scopeInbound} onCheckedChange={setScopeInbound} />
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <Label htmlFor="can-operate" className="font-normal">Can Operate</Label>
            <p className="text-xs text-muted-foreground">Allow viewer to perform actions on subject's data</p>
          </div>
          <Switch id="can-operate" checked={canOperate} onCheckedChange={setCanOperate} />
        </div>
      </div>
      
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          disabled={!viewerId || !subjectId || viewerId === subjectId || createShare.isPending}
        >
          {createShare.isPending ? 'Creating...' : 'Create Share'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditShareDialog({ 
  share, 
  onClose 
}: { 
  share: DataShare;
  onClose: () => void;
}) {
  const updateShare = useUpdateDataShare();
  
  const [scopeOrders, setScopeOrders] = useState(share.scope_orders);
  const [scopeProducts, setScopeProducts] = useState(share.scope_products);
  const [scopeStockBalance, setScopeStockBalance] = useState(share.scope_stock_balance);
  const [scopeInbound, setScopeInbound] = useState(share.scope_inbound);
  const [canOperate, setCanOperate] = useState(share.can_operate);
  
  const handleSubmit = () => {
    updateShare.mutate({
      id: share.id,
      scope_orders: scopeOrders,
      scope_products: scopeProducts,
      scope_stock_balance: scopeStockBalance,
      scope_inbound: scopeInbound,
      can_operate: canOperate,
    }, {
      onSuccess: onClose,
    });
  };
  
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Data Share</DialogTitle>
          <DialogDescription>
            {share.viewer?.display_name} → {share.subject?.display_name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <Label className="text-muted-foreground">Data Scopes</Label>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-scope-orders" className="font-normal">Orders</Label>
              <Switch id="edit-scope-orders" checked={scopeOrders} onCheckedChange={setScopeOrders} />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-scope-products" className="font-normal">Products</Label>
              <Switch id="edit-scope-products" checked={scopeProducts} onCheckedChange={setScopeProducts} />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-scope-stock" className="font-normal">Stock Balance</Label>
              <Switch id="edit-scope-stock" checked={scopeStockBalance} onCheckedChange={setScopeStockBalance} />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-scope-inbound" className="font-normal">Inbound</Label>
              <Switch id="edit-scope-inbound" checked={scopeInbound} onCheckedChange={setScopeInbound} />
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <Label htmlFor="edit-can-operate" className="font-normal">Can Operate</Label>
              <p className="text-xs text-muted-foreground">Allow viewer to perform actions</p>
            </div>
            <Switch id="edit-can-operate" checked={canOperate} onCheckedChange={setCanOperate} />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updateShare.isPending}>
            {updateShare.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteShareButton({ 
  shareId, 
  onComplete 
}: { 
  shareId: string;
  onComplete: () => void;
}) {
  const deleteShare = useDeleteDataShare();
  
  return (
    <AlertDialogAction 
      onClick={() => {
        deleteShare.mutate(shareId, {
          onSuccess: onComplete,
        });
      }}
      disabled={deleteShare.isPending}
      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
    >
      {deleteShare.isPending ? 'Deleting...' : 'Delete'}
    </AlertDialogAction>
  );
}
