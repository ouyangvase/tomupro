import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Shield, ChevronLeft, ChevronRight, Search, CalendarDays } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AuditEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
  actor?: { display_name: string; role: string } | null;
  order?: { order_code: string; customer_name: string; runner?: { display_name: string } | null } | null;
}

const PAGE_SIZE = 30;

const actionLabels: Record<string, string> = {
  // Receipt actions
  receipt_uploaded: 'Receipt Uploaded',
  receipt_re_uploaded: 'Receipt Re-uploaded',
  receipt_confirmed: 'Receipt Confirmed',
  receipt_rejected: 'Receipt Rejected',
  receipt_force_confirmed: 'Force Confirmed',
  // Delivery actions
  delivered: 'Marked Delivered',
  taken: 'Taken Order',
  DELIVERY_FAILED: 'Failed Delivery',
  // Status changes
  status_changed: 'Status Changed',
  order_created: 'Order Created',
  order_updated: 'Order Updated',
  CANCELLED: 'Order Cancelled',
  // Assignment actions
  runner_assigned: 'Runner Assigned',
  driver_assigned: 'Driver Assigned',
  // Claim actions
  CLAIM_BATCH_APPROVED: 'Claim Approved',
  CLAIM_BATCH_REJECTED: 'Claim Rejected',
  claim_created: 'Claim Created',
  claim_resolved: 'Claim Resolved',
};

const actionColors: Record<string, string> = {
  receipt_confirmed: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400',
  receipt_force_confirmed: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400',
  receipt_rejected: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
  delivered: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400',
  receipt_uploaded: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400',
  receipt_re_uploaded: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400',
  taken: 'bg-primary/10 text-primary border-primary/20',
  runner_assigned: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400',
  driver_assigned: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400',
  status_changed: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400',
  DELIVERY_FAILED: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
  CLAIM_BATCH_APPROVED: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400',
  CLAIM_BATCH_REJECTED: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
};

const roleBadgeColor: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  runner: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  runner_assistant: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  driver: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  manager: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  salesperson: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

