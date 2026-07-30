import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileCardField {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}

interface MobileOrderCardProps {
  id: string;
  // Header fields - always visible at top
  orderRef: string;
  areaBadge?: React.ReactNode;
  statusBadge?: React.ReactNode;
  // Primary fields - shown by default (collapsed view)
  primaryFields: MobileCardField[];
  // Expanded fields - shown when expanded
  expandedFields?: MobileCardField[];
  // Selection
  selectable?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (checked: boolean) => void;
  // Actions
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  // Click handler
  onClick?: () => void;
  // Extra className for the card
  className?: string;
}

export function MobileOrderCard({
  id,
  orderRef,
  areaBadge,
  statusBadge,
  primaryFields,
  expandedFields = [],
  selectable = false,
  isSelected = false,
  onSelectionChange,
  primaryAction,
  secondaryActions,
  onClick,
  className,
}: MobileOrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasExpandedContent = expandedFields.length > 0 || secondaryActions;

  return (
    <Card
      data-order-id={id}
      className={cn(
        'mobile-motion overflow-hidden rounded-[1.65rem] border-[#e5dacb] bg-[#fffdf8] p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_12px_34px_rgba(113,78,31,0.07)] transition-all duration-500',
        isSelected && 'border-[#c78b2f] bg-[#fff7ea] ring-2 ring-[#c78b2f]/18',
        onClick && 'active:scale-[0.99]',
        className
      )}
    >
      {/* Header Row: Checkbox + Order Ref + Area + Status */}
      <div className="flex items-start gap-3">
        {selectable && (
          <div 
            className="pt-0.5" 
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectionChange?.(checked as boolean)}
              className="h-5 w-5"
            />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          {/* Top line: Order Ref + Area + Status */}
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <span className="font-mono text-sm font-black text-[#171512]">{orderRef}</span>
            {areaBadge}
            {statusBadge}
          </div>

          {/* Primary fields grid */}
          <div 
            className="grid grid-cols-2 gap-x-4 gap-y-2"
            onClick={onClick}
          >
            {primaryFields.map((field, index) => (
              <div 
                key={index} 
                className={cn(
                  'min-w-0',
                  field.fullWidth && 'col-span-2'
                )}
              >
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a8174]">
                  {field.label}
                </span>
                <div className="truncate text-sm font-semibold text-[#25221e]">
                  {field.value}
                </div>
              </div>
            ))}
          </div>

          {/* Primary Action - always visible */}
          {primaryAction && (
            <div className="mt-3 flex justify-end">
              {primaryAction}
            </div>
          )}

          {/* Expand toggle */}
          {hasExpandedContent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 h-9 w-full rounded-full text-xs font-semibold text-[#7d7468] hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show {expandedFields.length} more fields
                </>
              )}
            </Button>
          )}

          {/* Expanded content */}
          {isExpanded && (
            <div className="mt-3 space-y-3 border-t border-[#eadfce] pt-3">
              {expandedFields.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {expandedFields.map((field, index) => (
                    <div 
                      key={index} 
                      className={cn(
                        'min-w-0',
                        field.fullWidth && 'col-span-2'
                      )}
                    >
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a8174]">
                        {field.label}
                      </span>
                      <div className="text-sm break-words">
                        {field.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {secondaryActions && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {secondaryActions}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// Select All Card for mobile
interface MobileSelectAllCardProps {
  isAllSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  selectedCount?: number;
  totalCount?: number;
}

export function MobileSelectAllCard({
  isAllSelected,
  onSelectAll,
  selectedCount = 0,
  totalCount = 0,
}: MobileSelectAllCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-[1.35rem] border border-[#e5dacb] bg-[#fffdf8] px-3 py-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95)]">
      <Checkbox
        checked={isAllSelected}
        onCheckedChange={(checked) => onSelectAll(checked as boolean)}
        className="h-5 w-5"
      />
      <div className="flex-1">
        <span className="text-sm font-medium">Select all</span>
        {selectedCount > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            ({selectedCount} of {totalCount} selected)
          </span>
        )}
      </div>
    </div>
  );
}
