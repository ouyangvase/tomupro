import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useClaimBatches } from '@/hooks/useClaimBatches';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Receipt, Wallet, Clock, CheckCircle, DollarSign } from 'lucide-react';
import { formatBND, formatRM, formatExchangeRate } from '@/lib/currency';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { ClaimBatchTimeline } from '@/components/runner/ClaimBatchTimeline';
import { PageHero } from '@/components/dashboard/PageHero';
import { DataScopeSelector } from '@/components/data-sharing/DataScopeSelector';
import type { DataViewMode } from '@/types/data-sharing';
import type { ClaimBatch, ClaimBatchStatus } from '@/types/database';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

const statusColors: Record<ClaimBatchStatus, string> = {
  ADMIN_ACK_PENDING: 'bg-[hsl(var(--status-warning)/0.15)] text-[hsl(var(--status-warning))] border border-[hsl(var(--status-warning)/0.3)]',
  CLAIMED: 'bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))] border border-[hsl(var(--status-success)/0.3)]',
};

export default function RunnerClaimBatches() {
  const { user } = useAuth();
  const [claimsViewMode, setClaimsViewMode] = useState<DataViewMode>('my_data');
  const { data: batches = [], isLoading } = useClaimBatches({ runnerId: user?.id });

  const stats = useMemo(() => {
    const pending = batches.filter(b => b.status === 'ADMIN_ACK_PENDING');
    const claimed = batches.filter(b => b.status === 'CLAIMED');
    return {
      totalBatches: batches.length,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, b) => sum + Number(b.net_bnd || b.total_amount || 0), 0),
      claimedCount: claimed.length,
      claimedAmount: claimed.reduce((sum, b) => sum + Number(b.net_bnd || b.total_amount || 0), 0),
    };
  }, [batches]);

  const columns: Column<ClaimBatch>[] = [
    {
      key: 'batch_code',
      header: 'Batch #',
      sortable: true,
      render: (batch) => (
        <span className="font-mono font-semibold text-primary">
          {(batch as any).batch_code || batch.id.slice(0, 8).toUpperCase()}
        </span>
      ),
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      render: (batch) => format(new Date(batch.submitted_at), 'MMM dd, yyyy HH:mm'),
    },
    {
      key: 'items',
      header: 'Orders',
      render: (batch) => (
        <span className="font-semibold">{batch.items?.length || 0}</span>
      ),
    },
    {
      key: 'net_bnd',
      header: 'Net Earnings (BND)',
      sortable: true,
      render: (batch) => (
        <span className="font-bold text-primary">
          {formatBND(batch.net_bnd || batch.total_bnd || batch.total_amount)}
        </span>
      ),
    },
    {
      key: 'exchange_rate_to_rm',
      header: 'FX Rate',
      render: (batch) => batch.exchange_rate_to_rm ? formatExchangeRate(batch.exchange_rate_to_rm) : '-',
    },
    {
      key: 'net_rm',
      header: 'Net (RM)',
      render: (batch) => batch.net_rm ? (
        <span className="font-semibold">{formatRM(batch.net_rm)}</span>
      ) : batch.total_rm ? formatRM(batch.total_rm) : '-',
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      render: (batch) => (
        <ClaimBatchTimeline
          status={batch.status}
          submittedAt={batch.submitted_at}
          acknowledgedAt={batch.admin_ack_at}
        />
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (batch) => (
        <span className="truncate max-w-[120px] block text-sm" title={batch.note || ''}>
          {batch.note || '-'}
        </span>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHero
          icon={<Receipt className="h-6 w-6 text-primary" />}
          title="My Claim Batches"
          subtitle="Track your claim submissions and payout status"
          actions={<DataScopeSelector value={claimsViewMode} onChange={setClaimsViewMode} scope="claims" />}
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase">Total Batches</span>
              </div>
              <p className="text-2xl font-extrabold"><AnimatedCounter value={stats.totalBatches} /></p>
            </CardContent>
          </Card>
          <Card className="border-[hsl(var(--status-warning)/0.3)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-[hsl(var(--status-warning))]" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase">Pending</span>
              </div>
              <p className="text-2xl font-extrabold text-[hsl(var(--status-warning))]">
                <AnimatedCounter value={stats.pendingCount} />
              </p>
              <p className="text-xs text-muted-foreground">{formatBND(stats.pendingAmount)}</p>
            </CardContent>
          </Card>
          <Card className="border-[hsl(var(--status-success)/0.3)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-[hsl(var(--status-success))]" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase">Approved</span>
              </div>
              <p className="text-2xl font-extrabold text-[hsl(var(--status-success))]">
                <AnimatedCounter value={stats.claimedCount} />
              </p>
              <p className="text-xs text-muted-foreground">{formatBND(stats.claimedAmount)}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase">Total Value</span>
              </div>
              <p className="text-2xl font-extrabold text-primary">
                <AnimatedCounter 
                  value={stats.pendingAmount + stats.claimedAmount} 
                  formatter={(v) => formatBND(v)} 
                />
              </p>
            </CardContent>
          </Card>
        </div>

        <DataGrid
          data={batches}
          columns={columns}
          loading={isLoading}
          keyField="id"
          emptyMessage="No claim batches yet. Submit your first claim from the Delivered Orders page!"
          onExport={() => {}}
        />
      </div>
    </AppLayout>
  );
}
