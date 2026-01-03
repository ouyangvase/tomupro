import { useState, useMemo } from 'react';
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
import { useOrders, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useClaimsByOrders } from '@/hooks/useClaims';
import { useReasons } from '@/hooks/useReasons';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLogs';
import { formatBND } from '@/lib/currency';
import type { Order, Claim } from '@/types/database';
import { CheckCircle, AlertTriangle, DollarSign, Users } from 'lucide-react';

export default function ReconciliationSP() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useOrders({ 
    salespersonId: user?.id, 
    reconciliationStatus: 'SP_ACK_PENDING' 
  });
  const orderIds = useMemo(() => orders?.map(o => o.id) || [], [orders]);
  const { data: claims } = useClaimsByOrders(orderIds);
  const bulkUpdate = useBulkUpdateOrders();

  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeNotes, setDisputeNotes] = useState('');

  const { data: disputeReasons } = useReasons('DISPUTE', true);

  // Group orders and claims by runner
  const groupedByRunner = useMemo(() => {
    if (!orders) return [];
    
    const groups: Record<string, { runner: Order['runner']; orders: Order[]; totalClaimed: number }> = {};
    
    orders.forEach(order => {
      const runnerId = order.runner_id || 'unassigned';
      if (!groups[runnerId]) {
        groups[runnerId] = { runner: order.runner, orders: [], totalClaimed: 0 };
      }
      groups[runnerId].orders.push(order);
      
      // Sum claims for this order
      const orderClaims = claims?.filter(c => c.order_id === order.id) || [];
      groups[runnerId].totalClaimed += orderClaims.reduce((sum, c) => sum + c.amount, 0);
    });
    
    return Object.values(groups);
  }, [orders, claims]);

  const handleAcknowledge = async () => {
    if (selectedOrders.length === 0) return;

    for (const orderId of selectedOrders) {
      await logAudit({
        entity_type: 'order',
        entity_id: orderId,
        action: 'SP_ACKNOWLEDGED',
        before_json: { reconciliation_status: 'SP_ACK_PENDING' },
        after_json: { reconciliation_status: 'ADMIN_ACK_PENDING' },
      });
    }

    await bulkUpdate.mutateAsync({
      ids: selectedOrders,
      updates: { reconciliation_status: 'ADMIN_ACK_PENDING' },
    });
    setSelectedOrders([]);
  };

  const handleDispute = async () => {
    if (selectedOrders.length === 0 || !disputeReason) return;

    for (const orderId of selectedOrders) {
      await logAudit({
        entity_type: 'order',
        entity_id: orderId,
        action: 'SP_DISPUTED',
        before_json: { reconciliation_status: 'SP_ACK_PENDING' },
        after_json: { reconciliation_status: 'DISPUTE', dispute_reason: disputeReason, dispute_notes: disputeNotes },
      });
    }

    await bulkUpdate.mutateAsync({
      ids: selectedOrders,
      updates: { 
        reconciliation_status: 'DISPUTE',
        dispute_reason: disputeReason,
        dispute_notes: disputeNotes,
      },
    });
    setSelectedOrders([]);
    setDisputeReason('');
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
      key: 'total_amount',
      header: 'Amount (BND)',
      sortable: true,
      render: (order) => formatBND(order.total_amount),
    },
    {
      key: 'claimed_amount',
      header: 'Claimed (BND)',
      render: (order) => {
        const orderClaims = getClaimsForOrder(order.id);
        const total = orderClaims.reduce((sum, c) => sum + c.amount, 0);
        return formatBND(total);
      },
    },
    {
      key: 'runner',
      header: 'Runner',
      render: (order) => order.runner?.display_name || '-',
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
          <DollarSign className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Claims Pending (SP)</h1>
            <p className="text-muted-foreground">Review and acknowledge runner claims</p>
          </div>
        </div>

        {/* Summary Cards by Runner */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {groupedByRunner.map((group, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {group.runner?.display_name || 'Unassigned'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatBND(group.totalClaimed)}
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
            onClick={handleAcknowledge}
            disabled={selectedOrders.length === 0 || bulkUpdate.isPending}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Acknowledge Selected ({selectedOrders.length})
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
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Dispute Reason *</Label>
              <Select value={disputeReason} onValueChange={setDisputeReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {disputeReasons?.map((r) => (
                    <SelectItem key={r.id} value={r.label}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea
                placeholder="Enter dispute notes..."
                value={disputeNotes}
                onChange={(e) => setDisputeNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDispute}
              disabled={!disputeReason}
            >
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
