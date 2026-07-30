import { AlertCircle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type OrdersLoadErrorProps = {
  error: Error;
  onRetry: () => void;
};

export function OrdersLoadError({ error, onRetry }: OrdersLoadErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <div>
        <p className="font-semibold text-foreground">Unable to load orders</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error.message || 'The orders request failed. Please retry.'}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
