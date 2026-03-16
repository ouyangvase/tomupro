import { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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
import { useBulkUpdateOrders } from '@/hooks/useOrders';
import { usePaginatedOrders } from '@/hooks/usePaginatedOrders';
import { useClaimsByOrders } from '@/hooks/useClaims';
import { useReasons } from '@/hooks/useReasons';
import { logAudit } from '@/hooks/useAuditLogs';
import { formatBND } from '@/lib/currency';
import type { Order, Claim } from '@/types/database';
import { CheckCircle, AlertTriangle, Shield, Users } from 'lucide-react';

export default function ReconciliationAdmin() {
  const [serverSearch, setServerSearch] = useState('');
  
  const { data: orders, isLoading, isFetching, pagination, setPage, setPageSize, refetch } = usePaginatedOrders({
    reconciliationStatus: 'ADMIN_ACK_PENDING' as any,
    searchQuery: serverSearch || undefined,
  }, 50);

  const handleSearchChange = useCallback((q: string) => setServerSearch(q), []);
  
  const orderIds = useMemo(() => orders?.map(o => o.id) || [], [orders]);
  const { data: claims } = useClaimsByOrders(orderIds);
  const bulkUpdate = useBulkUpdateOrders();

  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  // Group by salesperson
  const groupedBySP = useMemo(() => {
    if (!orders) return [];
    
    const groups: Record<string, { salesperson: Order['salesperson']; orders: Order[]; totalClaimed: number }> = {};
    
    orders.forEach(order => {
      const spId = order.salesperson_id;
      if (!groups[spId]) {
        groups[spId] = { salesperson: order.salesperson, orders: [], totalClaimed: 0 };
      }
      groups[spId].orders.push(order);
      
      const orderClaims = claims?.filter(c => c.order_id === order.id) || [];
      groups[spId].totalClaimed += orderClaims.reduce((sum, c) => sum + c.amount, 0);
    });
    
    return Object.values(groups).sort((a, b) => b.orders.length - a.orders.length);
  }, [orders, claims]);

  const handleApprove = () => {
    if (selectedOrders.length === 0) return;
    
    selectedOrders.forEach(id => {
      logAudit({
        entity_type: 'order',
        entity_id: id,
        action: 'RECONCILIATION_APPROVED',
        before_json: { reconciliation_status: 'ADMIN_ACK_PENDING' },
        after_json: { reconciliation_status: 'CLAIMED' },
      });
    });

    bulkUpdate.mutate(
      {
        ids: selectedOrders,
        updates: { reconciliation_status: 'CLAIMED' as any },
      },
      {
        onSuccess: () => {
          setSelectedOrders([]);
          refetch();
        },
      }
    );
  };

  const handleDispute = () => {
    if (selectedOrders.length === 0) return;
    
    selectedOrders.forEach(id => {
      logAudit({
        entity_type: 'order',
        entity_id: id,
        action: 'RECONCILIATION_DISPUTED',
        before_json: { reconciliation_status: 'ADMIN_ACK_PENDING' },
        after_json: { reconciliation_status: 'DISPUTE', dispute_reason: disputeReason, dispute_notes: disputeNotes },
      });
    });

    bulkUpdate.mutate(
      {
        ids: selectedOrders,
        updates: { 
          reconciliation_status: 'DISPUTE' as any,
          dispute_reason: disputeReason,
          dispute_notes: disputeNotes,
        },
      },
      {
        onSuccess: () => {
          setSelectedOrders([]);
          setDisputeDialogOpen(false);
          setDisputeReason('');
          setDisputeNotes('');
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
      header: 'Order Amt',
      sortable: true,
      render: (order) => <span className="font-medium">{formatBND(order.total_amount)}</span>,
    },
    {
      key: 'claimed_amount',
      header: 'Claimed',
      render: (order) => {
        const orderClaims = claims?.filter(c => c.order_id === order.id) || [];
        const total = orderClaims.reduce((sum, c) => sum + c.amount, 0);
        return <span className="font-medium text-primary">{formatBND(total)}</span>;
      },
    },
    {
      key: 'payment_method',
      header: 'Payment',
      render: (order) => order.payment_method,
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Reconciliation</h1>
            <p className="text-muted-foreground">Review and approve pending claims</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--status-warning))]" />
              <div>
                <p className="text-2xl font-bold">{pagination.totalCount}</p>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{groupedBySP.length}</p>
                <p className="text-xs text-muted-foreground">Salespersons</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-[hsl(var(--status-success))]" />
              <div>
                <p className="text-2xl font-bold">
                  {formatBND(
                    claims?.reduce((sum, c) => sum + c.amount, 0) || 0
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Total Claimed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <DataGrid
          data={orders || []}
          columns={columns}
          loading={isLoading}
          keyField="id"
          selectable
          selectedRows={selectedOrders}
          onSelectionChange={setSelectedOrders}
          onSearchChange={handleSearchChange}
          emptyMessage="No pending reconciliation items"
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
          bulkActions={
            selectedOrders.length > 0 ? (
              <div className="flex gap-2">
                <Button 
                  onClick={handleApprove} 
                  disabled={bulkUpdate.isPending}
                  size="sm"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve ({selectedOrders.length})
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setDisputeDialogOpen(true)}
                  disabled={bulkUpdate.isPending}
                  size="sm"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Dispute ({selectedOrders.length})
                </Button>
              </div>
            ) : undefined
          }
        />
      </div>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Orders</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason</Label>
              <Select value={disputeReason} onValueChange={setDisputeReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {disputeReasons?.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea 
                value={disputeNotes} 
                onChange={(e) => setDisputeNotes(e.target.value)}
                placeholder="Add notes about the dispute..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisputeDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDispute} disabled={!disputeReason}>
              Confirm Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