const actionFilterOptions = [
  { value: 'all', label: 'All Actions' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'taken', label: 'Taken' },
  { value: 'runner_assigned', label: 'Runner Assigned' },
  { value: 'driver_assigned', label: 'Driver Assigned' },
  { value: 'receipt_confirmed', label: 'Receipt Confirmed' },
  { value: 'receipt_rejected', label: 'Receipt Rejected' },
  { value: 'receipt_uploaded', label: 'Receipt Uploaded' },
  { value: 'receipt_force_confirmed', label: 'Force Confirmed' },
  { value: 'status_changed', label: 'Status Changed' },
  { value: 'DELIVERY_FAILED', label: 'Failed Delivery' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function RunnerAuditLog() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['runner-audit-log', user?.id, page, actionFilter, orderSearch, dateFrom, dateTo],
    queryFn: async () => {
      // Step 1: Fetch audit logs with actor profile (FK exists for actor_id)
      let query = (supabase as any)
        .from('audit_logs')
        .select('*, actor:profiles!actor_id(display_name, role)', { count: 'exact' })
        .eq('entity_type', 'order')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (dateFrom) {
        query = query.gte('created_at', dateFrom + 'T00:00:00');
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59');
      }

      const { data: logs, error, count } = await query;
      if (error) throw error;

      // Step 2: Batch-fetch order details for the entity_ids (no FK on entity_id)
      const entityIds = [...new Set((logs || []).map((l: any) => l.entity_id))];
      let orderMap: Record<string, { order_code: string; customer_name: string; runner?: { display_name: string } | null }> = {};
      if (entityIds.length > 0) {
        const { data: orders } = await (supabase as any)
          .from('orders')
          .select('id, order_code, customer_name, runner_id, runner:profiles!runner_id(display_name)')
          .in('id', entityIds);
        if (orders) {
          for (const o of orders) {
            orderMap[o.id] = { order_code: o.order_code, customer_name: o.customer_name, runner: o.runner };
          }
        }
      }

      // Merge order data into logs
      let enriched = ((logs || []) as AuditEntry[]).map(log => ({
        ...log,
        order: orderMap[log.entity_id] || null,
      }));

      // Client-side filter for order ref search
      if (orderSearch.trim()) {
        const term = orderSearch.trim().toLowerCase();
        enriched = enriched.filter(log =>
          log.order?.order_code?.toLowerCase().includes(term) ||
          log.order?.customer_name?.toLowerCase().includes(term)
        );
      }

      return { logs: enriched, count: orderSearch.trim() ? enriched.length : (count || 0) };
    },
    enabled: !!user?.id,
  });

  const logs = data?.logs || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleClearFilters = () => {
    setActionFilter('all');
    setOrderSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  };

  const hasActiveFilters = actionFilter !== 'all' || orderSearch.trim() || dateFrom || dateTo;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Operations Audit Trail
        </h2>
        <p className="text-sm text-muted-foreground">
          Track every operational action performed across orders, receipts, assignments and deliveries
        </p>
      </div>

      {/* Filters */}
      <Card className="p-3 rounded-xl space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Action type filter */}
          <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[170px] h-9 rounded-lg text-xs">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {actionFilterOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Order search */}
          <div className="relative flex-1 min-w-[140px] max-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search order ref..."
              value={orderSearch}
              onChange={e => { setOrderSearch(e.target.value); setPage(0); }}
              className="pl-8 h-9 rounded-lg text-xs"
            />
          </div>

          {/* Date from */}
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(0); }}
              className="h-9 rounded-lg text-xs w-[130px]"
              placeholder="From"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(0); }}
              className="h-9 rounded-lg text-xs w-[130px]"
              placeholder="To"
            />
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs h-9 px-2 text-muted-foreground">
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No audit entries found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasActiveFilters ? 'Try adjusting your filters' : 'Actions will appear here as they are performed'}
          </p>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {logs.map(log => {
              const actorRole = log.actor?.role || 'unknown';
              const actionColor = actionColors[log.action] || '';

              return (
                <Card key={log.id} className="p-3.5 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Action + Order */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn('text-[11px] px-2 py-0.5 font-semibold', actionColor)}
                        >
                          {actionLabels[log.action] || log.action}
                        </Badge>
                        {log.order && (
                          <span className="text-xs font-mono font-semibold text-foreground">
                            {log.order.order_code}
                          </span>
                        )}
                        {log.order?.customer_name && (
                          <span className="text-xs text-muted-foreground truncate">
                            {log.order.customer_name}
                          </span>
                        )}
                      </div>
                      {/* Actor */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-xs font-medium text-foreground">
                          {log.actor?.display_name || 'System'}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn('text-[9px] px-1.5 py-0 h-4', roleBadgeColor[actorRole] || '')}
                        >
                          {actorRole.replace('_', ' ')}
                        </Badge>
                        {log.order?.runner?.display_name && log.actor?.display_name !== log.order.runner.display_name && (
                          <span className="text-[10px] text-muted-foreground">
                            &middot; Runner: <span className="font-medium text-foreground">{log.order.runner.display_name}</span>
                          </span>
                        )}
                      </div>
                      {/* Details from after_json */}
                      {log.after_json && Object.keys(log.after_json).length > 0 && (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          {log.before_json?.runner_status && log.after_json?.runner_status && (
                            <span className="text-[10px] text-muted-foreground">
                              {String(log.before_json.runner_status)} → {String(log.after_json.runner_status)}
                            </span>
                          )}
                          {log.before_json?.status && log.after_json?.status && (
                            <span className="text-[10px] text-muted-foreground">
                              {String(log.before_json.status)} → {String(log.after_json.status)}
                            </span>
                          )}
                          {log.after_json?.receipt_rejected_reason && (
                            <span className="text-[10px] text-red-600 dark:text-red-400">
                              Reason: {String(log.after_json.receipt_rejected_reason)}
                            </span>
                          )}
                          {log.after_json?.failed_reason && (
                            <span className="text-[10px] text-red-600 dark:text-red-400">
                              {String(log.after_json.failed_reason)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Timestamp */}
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                      {format(new Date(log.created_at), 'dd MMM HH:mm')}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="h-8 w-8 p-0 rounded-lg"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="h-8 w-8 p-0 rounded-lg"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
