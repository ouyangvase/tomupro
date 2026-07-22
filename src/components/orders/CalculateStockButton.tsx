import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Calculator, Loader2 } from 'lucide-react';
import { useCalculateStock } from '@/hooks/useStockCalculation';
import type { Order } from '@/types/database';
import type { OrderStockResult } from '@/hooks/useStockCalculation';

interface CalculateStockButtonProps {
  /** All orders currently loaded on the page (with order_items populated) */
  orders: Order[];
  selectedOrderIds: string[];
  disabled?: boolean;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'secondary';
  className?: string;
  /** Callback when calculation completes — parent stores the results */
  onResults?: (results: Map<string, OrderStockResult>) => void;
}

export function CalculateStockButton({
  orders,
  selectedOrderIds,
  disabled,
  size = 'sm',
  variant = 'outline',
  className,
  onResults,
}: CalculateStockButtonProps) {
  const calculateStock = useCalculateStock();

  const hasSelection = selectedOrderIds.length > 0;
  const ordersToCalculate = hasSelection
    ? orders.filter(o => selectedOrderIds.includes(o.id))
    : orders;
  const count = ordersToCalculate.length;

  const handleClick = () => {
    if (count === 0) return;
    calculateStock.mutate(ordersToCalculate, {
      onSuccess: (results) => {
        onResults?.(results);
      },
    });
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleClick}
      disabled={disabled || calculateStock.isPending || count === 0}
      className={cn('rounded-full', className)}
    >
      {calculateStock.isPending ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <Calculator className="h-4 w-4 mr-1" />
      )}
      {calculateStock.isPending
        ? 'Calculating...'
        : hasSelection
          ? `Calculate Stock (${count})`
          : 'Calculate Stock'}
    </Button>
  );
}
