import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, CheckCircle, XCircle, User } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface MobileProductCardProps {
  id: string;
  productName: string;
  skuCode?: string;
  isActive: boolean;
  creatorName?: string;
  createdAt: string;
  // Selection
  selectable?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (checked: boolean) => void;
  // Actions
  onEdit?: () => void;
  onToggleActive?: () => void;
  canEdit?: boolean;
}

export function MobileProductCard({
  id,
  productName,
  skuCode,
  isActive,
  creatorName,
  createdAt,
  selectable = false,
  isSelected = false,
  onSelectionChange,
  onEdit,
  onToggleActive,
  canEdit = false,
}: MobileProductCardProps) {
  return (
    <Card
      className={cn(
        'p-4 transition-all',
        isSelected && 'bg-primary/5 border-primary/30'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Selection checkbox */}
        {selectable && (
          <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectionChange?.(checked as boolean)}
              className="h-5 w-5"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Header: Name + Status */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm truncate">{productName}</h3>
              {skuCode && (
                <p className="text-xs text-muted-foreground font-mono">{skuCode}</p>
              )}
            </div>
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {creatorName && (
              <div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                  Created By
                </span>
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs truncate">{creatorName}</span>
                </div>
              </div>
            )}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
                Created
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(createdAt), 'MMM dd, yyyy')}
              </span>
            </div>
          </div>

          {/* Actions */}
          {canEdit && (
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.();
                }}
                className="h-8"
              >
                <Edit className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                variant={isActive ? 'outline' : 'default'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleActive?.();
                }}
                className="h-8"
              >
                {isActive ? (
                  <>
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    Activate
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
