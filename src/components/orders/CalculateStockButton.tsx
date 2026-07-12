import { Button } from '@/components/ui/button';
import { Calculator, Loader2 } from 'lucide-react';
import { useCalculateStock } from '@/hooks/useStockCalculation';

interface CalculateStockButtonProps {
  selectedOrderIds: string[];
  allOrderIds: string[];
  disabled?: boolean;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'secondary';
}

export function CalculateStockButton({
  selectedOrderIds,
  allOrderIds,
  disabled,
  size = 'sm',
  variant = 'outline',
}: CalculateStockButtonProps) {
  const calculateStock = useCalculateStock();

  const hasSelection = selectedOrderIds.length > 0;
  const idsToCalculate = hasSelection ? selectedOrderIds : allOrderIds;
  const count = idsToCalculate.length;

  const handleClick = () => {
    if (count === 0) return;
    calculateStock.mutate(idsToCalculate);
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleClick}
      disabled={disabled || calculateStock.isPending || count === 0}
      className="rounded-full"
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
