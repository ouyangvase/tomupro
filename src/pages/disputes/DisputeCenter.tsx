import { useState, useCallback } from 'react';
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
import { useUpdateOrder } from '@/hooks/useOrders';
import { usePaginatedOrders } from '@/hooks/usePaginatedOrders';
import { useReasons } from '@/hooks/useReasons';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLogs';
import type { Order, ReconciliationStatus } from '@/types/database';
import { AlertTriangle, CheckCircle, MessageSquare } from 'lucide-react';

export default function DisputeCenter() {
  const { profile, role } = useAuth();
  const isAdmin = role === 'admin';
  const [serverSearch, setServerSearch] = useState('');

  // Server-side paginated query for disputed orders
  const { data: allOrders, isLoading, isFetching, pagination, setPage, setPageSize, refetch } = usePaginatedOrders({
    reconciliationStatus: 'DISPUTE' as any,
    salespersonId: (!isAdmin && role !== 'manager') ? profile?.id : undefined,
    searchQuery: serverSearch || undefined,
  }, 50);

  const handleSearchChange = useCallback((q: string) => setServerSearch(q), []);

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

  const handleResolve = () => {
    if (!selectedOrder) return;
    logAudit({
      entity_type: 'order',
      entity_id: selectedOrder.id,
      action: 'DISPUTE_RESOLVED',
      before_json: { reconciliation_status: 'DISPUTE' },
      after_json: { reconciliation_status: resolveTarget },
    });
    
    updateOrder.mutate(
      { id: selectedOrder.id, updates: { reconciliation_status: resolveTarget } },
      {
        onSuccess: () => {
          setResolveDialogOpen(false);
          setSelectedOrder(null);
          refetch();
        },
      }
    );
  };

  const handleUpdateNotes = () => {
    if (!selectedOrder) return;
    updateOrder.mutate(
      { id: selectedOrder.id, updates: { dispute_notes: newNotes } },
      {
        onSuccess: () => {
          setNotesDialogOpen(false);
          setSelectedOrder(null);
          refetch();
        },
      }
    );
  };

  const columns: Column<Order>[] = [
    {
      key: 'order_code',
      header: 'Order',
      sortable: true,
      render: (order) => <span className="font-mono text-sm">{order.order_code}</span>,
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      render: (order) => order.customer_name || '-',
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
      render: (order) => <span className="font-medium">${Number(order.total_amount).toFixed(2)}</span>,
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
        <div className="flex gap-2">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleOpenResolve(order); }}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Resolve
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleOpenNotes(order); }}>
            <MessageSquare className="h-4 w-4 mr-1" />
            Notes
          </Button>
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
            <p className="text-muted-foreground">
              {pagination.totalCount} disputed order{pagination.totalCount !== 1 ? 's' : ''} to review
            </p>
          </div>
        </div>

        <DataGrid
          data={allOrders || []}
          columns={columns}
          loading={isLoading}
          keyField="id"
          onSearchChange={handleSearchChange}
          emptyMessage="No disputes found"
          serverPagination={{
            enabled: true,
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalCount: pagination.totalCount,
            totalPages: pagination.totalPages,
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
            isFetching,
          }}
        />
      </div>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Order: <span className="font-mono font-medium">{selectedOrder?.order_code}</span></p>
            <div>
              <Label>Resolve to status</Label>
              <Select value={resolveTarget} onValueChange={(v) => setResolveTarget(v as ReconciliationStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN_ACK_PENDING">Back to Pending</SelectItem>
                  <SelectItem value="CLAIMED">Approve Claim</SelectItem>
                  <SelectItem value="NOT_CLAIMED">Reject (Reset)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={updateOrder.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Notes</DialogTitle>
          </DialogHeader>
          <Textarea 
            value={newNotes} 
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Add or update dispute notes..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotesDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateNotes} disabled={updateOrder.isPending}>Save Notes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
