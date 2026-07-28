import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatBND } from '@/lib/currency';
import { Sparkles, ArrowRight, AlertCircle, Users, ChevronDown, ChevronUp, MapPin, Clock } from 'lucide-react';
import type { Order } from '@/types/database';

interface ExcludedOrder {
  order: Order;
  reason: 'missing_area' | 'no_charge_rate' | 'no_delivery_time';
  reasonLabel: string;
}

interface AutoClaimSuggestionProps {
  claimableOrders: Order[];
  invalidAreaOrders: Order[];
  approvedChargeMap: Record<string, number>;
  onClaimAll: () => void;
  totalDeliveryFee?: number;
}

export function AutoClaimSuggestion({
  claimableOrders,
  invalidAreaOrders,
  approvedChargeMap,
  onClaimAll,
  totalDeliveryFee = 0,
}: AutoClaimSuggestionProps) {
  const [excludedExpanded, setExcludedExpanded] = useState(false);

  const totalAmount = claimableOrders.reduce((sum, o) => sum + o.total_amount, 0);

  // Group by salesperson for the breakdown
  const userBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; count: number; amount: number }>();
    for (const o of claimableOrders) {
      const spId = o.salesperson_id || 'unknown';
      const spName = o.salesperson?.display_name || (o as any).created_by_name_snapshot || 'Unknown';
      if (!map.has(spId)) {
        map.set(spId, { name: spName, count: 0, amount: 0 });
      }
      const entry = map.get(spId)!;
      entry.count += 1;
      entry.amount += o.total_amount;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [claimableOrders]);

  // Categorize excluded orders by reason
  const excludedDetails = useMemo((): ExcludedOrder[] => {
    return invalidAreaOrders.map(o => {
      if (!o.delivered_at) {
        return { order: o, reason: 'no_delivery_time' as const, reasonLabel: 'No delivery timestamp' };
      }
      if (!o.area || o.area.trim() === '') {
        return { order: o, reason: 'missing_area' as const, reasonLabel: 'Missing area' };
      }
      const area = o.area.toLowerCase();
      if (approvedChargeMap[area] === undefined) {
        return { order: o, reason: 'no_charge_rate' as const, reasonLabel: `No charge rate for "${o.area}"` };
      }
      return { order: o, reason: 'no_charge_rate' as const, reasonLabel: 'Unknown issue' };
    });
  }, [invalidAreaOrders, approvedChargeMap]);

  // Group excluded by reason for summary
  const excludedSummary = useMemo(() => {
    const groups: Record<string, { label: string; count: number }> = {};
    for (const e of excludedDetails) {
      const key = e.reason;
      if (!groups[key]) {
        groups[key] = {
          label: key === 'missing_area' ? 'missing area' : key === 'no_charge_rate' ? 'missing delivery charge rate' : 'no delivery timestamp',
          count: 0,
        };
      }
      groups[key].count++;
    }
    return Object.values(groups);
  }, [excludedDetails]);

  const hasMultipleUsers = userBreakdown.length > 1;
  const hasExcluded = invalidAreaOrders.length > 0;

  // Build inline summary text for excluded orders
  const excludedSummaryText = excludedSummary.map(g => `${g.count} ${g.label}`).join(', ');

  if (claimableOrders.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent overflow-hidden relative">
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-primary/5" />
      <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-primary/8" />
      <CardContent className="p-4 relative">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-primary/15 shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                Suggested Claim Orders
                <Badge variant="outline" className="border-primary/30 text-primary font-bold">
                  {claimableOrders.length}
                </Badge>
                {hasMultipleUsers && (
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {userBreakdown.length} users
                  </Badge>
                )}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {claimableOrders.length} orders ready to claim • Total Sales {formatBND(totalAmount)}
                {totalDeliveryFee > 0 && (
                  <span className="ml-1 text-primary font-medium">
                    • Est. Earning {formatBND(totalDeliveryFee)}
                  </span>
                )}
              </p>
              {/* Per-user breakdown when multiple users */}
              {hasMultipleUsers && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {userBreakdown.map((u, i) => (
                    <span key={i} className="text-xs text-muted-foreground">
                      {u.name}: {u.count} ({formatBND(u.amount)})
                      {i < userBreakdown.length - 1 && ' •'}
                    </span>
                  ))}
                </div>
              )}
              {/* Excluded orders section */}
              {hasExcluded && (
                <div className="mt-2">
                  <button
                    onClick={() => setExcludedExpanded(!excludedExpanded)}
                    className="text-xs text-destructive flex items-center gap-1 hover:underline cursor-pointer bg-transparent border-none p-0"
                  >
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>
                      {invalidAreaOrders.length} order(s) excluded — {excludedSummaryText}
                    </span>
                    {excludedExpanded ? (
                      <ChevronUp className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    )}
                  </button>

                  {excludedExpanded && (
                    <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-2 space-y-1.5">
                      {excludedDetails.map((e) => (
                        <div
                          key={e.order.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-foreground shrink-0">
                              {e.order.order_code}
                            </span>
                            <span className="text-muted-foreground truncate">
                              {e.order.customer_name || '—'}
                            </span>
                            {e.order.area && (
                              <Badge variant="outline" className="text-[10px] shrink-0">{e.order.area}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {e.reason === 'missing_area' && (
                              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800">
                                <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                No Area
                              </Badge>
                            )}
                            {e.reason === 'no_charge_rate' && (
                              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800">
                                No Charge Rate
                              </Badge>
                            )}
                            {e.reason === 'no_delivery_time' && (
                              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800">
                                <Clock className="h-2.5 w-2.5 mr-0.5" />
                                No Delivery Time
                              </Badge>
                            )}
                            <span className="text-muted-foreground">{formatBND(e.order.total_amount)}</span>
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground pt-1 border-t border-destructive/10">
                        Contact admin to fix area or delivery charge settings for these orders.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <Button
            onClick={onClaimAll}
            className="shrink-0 shadow-md hover:shadow-lg transition-all"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Claim All {claimableOrders.length}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
