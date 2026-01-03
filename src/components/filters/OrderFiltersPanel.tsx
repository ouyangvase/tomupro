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
import { Filter, X, ChevronDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    return count;
  }, [filters]);

  const updateFilter = (key: keyof OrderFilters, value: string | undefined) => {
    onFiltersChange({ ...filters, [key]: value === 'all' ? undefined : value });
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

  return (
    <div className="space-y-2">
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
          <div className="mt-3 p-4 border rounded-lg bg-card space-y-4">
            {/* Date Filters Row */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                Date Filters
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Year</Label>
                  <Select
                    value={filters.year || 'all'}
                    onValueChange={(v) => updateFilter('year', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All years" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All years</SelectItem>
                      {yearOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Month</Label>
                  <Select
                    value={filters.month || 'all'}
                    onValueChange={(v) => updateFilter('month', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All months" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All months</SelectItem>
                      {monthOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex items-end gap-3 pb-0.5">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="date-mode"
                      checked={filters.dateMode === 'delivered'}
                      onCheckedChange={(checked) =>
                        updateFilter('dateMode', checked ? 'delivered' : 'created')
                      }
                    />
                    <Label htmlFor="date-mode" className="text-xs">
                      Filter by Delivery Date
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Filters Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {showRunnerStatus && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Delivery Status</Label>
                  <Select
                    value={filters.runnerStatus || 'all'}
                    onValueChange={(v) => updateFilter('runnerStatus', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {runnerStatusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showDriverStatus && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Driver Status</Label>
                  <Select
                    value={filters.driverStatus || 'all'}
                    onValueChange={(v) => updateFilter('driverStatus', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {driverStatusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showOrderStatus && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Order Status</Label>
                  <Select
                    value={filters.orderStatus || 'all'}
                    onValueChange={(v) => updateFilter('orderStatus', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {orderStatusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showReconciliationStatus && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Reconciliation</Label>
                  <Select
                    value={filters.reconciliationStatus || 'all'}
                    onValueChange={(v) => updateFilter('reconciliationStatus', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {reconciliationStatusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Payment</Label>
                <Select
                  value={filters.paymentMethod || 'all'}
                  onValueChange={(v) => updateFilter('paymentMethod', v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {paymentMethodOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Other Filters Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {areaOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Area</Label>
                  <Select
                    value={filters.area || 'all'}
                    onValueChange={(v) => updateFilter('area', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All areas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All areas</SelectItem>
                      {areaOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showSalespersonFilter && salespersonOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Salesperson</Label>
                  <Select
                    value={filters.salespersonId || 'all'}
                    onValueChange={(v) => updateFilter('salespersonId', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {salespersonOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showDriverFilter && driverOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Driver</Label>
                  <Select
                    value={filters.driverId || 'all'}
                    onValueChange={(v) => updateFilter('driverId', v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {driverOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

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

    return true;
  });
}
