import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Badge } from '@/components/ui/badge';
import { useClaimBatches } from '@/hooks/useClaimBatches';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Receipt } from 'lucide-react';
import type { ClaimBatch, ClaimBatchStatus } from '@/types/database';

const statusColors: Record<ClaimBatchStatus, string> = {
  ADMIN_ACK_PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  CLAIMED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export default function RunnerClaimBatches() {
  const { user } = useAuth();
  const { data: batches = [], isLoading } = useClaimBatches({ runnerId: user?.id });

  const columns: Column<ClaimBatch>[] = [
    {
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      render: (batch) => format(new Date(batch.submitted_at), 'MMM dd, yyyy HH:mm'),
    },
    {
      key: 'items',
      header: 'Orders',
      render: (batch) => batch.items?.length || 0,
    },
    {
      key: 'total_amount',
      header: 'Total Amount',
      sortable: true,
      render: (batch) => batch.total_amount.toLocaleString(),
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      render: (batch) => (
        <Badge className={statusColors[batch.status]}>
          {batch.status === 'ADMIN_ACK_PENDING' ? 'Pending' : 'Claimed'}
        </Badge>
      ),
    },
    {
      key: 'admin_ack_at',
      header: 'Acknowledged At',
      render: (batch) => batch.admin_ack_at 
        ? format(new Date(batch.admin_ack_at), 'MMM dd, yyyy HH:mm') 
        : '-',
    },
    {
      key: 'note',
      header: 'Note',
      render: (batch) => batch.note || '-',
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Receipt className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">My Claim Batches</h1>
            <p className="text-muted-foreground">View your submitted claim batches and their status</p>
          </div>
        </div>

        <DataGrid
          data={batches}
          columns={columns}
          loading={isLoading}
          keyField="id"
          emptyMessage="No claim batches found"
          onExport={() => {}}
        />
      </div>
    </AppLayout>
  );
}
