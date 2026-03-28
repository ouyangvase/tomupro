import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatBND } from '@/lib/currency';
import { Sparkles, ArrowRight, AlertCircle, Users } from 'lucide-react';
import type { Order } from '@/types/database';

interface AutoClaimSuggestionProps {
  claimableOrders: Order[];
  invalidAreaOrders: Order[];
  onClaimAll: () => void;
  totalDeliveryFee?: number;
}

export function AutoClaimSuggestion({
  claimableOrders,
  invalidAreaOrders,
  onClaimAll,
  totalDeliveryFee = 0,
}: AutoClaimSuggestionProps) {
  if (claimableOrders.length === 0) return null;

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

  const hasMultipleUsers = userBreakdown.length > 1;

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
            <div>
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
              {invalidAreaOrders.length > 0 && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertCircle className="h-3 w-3" />
                  {invalidAreaOrders.length} order(s) excluded — missing delivery charge rate
                </p>
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
