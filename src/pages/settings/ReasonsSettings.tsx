import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  useReasons,
  useCreateReason,
  useUpdateReason,
  useDeleteReason,
  type ReasonType,
  type Reason,
} from '@/hooks/useReasons';
import { Plus, Settings, Trash2, Pencil } from 'lucide-react';
import { format } from 'date-fns';

export default function ReasonsSettings() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [activeTab, setActiveTab] = useState<ReasonType>('CANCEL');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<Reason | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newSortOrder, setNewSortOrder] = useState(0);

  // Fetch all reasons (including inactive for admin view)
  const { data: reasons, isLoading } = useReasons(activeTab, false);

  const createReason = useCreateReason();
  const updateReason = useUpdateReason();
  const deleteReason = useDeleteReason();

  const handleAddReason = async () => {
    if (!newLabel.trim()) return;

    await createReason.mutateAsync({
      reason_type: activeTab,
      label: newLabel.trim(),
      sort_order: newSortOrder,
    });

    setNewLabel('');
    setNewSortOrder(0);
    setAddDialogOpen(false);
  };

  const handleEditReason = async () => {
    if (!editingReason || !newLabel.trim()) return;

    await updateReason.mutateAsync({
      id: editingReason.id,
      label: newLabel.trim(),
      sort_order: newSortOrder,
    });

    setEditingReason(null);
    setNewLabel('');
    setNewSortOrder(0);
    setEditDialogOpen(false);
  };

  const handleToggleActive = async (reason: Reason) => {
    await updateReason.mutateAsync({
      id: reason.id,
      is_active: !reason.is_active,
    });
  };

  const handleOpenEdit = (reason: Reason) => {
    setEditingReason(reason);
    setNewLabel(reason.label);
    setNewSortOrder(reason.sort_order);
    setEditDialogOpen(true);
  };

  const handleDelete = async (reason: Reason) => {
    await deleteReason.mutateAsync(reason.id);
  };

  const columns: Column<Reason>[] = [
    {
      key: 'label',
      header: 'Label',
      sortable: true,
    },
    {
      key: 'sort_order',
      header: 'Sort Order',
      sortable: true,
    },
    {
      key: 'is_active',
      header: 'Active',
      render: (reason) => (
        <Switch
          checked={reason.is_active}
          onCheckedChange={() => isAdmin && handleToggleActive(reason)}
          disabled={!isAdmin || updateReason.isPending}
        />
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (reason) => format(new Date(reason.created_at), 'MMM d, yyyy'),
    },
  ];

  // Add actions column only for admin
  if (isAdmin) {
    columns.push({
      key: 'actions',
      header: 'Actions',
      render: (reason) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(reason);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(reason);
            }}
            disabled={deleteReason.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    });
  }

  const tabLabels: Record<ReasonType, string> = {
    CANCEL: 'Cancel Reasons',
    FAILED_DELIVERY: 'Failed Delivery Reasons',
    DISPUTE: 'Dispute Reasons',
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Reason Settings</h1>
              <p className="text-muted-foreground">
                Manage reasons for cancellations, failed deliveries, and disputes
              </p>
            </div>
          </div>

          {isAdmin && (
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Reason
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReasonType)}>
          <TabsList>
            <TabsTrigger value="CANCEL">Cancel Reasons</TabsTrigger>
            <TabsTrigger value="FAILED_DELIVERY">Failed Delivery</TabsTrigger>
            
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <DataGrid
              data={reasons || []}
              columns={columns}
              loading={isLoading}
              keyField="id"
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Reason Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {tabLabels[activeTab].replace('s', '')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Enter reason label..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddReason}
              disabled={!newLabel.trim() || createReason.isPending}
            >
              {createReason.isPending ? 'Adding...' : 'Add Reason'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Reason Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Reason</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editLabel">Label</Label>
              <Input
                id="editLabel"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Enter reason label..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSortOrder">Sort Order</Label>
              <Input
                id="editSortOrder"
                type="number"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditReason}
              disabled={!newLabel.trim() || updateReason.isPending}
            >
              {updateReason.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
