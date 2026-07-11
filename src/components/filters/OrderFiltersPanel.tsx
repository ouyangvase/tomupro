import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Filter, X, ChevronDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReasons } from '@/hooks/useReasons';
import { useIsMobile } from '@/hooks/use-mobile';

export interface OrderFilters {
  year?: string;
  month?: string;
  dateMode?: 'created' | 'delivered';
  runnerStatus?: string;
  driverStatus?: string;
  orderStatus?: string;
  reconciliationStatus?: string;
  area?: string;
  salespersonId?: string;
  driverId?: string;
  paymentMethod?: string;
  deliveryReasonId?: string;
  receiptStatus?: string;
}

interface FilterOption {
  label: string;
  value: string;
}

interface OrderFiltersPanelProps {
  filters: OrderFilters;
  onFiltersChange: (filters: OrderFilters) => void;
  areaOptions?: FilterOption[];
  salespersonOptions?: FilterOption[];
  driverOptions?: FilterOption[];
  showSalespersonFilter?: boolean;
  showDriverFilter?: boolean;
  showOrderStatus?: boolean;
  showRunnerStatus?: boolean;
  showDriverStatus?: boolean;
  showReconciliationStatus?: boolean;
}

const currentYear = new Date().getFullYear();
const yearOptions: FilterOption[] = Array.from({ length: 7 }, (_, i) => ({
  label: String(currentYear - 3 + i),
  value: String(currentYear - 3 + i),
}));

