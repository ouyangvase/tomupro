import { useOrderAuditLogs } from '@/hooks/useAuditLogs';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';

const actionLabels: Record<string, string> = {
  receipt_uploaded: 'Receipt Uploaded',
  receipt_confirmed: 'Receipt Confirmed',
  receipt_rejected: 'Receipt Rejected',
  delivered: 'Marked Delivered',
  order_created: 'Order Created',
  order_updated: 'Order Updated',
  status_changed: 'Status Changed',
  runner_assigned: 'Runner Assigned',
  driver_assigned: 'Driver Assigned',
  claim_created: 'Claim Created',
  claim_resolved: 'Claim Resolved',
};

const roleBadgeColor: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  runner: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  runner_assistant: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  driver: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  manager: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  salesperson: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
};

interface OrderAuditHistoryProps {
  orderId: string;
}

export function OrderAuditHistory({ orderId }: OrderAuditHistoryProps) {
  const { data: logs = [], isLoading } = useOrderAuditLogs(orderId);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">No audit history recorded yet.</p>
    );
  }

  return (
    <div className="space-y-0">
      {logs.map((log, index) => {
        const isExpanded = expandedIds.has(log.id);
        const hasDetails = log.before_json || log.after_json;
        const isLast = index === logs.length - 1;
        const actorRole = log.actor?.role || 'unknown';

        return (
          <div key={log.id} className="relative flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
              {!isLast && <div className="w-px flex-1 bg-border/60" />}
            </div>

            {/* Content */}
            <div className={`flex-1 pb-4 ${!isLast ? '' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {actionLabels[log.action] || log.action}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {log.actor?.display_name || 'System'}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[9px] px-1.5 py-0 h-4 ${roleBadgeColor[actorRole] || ''}`}
                    >
                      {actorRole.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                  {format(new Date(log.created_at), 'dd MMM HH:mm')}
                </span>
              </div>

              {/* Expandable details */}
              {hasDetails && (
                <button
                  onClick={() => toggleExpand(log.id)}
                  className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Details
                </button>
              )}
              {isExpanded && hasDetails && (
                <div className="mt-2 rounded-lg bg-muted/50 p-2.5 text-[11px] font-mono space-y-1.5 overflow-x-auto">
                  {log.before_json && (
                    <div>
                      <span className="text-muted-foreground">Before: </span>
                      <span className="text-red-600 dark:text-red-400">{JSON.stringify(log.before_json, null, 0)}</span>
                    </div>
                  )}
                  {log.after_json && (
                    <div>
                      <span className="text-muted-foreground">After: </span>
                      <span className="text-green-600 dark:text-green-400">{JSON.stringify(log.after_json, null, 0)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
