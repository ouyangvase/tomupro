import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useOrders, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useClaimsByOrders } from '@/hooks/useClaims';
import { logAudit } from '@/hooks/useAuditLogs';
import type { Order, Claim } from '@/types/database';
import { CheckCircle, AlertTriangle, Shield, Users } from 'lucide-react';

export default function ReconciliationAdmin() {
  const { data: orders, isLoading } = useOrders({ 
    reconciliationStatus: 'ADMIN_ACK_PENDING' 
  });
  const orderIds = useMemo(() => orders?.map(o => o.id) || [], [orders]);
  const { data: claims } = useClaimsByOrders(orderIds);
  const bulkUpdate = useBulkUpdateOrders();

  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeNotes, setDisputeNotes] = useState('');

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
    
    return Object.values(groups);
  }, [orders, claims]);

  const handleSettle = async () => {
    if (selectedOrders.length === 0) return;

    for (const orderId of selectedOrders) {
      await logAudit({
        entity_type: 'order',
        entity_id: orderId,
        action: 'ADMIN_SETTLED',
        before_json: { reconciliation_status: 'ADMIN_ACK_PENDING' },
        after_json: { reconciliation_status: 'SETTLED' },
      });
    }

    await bulkUpdate.mutateAsync({
      ids: selectedOrders,
      updates: { reconciliation_status: 'SETTLED' },
    });
    setSelectedOrders([]);
  };

  const handleDispute = async () => {
    if (selectedOrders.length === 0) return;

    for (const orderId of selectedOrders) {
      await logAudit({
        entity_type: 'order',
        entity_id: orderId,
        action: 'ADMIN_DISPUTED',
        before_json: { reconciliation_status: 'ADMIN_ACK_PENDING' },
        after_json: { reconciliation_status: 'DISPUTE', dispute_notes: disputeNotes },
      });
    }

    await bulkUpdate.mutateAsync({
      ids: selectedOrders,
      updates: { 
        reconciliation_status: 'DISPUTE',
        dispute_notes: disputeNotes,
      },
    });
    setSelectedOrders([]);
    setDisputeNotes('');
    setDisputeDialogOpen(false);
  };

  const getClaimsForOrder = (orderId: string): Claim[] => {
    return claims?.filter(c => c.order_id === orderId) || [];
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
      header: 'Order Amount',
      sortable: true,
      render: (order) => order.total_amount.toLocaleString(),
    },
    {
      key: 'claimed_amount',
      header: 'Claimed',
      render: (order) => {
        const orderClaims = getClaimsForOrder(order.id);
        const total = orderClaims.reduce((sum, c) => sum + c.amount, 0);
        return total.toLocaleString();
      },
    },
    {
      key: 'claim_method',
      header: 'Method',
      render: (order) => {
        const orderClaims = getClaimsForOrder(order.id);
        const methods = [...new Set(orderClaims.map(c => c.method))];
        return methods.join(', ') || '-';
      },
    },
    {
      key: 'delivered_at',
      header: 'Delivered',
      render: (order) => order.delivered_at 
        ? new Date(order.delivered_at).toLocaleDateString() 
        : '-',
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Claims Pending (Admin)</h1>
            <p className="text-muted-foreground">Final approval for SP-acknowledged claims</p>
          </div>
        </div>

        {/* Summary Cards by Salesperson */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {groupedBySP.map((group, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {group.salesperson?.display_name || 'Unknown'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {group.totalClaimed.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {group.orders.length} orders
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={handleSettle}
            disabled={selectedOrders.length === 0 || bulkUpdate.isPending}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Settle Selected ({selectedOrders.length})
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDisputeDialogOpen(true)}
            disabled={selectedOrders.length === 0}
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Dispute Selected
          </Button>
        </div>

        <DataGrid
          data={orders || []}
          columns={columns}
          loading={isLoading}
          keyField="id"
          selectable
          selectedRows={selectedOrders}
          onSelectionChange={setSelectedOrders}
        />
      </div>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Selected Orders</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter dispute notes..."
              value={disputeNotes}
              onChange={(e) => setDisputeNotes(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDispute}>
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