const monthOptions: FilterOption[] = [
  { label: 'January', value: '1' },
  { label: 'February', value: '2' },
  { label: 'March', value: '3' },
  { label: 'April', value: '4' },
  { label: 'May', value: '5' },
  { label: 'June', value: '6' },
  { label: 'July', value: '7' },
  { label: 'August', value: '8' },
  { label: 'September', value: '9' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

const runnerStatusOptions: FilterOption[] = [
  { label: 'Unassigned', value: 'UNASSIGNED' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Taken', value: 'TAKEN' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Failed Delivery', value: 'FAILED_DELIVERY' },
];

const driverStatusOptions: FilterOption[] = [
  { label: 'Unassigned', value: 'UNASSIGNED' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Out for Delivery', value: 'OUT_FOR_DELIVERY' },
  { label: 'Driver Delivered', value: 'DRIVER_DELIVERED' },
  { label: 'Driver Failed', value: 'DRIVER_FAILED' },
];

const orderStatusOptions: FilterOption[] = [
  { label: 'Booking', value: 'BOOKING' },
  { label: 'Ready', value: 'READY' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const reconciliationStatusOptions: FilterOption[] = [
  { label: 'Not Claimed', value: 'NOT_CLAIMED' },
  { label: 'Claimed', value: 'CLAIMED' },
  { label: 'SP Ack Pending', value: 'SP_ACK_PENDING' },
  { label: 'Admin Ack Pending', value: 'ADMIN_ACK_PENDING' },
  { label: 'Settled', value: 'SETTLED' },
  { label: 'Dispute', value: 'DISPUTE' },
];

const paymentMethodOptions: FilterOption[] = [
  { label: 'COD', value: 'COD' },
  { label: 'Transfer', value: 'TRANSFER' },
];

const receiptStatusOptions: FilterOption[] = [
  { label: 'Receipt Pending', value: 'pending' },
  { label: 'Receipt Confirmed', value: 'confirmed' },
  { label: 'Receipt Rejected', value: 'rejected' },
];

export function OrderFiltersPanel({
  filters,
  onFiltersChange,
  areaOptions = [],
  salespersonOptions = [],
  driverOptions = [],
  showSalespersonFilter = false,
  showDriverFilter = false,
  showOrderStatus = false,
  showRunnerStatus = true,
  showDriverStatus = false,
  showReconciliationStatus = true,
}: OrderFiltersPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  // Fetch CANCEL and FAILED_DELIVERY reasons for the dropdown
  const { data: cancelReasons = [] } = useReasons('CANCEL', true);
  const { data: failedReasons = [] } = useReasons('FAILED_DELIVERY', true);

  // Determine if reason filter should be enabled
  const isReasonFilterEnabled = useMemo(() => {
    return filters.runnerStatus === 'FAILED_DELIVERY' || filters.orderStatus === 'CANCELLED';
  }, [filters.runnerStatus, filters.orderStatus]);

  // Get the appropriate reasons based on current filter
  const reasonOptions = useMemo(() => {
    if (filters.orderStatus === 'CANCELLED') {
      return cancelReasons.map(r => ({ label: r.label, value: r.id }));
    }
    if (filters.runnerStatus === 'FAILED_DELIVERY') {
      return failedReasons.map(r => ({ label: r.label, value: r.id }));
    }
    return [];
  }, [filters.orderStatus, filters.runnerStatus, cancelReasons, failedReasons]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.year) count++;
    if (filters.month) count++;
    if (filters.runnerStatus) count++;
    if (filters.driverStatus) count++;
    if (filters.orderStatus) count++;
    if (filters.reconciliationStatus) count++;
    if (filters.area) count++;
    if (filters.salespersonId) count++;
    if (filters.driverId) count++;
    if (filters.paymentMethod) count++;
    if (filters.receiptStatus) count++;
    if (filters.deliveryReasonId) count++;
    return count;
  }, [filters]);

  const updateFilter = (key: keyof OrderFilters, value: string | undefined) => {
    const newFilters = { ...filters, [key]: value === 'all' ? undefined : value };
    // Clear deliveryReasonId if runnerStatus/orderStatus changes to something that doesn't support it
    if (key === 'runnerStatus' || key === 'orderStatus') {
      const newRunnerStatus = key === 'runnerStatus' ? value : filters.runnerStatus;
      const newOrderStatus = key === 'orderStatus' ? value : filters.orderStatus;
      const stillEnabled = newRunnerStatus === 'FAILED_DELIVERY' || newOrderStatus === 'CANCELLED';
      if (!stillEnabled) {
        newFilters.deliveryReasonId = undefined;
      }
    }
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  const filterScopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (filters.year) parts.push(`Year=${filters.year}`);
    if (filters.month) {
      const monthName = monthOptions.find(m => m.value === filters.month)?.label || filters.month;
      parts.push(`Month=${monthName}`);
    }
    if (filters.dateMode === 'delivered') {
      parts.push('Mode=Delivery Date');
    } else if (filters.year || filters.month) {
      parts.push('Mode=Order Date');
    }
    return parts.length > 0 ? parts.join(', ') : null;
  }, [filters]);

  // Individual filter select builder
  const renderSelect = (label: string, value: string | undefined, onChange: (v: string) => void, options: FilterOption[], placeholder = 'All', disabled = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || 'all'} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={cn("h-11 md:h-9", disabled && "opacity-50")}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{placeholder}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  // Mobile filter content (stacked 2-col grid)
  const mobileFilterContent = (
    <div className="space-y-4">
      {/* Date Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Calendar className="h-4 w-4" />
          Date Filters
        </div>
        <div className="grid grid-cols-2 gap-3">
          {renderSelect('Year', filters.year, (v) => updateFilter('year', v), yearOptions, 'All years')}
          {renderSelect('Month', filters.month, (v) => updateFilter('month', v), monthOptions, 'All months')}
          <div className="col-span-2 flex items-center gap-3 pt-1">
            <Switch id="date-mode-mobile" checked={filters.dateMode === 'delivered'} onCheckedChange={(checked) => updateFilter('dateMode', checked ? 'delivered' : 'created')} />
            <Label htmlFor="date-mode-mobile" className="text-xs">Filter by Delivery Date</Label>
          </div>
        </div>
      </div>

      {/* Status Filters */}
      <div className="grid grid-cols-2 gap-3">
        {showRunnerStatus && renderSelect('Delivery Status', filters.runnerStatus, (v) => updateFilter('runnerStatus', v), runnerStatusOptions)}
        {showDriverStatus && renderSelect('Driver Status', filters.driverStatus, (v) => updateFilter('driverStatus', v), driverStatusOptions)}
        {showOrderStatus && renderSelect('Order Status', filters.orderStatus, (v) => updateFilter('orderStatus', v), orderStatusOptions)}
        {showReconciliationStatus && renderSelect('Reconciliation', filters.reconciliationStatus, (v) => updateFilter('reconciliationStatus', v), reconciliationStatusOptions)}
        {renderSelect('Payment', filters.paymentMethod, (v) => updateFilter('paymentMethod', v), paymentMethodOptions)}
        {renderSelect('Receipt Status', filters.receiptStatus, (v) => updateFilter('receiptStatus', v), receiptStatusOptions)}
        {renderSelect('Delivery Reason', filters.deliveryReasonId, (v) => updateFilter('deliveryReasonId', v), reasonOptions, 'All Reasons', !isReasonFilterEnabled)}
      </div>

      {/* Other Filters */}
      <div className="grid grid-cols-2 gap-3">
        {areaOptions.length > 0 && renderSelect('Area', filters.area, (v) => updateFilter('area', v), areaOptions, 'All areas')}
        {showSalespersonFilter && salespersonOptions.length > 0 && renderSelect('Salesperson', filters.salespersonId, (v) => updateFilter('salespersonId', v), salespersonOptions)}
        {showDriverFilter && driverOptions.length > 0 && renderSelect('Driver', filters.driverId, (v) => updateFilter('driverId', v), driverOptions)}
      </div>

      {activeFilterCount > 0 && (
        <Button variant="outline" className="w-full h-11 mt-4" onClick={clearAllFilters}>
          <X className="h-4 w-4 mr-2" />
          Clear all filters
        </Button>
      )}
    </div>
  );

  // Desktop filter content (horizontal, full-width grid)
  const desktopFilterContent = (
    <div className="space-y-4">
      {/* Row 1: Date filters in a single row */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0 pb-1.5">
          <Calendar className="h-4 w-4" />
          Date
        </div>
        <div className="w-[130px]">
          {renderSelect('Year', filters.year, (v) => updateFilter('year', v), yearOptions, 'All years')}
        </div>
        <div className="w-[140px]">
          {renderSelect('Month', filters.month, (v) => updateFilter('month', v), monthOptions, 'All months')}
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <Switch id="date-mode-desktop" checked={filters.dateMode === 'delivered'} onCheckedChange={(checked) => updateFilter('dateMode', checked ? 'delivered' : 'created')} />
          <Label htmlFor="date-mode-desktop" className="text-xs whitespace-nowrap">Delivery Date</Label>
        </div>
      </div>

      {/* Row 2: All status/type filters in a responsive grid */}
      <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {showRunnerStatus && renderSelect('Delivery Status', filters.runnerStatus, (v) => updateFilter('runnerStatus', v), runnerStatusOptions)}
        {showDriverStatus && renderSelect('Driver Status', filters.driverStatus, (v) => updateFilter('driverStatus', v), driverStatusOptions)}
        {showOrderStatus && renderSelect('Order Status', filters.orderStatus, (v) => updateFilter('orderStatus', v), orderStatusOptions)}
        {showReconciliationStatus && renderSelect('Reconciliation', filters.reconciliationStatus, (v) => updateFilter('reconciliationStatus', v), reconciliationStatusOptions)}
        {renderSelect('Payment', filters.paymentMethod, (v) => updateFilter('paymentMethod', v), paymentMethodOptions)}
        {renderSelect('Receipt Status', filters.receiptStatus, (v) => updateFilter('receiptStatus', v), receiptStatusOptions)}
        {renderSelect('Delivery Reason', filters.deliveryReasonId, (v) => updateFilter('deliveryReasonId', v), reasonOptions, 'All Reasons', !isReasonFilterEnabled)}
        {areaOptions.length > 0 && renderSelect('Area', filters.area, (v) => updateFilter('area', v), areaOptions, 'All areas')}
        {showSalespersonFilter && salespersonOptions.length > 0 && renderSelect('Salesperson', filters.salespersonId, (v) => updateFilter('salespersonId', v), salespersonOptions)}
        {showDriverFilter && driverOptions.length > 0 && renderSelect('Driver', filters.driverId, (v) => updateFilter('driverId', v), driverOptions)}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {isMobile ? (
        // Mobile: Use Sheet (bottom drawer)
        <div className="flex items-center gap-2">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant={activeFilterCount > 0 ? 'default' : 'outline'} size="sm" className="h-10">
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
              <SheetHeader className="pb-4">
                <SheetTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary">{activeFilterCount}</Badge>
                  )}
                </SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100%-4rem)]">
                <div className="pb-6">
                  {mobileFilterContent}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-10">
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      ) : (
        // Desktop: Use Collapsible with full-width layout
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant={activeFilterCount > 0 ? 'default' : 'outline'} size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeFilterCount}
                  </Badge>
                )}
                <ChevronDown className={cn('h-4 w-4 ml-1 transition-transform', isOpen && 'rotate-180')} />
              </Button>
            </CollapsibleTrigger>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          <CollapsibleContent>
            <div className="mt-3 p-4 border rounded-xl bg-card">
              {desktopFilterContent}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Active filter scope indicator */}
      {filterScopeLabel && (
        <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded inline-block">
          {filterScopeLabel}
        </div>
      )}
    </div>
  );
}

