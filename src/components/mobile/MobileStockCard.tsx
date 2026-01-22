import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface MobileStockCardProps {
  productName: string;
  skuCode?: string;
  balance: number;
  ownerName: string;
  warehouseName?: string;
  lastMovement?: string | null;
  isOwnStock?: boolean;
  onClick?: () => void;
}

export function MobileStockCard({
  productName,
  skuCode,
  balance,
  ownerName,
  warehouseName,
  lastMovement,
  isOwnStock = false,
  onClick,
}: MobileStockCardProps) {
  return (
    <Card
      className={cn(
        'p-4 transition-all active:bg-secondary/50',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* Header: Product name + SKU */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{productName}</h3>
          {skuCode && (
            <p className="text-xs text-muted-foreground font-mono">{skuCode}</p>
          )}
        </div>
        
        {/* Balance - prominent display */}
        <div className="flex items-center gap-2">
          <Badge 
            variant={balance > 0 ? 'default' : 'destructive'}
            className="text-lg font-bold px-3 py-1"
          >
            {balance}
          </Badge>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Owner */}
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
              Owner
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium truncate">{ownerName}</span>
              {isOwnStock && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">You</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Warehouse */}
        {warehouseName && (
          <div className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                Warehouse
              </span>
              <span className="text-xs font-medium truncate block">{warehouseName}</span>
            </div>
          </div>
        )}

        {/* Last Movement */}
        {lastMovement && (
          <div className="flex items-center gap-2 col-span-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                Last Movement
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(lastMovement), 'MMM dd, HH:mm')}
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
