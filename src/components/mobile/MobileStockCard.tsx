import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Clock, User, MapPin, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const isRunnerHolderRole = (value: string | null | undefined) => value === 'runner' || value === 'driver';

interface MobileStockCardProps {
  productName: string;
  skuCode?: string;
  balance: number;
  ownerName: string;
  ownerLabel?: string;
  ownerRole?: string | null;
  warehouseName?: string;
  lastMovement?: string | null;
  isOwnStock?: boolean;
  stockLocationRemark?: string | null;
  canEditStockLocation?: boolean;
  onEditStockLocation?: () => void;
  onClick?: () => void;
}

export function MobileStockCard({
  productName,
  skuCode,
  balance,
  ownerName,
  ownerLabel = 'Owner',
  ownerRole,
  warehouseName,
  lastMovement,
  isOwnStock = false,
  stockLocationRemark,
  canEditStockLocation = false,
  onEditStockLocation,
  onClick,
}: MobileStockCardProps) {
  return (
    <Card
      className={cn(
        'mobile-motion overflow-hidden rounded-[1.75rem] border-[#e5dacb] bg-[#fffdf8] p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_14px_36px_rgba(113,78,31,0.07)] transition-all duration-500 active:scale-[0.99]',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* Header: Product name + SKU */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-black text-[#171512]">{productName}</h3>
          {skuCode && (
            <p className="text-xs text-muted-foreground font-mono">{skuCode}</p>
          )}
        </div>
        
        {/* Balance - prominent display */}
        <div className="flex items-center gap-2">
          <Badge 
            variant={balance > 0 ? 'default' : 'destructive'}
            className="rounded-full px-3.5 py-1.5 text-lg font-black shadow-[0_8px_18px_rgba(199,139,47,0.18)]"
          >
            {balance}
          </Badge>
        </div>
      </div>

      {canEditStockLocation && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEditStockLocation?.();
          }}
          className={cn(
            'mobile-motion mb-3 flex w-full items-center gap-3 rounded-[1.35rem] border px-3 py-3 text-left shadow-[inset_0_1px_1px_rgba(255,255,255,0.95)] transition-all duration-500 active:scale-[0.99]',
            stockLocationRemark
              ? 'border-primary/30 bg-primary/10 text-foreground'
              : 'border-primary/20 bg-primary/5 text-foreground'
          )}
        >
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <MapPin className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Stock Location
            </span>
            <span className="block truncate text-sm font-semibold">
              {stockLocationRemark || 'Add shelf or rack'}
            </span>
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] font-bold text-primary">
            <Pencil className="h-3 w-3" />
            Edit
          </span>
        </button>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Owner / holder */}
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
              {ownerLabel}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium truncate">{ownerName}</span>
              {isRunnerHolderRole(ownerRole) && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">Runner</Badge>
              )}
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