// Utility function to filter orders based on the filter state
export function applyOrderFilters<T extends {
  created_at?: string;
  delivered_at?: string | null;
  next_delivery_date?: string | null;
  runner_status?: string;
  driver_status?: string | null;
  driver_id?: string | null;
  status?: string;
  reconciliation_status?: string;
  area?: string | null;
  salesperson_id?: string;
  payment_method?: string;
  cancel_reason?: string | null;
  runner_failed_reason_id?: string | null;
}>(orders: T[], filters: OrderFilters): T[] {
  return orders.filter((order) => {
    // Year/Month filter
    if (filters.year || filters.month) {
      const dateField = filters.dateMode === 'delivered'
        ? (order.delivered_at || order.next_delivery_date)
        : order.created_at;
      
      if (!dateField) {
        if (filters.dateMode === 'delivered') return false;
      } else {
        const date = new Date(dateField);
        if (filters.year && date.getFullYear() !== parseInt(filters.year)) return false;
        if (filters.month && (date.getMonth() + 1) !== parseInt(filters.month)) return false;
      }
    }

    // Status filters
    if (filters.runnerStatus && order.runner_status !== filters.runnerStatus) return false;
    if (filters.driverStatus && order.driver_status !== filters.driverStatus) return false;
    if (filters.orderStatus && order.status !== filters.orderStatus) return false;
    if (filters.reconciliationStatus && order.reconciliation_status !== filters.reconciliationStatus) return false;
    if (filters.area && order.area !== filters.area) return false;
    if (filters.salespersonId && order.salesperson_id !== filters.salespersonId) return false;
    if (filters.driverId && order.driver_id !== filters.driverId) return false;
    if (filters.paymentMethod && order.payment_method !== filters.paymentMethod) return false;

    // Delivery Reason filter - match based on status context
    if (filters.deliveryReasonId) {
      if (filters.orderStatus === 'CANCELLED') {
        // For cancelled orders, match against cancel_reason (which stores the reason ID)
        if (order.cancel_reason !== filters.deliveryReasonId) return false;
      } else if (filters.runnerStatus === 'FAILED_DELIVERY') {
        // For failed delivery, match against runner_failed_reason_id
        if (order.runner_failed_reason_id !== filters.deliveryReasonId) return false;
      }
    }

    return true;
  });
}
