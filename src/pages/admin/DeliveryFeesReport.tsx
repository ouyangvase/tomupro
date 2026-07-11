import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear,
  setMonth as setDateMonth,
} from 'date-fns';
import {
  CalendarIcon, DollarSign, Users, TrendingUp, ChevronRight,
  Download, Search, Trophy, Package, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { exportToCSV } from '@/lib/csv';
import type { DateRange } from 'react-day-picker';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/* ─── Types ─────────────────────────────────────────────────────── */
interface RunnerSummary {
  runner_id: string;
  runner_name: string;
  total_orders: number;
  total_gross_amount: number;
  total_delivery_fees: number;
  total_net_amount: number;
  avg_fee_per_order: number;
  last_claim_submitted: string | null;
}

interface ClaimDetail {
  claim_id: string;
  batch_code: string;
  batch_submitted_at: string;
  delivery_fee: number;
  gross_amount: number;
  net_claim_amount: number;
  order_id: string;
  order_code: string;
  customer_name: string;
  area: string | null;
  payment_method: string;
}

/* ─── Helpers ───────────────────────────────────────────────────── */
const fmtBND = (n: number) =>
  `BND ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Fetch ALL records from a Supabase query, paginating past the 1000-row limit.
 */
async function fetchAllPaginated<T>(
  buildQuery: (offset: number, pageSize: number) => any,
): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await buildQuery(offset, PAGE);
    if (error) throw error;
    if (!data || data.length === 0) { hasMore = false; }
    else {
      all = all.concat(data as T[]);
      hasMore = data.length >= PAGE;
      offset += PAGE;
    }
  }
  return all;
}

/**
 * Chunk an array of IDs and run a Supabase `.in()` query for each chunk,
 * to avoid exceeding URL length limits (max ~50 UUIDs per `.in()` call).
 */
async function fetchChunkedIn<T>(
  ids: string[],
  buildQuery: (chunk: string[]) => any,
): Promise<T[]> {
  const CHUNK = 50;
  let all: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    // Paginate within each chunk
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const q = buildQuery(chunk);
      const { data, error } = await q.range(offset, offset + 999);
      if (error) throw error;
      if (!data || data.length === 0) { hasMore = false; }
      else {
        all = all.concat(data as T[]);
        hasMore = data.length >= 1000;
        offset += 1000;
      }
    }
  }
  return all;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  MAIN                                                              */
/* ═══════════════════════════════════════════════════════════════════ */
export default function DeliveryFeesReport() {
  const { profile } = useAuth();
  const role = profile?.role;
  const isRunner = role === 'runner';
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined);
  const [searchRange, setSearchRange] = useState<DateRange | undefined>(undefined);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRunner, setSelectedRunner] = useState<RunnerSummary | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const hasSearched = searchTrigger > 0;

  /* ── Search ── */
  const handleSearch = useCallback(() => {
    if (!pendingRange?.from || !pendingRange?.to) return;
    queryClient.removeQueries({ queryKey: ['delivery-report'] });
    queryClient.removeQueries({ queryKey: ['runner-detail'] });
    setSearchRange({ from: pendingRange.from, to: pendingRange.to });
    setSearchTrigger(t => t + 1);
  }, [pendingRange, queryClient]);

  /* ── Quick selectors ── */
  const selectThisMonth = () => { const n = new Date(); setPendingRange({ from: startOfMonth(n), to: endOfMonth(n) }); };
  const selectMonth = (m: number) => { const d = setDateMonth(new Date(), m); setPendingRange({ from: startOfMonth(d), to: endOfMonth(d) }); };
  const selectYear = (y: number) => { const d = new Date(y, 0, 1); setPendingRange({ from: startOfYear(d), to: endOfYear(d) }); };
  const selectLastN = (n: number) => { const now = new Date(); setPendingRange({ from: startOfMonth(subMonths(now, n - 1)), to: endOfMonth(now) }); };

  /* ══════════════════════════════════════════════════════════════════
   *  MAIN QUERY — based on claim_batches.submitted_at
   * ══════════════════════════════════════════════════════════════════ */
  const { data: reportData = [], isLoading, isFetching } = useQuery({
    queryKey: ['delivery-report', searchRange?.from?.toISOString(), searchRange?.to?.toISOString(), searchTrigger],
    queryFn: async () => {
      if (!searchRange?.from || !searchRange?.to) return [];

      // 1. Fetch claim_batches by submitted_at in range
      let batchQuery = (offset: number, pageSize: number) => {
        let q = supabase
          .from('claim_batches')
          .select('id, runner_id, submitted_at, batch_code')
          .gte('submitted_at', searchRange.from!.toISOString())
          .lte('submitted_at', searchRange.to!.toISOString())
          .range(offset, offset + pageSize - 1);
        if (isRunner && profile?.id) q = q.eq('runner_id', profile.id);
        return q;
      };
      const batches = await fetchAllPaginated<{
        id: string; runner_id: string; submitted_at: string; batch_code: string;
      }>(batchQuery);

      if (batches.length === 0) return [];

      const batchIds = batches.map(b => b.id);
      // Map batch_id → { submitted_at, batch_code }
      const batchMap = new Map(batches.map(b => [b.id, b]));

      // 2. Fetch claim_batch_items for those batches → get order_ids
      const batchItems = await fetchChunkedIn<{ batch_id: string; order_id: string }>(
        batchIds,
        (chunk) => supabase
          .from('claim_batch_items')
          .select('batch_id, order_id')
          .in('batch_id', chunk)
      );

      if (batchItems.length === 0) return [];

      // order_id → batch info (use earliest batch if order appears in multiple)
      const orderToBatch = new Map<string, { batch_id: string; submitted_at: string; batch_code: string }>();
      for (const item of batchItems) {
        if (!orderToBatch.has(item.order_id)) {
          const b = batchMap.get(item.batch_id);
          if (b) orderToBatch.set(item.order_id, { batch_id: b.id, submitted_at: b.submitted_at, batch_code: b.batch_code });
        }
      }

      const orderIds = [...orderToBatch.keys()];

      // 3. Fetch claims for those order_ids with order details (chunked)
      const claims = await fetchChunkedIn<any>(
        orderIds,
        (chunk) => supabase
          .from('claims')
          .select(`
            id,
            order_id,
            gross_amount,
            delivery_fee,
            net_claim_amount,
            order:orders!inner(
              id,
              runner_id,
              order_code,
              customer_name,
              area,
              payment_method
            )
          `)
          .in('order_id', chunk)
      );

      // 4. Get runner names
      const runnerIds = [...new Set(batches.map(b => b.runner_id))];
      const { data: runners } = await supabase
        .from('user_directory')
        .select('id, display_name')
        .in('id', runnerIds);
      const runnerMap = new Map(runners?.map(r => [r.id, r.display_name]) || []);

      // 5. Aggregate by runner — deduplicate by order_id
      const orderSeen = new Map<string, Set<string>>();
      const aggregated = new Map<string, RunnerSummary>();

      for (const claim of claims) {
        const runnerId = claim.order?.runner_id;
        const orderId = claim.order_id;
        if (!runnerId || !orderId) continue;

        if (!orderSeen.has(runnerId)) orderSeen.set(runnerId, new Set());
        const seen = orderSeen.get(runnerId)!;
        if (seen.has(orderId)) continue;
        seen.add(orderId);

        const existing = aggregated.get(runnerId) || {
          runner_id: runnerId,
          runner_name: runnerMap.get(runnerId) || 'Unknown',
          total_orders: 0,
          total_gross_amount: 0,
          total_delivery_fees: 0,
          total_net_amount: 0,
          avg_fee_per_order: 0,
          last_claim_submitted: null,
        };

        existing.total_orders += 1;
        existing.total_gross_amount += Number(claim.gross_amount || 0);
        existing.total_delivery_fees += Number(claim.delivery_fee || 0);
        existing.total_net_amount += Number(claim.net_claim_amount || 0);

        const batchInfo = orderToBatch.get(orderId);
        if (batchInfo && (!existing.last_claim_submitted || batchInfo.submitted_at > existing.last_claim_submitted)) {
          existing.last_claim_submitted = batchInfo.submitted_at;
        }

        aggregated.set(runnerId, existing);
      }

      return Array.from(aggregated.values())
        .map(r => ({ ...r, avg_fee_per_order: r.total_orders > 0 ? r.total_delivery_fees / r.total_orders : 0 }))
        .sort((a, b) => b.total_delivery_fees - a.total_delivery_fees);
    },
    enabled: hasSearched && !!searchRange?.from && !!searchRange?.to,
    staleTime: Infinity,
    gcTime: 0,
  });

  /* ══════════════════════════════════════════════════════════════════
   *  DETAIL QUERY — claim-level detail for a runner
   * ══════════════════════════════════════════════════════════════════ */
  const detailRunnerId = selectedRunner?.runner_id || (isRunner ? profile?.id : null);
  const { data: runnerDetails = [], isLoading: isLoadingDetails } = useQuery({
    queryKey: ['runner-detail', detailRunnerId, searchRange?.from?.toISOString(), searchRange?.to?.toISOString()],
    queryFn: async (): Promise<ClaimDetail[]> => {
      if (!detailRunnerId || !searchRange?.from || !searchRange?.to) return [];

      // 1. Batches for this runner in range
      const batches = await fetchAllPaginated<{
        id: string; runner_id: string; submitted_at: string; batch_code: string;
      }>((offset, pageSize) => supabase
        .from('claim_batches')
        .select('id, runner_id, submitted_at, batch_code')
        .eq('runner_id', detailRunnerId)
        .gte('submitted_at', searchRange.from!.toISOString())
        .lte('submitted_at', searchRange.to!.toISOString())
        .range(offset, offset + pageSize - 1)
      );

      if (batches.length === 0) return [];
      const batchMap = new Map(batches.map(b => [b.id, b]));
      const batchIds = batches.map(b => b.id);

      // 2. Batch items
      const items = await fetchChunkedIn<{ batch_id: string; order_id: string }>(
        batchIds,
        (chunk) => supabase
          .from('claim_batch_items')
          .select('batch_id, order_id')
          .in('batch_id', chunk)
      );

      if (items.length === 0) return [];
      const orderToBatch = new Map<string, { submitted_at: string; batch_code: string }>();
      for (const item of items) {
        if (!orderToBatch.has(item.order_id)) {
          const b = batchMap.get(item.batch_id);
          if (b) orderToBatch.set(item.order_id, { submitted_at: b.submitted_at, batch_code: b.batch_code });
        }
      }
      const orderIds = [...orderToBatch.keys()];

      // 3. Claims
      const claims = await fetchChunkedIn<any>(
        orderIds,
        (chunk) => supabase
          .from('claims')
          .select(`
            id,
            order_id,
            gross_amount,
            delivery_fee,
            net_claim_amount,
            order:orders!inner(
              id,
              order_code,
              customer_name,
              area,
              payment_method
            )
          `)
          .in('order_id', chunk)
      );

      // Deduplicate by order_id
      const seen = new Set<string>();
      const result: ClaimDetail[] = [];
      for (const c of claims) {
        if (!c.order_id || seen.has(c.order_id)) continue;
        seen.add(c.order_id);
        const bInfo = orderToBatch.get(c.order_id);
        result.push({
          claim_id: c.id,
          batch_code: bInfo?.batch_code || '-',
          batch_submitted_at: bInfo?.submitted_at || c.created_at,
          delivery_fee: Number(c.delivery_fee || 0),
          gross_amount: Number(c.gross_amount || 0),
          net_claim_amount: Number(c.net_claim_amount || 0),
          order_id: c.order_id,
          order_code: c.order?.order_code || '-',
          customer_name: c.order?.customer_name || '-',
          area: c.order?.area || null,
          payment_method: c.order?.payment_method || '-',
        });
      }

      return result.sort((a, b) => new Date(b.batch_submitted_at).getTime() - new Date(a.batch_submitted_at).getTime());
    },
    enabled: detailsOpen && !!detailRunnerId && !!searchRange?.from && !!searchRange?.to,
    staleTime: Infinity,
    gcTime: 0,
  });

  /* ── Filtered ── */
  const filteredData = useMemo(() => {
    if (!searchQuery) return reportData;
    const q = searchQuery.toLowerCase();
    return reportData.filter(r => r.runner_name.toLowerCase().includes(q));
  }, [reportData, searchQuery]);

  /* ── Totals ── */
  const totals = useMemo(() => ({
    runners: filteredData.length,
    orders: filteredData.reduce((s, r) => s + r.total_orders, 0),
    gross: filteredData.reduce((s, r) => s + r.total_gross_amount, 0),
    fees: filteredData.reduce((s, r) => s + r.total_delivery_fees, 0),
    net: filteredData.reduce((s, r) => s + r.total_net_amount, 0),
    avgPerRunner: filteredData.length > 0
      ? filteredData.reduce((s, r) => s + r.total_delivery_fees, 0) / filteredData.length
      : 0,
  }), [filteredData]);

  /* ── Rankings ── */
  const rankings = useMemo(() => {
    if (filteredData.length < 2) return null;
    const sorted = [...filteredData];
    return {
      topEarner: sorted[0],
      topOrders: [...sorted].sort((a, b) => b.total_orders - a.total_orders)[0],
      topAvg: [...sorted].sort((a, b) => b.avg_fee_per_order - a.avg_fee_per_order)[0],
    };
  }, [filteredData]);

  /* ── Export summary ── */
  const handleExportSummary = () => {
    exportToCSV(filteredData as any, [
      { key: 'runner_name', header: 'Runner Name' },
      { key: 'total_orders', header: 'Total Orders' },
      { key: 'total_gross_amount', header: 'Gross Amount (BND)' },
      { key: 'total_delivery_fees', header: 'Delivery Fees Earning (BND)' },
      { key: 'total_net_amount', header: 'Net Amount (BND)' },
      { key: 'avg_fee_per_order', header: 'Avg Fee/Order (BND)' },
      { key: 'last_claim_submitted', header: 'Last Claim Submitted' },
    ], 'delivery_fees_earning_report');
  };

  /* ── Export detail ── */
  const handleExportDetail = () => {
    exportToCSV(runnerDetails.map(d => ({
      submitted: format(new Date(d.batch_submitted_at), 'yyyy-MM-dd HH:mm'),
      batch_code: d.batch_code,
      order_code: d.order_code,
      customer_name: d.customer_name,
      area: d.area || '',
      payment_method: d.payment_method,
      gross_amount: d.gross_amount.toFixed(2),
      delivery_fee: d.delivery_fee.toFixed(2),
      net_amount: d.net_claim_amount.toFixed(2),
    })) as any, [
      { key: 'submitted', header: 'Claim Submitted' },
      { key: 'batch_code', header: 'Batch #' },
      { key: 'order_code', header: 'Order ID' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'area', header: 'Area' },
      { key: 'payment_method', header: 'Payment' },
      { key: 'gross_amount', header: 'Gross (BND)' },
      { key: 'delivery_fee', header: 'Delivery Fee Earning (BND)' },
      { key: 'net_amount', header: 'Net (BND)' },
    ], `earning_detail_${selectedRunner?.runner_name || 'runner'}`);
  };

  /* ── Columns ── */
  const columns: Column<RunnerSummary>[] = [
    {
      key: 'runner_name', header: 'Runner', sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2 font-medium">
          <span>{row.runner_name}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ),
    },
    { key: 'total_orders', header: 'Orders', sortable: true, render: (row) => row.total_orders.toLocaleString() },
    { key: 'total_gross_amount', header: 'Gross Amount', sortable: true, render: (row) => fmtBND(row.total_gross_amount) },
    {
      key: 'total_delivery_fees', header: 'Delivery Fees Earning', sortable: true,
      render: (row) => <span className="font-semibold text-primary">{fmtBND(row.total_delivery_fees)}</span>,
    },
    { key: 'total_net_amount', header: 'Net Amount', sortable: true, render: (row) => fmtBND(row.total_net_amount) },
    { key: 'avg_fee_per_order', header: 'Avg Fee/Order', sortable: true, render: (row) => fmtBND(row.avg_fee_per_order) },
    {
      key: 'last_claim_submitted', header: 'Last Claim Submitted', sortable: true,
      render: (row) => row.last_claim_submitted ? format(new Date(row.last_claim_submitted), 'dd MMM yyyy') : '-',
    },
  ];

  /* ═══ RENDER ═══ */
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className={cn('flex items-start justify-between gap-4', isMobile && 'flex-col')}>
        <div className="flex items-center gap-3">
          <FileText className={cn(isMobile ? 'h-6 w-6' : 'h-7 w-7', 'text-primary')} />
          <div>
            <h1 className={cn('font-bold', isMobile ? 'text-lg' : 'text-2xl')}>
              {isRunner ? 'My Earning Report' : 'Delivery Fees Earning Report'}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {isRunner
                ? 'Your delivery fee earnings from submitted claim batches'
                : 'Delivery fee earnings based on claim batch submitted date'}
            </p>
          </div>
        </div>
      </div>

      {/* Date Selection */}
      <DateSelector
        pendingRange={pendingRange} setPendingRange={setPendingRange}
        onSearch={handleSearch} onSelectThisMonth={selectThisMonth}
        onSelectMonth={selectMonth} onSelectYear={selectYear}
        onSelectLastN={selectLastN} isLoading={isLoading || isFetching} isMobile={isMobile}
      />

      {/* Content */}
      {!hasSearched ? (
        <EmptyPrompt isMobile={isMobile} />
      ) : (isLoading || isFetching) ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Summary Cards */}
          <div className={cn('grid gap-3', isMobile ? 'grid-cols-2' : isRunner ? 'grid-cols-3' : 'grid-cols-5')}>
            {!isRunner && <SummaryCard title="Total Runners" value={totals.runners.toString()} icon={Users} />}
            <SummaryCard title="Total Orders" value={totals.orders.toLocaleString()} icon={Package} />
            <SummaryCard title="Gross Amount" value={fmtBND(totals.gross)} icon={DollarSign} />
            <SummaryCard title="Delivery Fees Earning" value={fmtBND(totals.fees)} icon={DollarSign} highlight />
            {!isRunner && <SummaryCard title="Avg Per Runner" value={fmtBND(totals.avgPerRunner)} icon={TrendingUp} />}
          </div>

          {/* Rankings */}
          {rankings && !isRunner && (
            <div className={cn('grid gap-3', isMobile ? 'grid-cols-1' : 'grid-cols-3')}>
              <RankingCard icon={Trophy} label="Top Earner" name={rankings.topEarner.runner_name} value={fmtBND(rankings.topEarner.total_delivery_fees)} color="text-yellow-600" />
              <RankingCard icon={Package} label="Most Deliveries" name={rankings.topOrders.runner_name} value={`${rankings.topOrders.total_orders} orders`} color="text-blue-600" />
              <RankingCard icon={TrendingUp} label="Highest Avg Fee" name={rankings.topAvg.runner_name} value={fmtBND(rankings.topAvg.avg_fee_per_order)} color="text-green-600" />
            </div>
          )}

          {/* Filter */}
          {!isRunner && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Filter runner name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
            </div>
          )}

          {/* Grid */}
          <DataGrid
            data={filteredData}
            columns={isRunner ? columns.filter(c => c.key !== 'runner_name') : columns}
            loading={false}
            keyField="runner_id"
            emptyMessage="No earning data for the selected period"
            onExport={handleExportSummary}
            onRowClick={(row) => { setSelectedRunner(row); setDetailsOpen(true); }}
          />

          {searchRange?.from && searchRange?.to && (
            <p className="text-xs text-muted-foreground text-center">
              Based on claim batches submitted from {format(searchRange.from, 'dd MMM yyyy')} to {format(searchRange.to, 'dd MMM yyyy')}
            </p>
          )}
        </>
      )}

      {/* Detail Dialog */}
      <DetailDialog
        open={detailsOpen} onOpenChange={setDetailsOpen}
        runner={selectedRunner} details={runnerDetails}
        isLoading={isLoadingDetails} dateRange={searchRange}
        isMobile={isMobile} onExport={handleExportDetail}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  DATE SELECTOR                                                     */
/* ═══════════════════════════════════════════════════════════════════ */
function DateSelector({
  pendingRange, setPendingRange, onSearch, onSelectThisMonth, onSelectMonth,
  onSelectYear, onSelectLastN, isLoading, isMobile,
}: {
  pendingRange: DateRange | undefined;
  setPendingRange: (r: DateRange | undefined) => void;
  onSearch: () => void;
  onSelectThisMonth: () => void;
  onSelectMonth: (m: number) => void;
  onSelectYear: (y: number) => void;
  onSelectLastN: (n: number) => void;
  isLoading: boolean;
  isMobile: boolean;
}) {
  const thisYear = new Date().getFullYear();
  const thisMonthIdx = new Date().getMonth();

  return (
    <Card className="border-dashed">
      <CardContent className={cn('pt-4 pb-4 space-y-3', isMobile && 'px-3')}>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={onSelectThisMonth}>This Month</Button>
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => onSelectLastN(3)}>Last 3 Months</Button>
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => onSelectLastN(6)}>Last 6 Months</Button>
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => onSelectYear(thisYear)}>This Year</Button>
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => onSelectYear(thisYear - 1)}>{thisYear - 1}</Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {MONTH_NAMES.map((name, i) => (
            <Button key={name} variant="ghost" size="sm"
              className={cn('text-[11px] h-7 px-2.5 rounded-full', i === thisMonthIdx && 'bg-primary/10 text-primary font-semibold')}
              onClick={() => onSelectMonth(i)}>{name.slice(0, 3)}</Button>
          ))}
        </div>
        <div className={cn('flex items-center gap-2', isMobile && 'flex-col')}>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('justify-start text-left font-normal text-xs h-9', isMobile && 'w-full', !pendingRange && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {pendingRange?.from ? (
                  pendingRange.to
                    ? <>{format(pendingRange.from, 'dd MMM yyyy')} — {format(pendingRange.to, 'dd MMM yyyy')}</>
                    : format(pendingRange.from, 'dd MMM yyyy')
                ) : 'Custom date range...'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar initialFocus mode="range" defaultMonth={pendingRange?.from} selected={pendingRange} onSelect={setPendingRange} numberOfMonths={isMobile ? 1 : 2} />
            </PopoverContent>
          </Popover>
          <Button onClick={onSearch} disabled={!pendingRange?.from || !pendingRange?.to || isLoading} className={cn('h-9 px-6', isMobile && 'w-full')}>
            {isLoading ? (
              <><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent mr-2" /> Loading...</>
            ) : (
              <><Search className="h-4 w-4 mr-2" /> Search</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  SMALL COMPONENTS                                                  */
/* ═══════════════════════════════════════════════════════════════════ */
function EmptyPrompt({ isMobile }: { isMobile: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CalendarIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h3 className={cn('font-semibold text-muted-foreground', isMobile ? 'text-base' : 'text-lg')}>Select a date range to begin</h3>
      <p className="text-sm text-muted-foreground/60 mt-1 max-w-sm">
        Choose a month, year, or custom range above, then click Search to load earnings based on claim batch submitted dates.
      </p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent mb-3" />
      <p className="text-sm text-muted-foreground">Loading all records...</p>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, highlight }: { title: string; value: string; icon: any; highlight?: boolean }) {
  return (
    <Card className={cn(highlight && 'border-primary/50')}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', highlight ? 'text-primary' : 'text-muted-foreground')} />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className={cn('text-xl md:text-2xl font-bold', highlight && 'text-primary')}>{value}</div>
      </CardContent>
    </Card>
  );
}

function RankingCard({ icon: Icon, label, name, value, color }: { icon: any; label: string; name: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className={cn('h-9 w-9 rounded-full flex items-center justify-center bg-muted', color)}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold truncate">{name}</p>
        <p className={cn('text-xs font-medium', color)}>{value}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  DETAIL DIALOG                                                     */
/* ═══════════════════════════════════════════════════════════════════ */
function DetailDialog({
  open, onOpenChange, runner, details, isLoading, dateRange, isMobile, onExport,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  runner: RunnerSummary | null; details: ClaimDetail[];
  isLoading: boolean; dateRange: DateRange | undefined;
  isMobile: boolean; onExport: () => void;
}) {
  if (!runner) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[85vh] overflow-y-auto', isMobile ? 'max-w-full mx-2' : 'max-w-5xl')}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            {runner.runner_name} — Earning Details
          </DialogTitle>
          <DialogDescription>
            {dateRange?.from && dateRange?.to && (
              <>Claims submitted {format(dateRange.from, 'dd MMM yyyy')} — {format(dateRange.to, 'dd MMM yyyy')} &middot; {details.length} records</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className={cn('grid gap-3 mb-4', isMobile ? 'grid-cols-2' : 'grid-cols-4')}>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-[11px] text-muted-foreground">Orders</p>
            <p className="text-lg font-bold">{runner.total_orders.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-[11px] text-muted-foreground">Gross Amount</p>
            <p className="text-lg font-bold">{fmtBND(runner.total_gross_amount)}</p>
          </div>
          <div className="p-3 bg-primary/10 rounded-lg">
            <p className="text-[11px] text-muted-foreground">Delivery Fees Earning</p>
            <p className="text-lg font-bold text-primary">{fmtBND(runner.total_delivery_fees)}</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-[11px] text-muted-foreground">Avg Fee/Order</p>
            <p className="text-lg font-bold">{fmtBND(runner.avg_fee_per_order)}</p>
          </div>
        </div>

        <div className="flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={onExport} disabled={details.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
        </div>

        {isLoading ? <LoadingSpinner /> : isMobile ? <MobileCards details={details} /> : <DesktopTable details={details} />}
      </DialogContent>
    </Dialog>
  );
}

function DesktopTable({ details }: { details: ClaimDetail[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Claim Submitted</TableHead>
          <TableHead>Batch #</TableHead>
          <TableHead>Order</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Area</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead className="text-right">Gross</TableHead>
          <TableHead className="text-right">Delivery Fee Earning</TableHead>
          <TableHead className="text-right">Net</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {details.length === 0 ? (
          <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No records found</TableCell></TableRow>
        ) : details.map(d => (
          <TableRow key={d.claim_id}>
            <TableCell className="text-sm">{format(new Date(d.batch_submitted_at), 'dd MMM yyyy, HH:mm')}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{d.batch_code}</TableCell>
            <TableCell className="font-mono text-sm">{d.order_code}</TableCell>
            <TableCell>{d.customer_name}</TableCell>
            <TableCell>{d.area || '-'}</TableCell>
            <TableCell className="text-xs">{d.payment_method}</TableCell>
            <TableCell className="text-right font-mono">{fmtBND(d.gross_amount)}</TableCell>
            <TableCell className="text-right font-mono text-primary font-semibold">{fmtBND(d.delivery_fee)}</TableCell>
            <TableCell className="text-right font-mono">{fmtBND(d.net_claim_amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MobileCards({ details }: { details: ClaimDetail[] }) {
  if (details.length === 0) return <p className="text-center text-muted-foreground py-8 text-sm">No records found</p>;
  return (
    <div className="space-y-2">
      {details.map(d => (
        <div key={d.claim_id} className="border rounded-lg p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{d.order_code}</span>
            <span className="font-semibold text-primary text-sm">{fmtBND(d.delivery_fee)}</span>
          </div>
          <p className="text-sm font-medium">{d.customer_name}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{d.area || '-'}</span>
            <span>{format(new Date(d.batch_submitted_at), 'dd MMM yyyy')}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
            <span>Batch: {d.batch_code}</span>
            <span>Net: {fmtBND(d.net_claim_amount)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
