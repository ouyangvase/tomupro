import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { Label } from '@/components/ui/label';
import { useOrders, useUpdateOrder } from '@/hooks/useOrders';
import { useReasons } from '@/hooks/useReasons';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLogs';
import type { Order, ReconciliationStatus } from '@/types/database';
import { AlertTriangle, CheckCircle, MessageSquare } from 'lucide-react';

export default function DisputeCenter() {
  const { profile, role } = useAuth();
  const isAdmin = role === 'admin';

  // Filter based on role
  const { data: orders, isLoading } = useOrders({ 
    reconciliationStatus: 'DISPUTE' 
  });
  
  // Filter for salesperson to only see their own
  const filteredOrders = isAdmin || role === 'manager' 
    ? orders 
    : orders?.filter(o => o.salesperson_id === profile?.id);

  const updateOrder = useUpdateOrder();

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [newNotes, setNewNotes] = useState('');
  const [resolveTarget, setResolveTarget] = useState<ReconciliationStatus>('ADMIN_ACK_PENDING');

  const handleOpenResolve = (order: Order) => {
    setSelectedOrder(order);
    setResolveDialogOpen(true);
  };

  const handleOpenNotes = (order: Order) => {
    setSelectedOrder(order);
    setNewNotes(order.dispute_notes || '');
    setNotesDialogOpen(true);
  };

  const handleResolve = async () => {
    if (!selectedOrder) return;

    await logAudit({
      entity_type: 'order',
      entity_id: selectedOrder.id,
      action: 'DISPUTE_RESOLVED',
      before_json: { reconciliation_status: 'DISPUTE' },
      after_json: { reconciliation_status: resolveTarget },
    });

    await updateOrder.mutateAsync({
      id: selectedOrder.id,
      reconciliation_status: resolveTarget,
    });

    setSelectedOrder(null);
    setResolveDialogOpen(false);
  };

  const handleSaveNotes = async () => {
    if (!selectedOrder) return;

    await logAudit({
      entity_type: 'order',
      entity_id: selectedOrder.id,
      action: 'DISPUTE_NOTES_UPDATED',
      before_json: { dispute_notes: selectedOrder.dispute_notes },
      after_json: { dispute_notes: newNotes },
    });

    await updateOrder.mutateAsync({
      id: selectedOrder.id,
      dispute_notes: newNotes,
    });

    setSelectedOrder(null);
    setNotesDialogOpen(false);
  };

  const columns: Column<Order>[] = [
    {
      key: 'order_date',
      header: 'Date',
      sortable: true,
      render: (order) => new Date(order.order_date).toLocaleDateString(),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
    },
    {
      key: 'salesperson',
      header: 'Salesperson',
      render: (order) => order.salesperson?.display_name || '-',
    },
    {
      key: 'runner',
      header: 'Runner',
      render: (order) => order.runner?.display_name || '-',
    },
    {
      key: 'total_amount',
      header: 'Amount',
      sortable: true,
      render: (order) => order.total_amount.toLocaleString(),
    },
    {
      key: 'dispute_reason',
      header: 'Reason',
      render: (order) => order.dispute_reason || '-',
    },
    {
      key: 'dispute_notes',
      header: 'Notes',
      render: (order) => (
        <span className="text-sm truncate max-w-[200px] block">
          {order.dispute_notes || '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (order) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenNotes(order);
            }}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenResolve(order);
              }}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Resolve
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold">Dispute Center</h1>
            <p className="text-muted-foreground">Manage and resolve order disputes</p>
          </div>
        </div>

        <DataGrid
          data={filteredOrders || []}
          columns={columns}
          loading={isLoading}
          keyField="id"
        />
      </div>

      {/* Resolve Dialog (Admin only) */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Order</Label>
              <p className="text-sm text-muted-foreground">
                {selectedOrder?.customer_name} - {selectedOrder?.total_amount.toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Resolve To</Label>
              <Select 
                value={resolveTarget} 
                onValueChange={(v) => setResolveTarget(v as ReconciliationStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN_ACK_PENDING">Back to Admin Pending</SelectItem>
                  <SelectItem value="SETTLED">Settled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={updateOrder.isPending}>
              {updateOrder.isPending ? 'Resolving...' : 'Resolve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Notes</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Add notes about this dispute..."
              rows={6}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNotes} disabled={updateOrder.isPending}>
              {updateOrder.isPending ? 'Saving...' : 'Save Notes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
